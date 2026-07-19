/**
 * Scheduling rules for the campaign dialer: whose local time is it, may we
 * ring them right now, and when may we try again.
 *
 * All of this is pure and side-effect free so it can be tested exhaustively
 * without a database or a phone network. That matters more here than almost
 * anywhere else in the codebase: the failure mode of a bug in this file is a
 * real person's phone ringing at 6am, which is a complaint, a regulatory
 * problem, and an unfixable first impression — not a stack trace.
 */

// ---------------------------------------------------------------------------
// Timezone resolution
//
// A campaign's calling window is LOCAL wall-clock time, and "local" means
// local to the person being called, not to the business doing the calling. A
// Boston clinic running a 09:00–20:00 window must not dial San Diego at 06:00,
// and it would, if we naively applied the window in the tenant's zone.
//
// We derive the callee's zone from the number itself where the number actually
// carries that information, and fall back to the tenant's zone where it does
// not. The fallback is deliberately the tenant's zone rather than UTC: a
// tenant's list is overwhelmingly local to the tenant, so their zone is by far
// the best guess available when the number tells us nothing.
// ---------------------------------------------------------------------------

/**
 * NANP (+1) area code → IANA zone.
 *
 * Curated rather than exhaustive, and that is a deliberate choice: an area
 * code mapped to the WRONG zone is worse than one that is absent, because an
 * absent code falls back to the tenant's zone (a sane guess) while a wrong one
 * silently authorises calls at a genuinely antisocial hour. Codes below are
 * ones whose zone is unambiguous; unlisted codes fall back.
 *
 * Note the two no-DST zones that are easy to get wrong and are called out
 * explicitly: most of Arizona (America/Phoenix) and Saskatchewan
 * (America/Regina). Mapping those to Denver/Winnipeg would put every summer
 * call an hour out.
 */
const NANP_BY_ZONE: Record<string, readonly string[]> = {
  "America/New_York": [
    // NY
    "212", "646", "332", "917", "718", "347", "929", "516", "631", "845", "914",
    "585", "716", "315", "680", "607", "518", "838", "363",
    // NJ
    "201", "551", "732", "848", "973", "862", "908", "609", "640", "856",
    // PA
    "215", "267", "445", "610", "484", "412", "878", "724", "570", "272", "717",
    "223", "814",
    // New England
    "617", "857", "508", "774", "781", "339", "978", "351", "413", "203", "475",
    "860", "959", "401", "603", "802", "207",
    // MD / DC / DE / WV
    "301", "240", "410", "443", "667", "227", "202", "302", "304", "681",
    // VA
    "703", "571", "804", "757", "540", "434", "276",
    // NC / SC
    "704", "980", "919", "984", "336", "743", "910", "828", "252",
    "803", "839", "843", "854", "864",
    // GA
    "404", "470", "678", "770", "943", "706", "762", "912", "229", "478",
    // FL
    "305", "786", "954", "754", "561", "772", "407", "321", "689", "813", "727",
    "941", "239", "904", "386", "352", "656", "448",
    // OH
    "216", "440", "614", "380", "513", "937", "330", "234", "419", "567", "740",
    "220",
    // MI
    "313", "679", "248", "947", "586", "734", "517", "810", "989", "231", "616",
    "269",
    // IN (Indianapolis and most of the state observe Eastern)
    "317", "463", "260", "574", "765", "812", "930",
    // KY (Louisville/Lexington) + east TN
    "502", "859", "606", "423", "865",
    // Ontario / Quebec
    "416", "647", "437", "905", "289", "365", "613", "343", "705", "249", "519",
    "226", "548", "807", "514", "438", "450", "579", "819", "873", "418", "367",
    "581",
  ],
  "America/Chicago": [
    // IL
    "312", "872", "773", "224", "847", "630", "331", "708", "464", "815", "779",
    "217", "309", "618",
    // TX (El Paso 915 is Mountain and is listed there, not here)
    "214", "469", "972", "945", "817", "682", "713", "281", "832", "346", "210",
    "726", "512", "737", "940", "903", "430", "254", "325", "361", "979", "806",
    // MO / KS / NE / IA
    "314", "557", "636", "816", "975", "417", "573", "316", "785", "620", "913",
    "402", "531", "308", "515", "319", "563", "641", "712",
    // MN / WI
    "612", "651", "952", "763", "218", "507", "320", "414", "262", "608", "920",
    "715", "534",
    // OK / AR / LA / MS / AL
    "405", "572", "918", "539", "580", "501", "479", "870", "504", "225", "337",
    "318", "985", "601", "769", "662", "228", "205", "659", "251", "256", "938",
    "334",
    // TN (Nashville / Memphis)
    "615", "629", "901", "731", "931",
    // Dakotas + Manitoba
    "701", "605", "204", "431",
  ],
  "America/Denver": [
    "303", "720", "983", "970", "719", // CO
    "801", "385", "435", // UT
    "505", "575", // NM
    "406", "307", // MT, WY
    "208", "986", // ID (southern; northern ID is Pacific — falls back if wrong)
    "915", // El Paso, TX
    "403", "587", "780", "825", "368", // Alberta
  ],
  // Most of Arizona does NOT observe DST. Mapping these to America/Denver
  // would shift every summer call by an hour.
  "America/Phoenix": ["602", "480", "623", "520", "928"],
  // Saskatchewan likewise does not observe DST.
  "America/Regina": ["306", "639"],
  "America/Los_Angeles": [
    // CA
    "213", "323", "310", "424", "562", "626", "661", "747", "818", "909", "951",
    "714", "657", "949", "760", "442", "619", "858", "935", "805", "820", "831",
    "408", "669", "650", "415", "628", "510", "341", "925", "707", "916", "279",
    "530", "559", "209", "350",
    // WA / OR / NV
    "206", "564", "253", "425", "360", "509", "503", "971", "541", "458",
    "702", "725", "775",
    // BC
    "604", "778", "236", "672", "250",
  ],
  "America/Anchorage": ["907"],
  "Pacific/Honolulu": ["808"],
  "America/St_Johns": ["709"],
  "America/Halifax": ["902", "782"],
  "America/Puerto_Rico": [
    "787", "939", "340", "809", "829", "849", "246", "868", "473", "758", "767",
    "784", "869", "721", "284",
  ],
  "Atlantic/Bermuda": ["441"],
  "America/Jamaica": ["876", "658"],
  "America/Nassau": ["242"],
  "America/Cayman": ["345"],
};

