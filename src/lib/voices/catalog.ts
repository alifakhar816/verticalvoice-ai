/**
 * Ultravox voice catalog: fetching, caching, filtering and validation.
 *
 * `GET https://api.ultravox.ai/api/voices` is a cursor-paginated list of every
 * voice available to our Ultravox account (238 at time of writing, across 57
 * languages). `pageSize` caps out around 200, so a single request never returns
 * the whole catalog and callers MUST follow the `next` cursor.
 *
 * The catalog is effectively static — voices are added by Ultravox, not by us —
 * so we hold it in a module-level cache with a TTL rather than hitting the
 * upstream API on every keystroke of the voice picker's search box. Next.js
 * does not cache Route Handlers by default (and the routes that read this are
 * authenticated, therefore dynamic), so this cache is the only thing standing
 * between the UI and a full re-paginate per request.
 */

/** A voice exactly as Ultravox returns it. */
export interface UltravoxCatalogVoice {
  voiceId: string;
  name: string;
  description?: string | null;
  primaryLanguage?: string | null;
  languageLabel?: string | null;
  previewUrl?: string | null;
  ownership?: string | null;
  billingStyle?: string | null;
  provider?: string | null;
  /**
   * Provider-specific wiring (Eleven Labs ids, models, speeds). Deliberately
   * typed as unknown and never sent to the browser — it leaks our provider
   * plumbing and is useless to the picker.
   */
  definition?: unknown;
}

/** The trimmed, UI-ready shape handed to the browser. */
export interface VoiceSummary {
  voiceId: string;
  name: string;
  description: string;
  language: string;
  languageLabel: string;
  provider: string;
  /** False when Ultravox has no preview clip, so the UI can hide the play button. */
  hasPreview: boolean;
}

/** One entry of the language filter, built from the real catalog. */
export interface VoiceLanguageOption {
  code: string;
  label: string;
  count: number;
}

interface VoicesPage {
  next: string | null;
  previous: string | null;
  total: number;
  results: UltravoxCatalogVoice[];
}

const DEFAULT_BASE_URL = "https://api.ultravox.ai/api";
const PAGE_SIZE = 200;

/**
 * Guards against a malformed `next` cursor looping forever. 238 voices at 200
 * per page is 2 requests; 25 pages is 5,000 voices of headroom.
 */
const MAX_PAGES = 25;

/** The catalog changes on Ultravox's release schedule, not ours. */
export const CATALOG_TTL_MS = 60 * 60 * 1000;

type FetchLike = typeof fetch;

function isVoicesPage(value: unknown): value is VoicesPage {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as { results?: unknown }).results)
  );
}

/**
 * Walks every page of the voice catalog and returns the flattened list.
 *
 * Throws on a non-2xx response rather than returning a partial catalog: a
 * silently short list would let the picker "successfully" hide voices, and
 * would let voice-id validation reject an id that actually exists.
 */
export async function fetchVoiceCatalog(options?: {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: FetchLike;
}): Promise<UltravoxCatalogVoice[]> {
  const apiKey = options?.apiKey ?? process.env.ULTRAVOX_API_KEY;
  if (!apiKey) throw new Error("ULTRAVOX_API_KEY is not configured");

  const baseUrl =
    options?.baseUrl ?? process.env.ULTRAVOX_BASE_URL ?? DEFAULT_BASE_URL;
  const doFetch = options?.fetchImpl ?? fetch;

  const voices: UltravoxCatalogVoice[] = [];
  const seenUrls = new Set<string>();
  let url: string | null = `${baseUrl}/voices?pageSize=${PAGE_SIZE}`;

  for (let page = 0; page < MAX_PAGES && url; page++) {
    // An upstream `next` that points back at a page we already read would
    // otherwise duplicate voices until MAX_PAGES.
    if (seenUrls.has(url)) break;
    seenUrls.add(url);

    const res: Response = await doFetch(url, {
      headers: { "X-API-Key": apiKey },
    });
    if (!res.ok) {
      throw new Error(`Ultravox voice catalog request failed: ${res.status}`);
    }

    const body: unknown = await res.json();
    if (!isVoicesPage(body)) {
      throw new Error("Ultravox voice catalog returned an unexpected shape");
    }

    voices.push(...body.results);
    url = typeof body.next === "string" && body.next.length > 0 ? body.next : null;
  }

  return voices;
}

let cache: { voices: UltravoxCatalogVoice[]; expiresAt: number } | null = null;
/**
 * De-dupes concurrent misses. Without this, N simultaneous page loads on a cold
 * cache each fire their own full pagination.
 */
let inFlight: Promise<UltravoxCatalogVoice[]> | null = null;

