import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database/types";
import {
  placeOutboundCallForTenant,
  type PlaceOutboundFailureCode,
  type PlaceOutboundResult,
} from "@/lib/calls/place-outbound-call";
import {
  computeDialBudget,
  computeRetry,
  evaluateFrequencyCap,
  FREQUENCY_LOOKBACK_MS,
  isWithinCallingWindow,
  nextWindowOpening,
  resolveContactTimezone,
  resolveFrequencyCaps,
  type FrequencyCaps,
} from "./schedule";

/**
 * The campaign dialer: one tick of the outbound autodialer.
 *
 * Invoked by a cron route every minute. Everything here is written on the
 * assumption that ticks OVERLAP — a tick that places real phone calls can
 * comfortably run longer than sixty seconds, so the next one starts while this
 * one is still dialling. That assumption drives the whole design:
 *
 *   - work is taken with an atomic SKIP LOCKED claim (see migration 014), so
 *     two ticks physically cannot pick up the same person;
 *   - pacing is recomputed from live database state on every tick rather than
 *     held in memory, so two concurrent ticks can't each think they have the
 *     full budget;
 *   - every safety check (do-not-call, calling window, campaign status) is
 *     re-evaluated at DIAL time, not at claim time and certainly not at
 *     list-build time.
 *
 * The last point is the one that matters most. A target may have been queued
 * days ago. In that time the person may have asked never to be called again,
 * the operator may have paused the campaign, and the local clock at their end
 * may have moved into the middle of the night. A list built on Monday is not
 * permission to dial on Thursday.
 */

/** Call statuses that mean a line is currently occupied for the tenant. */
const LIVE_CALL_STATUSES = ["initiating", "initiated", "ringing", "in_progress"];

/**
 * Failure codes that are a property of the CAMPAIGN, not of the person.
 *
 * Outbound switched off, no phone number, a call type that no longer exists in
 * the industry pack — none of these get better by trying the next person, and
 * treating them as per-target failures would march through the entire list
 * burning one attempt per contact and then mark everybody failed. When one of
 * these appears the campaign stops for this tick and the claimed target goes
 * back to 'queued' untouched, with no attempt charged.
 */
const CAMPAIGN_LEVEL_FAILURES: ReadonlySet<PlaceOutboundFailureCode> = new Set([
  "outbound_disabled",
  "tenant_not_found",
  "no_industry_pack",
  "unknown_call_type",
  "no_phone_number",
  "config_error",
]);

type CampaignRow = Database["public"]["Tables"]["campaigns"]["Row"];
type TargetRow = Database["public"]["Tables"]["campaign_targets"]["Row"];

export interface DialerTickResult {
  campaignsConsidered: number;
  claimed: number;
  dialed: number;
  optedOut: number;
  deferred: number;
  failed: number;
  released: number;
  completedCampaigns: number;
}

function asVariables(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === null || v === undefined) continue;
    out[k] = typeof v === "string" ? v : String(v);
  }
  return out;
}

/** Live + last-minute call counts for one tenant, used for pacing. */
async function loadTenantPacing(
  admin: SupabaseClient<Database>,
  tenantId: string,
  now: Date
): Promise<{ liveCalls: number; dialedInLastMinute: number }> {
  const oneMinuteAgo = new Date(now.getTime() - 60_000).toISOString();

  const [{ count: liveCalls }, { count: recentCalls }] = await Promise.all([
    admin
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .in("status", LIVE_CALL_STATUSES),
    admin
      .from("calls")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("direction", "outbound")
      .gte("started_at", oneMinuteAgo),
  ]);

  return { liveCalls: liveCalls ?? 0, dialedInLastMinute: recentCalls ?? 0 };
}

/**
 * Is this specific person opted out, right now?
 *
 * Checked by contact_id when we have one and by (tenant, phone) always: a
 * target may carry a stale contact_id, or none at all, while the tenant's
 * contact book has since been marked do-not-call for that number. Both routes
 * to the same human have to be closed.
 *
 * `placeOutboundCallForTenant` performs its own do-not-call check as the last
 * line of defence. This one exists so the TARGET can be marked `opted_out`
 * (terminal, never retried) rather than being treated as a failed dial that
 * gets tried twice more.
 */