const NANP_AREA_TO_ZONE: Record<string, string> = {};
for (const [zone, codes] of Object.entries(NANP_BY_ZONE)) {
  for (const code of codes) NANP_AREA_TO_ZONE[code] = zone;
}

/**
 * Non-NANP country calling code → IANA zone.
 *
 * Restricted to countries that are effectively a SINGLE timezone. Countries
 * that span several (Brazil +55, Mexico +52, Russia +7, Australia +61,
 * Indonesia +62) are deliberately absent: for those, the country code simply
 * does not determine local time, and pretending otherwise would be inventing
 * an answer. They fall back to the tenant's zone like any unknown number.
 */
const COUNTRY_CODE_TO_ZONE: Record<string, string> = {
  "44": "Europe/London", "353": "Europe/Dublin", "351": "Europe/Lisbon",
  "33": "Europe/Paris", "34": "Europe/Madrid", "39": "Europe/Rome",
  "49": "Europe/Berlin", "31": "Europe/Amsterdam", "32": "Europe/Brussels",
  "41": "Europe/Zurich", "43": "Europe/Vienna", "352": "Europe/Luxembourg",
  "45": "Europe/Copenhagen", "46": "Europe/Stockholm", "47": "Europe/Oslo",
  "358": "Europe/Helsinki", "354": "Atlantic/Reykjavik",
  "48": "Europe/Warsaw", "420": "Europe/Prague", "421": "Europe/Bratislava",
  "36": "Europe/Budapest", "40": "Europe/Bucharest", "30": "Europe/Athens",
  "385": "Europe/Zagreb", "386": "Europe/Ljubljana", "359": "Europe/Sofia",
  "90": "Europe/Istanbul", "972": "Asia/Jerusalem", "961": "Asia/Beirut",
  "971": "Asia/Dubai", "966": "Asia/Riyadh", "974": "Asia/Qatar",
  "965": "Asia/Kuwait", "973": "Asia/Bahrain", "968": "Asia/Muscat",
  "962": "Asia/Amman", "964": "Asia/Baghdad",
  "20": "Africa/Cairo", "27": "Africa/Johannesburg", "234": "Africa/Lagos",
  "254": "Africa/Nairobi", "233": "Africa/Accra", "212": "Africa/Casablanca",
  "216": "Africa/Tunis", "213": "Africa/Algiers", "256": "Africa/Kampala",
  "91": "Asia/Kolkata", "92": "Asia/Karachi", "880": "Asia/Dhaka",
  "94": "Asia/Colombo", "977": "Asia/Kathmandu", "66": "Asia/Bangkok",
  "84": "Asia/Ho_Chi_Minh", "65": "Asia/Singapore", "60": "Asia/Kuala_Lumpur",
  "63": "Asia/Manila", "852": "Asia/Hong_Kong", "853": "Asia/Macau",
  "886": "Asia/Taipei", "82": "Asia/Seoul", "81": "Asia/Tokyo",
  "86": "Asia/Shanghai", "64": "Pacific/Auckland",
  "51": "America/Lima", "56": "America/Santiago", "57": "America/Bogota",
  "58": "America/Caracas", "54": "America/Argentina/Buenos_Aires",
  "598": "America/Montevideo", "595": "America/Asuncion",
  "591": "America/La_Paz", "593": "America/Guayaquil",
  "502": "America/Guatemala", "503": "America/El_Salvador",
  "504": "America/Tegucigalpa", "505": "America/Managua",
  "506": "America/Costa_Rica", "507": "America/Panama", "53": "America/Havana",
};

