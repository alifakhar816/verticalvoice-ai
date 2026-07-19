import { describe, it, expect } from "vitest";
import {
  CAMPAIGN_DEFAULTS,
  controlsFor,
  describeAttempts,
  describeCallingWindow,
  describePacing,
  formatMinutesWords,
  formatTimeOfDay,
  isTerminal,
  progressPercent,
  progressSummary,
  settledCount,
  TARGET_STATE_LABELS,
  TARGET_STATES,
  type CampaignProgress,
  type CampaignStatus,
} from "@/lib/campaign-ui/progress";

function progress(partial: Partial<CampaignProgress> = {}): CampaignProgress {
  const base: CampaignProgress = {
    queued: 0,
    dialing: 0,
    done: 0,
    failed: 0,
    opted_out: 0,
    skipped: 0,
    total: 0,
  };
  const merged = { ...base, ...partial };
  // Mirror the API: total is the sum of the six states unless overridden.
  if (partial.total === undefined) {
    merged.total = TARGET_STATES.reduce((sum, s) => sum + merged[s], 0);
  }
  return merged;
}

describe("progressPercent", () => {
  it("is 0 for an empty list rather than NaN or 100", () => {
    expect(progressPercent(progress())).toBe(0);
  });

  it("counts only settled targets, not the ones still waiting", () => {
    expect(progressPercent(progress({ done: 1, queued: 3 }))).toBe(25);
  });

  it("treats a target being dialled right now as unsettled", () => {
    expect(progressPercent(progress({ done: 1, dialing: 1 }))).toBe(50);
  });

  it("reaches 100 when the remainder opted out or was skipped", () => {
    expect(progressPercent(progress({ done: 2, opted_out: 1, skipped: 1 }))).toBe(100);
  });

  it("counts unreachable targets as settled", () => {
    expect(progressPercent(progress({ done: 1, failed: 1, queued: 2 }))).toBe(50);
  });

  it("rounds to a whole number", () => {
    expect(progressPercent(progress({ done: 1, queued: 2 }))).toBe(33);
  });

  it("never exceeds 100 even if the counts disagree with total", () => {
    expect(progressPercent(progress({ done: 10, total: 4 }))).toBe(100);
  });

  it("never goes below 0 for a nonsensical negative total", () => {
    expect(progressPercent(progress({ done: 1, total: -5 }))).toBe(0);
  });
});

describe("settledCount", () => {
  it("sums the four terminal states and ignores queued/dialing", () => {
    expect(
      settledCount(progress({ done: 1, failed: 2, opted_out: 3, skipped: 4, queued: 9, dialing: 9 }))
    ).toBe(10);
  });
});

describe("progressSummary", () => {
  it("says nobody is added rather than '0 of 0'", () => {
    expect(progressSummary(progress())).toBe("Nobody added yet");
  });

  it("reports called out of total", () => {
    expect(progressSummary(progress({ done: 12, queued: 28 }))).toBe("12 of 40 called");
  });
});

describe("controlsFor — disabled-transition rules", () => {
  function byTarget(status: CampaignStatus, hasTargets = true) {
    return Object.fromEntries(controlsFor(status, hasTargets).map((c) => [c.target, c]));
  }

  it("lets a draft with people start, but not pause", () => {
    const c = byTarget("draft");
    expect(c.running.enabled).toBe(true);
    expect(c.running.label).toBe("Start calling");
    expect(c.paused.enabled).toBe(false);
    expect(c.cancelled.enabled).toBe(true);
  });

  it("refuses to start an empty draft and says why", () => {
    const c = byTarget("draft", false);
    expect(c.running.enabled).toBe(false);
    expect(c.running.reason).toBe("Add people to this campaign before starting it.");
  });

  it("lets a running campaign pause or cancel but not start again", () => {
    const c = byTarget("running");
    expect(c.running.enabled).toBe(false);
    expect(c.running.reason).toBe("Already calling.");
    expect(c.paused.enabled).toBe(true);
    expect(c.cancelled.enabled).toBe(true);
  });

  it("offers Resume wording on a paused campaign", () => {
    const c = byTarget("paused");
    expect(c.running.enabled).toBe(true);
    expect(c.running.label).toBe("Resume calling");
    expect(c.paused.enabled).toBe(false);
  });

  it("disables every control on a completed campaign with a reason", () => {
    for (const control of controlsFor("completed", true)) {
      expect(control.enabled).toBe(false);
      expect(control.reason).toBe(
        "This campaign has finished. Create a new one to call people again."
      );
    }
  });

  it("disables every control on a cancelled campaign with a reason", () => {
    for (const control of controlsFor("cancelled", true)) {
      expect(control.enabled).toBe(false);
      expect(control.reason).toBe("This campaign was cancelled and can't be restarted.");
    }
  });

  it("always explains a disabled control", () => {
    const statuses: CampaignStatus[] = ["draft", "running", "paused", "completed", "cancelled"];
    for (const status of statuses) {
      for (const hasTargets of [true, false]) {
        for (const control of controlsFor(status, hasTargets)) {
          if (!control.enabled) expect(control.reason).toBeTruthy();
          else expect(control.reason).toBeNull();
        }
      }
    }
  });

  it("never enables a transition the API's ALLOWED_TRANSITIONS would reject", () => {
    // Copied from src/app/api/v1/campaigns/[id]/route.ts.
    const allowed: Record<CampaignStatus, readonly string[]> = {
      draft: ["running", "cancelled"],
      running: ["paused", "cancelled"],
      paused: ["running", "cancelled"],
      completed: [],
      cancelled: [],
    };
    const statuses: CampaignStatus[] = ["draft", "running", "paused", "completed", "cancelled"];
    for (const status of statuses) {
      for (const control of controlsFor(status, true)) {
        if (control.enabled) expect(allowed[status]).toContain(control.target);
      }
    }
  });
});

