import { describe, expect, it } from "vitest";
import {
  computeDialBudget,
  computeRetry,
  DEFAULT_MAX_CALLS_PER_DAY,
  DEFAULT_MAX_CALLS_PER_WEEK,
  evaluateFrequencyCap,
  isWithinCallingWindow,
  localMinutesOfDay,
  nextWindowOpening,
  parseWindowTime,
  resolveContactTimezone,
  resolveFrequencyCaps,
} from "@/lib/campaigns/schedule";

const BUSINESS_HOURS = { start: "09:00", end: "20:00" };

describe("resolveContactTimezone", () => {
  it("derives the callee's zone from a NANP area code, not the tenant's", () => {
    // The whole point: a New York tenant calling a California number must get
    // California's clock, or the window is applied three hours out.
    expect(resolveContactTimezone("+14155550100", "America/New_York")).toBe(
      "America/Los_Angeles"
    );
    expect(resolveContactTimezone("+12125550100", "America/Los_Angeles")).toBe(
      "America/New_York"
    );
  });

  it("handles the no-DST zones that a naive state mapping gets wrong", () => {
    expect(resolveContactTimezone("+16025550100", "America/New_York")).toBe("America/Phoenix");
    expect(resolveContactTimezone("+13065550100", "America/Toronto")).toBe("America/Regina");
  });

  it("reads non-NANP country codes, longest prefix first", () => {
    expect(resolveContactTimezone("+442071234567", "America/New_York")).toBe("Europe/London");
    expect(resolveContactTimezone("+353871234567", "America/New_York")).toBe("Europe/Dublin");
    expect(resolveContactTimezone("+919876543210", "America/New_York")).toBe("Asia/Kolkata");
    expect(resolveContactTimezone("+81312345678", "America/New_York")).toBe("Asia/Tokyo");
  });

  it("accepts messy real-world formats", () => {
    expect(resolveContactTimezone("(415) 555-0100", "America/New_York")).toBe(
      "America/Los_Angeles"
    );
    expect(resolveContactTimezone("1-415-555-0100", "America/New_York")).toBe(
      "America/Los_Angeles"
    );
    expect(resolveContactTimezone("0014155550100", "America/New_York")).toBe(
      "America/Los_Angeles"
    );
  });

  it("falls back to the tenant zone when the number carries no geography", () => {
    // +61 (Australia) spans several zones, so the country code genuinely does
    // not determine local time and we must not invent one.
    expect(resolveContactTimezone("+61412345678", "America/Chicago")).toBe("America/Chicago");
    expect(resolveContactTimezone("+5511987654321", "America/Chicago")).toBe("America/Chicago");
    expect(resolveContactTimezone(null, "America/Chicago")).toBe("America/Chicago");
  });

  it("falls back to UTC when the tenant zone is missing or nonsense", () => {
    expect(resolveContactTimezone("+61412345678", null)).toBe("UTC");
    expect(resolveContactTimezone("+61412345678", "Mars/Olympus_Mons")).toBe("UTC");
  });
});

describe("parseWindowTime", () => {
  it("reads both the HH:MM and Postgres HH:MM:SS forms", () => {
    expect(parseWindowTime("09:00", 0)).toBe(540);
    expect(parseWindowTime("09:00:00", 0)).toBe(540);
    expect(parseWindowTime("20:30:00", 0)).toBe(1230);
  });

  it("falls back rather than throwing on garbage", () => {
    expect(parseWindowTime("not a time", 540)).toBe(540);
    expect(parseWindowTime("99:99", 540)).toBe(540);
    expect(parseWindowTime(null, 540)).toBe(540);
  });
});