async function isOptedOut(
  admin: SupabaseClient<Database>,
  tenantId: string,
  target: TargetRow
): Promise<boolean> {
  if (target.contact_id) {
    const { data } = await admin
      .from("contacts")
      .select("do_not_call")
      .eq("id", target.contact_id)
      .maybeSingle();
    if (data?.do_not_call) return true;
  }

  const { data: byPhone } = await admin
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone", target.phone)
    .eq("do_not_call", true)
    .maybeSingle();

  return Boolean(byPhone);
}

/**
 * Prior outbound dials to `phone` for this tenant, within the cap lookback.
 *
 * Counted against `calls` — rows that exist only because a dial actually
 * happened — rather than against campaign_targets, which records intentions
 * and would let a person be "called" by a queue that never rang anything.
 *
 * `called_number` is the counterparty for direction='outbound' (caller_number
 * is the tenant's own line); reading the wrong column would count every
 * campaign call the tenant ever placed as if it went to this one person.
 *
 * Test calls are deliberately included: `is_test` marks the operator's intent,
 * not the phone's experience, and a test call rings a real handset.
 */
async function loadRecentDialStarts(
  admin: SupabaseClient<Database>,
  tenantId: string,
  phone: string,
  now: Date
): Promise<string[]> {
  const since = new Date(now.getTime() - FREQUENCY_LOOKBACK_MS).toISOString();

  const { data } = await admin
    .from("calls")
    .select("started_at")
    .eq("tenant_id", tenantId)
    .eq("direction", "outbound")
    .eq("called_number", phone)
    .gte("started_at", since)
    // The cap is a small number; a pathological row count must not be read
    // into memory wholesale. Any limit far above the cap gives the same verdict.
    .limit(500);

  return ((data ?? []) as { started_at: string | null }[])
    .map((row) => row.started_at)
    .filter((value): value is string => Boolean(value));
}

