import { z } from "zod";

/**
 * Validation for the engine settings that actually reach an Ultravox call:
 * temperature, speaking speed, language hint and model.
 *
 * Every bound here was read off the live Ultravox OpenAPI document
 * (`GET https://api.ultravox.ai/api/schema/`, `ultravox.v1.StartCallRequest`)
 * rather than guessed, because a control whose range disagrees with the API
 * just moves the failure from "silently ignored" to "call 400s at dial time".
 */

/** `temperature`: "The model temperature, between 0 and 1. Defaults to 0." */
export const MIN_TEMPERATURE = 0;
export const MAX_TEMPERATURE = 1;

/**
 * Speaking speed.
 *
 * Ultravox has no top-level speed field. Speed is only settable through
 * `voiceOverrides`, whose shape and range depend on the voice's TTS provider:
 *
 *   - Eleven Labs: `voiceOverrides.elevenLabs.speed`, 0.7–1.2, default 1
 *   - Cartesia:    `voiceOverrides.cartesia.generationConfig.speed`, 0.6–1.5,
 *                  default 1. (Cartesia also has a deprecated top-level
 *                  `speed` on a -1..1 scale — deliberately not used.)
 *
 * The voices this product ships with span BOTH providers, and the user picks a
 * voice separately from the speed. So we expose the intersection-safe range —
 * Eleven Labs' 0.7–1.2 — which is valid for every provider we can land on.
 * Allowing 1.4 would work on a Cartesia voice and hard-fail the call on an
 * Eleven Labs one, which is exactly the kind of "setting that lies" this is
 * meant to remove.
 */
export const MIN_SPEED = 0.7;
export const MAX_SPEED = 1.2;

/**
 * Models available to this account, from `GET https://api.ultravox.ai/api/models`.
 * Kept as an allowlist so an unknown name is rejected here with a readable
 * message instead of 400ing mid-dial. Refresh with:
 *   curl -s https://api.ultravox.ai/api/models -H "X-API-Key: $ULTRAVOX_API_KEY"
 */
export const SUPPORTED_MODELS = [
  "ultravox-v0.7",
  "ultravox-v0.6",
  "ultravox-v0.6-llama3.3-70b",
  "ultravox-v0.6-gemma3-27b",
] as const;

export type SupportedModel = (typeof SUPPORTED_MODELS)[number];

/**
 * `languageHint` is a BCP47 code — "may be used to guide speech recognition and
 * synthesis". The API accepts any BCP47 string, but an arbitrary code paired
 * with a voice that cannot speak it produces a bad-sounding call rather than an
 * error, so this is a curated list with plain-English labels for the UI.
 */
export const SUPPORTED_LANGUAGES = [
  { code: "en-US", label: "English (United States)" },
  { code: "en-GB", label: "English (United Kingdom)" },
  { code: "en-AU", label: "English (Australia)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "es-MX", label: "Spanish (Mexico)" },
  { code: "fr-FR", label: "French (France)" },
  { code: "fr-CA", label: "French (Canada)" },
  { code: "de-DE", label: "German" },
  { code: "it-IT", label: "Italian" },
  { code: "pt-BR", label: "Portuguese (Brazil)" },
  { code: "nl-NL", label: "Dutch" },
  { code: "pl-PL", label: "Polish" },
  { code: "hi-IN", label: "Hindi" },
  { code: "ja-JP", label: "Japanese" },
  { code: "ko-KR", label: "Korean" },
  { code: "zh-CN", label: "Chinese (Mandarin)" },
] as const;

export const SUPPORTED_LANGUAGE_CODES: readonly string[] =
  SUPPORTED_LANGUAGES.map((l) => l.code);

function roundTo(value: number, places: number): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

export const agentEngineSchema = z
  .object({
    temperature: z
      .number({ message: "Choose a creativity level between 0 and 1." })
      .min(
        MIN_TEMPERATURE,
        `Creativity must be between ${MIN_TEMPERATURE} and ${MAX_TEMPERATURE}.`
      )
      .max(
        MAX_TEMPERATURE,
        `Creativity must be between ${MIN_TEMPERATURE} and ${MAX_TEMPERATURE}.`
      )
      .optional(),
    speed: z
      .number({ message: "Choose a speaking speed between 0.7 and 1.2." })
      .min(
        MIN_SPEED,
        `Speaking speed must be between ${MIN_SPEED} and ${MAX_SPEED}. Outside that range some voices refuse the call.`
      )
      .max(
        MAX_SPEED,
        `Speaking speed must be between ${MIN_SPEED} and ${MAX_SPEED}. Outside that range some voices refuse the call.`
      )
      .optional(),
    language: z
      .string()
      .refine((v) => SUPPORTED_LANGUAGE_CODES.includes(v), {
        message: "That language is not one of the supported options.",
      })
      .optional(),
    model: z
      .string()
      .refine((v) => SUPPORTED_MODELS.includes(v as SupportedModel), {
        message: "That model is not available on this account.",
      })
      .optional(),
  })
  // Unknown keys are rejected rather than dropped, so a typo'd field name is
  // reported instead of silently doing nothing. The message is rewritten in
  // `validateAgentEngine` — zod's own wording names the raw key.
  .strict();

export type AgentEngineInput = z.infer<typeof agentEngineSchema>;

/**
 * Single entry point for the API route. Returns the cleaned settings or one
 * plain-English sentence explaining what to fix — this codebase never shows
 * raw JSON or validation-library output to users.
 */
export function validateAgentEngine(
  input: unknown
): { ok: true; settings: AgentEngineInput } | { ok: false; message: string } {
  const parsed = agentEngineSchema.safeParse(input);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    if (first?.code === "unrecognized_keys") {
      return {
        ok: false,
        message: "That request contained a setting this page cannot change.",
      };
    }
    return {
      ok: false,
      message: first?.message ?? "Those settings are not valid.",
    };
  }

  const settings = parsed.data;
  if (Object.values(settings).every((v) => v === undefined)) {
    return {
      ok: false,
      message: "No settings were provided, so nothing was changed.",
    };
  }

  // Round to the precision the controls actually offer, so a float artefact
  // like 0.30000000000000004 never lands in a stored snapshot.
  return {
    ok: true,
    settings: {
      ...settings,
      ...(settings.temperature !== undefined
        ? { temperature: roundTo(settings.temperature, 2) }
        : {}),
      ...(settings.speed !== undefined
        ? { speed: roundTo(settings.speed, 2) }
        : {}),
    },
  };
}