/** Longest country codes first, so "353" wins over a "35" style prefix. */
const COUNTRY_CODES_BY_LENGTH = Object.keys(COUNTRY_CODE_TO_ZONE).sort(
  (a, b) => b.length - a.length
);

export const DEFAULT_TIMEZONE = "UTC";

/** True if the runtime recognises this IANA zone. */
export function isValidTimezone(tz: string | null | undefined): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Best available guess at the local timezone of whoever answers `phone`.
 *
 * Order: the number's own geography (NANP area code, then country code), then
 * the tenant's zone, then UTC. Never throws and never returns an invalid zone
 * — a scheduling helper that can throw would take the whole dialer tick down.
 */
export function resolveContactTimezone(
  phone: string | null | undefined,
  tenantTimezone: string | null | undefined
): string {
  const fallback = isValidTimezone(tenantTimezone)
    ? (tenantTimezone as string)
    : DEFAULT_TIMEZONE;

  if (!phone) return fallback;

  // Keep digits only; a leading "+" is the only reliable signal of E.164, but
  // lists arrive as "(415) 555-0100" and "001-415-555-0100" too.
  let digits = phone.replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);

  // NANP: 11 digits starting with 1, or a bare 10-digit domestic number.
  if (digits.length === 11 && digits.startsWith("1")) {
    return NANP_AREA_TO_ZONE[digits.slice(1, 4)] ?? fallback;
  }
  if (digits.length === 10 && !phone.trim().startsWith("+")) {
    return NANP_AREA_TO_ZONE[digits.slice(0, 3)] ?? fallback;
  }

  for (const cc of COUNTRY_CODES_BY_LENGTH) {
    if (digits.startsWith(cc)) return COUNTRY_CODE_TO_ZONE[cc];
  }

  return fallback;
}

// ---------------------------------------------------------------------------
// Calling window
// ---------------------------------------------------------------------------