/** Returns a claimed target to the queue without charging an attempt. */
async function requeue(
  admin: SupabaseClient<Database>,
  targetId: string,
  nextAttemptAt: Date | null
): Promise<void> {
  await admin
    .from("campaign_targets")
    .update({
      state: "queued",
      next_attempt_at: nextAttemptAt ? nextAttemptAt.toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", targetId);
}

/**
 * Applies the retry policy to a target whose dial attempt failed.
 *
 * `attempts` is incremented HERE rather than at claim time, because claiming
 * is not attempting: a tick that claims a row and then declines to dial it
 * must not consume one of that person's finite attempts.
 */
async function recordFailure(
  admin: SupabaseClient<Database>,
  campaign: CampaignRow,
  target: TargetRow,
  reason: string,
  now: Date
): Promise<"failed" | "queued"> {
  const decision = computeRetry({
    previousAttempts: target.attempts,
    maxAttempts: campaign.max_attempts,
    retryDelayMinutes: campaign.retry_delay_minutes,
    now,
  });

  await admin
    .from("campaign_targets")
    .update({
      state: decision.giveUp ? "failed" : "queued",
      attempts: decision.attempts,
      next_attempt_at: decision.nextAttemptAt ? decision.nextAttemptAt.toISOString() : null,
      failure_reason: reason.slice(0, 500),
      updated_at: now.toISOString(),
    })
    .eq("id", target.id);

  return decision.giveUp ? "failed" : "queued";
}

/** Marks a campaign completed once nothing is left to do. */
async function completeIfDrained(
  admin: SupabaseClient<Database>,
  campaignId: string
): Promise<boolean> {
  const { count } = await admin
    .from("campaign_targets")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("state", ["queued", "dialing"]);

  if ((count ?? 0) > 0) return false;

  const nowIso = new Date().toISOString();
  await admin
    .from("campaigns")
    .update({ status: "completed", completed_at: nowIso, updated_at: nowIso })
    .eq("id", campaignId)
    // Only a still-running campaign completes. A campaign someone cancelled or
    // paused in the meantime must keep the status they chose.
    .eq("status", "running");
  return true;
}

/**
 * Runs one dialer tick across every running campaign.
 *
 * Never throws: a cron worker that dies on one bad campaign stops dialling for
 * every other tenant too, so failures are contained per campaign and per
 * target and the sweep carries on.
 */
export async function runCampaignDialerTick(
  admin: SupabaseClient<Database>,
  options: { now?: Date; maxCampaigns?: number } = {}
): Promise<DialerTickResult> {
  const now = options.now ?? new Date();
  const result: DialerTickResult = {
    campaignsConsidered: 0,
    claimed: 0,
    dialed: 0,
    optedOut: 0,
    deferred: 0,
    failed: 0,
    released: 0,
    completedCampaigns: 0,
  };

  // Recover anything a previous tick claimed and then died holding, before
  // claiming more. Otherwise those people are never called again.
  const { data: releasedCount } = await admin.rpc("release_stale_campaign_targets", {
    p_stale_minutes: 15,
  });
  result.released = typeof releasedCount === "number" ? releasedCount : 0;

  const { data: campaigns } = await admin
    .from("campaigns")
    .select("*")
    .eq("status", "running")
    .order("created_at", { ascending: true })
    .limit(options.maxCampaigns ?? 25);

  for (const campaign of (campaigns ?? []) as CampaignRow[]) {
    result.campaignsConsidered += 1;
    try {
      await runCampaign(admin, campaign, now, result);
    } catch {
      // One broken campaign must not stall every other tenant's dialling.
    }
  }

  return result;
}

async function runCampaign(
  admin: SupabaseClient<Database>,
  campaign: CampaignRow,
  now: Date,
  result: DialerTickResult
): Promise<void> {
  const { data: profile } = await admin
    .from("business_profiles")
    .select("timezone")
    .eq("tenant_id", campaign.tenant_id)
    .maybeSingle();
  const tenantTimezone = profile?.timezone ?? null;

  // Per-person frequency ceilings are a TENANT policy, not a campaign one:
  // their whole purpose is to bound what one human experiences across every
  // campaign at once, so a per-campaign setting could not express them.
  const { data: policy } = await admin
    .from("policy_settings")
    .select("max_calls_per_day, max_calls_per_week")
    .eq("tenant_id", campaign.tenant_id)
    .maybeSingle();
  const frequencyCaps: FrequencyCaps = resolveFrequencyCaps(policy);

  const window = {
    start: campaign.calling_window_start,
    end: campaign.calling_window_end,
  };

  const pacing = await loadTenantPacing(admin, campaign.tenant_id, now);
  const budget = computeDialBudget({
    maxConcurrentCalls: campaign.max_concurrent_calls,
    callsPerMinute: campaign.calls_per_minute,
    liveCalls: pacing.liveCalls,
    dialedInLastMinute: pacing.dialedInLastMinute,
  });

  if (budget <= 0) {
    // At capacity. Claim nothing — claiming rows we cannot dial would only
    // park them in 'dialing' until the stale sweep charged them an attempt.
    return;
  }

  const { data: claimedRows } = await admin.rpc("claim_campaign_targets", {
    p_campaign_id: campaign.id,
    p_limit: budget,
  });

  const targets = (claimedRows ?? []) as TargetRow[];
  result.claimed += targets.length;

  if (targets.length === 0) {
    if (await completeIfDrained(admin, campaign.id)) result.completedCampaigns += 1;
    return;
  }

  for (const target of targets) {
    // Re-read the campaign's status before every single dial. An operator who
    // hits Pause expects the ringing to stop now, not at the end of a batch we
    // claimed sixty seconds ago.
    const { data: fresh } = await admin
      .from("campaigns")
      .select("status")
      .eq("id", campaign.id)
      .maybeSingle();

    if (fresh?.status !== "running") {
      await requeue(admin, target.id, null);
      result.deferred += 1;
      continue;
    }

    // Consent, re-checked at dial time. Terminal: an opted-out target is never
    // retried, so it does not go through the retry policy at all.
    if (await isOptedOut(admin, campaign.tenant_id, target)) {
      await admin
        .from("campaign_targets")
        .update({
          state: "opted_out",
          failure_reason: "do_not_call",
          updated_at: now.toISOString(),
        })
        .eq("id", target.id);
      result.optedOut += 1;
      continue;
    }

    // Local hours, in the CALLEE's zone.
    const timezone = resolveContactTimezone(target.phone, tenantTimezone);
    if (!isWithinCallingWindow(now, timezone, window)) {
      // Park until the window actually opens rather than re-examining this row
      // every minute all night.
      const opening = nextWindowOpening(now, timezone, window);
      await requeue(admin, target.id, opening);
      result.deferred += 1;
      continue;
    }

    // How often this PERSON has been rung lately, across every campaign this
    // tenant runs. Evaluated here at dial time rather than when the list was
    // built, because the list does not know what the other campaigns did after
    // it was built — and because a re-run of this same campaign would
    // otherwise start from a clean slate against a phone that is not clean.
    const frequency = evaluateFrequencyCap({
      recentCallStarts: await loadRecentDialStarts(
        admin,
        campaign.tenant_id,
        target.phone,
        now
      ),
      caps: frequencyCaps,
      now,
    });

    if (!frequency.allowed) {
      // DEFERRED, not failed. This person has not declined anything; we have
      // simply spent our budget of their attention for now. Parked until the
      // window rolls off, and no attempt charged — being called too often is
      // our doing, and it must not consume the attempts they are owed.
      await requeue(admin, target.id, frequency.retryAt);
      result.deferred += 1;
      continue;
    }

    let outcome: PlaceOutboundResult;
    try {
      outcome = await placeOutboundCallForTenant({
        admin,
        tenantId: campaign.tenant_id,
        toNumber: target.phone,
        callTypeId: campaign.call_type_id,
        variables: {
          ...asVariables(campaign.variables),
          ...asVariables(target.variables),
        },
        // No human initiated this dial; audit_events.actor_id stays null and
        // the campaign ids below are what identifies the origin.
        actorId: null,
        auditMetadata: { campaign_id: campaign.id, campaign_target_id: target.id },
      });
    } catch (err) {
      const reason = err instanceof Error ? err.message : "dial_error";
      const state = await recordFailure(admin, campaign, target, reason, now);
      if (state === "failed") result.failed += 1;
      continue;
    }

    if (outcome.ok) {
      await admin
        .from("campaign_targets")
        .update({
          state: "done",
          attempts: target.attempts + 1,
          call_id: outcome.call.id,
          failure_reason: null,
          next_attempt_at: null,
          updated_at: now.toISOString(),
        })
        .eq("id", target.id);
      result.dialed += 1;
      continue;
    }

    // The shared dial path also enforces do-not-call. If it fired here, the
    // contact book changed between our check and the dial — still terminal.
    if (outcome.code === "do_not_call") {
      await admin
        .from("campaign_targets")
        .update({
          state: "opted_out",
          failure_reason: "do_not_call",
          updated_at: now.toISOString(),
        })
        .eq("id", target.id);
      result.optedOut += 1;
      continue;
    }

    if (CAMPAIGN_LEVEL_FAILURES.has(outcome.code)) {
      // Misconfiguration, not this person's fault. Give the row back unharmed
      // and stop dialling this campaign for the rest of the tick.
      await requeue(admin, target.id, null);
      result.deferred += 1;
      return;
    }

    if (outcome.code === "missing_variables") {
      // The call type needs a value this target doesn't carry. Retrying can't
      // conjure it, so skip the target rather than burning attempts on it.
      await admin
        .from("campaign_targets")
        .update({
          state: "skipped",
          failure_reason: outcome.error.slice(0, 500),
          updated_at: now.toISOString(),
        })
        .eq("id", target.id);
      result.failed += 1;
      continue;
    }

    const state = await recordFailure(admin, campaign, target, outcome.error, now);
    if (state === "failed") result.failed += 1;
  }

  if (await completeIfDrained(admin, campaign.id)) result.completedCampaigns += 1;
}
