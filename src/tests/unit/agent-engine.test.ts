import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SPEED,
  MAX_TEMPERATURE,
  MIN_SPEED,
  MIN_TEMPERATURE,
  SUPPORTED_LANGUAGES,
  SUPPORTED_MODELS,
  validateAgentEngine,
} from "@/lib/validation/agent-engine";
import { buildVoiceOverrides, createUltravoxCall } from "@/lib/telephony/ultravox";

describe("validateAgentEngine", () => {
  it("accepts a full set of in-range settings", () => {
    const result = validateAgentEngine({
      temperature: 0.4,
      speed: 1.1,
      language: "en-US",
      model: "ultravox-v0.7",
    });
    expect(result).toEqual({
      ok: true,
      settings: {
        temperature: 0.4,
        speed: 1.1,
        language: "en-US",
        model: "ultravox-v0.7",
      },
    });
  });

  it("accepts a partial update", () => {
    const result = validateAgentEngine({ temperature: 0.8 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.settings).toEqual({ temperature: 0.8 });
      expect(result.settings.speed).toBeUndefined();
    }
  });

  it("accepts the exact range boundaries the API allows", () => {
    for (const value of [MIN_TEMPERATURE, MAX_TEMPERATURE]) {
      expect(validateAgentEngine({ temperature: value }).ok).toBe(true);
    }
    for (const value of [MIN_SPEED, MAX_SPEED]) {
      expect(validateAgentEngine({ speed: value }).ok).toBe(true);
    }
  });

  it("rejects a temperature above 1 with a plain-English message", () => {
    const result = validateAgentEngine({ temperature: 1.5 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toBe("Creativity must be between 0 and 1.");
      // No raw JSON or zod output ever reaches the user.
      expect(result.message).not.toContain("{");
    }
  });

  it("rejects a negative temperature", () => {
    expect(validateAgentEngine({ temperature: -0.1 }).ok).toBe(false);
  });

  it("rejects a speed outside the range every voice provider accepts", () => {
    // 1.4 is legal for Cartesia but hard-fails an Eleven Labs voice, so it is
    // rejected here rather than at dial time.
    const result = validateAgentEngine({ speed: 1.4 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("0.7 and 1.2");
    expect(validateAgentEngine({ speed: 0.5 }).ok).toBe(false);
  });

  it("rejects an unknown language and an unknown model", () => {
    expect(validateAgentEngine({ language: "klingon" }).ok).toBe(false);
    expect(validateAgentEngine({ model: "gpt-4" }).ok).toBe(false);
  });

  it("accepts every advertised language and model", () => {
    for (const { code } of SUPPORTED_LANGUAGES) {
      expect(validateAgentEngine({ language: code }).ok).toBe(true);
    }
    for (const model of SUPPORTED_MODELS) {
      expect(validateAgentEngine({ model }).ok).toBe(true);
    }
  });

  it("rejects an empty update and a non-object body", () => {
    expect(validateAgentEngine({}).ok).toBe(false);
    expect(validateAgentEngine(null).ok).toBe(false);
    expect(validateAgentEngine("nope").ok).toBe(false);
  });

  it("rejects unknown fields rather than silently dropping them", () => {
    const result = validateAgentEngine({ temperature: 0.4, voice_id: "abc" });
    expect(result.ok).toBe(false);
  });

  it("rejects a non-numeric temperature", () => {
    expect(validateAgentEngine({ temperature: "0.4" }).ok).toBe(false);
  });

  it("rounds float artefacts before they reach a stored snapshot", () => {
    const result = validateAgentEngine({ temperature: 0.30000000000000004 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.settings.temperature).toBe(0.3);
  });
});

describe("buildVoiceOverrides", () => {
  it("uses the Eleven Labs field name", () => {
    expect(buildVoiceOverrides("Eleven Labs", 1.15)).toEqual({
      elevenLabs: { speed: 1.15 },
    });
  });

  it("uses Cartesia's nested generationConfig, not its deprecated top-level speed", () => {
    const overrides = buildVoiceOverrides("Cartesia", 1.15);
    expect(overrides).toEqual({ cartesia: { generationConfig: { speed: 1.15 } } });
    // The deprecated CartesiaVoice.speed uses a -1..1 scale; sending 1.15 there
    // would be silently wrong rather than an error.
    expect(overrides).not.toHaveProperty("cartesia.speed");
  });

  it("returns null for an unknown provider so the call still connects", () => {
    expect(buildVoiceOverrides("Some New TTS", 1.15)).toBeNull();
    expect(buildVoiceOverrides(null, 1.15)).toBeNull();
  });
});

describe("createUltravoxCall request body", () => {
  const ELEVEN_LABS_VOICE = "ef6757de-79b1-497b-ad54-c6bef635e2b7";
  const CARTESIA_VOICE = "5f8e97b1-cd48-431a-b6a1-3b94306d8914";
  let fetchMock: ReturnType<typeof vi.fn>;

  function callBody(index = 0): Record<string, unknown> {
    const init = fetchMock.mock.calls[index][1] as RequestInit;
    return JSON.parse(init.body as string);
  }

  beforeEach(() => {
    process.env.ULTRAVOX_API_KEY = "test-key";
    fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ callId: "call-1", joinUrl: "wss://example/1" }),
    });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("sends temperature, languageHint and model using the real API field names", async () => {
    await createUltravoxCall("You are a receptionist.", ELEVEN_LABS_VOICE, undefined, {
      temperature: 0.4,
      language: "en-US",
      model: "ultravox-v0.7",
    });

    const body = callBody();
    expect(body.temperature).toBe(0.4);
    // The API field is `languageHint`, not `language`.
    expect(body.languageHint).toBe("en-US");
    expect(body.language).toBeUndefined();
    expect(body.model).toBe("ultravox-v0.7");
    expect(body.systemPrompt).toBe("You are a receptionist.");
  });

  it("sends speed as an Eleven Labs voiceOverride for an Eleven Labs voice", async () => {
    await createUltravoxCall("prompt", ELEVEN_LABS_VOICE, undefined, { speed: 1.15 });

    const body = callBody();
    expect(body.voiceOverrides).toEqual({ elevenLabs: { speed: 1.15 } });
    // There is no top-level speed field on the Ultravox call API.
    expect(body.speed).toBeUndefined();
  });

  it("sends speed in Cartesia's shape for a Cartesia voice", async () => {
    await createUltravoxCall("prompt", CARTESIA_VOICE, undefined, { speed: 0.9 });

    expect(callBody().voiceOverrides).toEqual({
      cartesia: { generationConfig: { speed: 0.9 } },
    });
  });

  it("omits every setting that was not supplied", async () => {
    await createUltravoxCall("prompt", ELEVEN_LABS_VOICE);

    const body = callBody();
    expect(body.temperature).toBeUndefined();
    expect(body.languageHint).toBeUndefined();
    expect(body.model).toBeUndefined();
    expect(body.voiceOverrides).toBeUndefined();
    // Pre-existing behaviour must be untouched.
    expect(body.medium).toEqual({ twilio: {} });
    expect(body.recordingEnabled).toBe(true);
  });

  it("sends temperature 0 rather than dropping it as falsy", async () => {
    await createUltravoxCall("prompt", ELEVEN_LABS_VOICE, undefined, {
      temperature: 0,
    });
    expect(callBody().temperature).toBe(0);
  });

  it("skips the override at the default speed of 1, avoiding a needless lookup", async () => {
    await createUltravoxCall("prompt", ELEVEN_LABS_VOICE, undefined, { speed: 1 });

    expect(callBody().voiceOverrides).toBeUndefined();
    // Only the call creation itself — no voice-catalog request.
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not send a speed override when no voice is set", async () => {
    await createUltravoxCall("prompt", null, undefined, { speed: 1.15 });

    const body = callBody();
    expect(body.voiceOverrides).toBeUndefined();
    expect(body.voice).toBeUndefined();
  });

  it("still connects the call when the voice provider cannot be resolved", async () => {
    // Unknown voice id -> catalog lookup, which we fail on purpose.
    fetchMock.mockImplementationOnce(async () => ({ ok: false, status: 500 }));

    const result = await createUltravoxCall("prompt", "unknown-voice-id", undefined, {
      speed: 1.15,
      temperature: 0.4,
    });

    expect(result.callId).toBe("call-1");
    const body = callBody(1);
    expect(body.voiceOverrides).toBeUndefined();
    // Losing the override must not lose the other settings.
    expect(body.temperature).toBe(0.4);
  });

  it("still passes selectedTools through alongside the new settings", async () => {
    const tools = [{ temporaryTool: { modelToolName: "book" } }];
    await createUltravoxCall("prompt", ELEVEN_LABS_VOICE, tools, { temperature: 0.2 });

    const body = callBody();
    expect(body.selectedTools).toEqual(tools);
    expect(body.temperature).toBe(0.2);
  });
});
