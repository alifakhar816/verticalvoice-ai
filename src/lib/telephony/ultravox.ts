export interface UltravoxCallResponse {
  callId: string;
  joinUrl: string | null;
}

/**
 * The onboarding wizard's voice picker (step-5-personality.tsx) uses short
 * marketing names ("sophia", "james", ...) as its option ids — these are
 * NOT real Ultravox voice catalog ids (which are UUIDs), so passing one
 * straight through to Ultravox 400s with "Voice X does not exist". Map our
 * internal names to real voices (picked from `GET /api/voices` for a
 * matching character/description) before calling Ultravox.
 */
const ONBOARDING_VOICE_TO_ULTRAVOX_ID: Record<string, string> = {
  sophia: '4c8d6eb4-c021-4d56-aec9-656bf6ca6046', // Kai — warm southern woman
  james: '5f8e97b1-cd48-431a-b6a1-3b94306d8914', // Grant — reliable, clear male, professional
  luna: 'aa601962-1cbd-4bbd-9d96-3c7a93c3414a', // Jacqueline — confident, upbeat young adult female
  marcus: 'ef6757de-79b1-497b-ad54-c6bef635e2b7', // David — steady, neutral American male
  aria: '33175488-b0f9-4f11-a0c6-3f4edd47353e', // Gabrielle — polished American female
  noah: '199c9635-edbe-4f9c-a626-ca31fb151d15', // Troy — natural, approachable American male
};

function resolveUltravoxVoiceId(voiceId: string | null): string | null {
  if (!voiceId) return null;
  return ONBOARDING_VOICE_TO_ULTRAVOX_ID[voiceId] ?? voiceId;
}

/**
 * Engine settings that a tenant chooses and that must actually reach the call.
 *
 * These live in `agent_config_versions.snapshot` (temperature, voice.speed,
 * voice.language) and were previously stored and displayed but never sent, so
 * changing them did nothing. Field names below are the real Ultravox ones,
 * taken from `GET https://api.ultravox.ai/api/schema/`
 * (`ultravox.v1.StartCallRequest`).
 */
export interface UltravoxCallOptions {
  /** -> `temperature`. 0–1, Ultravox default 0. */
  temperature?: number | null;
  /** -> `languageHint`. BCP47, e.g. "en-US". */
  language?: string | null;
  /** -> `voiceOverrides.<provider>.…` — see `buildVoiceOverrides`. */
  speed?: number | null;
  /** -> `model`. Ultravox currently defaults to "ultravox-v0.7". */
  model?: string | null;
}

/** TTS providers we know how to express a speed override for. */
type VoiceProvider = 'Eleven Labs' | 'Cartesia';

/**
 * Providers for the voices the onboarding wizard can produce, confirmed against
 * `GET /api/voices`. Having these inline means the common case never pays for a
 * catalog lookup on the latency-sensitive inbound path.
 */
const KNOWN_VOICE_PROVIDERS: Record<string, VoiceProvider> = {
  '4c8d6eb4-c021-4d56-aec9-656bf6ca6046': 'Eleven Labs', // Kai
  '5f8e97b1-cd48-431a-b6a1-3b94306d8914': 'Cartesia', // Grant
  'aa601962-1cbd-4bbd-9d96-3c7a93c3414a': 'Cartesia', // Jacqueline
  'ef6757de-79b1-497b-ad54-c6bef635e2b7': 'Eleven Labs', // David
  '33175488-b0f9-4f11-a0c6-3f4edd47353e': 'Eleven Labs', // Gabrielle
  '199c9635-edbe-4f9c-a626-ca31fb151d15': 'Eleven Labs', // Troy
};

/** Cached `GET /api/voices` result: voiceId -> provider. */
let voiceProviderCache: { at: number; byId: Map<string, string> } | null = null;
const VOICE_CACHE_TTL_MS = 60 * 60 * 1000;