describe("localMinutesOfDay", () => {
  it("resolves the offset that applied at that instant, across zones", () => {
    // 2026-07-19T20:00:00Z — summer, so US zones are on daylight time.
    const instant = new Date("2026-07-19T20:00:00Z");
    expect(localMinutesOfDay(instant, "UTC")).toBe(20 * 60);
    expect(localMinutesOfDay(instant, "America/New_York")).toBe(16 * 60); // EDT, UTC-4
    expect(localMinutesOfDay(instant, "America/Los_Angeles")).toBe(13 * 60); // PDT, UTC-7
    expect(localMinutesOfDay(instant, "Asia/Kolkata")).toBe(60 + 30); // +05:30 -> 01:30
  });

  it("tracks DST rather than a fixed offset", () => {
    // Same wall clock in UTC, six months apart: New York shifts by an hour.
    const summer = new Date("2026-07-19T17:00:00Z");
    const winter = new Date("2026-01-19T17:00:00Z");
    expect(localMinutesOfDay(summer, "America/New_York")).toBe(13 * 60); // EDT
    expect(localMinutesOfDay(winter, "America/New_York")).toBe(12 * 60); // EST
  });
});

describe("isWithinCallingWindow", () => {
  it("is the difference between a civil hour and a 6am cold call", () => {
    // 13:00 UTC. New York 09:00 (open), Los Angeles 06:00 (must NOT be called).
    const instant = new Date("2026-07-19T13:00:00Z");
    expect(isWithinCallingWindow(instant, "America/New_York", BUSINESS_HOURS)).toBe(true);
    expect(isWithinCallingWindow(instant, "America/Los_Angeles", BUSINESS_HOURS)).toBe(false);
  });

  it("treats the end of the window as exclusive", () => {
    // Exactly 20:00 in New York — the window has closed.
    const atEnd = new Date("2026-07-20T00:00:00Z");
    expect(localMinutesOfDay(atEnd, "America/New_York")).toBe(20 * 60);
    expect(isWithinCallingWindow(atEnd, "America/New_York", BUSINESS_HOURS)).toBe(false);
  });

  it("includes the exact opening minute", () => {
    const atStart = new Date("2026-07-19T13:00:00Z");
    expect(localMinutesOfDay(atStart, "America/New_York")).toBe(9 * 60);
    expect(isWithinCallingWindow(atStart, "America/New_York", BUSINESS_HOURS)).toBe(true);
  });

  it("supports a window that wraps past local midnight", () => {
    const overnight = { start: "22:00", end: "02:00" };
    const at23 = new Date("2026-07-20T03:00:00Z"); // 23:00 New York
    const at01 = new Date("2026-07-20T05:00:00Z"); // 01:00 New York
    const at12 = new Date("2026-07-19T16:00:00Z"); // 12:00 New York
    expect(isWithinCallingWindow(at23, "America/New_York", overnight)).toBe(true);
    expect(isWithinCallingWindow(at01, "America/New_York", overnight)).toBe(true);
    expect(isWithinCallingWindow(at12, "America/New_York", overnight)).toBe(false);
  });

  it("treats a zero-length window as CLOSED, never as all-day", () => {
    // The permissive reading of 09:00-09:00 would be calls around the clock.
    const anytime = new Date("2026-07-19T15:00:00Z");
    expect(
      isWithinCallingWindow(anytime, "America/New_York", { start: "09:00", end: "09:00" })
    ).toBe(false);
  });
});