/** Minutes past local midnight for `date` as observed in `timezone`. */
export function localMinutesOfDay(date: Date, timezone: string): number {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
  // `Intl` is the only DST-correct way to do this in plain JS: it resolves the
  // offset that actually applied at that instant, rather than the one that
  // applies today.
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/** Parses a Postgres TIME ("09:00", "09:00:00") into minutes past midnight. */
export function parseWindowTime(
  value: string | null | undefined,
  fallbackMinutes: number
): number {
  if (!value) return fallbackMinutes;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return fallbackMinutes;
  const hours = Number(m[1]);
  const minutes = Number(m[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return fallbackMinutes;
  if (hours > 23 || minutes > 59) return fallbackMinutes;
  return hours * 60 + minutes;
}

export interface CallingWindow {
  /** Local wall-clock start, e.g. "09:00". */
  start: string;
  /** Local wall-clock end (exclusive), e.g. "20:00". */
  end: string;
}

/**
 * May we ring someone in `timezone` at instant `now`?
 *
 * A window where start === end is treated as CLOSED, not as "all day". If an
 * operator manages to save 09:00–09:00 the safe reading of their intent is
 * "no time", because the cost of guessing wrong in the permissive direction is
 * calls around the clock.
 */
export function isWithinCallingWindow(
  now: Date,
  timezone: string,
  window: CallingWindow
): boolean {
  const start = parseWindowTime(window.start, 9 * 60);
  const end = parseWindowTime(window.end, 20 * 60);
  if (start === end) return false;

  const minutes = localMinutesOfDay(now, timezone);
  // A window that wraps past local midnight (e.g. 20:00–02:00) is two ranges.
  if (start < end) return minutes >= start && minutes < end;
  return minutes >= start || minutes < end;
}

const MINUTE_MS = 60_000;

/**
 * The next instant at which `timezone` enters the window.
 *
 * Implemented by stepping forward a minute at a time rather than by arithmetic
 * on local dates, because minute-stepping is DST-proof for free: on a spring
 * forward the missing local hour simply never tests true, and on a fall back
 * the repeated hour tests true twice and we take the first. Bounded at 8 days
 * so a nonsensical window can never spin.
 */
export function nextWindowOpening(
  now: Date,
  timezone: string,
  window: CallingWindow
): Date | null {
  const start = parseWindowTime(window.start, 9 * 60);
  const end = parseWindowTime(window.end, 20 * 60);
  if (start === end) return null; // never opens

  const LIMIT_MINUTES = 8 * 24 * 60;
  for (let i = 1; i <= LIMIT_MINUTES; i += 1) {
    const candidate = new Date(now.getTime() + i * MINUTE_MS);
    if (isWithinCallingWindow(candidate, timezone, window)) return candidate;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Retry / backoff
// ---------------------------------------------------------------------------

export interface RetryDecision {
  /** No further attempts will be made. */
  giveUp: boolean;
  /** When to try again; null when giving up. */
  nextAttemptAt: Date | null;
  /** Attempts consumed so far, including the one that just failed. */
  attempts: number;
}

/**
 * 24h ceiling: doubling forever would schedule a retry weeks out and the row
 * would sit in the queue looking alive while being effectively dead.
 */
const MAX_BACKOFF_MINUTES = 24 * 60;

/**
 * What to do after a dial attempt failed (no answer, busy, provider error).
 *
 * Backoff is exponential on the campaign's base delay. The first retry waits
 * the configured delay, the second twice that, and so on — someone who did not
 * pick up twice in a row is less likely to pick up on the third try soon
 * after, and spacing attempts out is also the difference between "we tried to
 * reach you" and "your phone would not stop ringing".
 */
export function computeRetry(params: {
  /** Attempts BEFORE this failure. */
  previousAttempts: number;
  maxAttempts: number;
  retryDelayMinutes: number;
  now: Date;
}): RetryDecision {
  const attempts = params.previousAttempts + 1;
  const maxAttempts = Math.max(1, params.maxAttempts);

  if (attempts >= maxAttempts) {
    return { giveUp: true, nextAttemptAt: null, attempts };
  }

  const base = Math.max(1, params.retryDelayMinutes);
  const factor = 2 ** (attempts - 1);
  const delay = Math.min(base * factor, MAX_BACKOFF_MINUTES);
  return {
    giveUp: false,
    nextAttemptAt: new Date(params.now.getTime() + delay * MINUTE_MS),
    attempts,
  };
}

// ---------------------------------------------------------------------------
// Pacing
// ---------------------------------------------------------------------------

/**
 * How many calls this tick may actually place.
 *
 * Both ceilings apply at once and the tighter one wins. `liveCalls` is counted
 * across the whole TENANT, not the campaign: two campaigns running side by
 * side share one phone number and one Twilio account, and a concurrency limit
 * that each campaign interpreted privately would be no limit at all.
 *
 * Never returns a negative number — a tenant already over its ceiling (calls
 * left over from a previous configuration) means "place none", not "place a
 * negative number", which would read as a large number after any later
 * arithmetic.
 */
export function computeDialBudget(params: {
  maxConcurrentCalls: number;
  callsPerMinute: number;
  /** Calls currently live for the tenant. */
  liveCalls: number;
  /** Calls this tenant already started within the last 60 seconds. */
  dialedInLastMinute: number;
}): number {
  const concurrencyHeadroom = params.maxConcurrentCalls - params.liveCalls;
  const rateHeadroom = params.callsPerMinute - params.dialedInLastMinute;
  return Math.max(0, Math.min(concurrencyHeadroom, rateHeadroom));
}