/** Returns the catalog, fetching it only when the cache is cold or stale. */
export async function getVoiceCatalog(options?: {
  now?: number;
  fetchImpl?: FetchLike;
}): Promise<UltravoxCatalogVoice[]> {
  const now = options?.now ?? Date.now();
  if (cache && cache.expiresAt > now) return cache.voices;
  if (inFlight) return inFlight;

  inFlight = fetchVoiceCatalog({ fetchImpl: options?.fetchImpl })
    .then((voices) => {
      cache = { voices, expiresAt: now + CATALOG_TTL_MS };
      return voices;
    })
    .finally(() => {
      inFlight = null;
    });

  return inFlight;
}

/** Test seam — drops the cached catalog so the next read refetches. */
export function clearVoiceCatalogCache(): void {
  cache = null;
  inFlight = null;
}

/** Strips the provider `definition` blob and normalises nullable fields. */
export function toVoiceSummary(voice: UltravoxCatalogVoice): VoiceSummary {
  return {
    voiceId: voice.voiceId,
    name: voice.name,
    description: voice.description ?? "",
    language: voice.primaryLanguage ?? "",
    languageLabel: voice.languageLabel ?? voice.primaryLanguage ?? "Unknown",
    provider: voice.provider ?? "",
    hasPreview: typeof voice.previewUrl === "string" && voice.previewUrl.length > 0,
  };
}

/**
 * Filters by free-text search (name or description) and/or exact language code.
 * Both filters are optional and combine with AND.
 */
export function filterVoices(
  voices: UltravoxCatalogVoice[],
  filters: { search?: string | null; language?: string | null }
): UltravoxCatalogVoice[] {
  const search = filters.search?.trim().toLowerCase() ?? "";
  const language = filters.language?.trim() ?? "";

  return voices.filter((voice) => {
    if (language && (voice.primaryLanguage ?? "") !== language) return false;
    if (!search) return true;
    const haystack = `${voice.name ?? ""} ${voice.description ?? ""}`.toLowerCase();
    return haystack.includes(search);
  });
}

/**
 * Builds the language filter options from the catalog itself, so the list can
 * never drift from the voices actually on offer. Sorted by label.
 */
export function listLanguages(
  voices: UltravoxCatalogVoice[]
): VoiceLanguageOption[] {
  const byCode = new Map<string, VoiceLanguageOption>();

  for (const voice of voices) {
    const code = voice.primaryLanguage ?? "";
    if (!code) continue;
    const existing = byCode.get(code);
    if (existing) {
      existing.count += 1;
    } else {
      byCode.set(code, {
        code,
        label: voice.languageLabel ?? code,
        count: 1,
      });
    }
  }

  return [...byCode.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Read-only mirror of `ONBOARDING_VOICE_TO_ULTRAVOX_ID` in
 * `src/lib/telephony/ultravox.ts`, which is not exported.
 *
 * The onboarding wizard stored short marketing names ("luna", "sophia", ...)
 * as the tenant's `voice_id`. Those are not catalog ids, so a tenant still on
 * one of them has no row to highlight in the picker. This map exists purely so
 * the UI can show such a tenant which real voice they are actually hearing.
 *
 * It is display-only: the call path's own aliasing is untouched, so existing
 * tenants keep working whether or not they ever open the voice picker. New
 * selections always persist a real catalog id, which needs no aliasing at all.
 */
const LEGACY_VOICE_ALIASES: Record<string, string> = {
  sophia: "4c8d6eb4-c021-4d56-aec9-656bf6ca6046",
  james: "5f8e97b1-cd48-431a-b6a1-3b94306d8914",
  luna: "aa601962-1cbd-4bbd-9d96-3c7a93c3414a",
  marcus: "ef6757de-79b1-497b-ad54-c6bef635e2b7",
  aria: "33175488-b0f9-4f11-a0c6-3f4edd47353e",
  noah: "199c9635-edbe-4f9c-a626-ca31fb151d15",
};

/**
 * Maps a stored `voice_id` to the catalog id it actually resolves to on a call.
 * Real catalog ids pass through unchanged.
 */
export function resolveStoredVoiceId(voiceId: string | null): string | null {
  if (!voiceId) return null;
  return LEGACY_VOICE_ALIASES[voiceId] ?? voiceId;
}

/** Looks up one voice by its catalog id. Returns null when it does not exist. */
export function findVoice(
  voices: UltravoxCatalogVoice[],
  voiceId: string
): UltravoxCatalogVoice | null {
  return voices.find((voice) => voice.voiceId === voiceId) ?? null;
}

/**
 * True when `voiceId` is a real catalog id.
 *
 * Saving an id Ultravox does not recognise would not fail here — it would fail
 * on every future phone call with "Voice X does not exist", which is why the
 * write path validates before persisting rather than after.
 */
export function isKnownVoiceId(
  voices: UltravoxCatalogVoice[],
  voiceId: string
): boolean {
  return findVoice(voices, voiceId) !== null;
}