async function lookupVoiceProvider(
  voiceId: string,
  apiKey: string,
  baseUrl: string
): Promise<string | null> {
  const known = KNOWN_VOICE_PROVIDERS[voiceId];
  if (known) return known;

  const fresh =
    voiceProviderCache && Date.now() - voiceProviderCache.at < VOICE_CACHE_TTL_MS;
  if (!fresh) {
    try {
      const res = await fetch(`${baseUrl}/voices?pageSize=200`, {
        headers: { 'X-API-Key': apiKey },
      });
      if (!res.ok) return null;
      const body = (await res.json()) as {
        results?: { voiceId?: string; provider?: string }[];
      };
      const byId = new Map<string, string>();
      for (const v of body.results ?? []) {
        if (v.voiceId && v.provider) byId.set(v.voiceId, v.provider);
      }
      voiceProviderCache = { at: Date.now(), byId };
    } catch {
      // Fail soft: a catalog blip must not stop the call from connecting. We
      // lose the speed override for this call, not the call itself.
      return null;
    }
  }

  return voiceProviderCache?.byId.get(voiceId) ?? null;
}

/**
 * Shapes a speed into the provider-specific `voiceOverrides` body.
 *
 * There is no top-level speed field on Ultravox calls — each TTS provider
 * spells it differently, so the provider must be known before a speed can be
 * sent at all. Returns null when we cannot express the override, which means
 * the call goes out at default speed rather than 400ing.
 */
export function buildVoiceOverrides(
  provider: string | null,
  speed: number
): Record<string, unknown> | null {
  if (provider === 'Eleven Labs') {
    // ElevenLabsVoice.speed — 0.7 to 1.2, default 1.
    return { elevenLabs: { speed } };
  }
  if (provider === 'Cartesia') {
    // CartesiaGenerationConfig.speed — 0.6 to 1.5, default 1. The top-level
    // CartesiaVoice.speed is deprecated and uses a different -1..1 scale.
    return { cartesia: { generationConfig: { speed } } };
  }
  return null;
}

/**
 * Creates an Ultravox call bridged over Twilio's media stream. Used both by
 * the inbound voice webhook (Twilio already has the caller on the line, we
 * need a joinUrl to <Connect><Stream> to) and by outbound calling (we create
 * the Ultravox call first, then hand Twilio the joinUrl when placing the call).
 */
export async function createUltravoxCall(
  systemPrompt: string,
  voiceId: string | null,
  selectedTools?: unknown[],
  options?: UltravoxCallOptions
): Promise<UltravoxCallResponse> {
  const apiKey = process.env.ULTRAVOX_API_KEY;
  const baseUrl = process.env.ULTRAVOX_BASE_URL ?? 'https://api.ultravox.ai/api';
  if (!apiKey) throw new Error('ULTRAVOX_API_KEY is not configured');

  const resolvedVoiceId = resolveUltravoxVoiceId(voiceId);

  // Speed is only expressible as a provider-specific `voiceOverrides` block,
  // and only when a voice is actually set — Ultravox rejects overrides without
  // a `voice`. A speed of exactly 1 is the provider default, so we skip the
  // provider lookup entirely in that case.
  let voiceOverrides: Record<string, unknown> | null = null;
  if (
    resolvedVoiceId &&
    typeof options?.speed === 'number' &&
    options.speed !== 1
  ) {
    const provider = await lookupVoiceProvider(resolvedVoiceId, apiKey, baseUrl);
    voiceOverrides = buildVoiceOverrides(provider, options.speed);
  }

  const res = await fetch(`${baseUrl}/calls`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': apiKey,
    },
    body: JSON.stringify({
      systemPrompt,
      ...(resolvedVoiceId ? { voice: resolvedVoiceId } : {}),
      medium: { twilio: {} },
      recordingEnabled: true,
      ...(selectedTools && selectedTools.length > 0 ? { selectedTools } : {}),
      ...(typeof options?.temperature === 'number'
        ? { temperature: options.temperature }
        : {}),
      ...(options?.language ? { languageHint: options.language } : {}),
      ...(options?.model ? { model: options.model } : {}),
      ...(voiceOverrides ? { voiceOverrides } : {}),
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Ultravox call creation failed: ${res.status} ${text}`);
  }

  return (await res.json()) as UltravoxCallResponse;
}
