import { describe, expect, it, vi, afterEach } from "vitest";
import { createUltravoxCall, ULTRAVOX_MODELS } from "@/lib/telephony/ultravox";

/**
 * Regression guard for a live break: onboarding stored `model: "gpt-4o"` in the
 * config snapshot. That was harmless while the field was never sent, but once
 * engine settings started reaching the call, Ultravox answered every request
 * with 400 ["Model `gpt-4o` does not exist"] — i.e. no call could connect.
 */
function mockFetch() {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ callId: "c1", joinUrl: "wss://x" }),
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function sentBody(fn: ReturnType<typeof mockFetch>) {
  return JSON.parse((fn.mock.calls[0][1] as { body: string }).body);
}

afterEach(() => vi.unstubAllGlobals());

describe("ultravox model guard", () => {
  it("never forwards a model Ultravox does not serve", () => {
    process.env.ULTRAVOX_API_KEY = "k";
    const fn = mockFetch();
    return createUltravoxCall("p", null, undefined, { model: "gpt-4o" }).then(() => {
      // Omitted entirely, so Ultravox applies its own default and the call connects.
      expect(sentBody(fn).model).toBeUndefined();
    });
  });

  it("forwards every model Ultravox does serve", async () => {
    process.env.ULTRAVOX_API_KEY = "k";
    for (const model of ULTRAVOX_MODELS) {
      vi.unstubAllGlobals();
      const fn = mockFetch();
      await createUltravoxCall("p", null, undefined, { model });
      expect(sentBody(fn).model).toBe(model);
    }
  });

  it("omits model when none is configured", async () => {
    process.env.ULTRAVOX_API_KEY = "k";
    const fn = mockFetch();
    await createUltravoxCall("p", null, undefined, {});
    expect(sentBody(fn).model).toBeUndefined();
  });
});