describe("nextWindowOpening", () => {
  it("parks an out-of-hours target on the next local opening", () => {
    // 13:00 UTC = 06:00 in Los Angeles. Next opening is 09:00 local = 16:00 UTC.
    const now = new Date("2026-07-19T13:00:00Z");
    const opening = nextWindowOpening(now, "America/Los_Angeles", BUSINESS_HOURS);
    expect(opening).not.toBeNull();
    expect(localMinutesOfDay(opening as Date, "America/Los_Angeles")).toBe(9 * 60);
    expect((opening as Date).getTime()).toBeGreaterThan(now.getTime());
    // Within the same day, not a week out.
    expect((opening as Date).getTime() - now.getTime()).toBeLessThanOrEqual(4 * 60 * 60 * 1000);
  });

  it("rolls to the next day when the window has already closed", () => {
    // 02:00 UTC = 22:00 previous day in New York; window shut at 20:00.
    const now = new Date("2026-07-20T02:00:00Z");
    const opening = nextWindowOpening(now, "America/New_York", BUSINESS_HOURS);
    expect(opening).not.toBeNull();
    expect(localMinutesOfDay(opening as Date, "America/New_York")).toBe(9 * 60);
  });

  it("returns null for a window that never opens, instead of spinning", () => {
    const now = new Date("2026-07-19T13:00:00Z");
    expect(
      nextWindowOpening(now, "America/New_York", { start: "09:00", end: "09:00" })
    ).toBeNull();
  });

  it("never lands inside the hour that does not exist on a spring-forward day", () => {
    // US DST 2026 begins 2026-03-08; local 02:00-03:00 never happens.
    const now = new Date("2026-03-08T06:30:00Z"); // 01:30 EST
    const opening = nextWindowOpening(now, "America/New_York", { start: "02:00", end: "02:30" });
    if (opening) {
      // Whatever it returns must be a real local time inside the window.
      const local = localMinutesOfDay(opening, "America/New_York");
      expect(local).toBeGreaterThanOrEqual(2 * 60);
      expect(local).toBeLessThan(2 * 60 + 30);
      expect(opening.getTime()).toBeGreaterThan(now.getTime());
    }
  });
});

describe("computeRetry", () => {
  const now = new Date("2026-07-19T12:00:00Z");

  it("backs off exponentially from the configured delay", () => {
    const first = computeRetry({ previousAttempts: 0, maxAttempts: 4, retryDelayMinutes: 30, now });
    expect(first.giveUp).toBe(false);
    expect(first.attempts).toBe(1);
    expect(first.nextAttemptAt?.getTime()).toBe(now.getTime() + 30 * 60_000);

    const second = computeRetry({ previousAttempts: 1, maxAttempts: 4, retryDelayMinutes: 30, now });
    expect(second.nextAttemptAt?.getTime()).toBe(now.getTime() + 60 * 60_000);

    const third = computeRetry({ previousAttempts: 2, maxAttempts: 4, retryDelayMinutes: 30, now });
    expect(third.nextAttemptAt?.getTime()).toBe(now.getTime() + 120 * 60_000);
  });

  it("gives up exactly at max_attempts and schedules nothing further", () => {
    const decision = computeRetry({
      previousAttempts: 2,
      maxAttempts: 3,
      retryDelayMinutes: 60,
      now,
    });
    expect(decision.giveUp).toBe(true);
    expect(decision.attempts).toBe(3);
    expect(decision.nextAttemptAt).toBeNull();
  });

  it("gives up after a single attempt when max_attempts is 1", () => {
    const decision = computeRetry({
      previousAttempts: 0,
      maxAttempts: 1,
      retryDelayMinutes: 60,
      now,
    });
    expect(decision.giveUp).toBe(true);
    expect(decision.attempts).toBe(1);
  });

  it("caps the backoff at 24h so a retry is never scheduled weeks out", () => {
    const decision = computeRetry({
      previousAttempts: 9,
      maxAttempts: 20,
      retryDelayMinutes: 600,
      now,
    });
    expect(decision.nextAttemptAt?.getTime()).toBe(now.getTime() + 24 * 60 * 60_000);
  });
});