describe("isTerminal", () => {
  it("is true only for completed and cancelled", () => {
    expect(isTerminal("completed")).toBe(true);
    expect(isTerminal("cancelled")).toBe(true);
    expect(isTerminal("draft")).toBe(false);
    expect(isTerminal("running")).toBe(false);
    expect(isTerminal("paused")).toBe(false);
  });
});

describe("formatTimeOfDay", () => {
  it("renders morning and evening in 12-hour clock", () => {
    expect(formatTimeOfDay("09:00")).toBe("9:00 AM");
    expect(formatTimeOfDay("20:00")).toBe("8:00 PM");
  });

  it("handles midnight and noon without a zero or 24 hour", () => {
    expect(formatTimeOfDay("00:30")).toBe("12:30 AM");
    expect(formatTimeOfDay("12:15")).toBe("12:15 PM");
  });

  it("tolerates the seconds Postgres TIME returns", () => {
    expect(formatTimeOfDay("09:00:00")).toBe("9:00 AM");
  });

  it("falls back to an em dash when missing", () => {
    expect(formatTimeOfDay(null)).toBe("—");
  });
});

describe("describeCallingWindow", () => {
  it("names the timezone rule the dialer actually applies", () => {
    expect(describeCallingWindow("09:00", "20:00")).toBe(
      "9:00 AM to 8:00 PM, in each person's own local time"
    );
  });
});

describe("formatMinutesWords", () => {
  it("renders the default retry delay as one hour", () => {
    expect(formatMinutesWords(60)).toBe("1 hour");
  });

  it("combines hours and minutes", () => {
    expect(formatMinutesWords(90)).toBe("1 hour 30 minutes");
  });

  it("renders whole days", () => {
    expect(formatMinutesWords(2880)).toBe("2 days");
  });

  it("renders a single minute", () => {
    expect(formatMinutesWords(1)).toBe("1 minute");
  });

  it("renders the schema maximum", () => {
    expect(formatMinutesWords(10080)).toBe("7 days");
  });

  it("falls back for missing or zero", () => {
    expect(formatMinutesWords(null)).toBe("—");
    expect(formatMinutesWords(0)).toBe("—");
  });
});

describe("describeAttempts / describePacing", () => {
  it("does not say 'up to 1 tries'", () => {
    expect(describeAttempts(1)).toBe("One try each");
    expect(describeAttempts(3)).toBe("Up to 3 tries each");
  });

  it("reads naturally at the defaults", () => {
    expect(describePacing(1, 1)).toBe("1 call at a time, 1 call a minute");
    expect(describePacing(5, 10)).toBe("Up to 5 calls at a time, 10 calls a minute");
  });
});

describe("labels and defaults", () => {
  it("gives every target state a plain-English label with no raw enum leaking", () => {
    for (const state of TARGET_STATES) {
      const label = TARGET_STATE_LABELS[state];
      expect(label).toBeTruthy();
      expect(label).not.toContain("_");
    }
  });

  it("matches the column defaults in migration 014", () => {
    expect(CAMPAIGN_DEFAULTS).toEqual({
      max_concurrent_calls: 1,
      calls_per_minute: 1,
      calling_window_start: "09:00",
      calling_window_end: "20:00",
      max_attempts: 3,
      retry_delay_minutes: 60,
    });
  });
});
