import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/database/supabase-server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { getCurrentTenantId } from "@/domain/tenants/current";
import type { Database } from "@/lib/database/types";

const CAMPAIGN_FIELDS =
  "id, name, call_type_id, status, max_concurrent_calls, calls_per_minute, calling_window_start, calling_window_end, max_attempts, retry_delay_minutes, variables, started_at, completed_at, created_at, updated_at" as const;

/** Every state a target can be in, so a caller always gets a complete shape. */
const TARGET_STATES = ["queued", "dialing", "done", "failed", "opted_out", "skipped"] as const;

type ProgressCounts = Record<(typeof TARGET_STATES)[number], number> & { total: number };

/**
 * One campaign plus its progress, counted by target state.
 *
 * Every state is present in the response even when zero. A progress bar that
 * receives `{done: 4}` one poll and `{done: 4, failed: 1}` the next has to
 * guess whether a missing key means zero or means "not loaded"; returning the
 * full shape every time removes the guess.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = await getCurrentTenantId(user.id);
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant found for this account" }, { status: 403 });
  }

  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .select(CAMPAIGN_FIELDS)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // One HEAD count per state rather than pulling every target row back: a
  // campaign can hold hundreds of thousands of targets, and the progress view
  // needs six integers, not the list.
  const counts = await Promise.all(
    TARGET_STATES.map(async (state) => {
      const { count } = await admin
        .from("campaign_targets")
        .select("id", { count: "exact", head: true })
        .eq("campaign_id", id)
        .eq("state", state);
      return [state, count ?? 0] as const;
    })
  );

  const progress = Object.fromEntries(counts) as ProgressCounts;
  progress.total = counts.reduce((sum, [, n]) => sum + n, 0);

  return NextResponse.json({ data: { ...campaign, progress } });
}

/**
 * Status transitions: start, pause, resume, cancel.
 *
 * Expressed as target states rather than verbs so the operation is idempotent
 * — a double-clicked Pause is still just "paused". Transitions are validated
 * against the current status because some of them are not reversible and the
 * API should say so rather than silently no-op.
 */
const patchSchema = z.object({
  status: z.enum(["running", "paused", "cancelled"]),
});

const ALLOWED_TRANSITIONS: Record<string, readonly string[]> = {
  draft: ["running", "cancelled"],
  running: ["paused", "cancelled"],
  paused: ["running", "cancelled"],
  // Terminal. A completed or cancelled campaign cannot be resurrected into
  // dialling people again; that has to be a new campaign, deliberately made.
  completed: [],
  cancelled: [],
};

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = await getCurrentTenantId(user.id);
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant found for this account" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const nextStatus = parsed.data.status;

  const admin = createAdminClient();
  const { data: current } = await admin
    .from("campaigns")
    .select("id, status")
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!current) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  if (current.status === nextStatus) {
    const { data } = await admin
      .from("campaigns")
      .select(CAMPAIGN_FIELDS)
      .eq("id", id)
      .single();
    return NextResponse.json({ data });
  }

  const allowed = ALLOWED_TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(nextStatus)) {
    return NextResponse.json(
      { error: `A ${current.status} campaign cannot be moved to ${nextStatus}.` },
      { status: 409 }
    );
  }

  const nowIso = new Date().toISOString();
  // Typed against the generated table shape rather than Record<string, unknown>
  // so a mistyped column name is a compile error instead of a silently ignored
  // field on a status transition.
  const update: Database["public"]["Tables"]["campaigns"]["Update"] = {
    status: nextStatus,
    updated_at: nowIso,
  };
  // Stamp the first start only; resuming after a pause is not a new start and
  // overwriting it would lose when the campaign actually began.
  if (nextStatus === "running" && current.status === "draft") update.started_at = nowIso;
  if (nextStatus === "cancelled") update.completed_at = nowIso;

  const { data, error } = await admin
    .from("campaigns")
    .update(update)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    // Guard against a concurrent transition landing between the read above and
    // this write — without it, two operators clicking Pause and Cancel at the
    // same moment could resolve to whichever wrote last rather than to the
    // transition that was actually legal.
    .eq("status", current.status)
    .select(CAMPAIGN_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_events").insert({
    tenant_id: tenantId,
    actor_id: user.id,
    action: `campaign.${nextStatus}`,
    resource_type: "campaign",
    resource_id: id,
    metadata: { from: current.status, to: nextStatus },
  });

  return NextResponse.json({ data });
}