describe("computeDialBudget", () => {
  it("takes the tighter of the two ceilings", () => {
    expect(
      computeDialBudget({
        maxConcurrentCalls: 10,
        callsPerMinute: 3,
        liveCalls: 0,
        dialedInLastMinute: 0,
      })
    ).toBe(3);

    expect(
      computeDialBudget({
        maxConcurrentCalls: 2,
        callsPerMinute: 30,
        liveCalls: 0,
        dialedInLastMinute: 0,
      })
    ).toBe(2);
  });

  it("subtracts calls already live and already placed this minute", () => {
    expect(
      computeDialBudget({
        maxConcurrentCalls: 5,
        callsPerMinute: 10,
        liveCalls: 3,
        dialedInLastMinute: 0,
      })
    ).toBe(2);

    expect(
      computeDialBudget({
        maxConcurrentCalls: 10,
        callsPerMinute: 5,
        liveCalls: 0,
        dialedInLastMinute: 4,
      })
    ).toBe(1);
  });

  it("returns zero — never a negative — when already over capacity", () => {
    // A negative budget would read as a huge LIMIT after any later arithmetic.
    expect(
      computeDialBudget({
        maxConcurrentCalls: 2,
        callsPerMinute: 5,
        liveCalls: 7,
        dialedInLastMinute: 0,
      })
    ).toBe(0);

    expect(
      computeDialBudget({
        maxConcurrentCalls: 5,
        callsPerMinute: 2,
        liveCalls: 0,
        dialedInLastMinute: 9,
      })
    ).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Per-person frequency caps
//
// The failure mode these guard is a real person being rung nine times in a day
// by three campaigns that each believed they were being polite. Exhaustive
// here because the arithmetic is rolling-window arithmetic, which is easy to
// get subtly wrong in the permissive direction.
// ---------------------------------------------------------------------------

const NOW = new Date("2026-07-19T15:00:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** `n` hours before NOW, as an ISO string — the shape `calls.started_at` has. */
function hoursAgo(n: number): string {
  return new Date(NOW.getTime() - n * HOUR).toISOString();
}

const CAPS = { maxPerDay: 3, maxPerWeek: 10 };

describe("frequency caps — configuration", () => {
  it("falls back to the conservative defaults when unconfigured", () => {
    // An absent setting is NOT consent to call without limit.
    for (const settings of [null, undefined, {}]) {
      expect(resolveFrequencyCaps(settings)).toEqual({
        maxPerDay: DEFAULT_MAX_CALLS_PER_DAY,
        maxPerWeek: DEFAULT_MAX_CALLS_PER_WEEK,
      });
    }
  });

  it("treats a null column as unconfigured rather than unlimited", () => {
    expect(
      resolveFrequencyCaps({ max_calls_per_day: null, max_calls_per_week: null })
    ).toEqual({ maxPerDay: 3, maxPerWeek: 10 });
  });

  it("honours a tenant's own numbers, including a stricter zero", () => {
    expect(
      resolveFrequencyCaps({ max_calls_per_day: 1, max_calls_per_week: 2 })
    ).toEqual({ maxPerDay: 1, maxPerWeek: 2 });
    expect(
      resolveFrequencyCaps({ max_calls_per_day: 0, max_calls_per_week: 0 })
    ).toEqual({ maxPerDay: 0, maxPerWeek: 0 });
  });

  it("clamps a nonsensical negative to zero rather than reading it as unset", () => {
    // The safe reading of a mistake is the restrictive one.
    expect(resolveFrequencyCaps({ max_calls_per_day: -5 }).maxPerDay).toBe(0);
  });
});

describe("frequency caps — the decision", () => {
  it("allows a dial below the daily limit", () => {
    const decision = evaluateFrequencyCap({
      recentCallStarts: [hoursAgo(1), hoursAgo(5)],
      caps: CAPS,
      now: NOW,
    });
    expect(decision.allowed).toBe(true);
    expect(decision.retryAt).toBeNull();
  });

  it("blocks the dial that would exceed the daily limit", () => {
    const decision = evaluateFrequencyCap({
      recentCallStarts: [hoursAgo(1), hoursAgo(5), hoursAgo(9)],
      caps: CAPS,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("daily_cap");
  });

  it("allows the first dial when there is no history at all", () => {
    expect(
      evaluateFrequencyCap({ recentCallStarts: [], caps: CAPS, now: NOW }).allowed
    ).toBe(true);
  });

  it("rolls the window off — the oldest call ageing out reopens the door", () => {
    // Three calls at the cap: blocked, and retryable exactly when the OLDEST
    // one leaves the rolling 24h window, not a moment later.
    const oldest = hoursAgo(9);
    const decision = evaluateFrequencyCap({
      recentCallStarts: [hoursAgo(1), hoursAgo(5), oldest],
      caps: CAPS,
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.retryAt?.getTime()).toBe(new Date(oldest).getTime() + DAY);

    // And at that instant it is genuinely allowed again.
    const later = new Date(decision.retryAt!.getTime() + 1000);
    expect(
      evaluateFrequencyCap({
        recentCallStarts: [hoursAgo(1), hoursAgo(5), oldest],
        caps: CAPS,
        now: later,
      }).allowed
    ).toBe(true);
  });

  it("ignores calls that already fell out of the window", () => {
    // Three calls, but all older than 24h: the daily window is empty.
    expect(
      evaluateFrequencyCap({
        recentCallStarts: [hoursAgo(30), hoursAgo(40), hoursAgo(50)],
        caps: CAPS,
        now: NOW,
      }).allowed
    ).toBe(true);
  });

  it("waits only as long as it must when well over the cap", () => {
    // Five calls against a cap of three: we need the THIRD-oldest to age out,
    // not the newest. Waiting for the newest would delay by a full extra day.
    const starts = [hoursAgo(2), hoursAgo(4), hoursAgo(6), hoursAgo(8), hoursAgo(10)];
    const decision = evaluateFrequencyCap({ recentCallStarts: starts, caps: CAPS, now: NOW });
    expect(decision.retryAt?.getTime()).toBe(new Date(hoursAgo(6)).getTime() + DAY);
  });

  it("enforces the weekly ceiling even when the day is clear", () => {
    // Ten calls spread across the week, none in the last 24h. The daily window
    // is empty, but the person has still been rung ten times this week.
    const starts = Array.from({ length: 10 }, (_, i) => hoursAgo(30 + i * 10));
    const decision = evaluateFrequencyCap({ recentCallStarts: starts, caps: CAPS, now: NOW });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("weekly_cap");
  });

  it("takes the LATER reopening when both ceilings bind", () => {
    // Under both windows at once, the weekly one opens much later and it is
    // the weekly one that must be obeyed.
    const starts = [
      ...Array.from({ length: 8 }, (_, i) => hoursAgo(30 + i * 10)),
      hoursAgo(1),
      hoursAgo(2),
      hoursAgo(3),
    ];
    const decision = evaluateFrequencyCap({ recentCallStarts: starts, caps: CAPS, now: NOW });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("weekly_cap");
    // Later than any purely-daily roll-off could be.
    expect(decision.retryAt!.getTime()).toBeGreaterThan(NOW.getTime() + DAY);
  });

  it("never reopens when the cap is zero", () => {
    // A retry time here would silently become a dial. Park indefinitely.
    const decision = evaluateFrequencyCap({
      recentCallStarts: [hoursAgo(100)],
      caps: { maxPerDay: 0, maxPerWeek: 10 },
      now: NOW,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.retryAt).toBeNull();
  });

  it("blocks on a zero cap even with no call history whatsoever", () => {
    // Zero means zero: not "zero more than you've already had".
    expect(
      evaluateFrequencyCap({
        recentCallStarts: [],
        caps: { maxPerDay: 0, maxPerWeek: 0 },
        now: NOW,
      }).allowed
    ).toBe(false);
  });

  it("ignores unparseable timestamps rather than throwing", () => {
    // A scheduling helper that throws takes the whole dialer tick down.
    const decision = evaluateFrequencyCap({
      recentCallStarts: ["not-a-date", "", hoursAgo(1)],
      caps: CAPS,
      now: NOW,
    });
    expect(decision.allowed).toBe(true);
  });

  it("accepts Date objects as readily as ISO strings", () => {
    expect(
      evaluateFrequencyCap({
        recentCallStarts: [new Date(NOW.getTime() - HOUR)],
        caps: { maxPerDay: 1, maxPerWeek: 10 },
        now: NOW,
      }).allowed
    ).toBe(false);
  });
});
