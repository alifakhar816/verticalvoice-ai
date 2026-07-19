import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  CATALOG_TTL_MS,
  clearVoiceCatalogCache,
  fetchVoiceCatalog,
  filterVoices,
  findVoice,
  getVoiceCatalog,
  isKnownVoiceId,
  listLanguages,
  resolveStoredVoiceId,
  toVoiceSummary,
  type UltravoxCatalogVoice,
} from "@/lib/voices/catalog";

/**
 * Every test here runs against a mocked fetch. The point is the pagination,
 * filtering and validation logic — hitting the real Ultravox API would make
 * these tests slow, non-deterministic and dependent on a live API key.
 */

const BASE = "https://ultravox.test/api";

function voice(overrides: Partial<UltravoxCatalogVoice>): UltravoxCatalogVoice {
  return {
    voiceId: "voice-1",
    name: "Example",
    description: "A voice.",
    primaryLanguage: "en-US",
    languageLabel: "English (United States)",
    previewUrl: "https://storage.example/preview.mp3",
    ownership: "public",
    billingStyle: "VOICE_BILLING_STYLE_INCLUDED",
    provider: "Eleven Labs",
    definition: { elevenLabs: { voiceId: "secret", model: "turbo", speed: 1.0 } },
    ...overrides,
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/** Builds a fetch that serves a fixed set of pages keyed by URL. */
function pagedFetch(pages: Record<string, unknown>) {
  const calls: string[] = [];
  const impl = vi.fn(async (url: string | URL | Request) => {
    const key = String(url);
    calls.push(key);
    if (!(key in pages)) throw new Error(`unexpected fetch: ${key}`);
    return jsonResponse(pages[key]);
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

beforeEach(() => {
  clearVoiceCatalogCache();
});

describe("fetchVoiceCatalog", () => {
  it("follows the next cursor and returns every page flattened", async () => {
    const page1 = `${BASE}/voices?pageSize=200`;
    const page2 = `${BASE}/voices?cursor=abc&pageSize=200`;

    const { impl, calls } = pagedFetch({
      [page1]: {
        next: page2,
        previous: null,
        total: 3,
        results: [voice({ voiceId: "a" }), voice({ voiceId: "b" })],
      },
      [page2]: {
        next: null,
        previous: page1,
        total: 3,
        results: [voice({ voiceId: "c" })],
      },
    });

    const voices = await fetchVoiceCatalog({
      apiKey: "test-key",
      baseUrl: BASE,
      fetchImpl: impl,
    });

    expect(voices.map((v) => v.voiceId)).toEqual(["a", "b", "c"]);
    expect(calls).toEqual([page1, page2]);
  });

  it("sends the API key as X-API-Key on every page", async () => {
    const page1 = `${BASE}/voices?pageSize=200`;
    const page2 = `${BASE}/voices?cursor=abc&pageSize=200`;

    const seenHeaders: unknown[] = [];
    const impl = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      seenHeaders.push(init?.headers);
      return jsonResponse(
        String(url) === page1
          ? { next: page2, previous: null, total: 2, results: [voice({ voiceId: "a" })] }
          : { next: null, previous: page1, total: 2, results: [voice({ voiceId: "b" })] }
      );
    }) as unknown as typeof fetch;

    await fetchVoiceCatalog({ apiKey: "test-key", baseUrl: BASE, fetchImpl: impl });

    expect(seenHeaders).toEqual([
      { "X-API-Key": "test-key" },
      { "X-API-Key": "test-key" },
    ]);
  });

  it("throws rather than returning a partial catalog when a page fails", async () => {
    const impl = vi.fn(async () =>
      jsonResponse({ error: "nope" }, 500)
    ) as unknown as typeof fetch;

    await expect(
      fetchVoiceCatalog({ apiKey: "test-key", baseUrl: BASE, fetchImpl: impl })
    ).rejects.toThrow(/500/);
  });

  it("throws when the response is not a voices page", async () => {
    const impl = vi.fn(async () => jsonResponse({ nope: true })) as unknown as typeof fetch;

    await expect(
      fetchVoiceCatalog({ apiKey: "test-key", baseUrl: BASE, fetchImpl: impl })
    ).rejects.toThrow(/unexpected shape/);
  });

  it("stops instead of looping when next points back at a page already read", async () => {
    const page1 = `${BASE}/voices?pageSize=200`;

    let hits = 0;
    const impl = vi.fn(async () => {
      hits++;
      return jsonResponse({
        next: page1, // upstream pointing at itself
        previous: null,
        total: 1,
        results: [voice({ voiceId: "a" })],
      });
    }) as unknown as typeof fetch;

    const voices = await fetchVoiceCatalog({
      apiKey: "test-key",
      baseUrl: BASE,
      fetchImpl: impl,
    });

    expect(hits).toBe(1);
    expect(voices).toHaveLength(1);
  });

  it("requires an API key", async () => {
    await expect(
      fetchVoiceCatalog({
        apiKey: "",
        baseUrl: BASE,
        fetchImpl: vi.fn() as unknown as typeof fetch,
      })
    ).rejects.toThrow(/ULTRAVOX_API_KEY/);
  });
});

describe("getVoiceCatalog caching", () => {
  it("fetches once and serves later reads from cache", async () => {
    const impl = vi.fn(async () =>
      jsonResponse({ next: null, previous: null, total: 1, results: [voice({ voiceId: "a" })] })
    ) as unknown as typeof fetch;

    process.env.ULTRAVOX_API_KEY = "test-key";
    process.env.ULTRAVOX_BASE_URL = BASE;

    await getVoiceCatalog({ fetchImpl: impl, now: 1_000 });
    await getVoiceCatalog({ fetchImpl: impl, now: 2_000 });

    expect(impl).toHaveBeenCalledTimes(1);
  });

  it("refetches once the TTL has elapsed", async () => {
    const impl = vi.fn(async () =>
      jsonResponse({ next: null, previous: null, total: 1, results: [voice({ voiceId: "a" })] })
    ) as unknown as typeof fetch;

    process.env.ULTRAVOX_API_KEY = "test-key";
    process.env.ULTRAVOX_BASE_URL = BASE;

    await getVoiceCatalog({ fetchImpl: impl, now: 1_000 });
    await getVoiceCatalog({ fetchImpl: impl, now: 1_000 + CATALOG_TTL_MS + 1 });

    expect(impl).toHaveBeenCalledTimes(2);
  });

  it("collapses concurrent cold reads into one upstream fetch", async () => {
    const impl = vi.fn(async () =>
      jsonResponse({ next: null, previous: null, total: 1, results: [voice({ voiceId: "a" })] })
    ) as unknown as typeof fetch;

    process.env.ULTRAVOX_API_KEY = "test-key";
    process.env.ULTRAVOX_BASE_URL = BASE;

    await Promise.all([
      getVoiceCatalog({ fetchImpl: impl, now: 1_000 }),
      getVoiceCatalog({ fetchImpl: impl, now: 1_000 }),
      getVoiceCatalog({ fetchImpl: impl, now: 1_000 }),
    ]);

    expect(impl).toHaveBeenCalledTimes(1);
  });
});

describe("filterVoices", () => {
  const catalog = [
    voice({
      voiceId: "a",
      name: "Jacqueline",
      description: "Confident, upbeat young adult female.",
      primaryLanguage: "en-US",
    }),
    voice({
      voiceId: "b",
      name: "Vera",
      description: "Spanish female voice. Puerto Rican accent.",
      primaryLanguage: "es-PR",
    }),
    voice({
      voiceId: "c",
      name: "Grant",
      description: "Reliable, clear male, professional.",
      primaryLanguage: "en-GB",
    }),
  ];

  it("returns everything when no filters are given", () => {
    expect(filterVoices(catalog, {})).toHaveLength(3);
    expect(filterVoices(catalog, { search: "", language: "" })).toHaveLength(3);
    expect(filterVoices(catalog, { search: null, language: null })).toHaveLength(3);
  });

  it("matches on name, case-insensitively", () => {
    expect(filterVoices(catalog, { search: "jacq" }).map((v) => v.voiceId)).toEqual(["a"]);
  });

  it("matches on description too", () => {
    expect(filterVoices(catalog, { search: "professional" }).map((v) => v.voiceId)).toEqual(["c"]);
  });

  it("filters by exact language code", () => {
    expect(filterVoices(catalog, { language: "en-US" }).map((v) => v.voiceId)).toEqual(["a"]);
    // en-GB must not be caught by an en-US filter.
    expect(filterVoices(catalog, { language: "en" })).toHaveLength(0);
  });

  it("combines search and language with AND", () => {
    expect(
      filterVoices(catalog, { search: "female", language: "es-PR" }).map((v) => v.voiceId)
    ).toEqual(["b"]);
    expect(filterVoices(catalog, { search: "female", language: "en-GB" })).toHaveLength(0);
  });

  it("ignores surrounding whitespace in the search term", () => {
    expect(filterVoices(catalog, { search: "  vera  " }).map((v) => v.voiceId)).toEqual(["b"]);
  });

  it("does not crash on voices missing a description or language", () => {
    const sparse = [
      voice({ voiceId: "d", name: "Nameless", description: null, primaryLanguage: null }),
    ];
    expect(filterVoices(sparse, { search: "nameless" })).toHaveLength(1);
    expect(filterVoices(sparse, { language: "en-US" })).toHaveLength(0);
  });
});

describe("listLanguages", () => {
  it("returns distinct languages with counts, sorted by label", () => {
    const catalog = [
      voice({ voiceId: "a", primaryLanguage: "en-US", languageLabel: "English (United States)" }),
      voice({ voiceId: "b", primaryLanguage: "en-US", languageLabel: "English (United States)" }),
      voice({ voiceId: "c", primaryLanguage: "es-PR", languageLabel: "Spanish (Puerto Rico)" }),
      voice({ voiceId: "d", primaryLanguage: "ar-SA", languageLabel: "Arabic (Saudi Arabia)" }),
    ];

    expect(listLanguages(catalog)).toEqual([
      { code: "ar-SA", label: "Arabic (Saudi Arabia)", count: 1 },
      { code: "en-US", label: "English (United States)", count: 2 },
      { code: "es-PR", label: "Spanish (Puerto Rico)", count: 1 },
    ]);
  });

  it("skips voices with no language rather than inventing a blank option", () => {
    expect(listLanguages([voice({ primaryLanguage: null })])).toEqual([]);
  });
});

describe("voice id validation", () => {
  const catalog = [voice({ voiceId: "real-id" })];

  it("accepts an id present in the catalog", () => {
    expect(isKnownVoiceId(catalog, "real-id")).toBe(true);
    expect(findVoice(catalog, "real-id")?.voiceId).toBe("real-id");
  });

  it("rejects an id that is not in the catalog", () => {
    // Saving this would 400 on every future call with "Voice X does not exist".
    expect(isKnownVoiceId(catalog, "made-up")).toBe(false);
    expect(findVoice(catalog, "made-up")).toBeNull();
  });

  it("rejects a legacy onboarding alias, which is not a catalog id", () => {
    expect(isKnownVoiceId(catalog, "luna")).toBe(false);
  });

  it("is exact, not a prefix or case-insensitive match", () => {
    expect(isKnownVoiceId(catalog, "real")).toBe(false);
    expect(isKnownVoiceId(catalog, "REAL-ID")).toBe(false);
  });
});

describe("resolveStoredVoiceId", () => {
  it("maps a legacy onboarding alias to the catalog id it plays as", () => {
    expect(resolveStoredVoiceId("luna")).toBe("aa601962-1cbd-4bbd-9d96-3c7a93c3414a");
  });

  it("passes a real catalog id through untouched", () => {
    expect(resolveStoredVoiceId("real-id")).toBe("real-id");
  });

  it("handles a tenant with no voice set", () => {
    expect(resolveStoredVoiceId(null)).toBeNull();
  });
});

describe("toVoiceSummary", () => {
  it("drops the provider definition blob", () => {
    const summary = toVoiceSummary(voice({}));
    expect(summary).not.toHaveProperty("definition");
    expect(JSON.stringify(summary)).not.toContain("secret");
  });

  it("keeps the fields the picker renders", () => {
    expect(toVoiceSummary(voice({ voiceId: "a", name: "Vera" }))).toEqual({
      voiceId: "a",
      name: "Vera",
      description: "A voice.",
      language: "en-US",
      languageLabel: "English (United States)",
      provider: "Eleven Labs",
      hasPreview: true,
    });
  });

  it("reports no preview when the clip is missing, so the UI can disable play", () => {
    expect(toVoiceSummary(voice({ previewUrl: null })).hasPreview).toBe(false);
    expect(toVoiceSummary(voice({ previewUrl: "" })).hasPreview).toBe(false);
  });

  it("falls back to the language code when there is no label", () => {
    expect(toVoiceSummary(voice({ languageLabel: null })).languageLabel).toBe("en-US");
    expect(
      toVoiceSummary(voice({ languageLabel: null, primaryLanguage: null })).languageLabel
    ).toBe("Unknown");
  });
});
