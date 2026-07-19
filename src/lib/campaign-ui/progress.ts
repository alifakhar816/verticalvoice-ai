/**
 * Presentation logic for campaigns.
 *
 * Lives outside `src/lib/campaigns/**` on purpose: that directory is the
 * dialer's own logic and is not a UI concern. Everything here is pure so the
 * disabled-control rules and the progress arithmetic can be tested without
 * rendering anything.
 */

export const TARGET_STATES = [
  "queued",
  "dialing",
  "done",
  "failed",
  "opted_out",
  "skipped",
] as const;

export type TargetState = (typeof TARGET_STATES)[number];

export type CampaignProgress = Record<TargetState, number> & { total: number };

export type CampaignStatus = "draft" | "running" | "paused" | "completed" | "cancelled";

/**
 * Plain English for every target state. The raw values ("opted_out") are
 * database vocabulary and must never reach a screen.
 */
export const TARGET_STATE_LABELS: Record<TargetState, string> = {
  queued: "Waiting to be called",
  dialing: "Calling now",
  done: "Called",
  failed: "Couldn't reach",
  opted_out: "Asked not to be called",
  skipped: "Skipped",
};

export const CAMPAIGN_STATUS_LABELS: Record<CampaignStatus, string> = {
  draft: "Draft",
  running: "Calling",
  paused: "Paused",
  completed: "Finished",
  cancelled: "Cancelled",
};

/** One-line explanation of what the campaign is doing right now. */
export const CAMPAIGN_STATUS_DESCRIPTIONS: Record<CampaignStatus, string> = {
  draft: "Not started yet. Nobody has been called.",
  running: "Working through the list within the calling window.",
  paused: "Stopped for now. No new calls will be placed until you resume.",
  completed: "Everyone on the list has been worked through.",
  cancelled: "Stopped for good. This campaign cannot be restarted.",
};

/**
 * A target is "settled" once the campaign will never dial it again — which is
 * what a progress bar should measure. Counting only `done` would leave a bar
 * stuck below 100% forever on a campaign whose remaining people all opted out.
 */
const SETTLED_STATES: readonly TargetState[] = ["done", "failed", "opted_out", "skipped"];

export function settledCount(progress: CampaignProgress): number {
  return SETTLED_STATES.reduce((sum, state) => sum + (progress[state] ?? 0), 0);
}

/**
 * Whole-number percentage of the list that is finished with, 0–100.
 *
 * An empty list is 0%, not NaN and not 100%: a campaign with nobody in it has
 * not finished anything, and showing a full bar would say the opposite.
 */
export function progressPercent(progress: CampaignProgress): number {
  if (!progress.total || progress.total <= 0) return 0;
  const pct = (settledCount(progress) / progress.total) * 100;
  return Math.max(0, Math.min(100, Math.round(pct)));
}

/** "12 of 40 called" — the headline number a list row shows. */
export function progressSummary(progress: CampaignProgress): string {
  if (!progress.total) return "Nobody added yet";
  return `${progress.done} of ${progress.total} called`;
}

const TERMINAL: readonly CampaignStatus[] = ["completed", "cancelled"];

export function isTerminal(status: CampaignStatus): boolean {
  return TERMINAL.includes(status);
}

export interface ControlState {
  /** The target state this control would PATCH to. */
  target: "running" | "paused" | "cancelled";
  label: string;
  enabled: boolean;
  /** Why it's off. Always present when disabled, so the UI never goes silent. */
  reason: string | null;
}

/**
 * The three controls on the detail page, decided from status alone.
 *
 * Mirrors ALLOWED_TRANSITIONS in the PATCH handler. A transition the API would
 * reject is surfaced as a disabled control with a plain-English reason rather
 * than as a request that comes back 409 — the user should not have to click
 * something to find out it was never possible.
 */
export function controlsFor(status: CampaignStatus, hasTargets: boolean): ControlState[] {
  const terminalReason =
    status === "completed"
      ? "This campaign has finished. Create a new one to call people again."
      : "This campaign was cancelled and can't be restarted.";

  const startLabel = status === "paused" ? "Resume calling" : "Start calling";

  const start: ControlState = isTerminal(status)
    ? { target: "running", label: startLabel, enabled: false, reason: terminalReason }
    : status === "running"
      ? {
          target: "running",
          label: startLabel,
          enabled: false,
          reason: "Already calling.",
        }
      : !hasTargets
        ? {
            target: "running",
            label: startLabel,
            enabled: false,
            reason: "Add people to this campaign before starting it.",
          }
        : { target: "running", label: startLabel, enabled: true, reason: null };

  const pause: ControlState =
    status === "running"
      ? { target: "paused", label: "Pause", enabled: true, reason: null }
      : {
          target: "paused",
          label: "Pause",
          enabled: false,
          reason: isTerminal(status)
            ? terminalReason
            : "Only a campaign that is calling can be paused.",
        };

  const cancel: ControlState = isTerminal(status)
    ? { target: "cancelled", label: "Cancel campaign", enabled: false, reason: terminalReason }
    : { target: "cancelled", label: "Cancel campaign", enabled: true, reason: null };

  return [start, pause, cancel];
}

/** "09:00" / "09:00:00" -> "9:00 AM". Anything unexpected is returned as-is. */
export function formatTimeOfDay(value: string | null | undefined): string {
  if (!value) return "—";
  const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)/);
  if (!match) return value;
  const hours = Number(match[1]);
  const minutes = match[2];
  const suffix = hours < 12 ? "AM" : "PM";
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  return `${hour12}:${minutes} ${suffix}`;
}

/** "9:00 AM to 8:00 PM, in each person's own local time". */
export function describeCallingWindow(
  start: string | null | undefined,
  end: string | null | undefined
): string {
  return `${formatTimeOfDay(start)} to ${formatTimeOfDay(end)}, in each person's own local time`;
}

/** 60 -> "1 hour"; 90 -> "1 hour 30 minutes"; 2880 -> "2 days". */
export function formatMinutesWords(minutes: number | null | undefined): string {
  if (minutes == null || minutes <= 0) return "—";
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? "day" : "days"}`);
  if (hours) parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`);
  if (mins) parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`);
  return parts.join(" ");
}

/** "Up to 3 tries each" — max_attempts in words rather than a bare integer. */
export function describeAttempts(maxAttempts: number | null | undefined): string {
  if (!maxAttempts || maxAttempts <= 1) return "One try each";
  return `Up to ${maxAttempts} tries each`;
}

/** "1 call at a time, 1 call a minute". */
export function describePacing(
  maxConcurrent: number | null | undefined,
  callsPerMinute: number | null | undefined
): string {
  const concurrent = maxConcurrent ?? 1;
  const perMinute = callsPerMinute ?? 1;
  const concurrentText =
    concurrent === 1 ? "1 call at a time" : `Up to ${concurrent} calls at a time`;
  const rateText = perMinute === 1 ? "1 call a minute" : `${perMinute} calls a minute`;
  return `${concurrentText}, ${rateText}`;
}

/**
 * The defaults the create API applies when a field is left out (migration 014).
 * Shown in the form as real starting values so the operator sees the policy
 * they are about to accept rather than an empty box.
 */
export const CAMPAIGN_DEFAULTS = {
  max_concurrent_calls: 1,
  calls_per_minute: 1,
  calling_window_start: "09:00",
  calling_window_end: "20:00",
  max_attempts: 3,
  retry_delay_minutes: 60,
} as const;
