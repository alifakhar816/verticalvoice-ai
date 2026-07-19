import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/database/supabase-server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { getCurrentTenantId } from "@/domain/tenants/current";

/**
 * Campaign collection endpoints.
 *
 * Auth follows the outbound-call route exactly: authenticate the browser
 * session with `createServerClient`, resolve the tenant with
 * `getCurrentTenantId`, then do the actual reads and writes through
 * `createAdminClient` with an explicit `tenant_id` filter. The admin client
 * bypasses RLS, so every query below states its tenant scope itself — that
 * filter is the authorization, not a convenience.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

const CAMPAIGN_FIELDS =
  "id, name, call_type_id, status, max_concurrent_calls, calls_per_minute, calling_window_start, calling_window_end, max_attempts, retry_delay_minutes, variables, started_at, completed_at, created_at, updated_at" as const;

/** Lists this tenant's campaigns, newest first. */
export async function GET(request: NextRequest) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const tenantId = await getCurrentTenantId(user.id);
  if (!tenantId) {
    return NextResponse.json({ error: "No tenant found for this account" }, { status: 403 });
  }

  const status = request.nextUrl.searchParams.get("status")?.trim();
  const limitParam = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Math.min(
    MAX_LIMIT,
    Math.max(1, Number.isFinite(limitParam) && limitParam > 0 ? limitParam : DEFAULT_LIMIT)
  );

  const admin = createAdminClient();
  let query = admin
    .from("campaigns")
    .select(CAMPAIGN_FIELDS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ data: data ?? [] });
}

// A campaign is created as a 'draft' and never starts dialling on creation.
// Making a POST that also begins ringing strangers would mean one mistaken
// click is unrecoverable; starting is a separate, deliberate PATCH.
const timeSchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, "Use HH:MM 24-hour local time");

const createCampaignSchema = z.object({
  name: z.string().trim().min(1, "Name your campaign").max(200),
  call_type_id: z.string().trim().min(1),
  max_concurrent_calls: z.number().int().min(1).max(50).optional(),
  calls_per_minute: z.number().int().min(1).max(60).optional(),
  calling_window_start: timeSchema.optional(),
  calling_window_end: timeSchema.optional(),
  max_attempts: z.number().int().min(1).max(10).optional(),
  retry_delay_minutes: z.number().int().min(1).max(10080).optional(),
  variables: z.record(z.string(), z.string()).optional(),
});

/** Creates a campaign in 'draft'. */
export async function POST(request: NextRequest) {
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

  const parsed = createCampaignSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  // A window that starts and ends at the same minute never opens, and the
  // dialer treats it as closed. Rejecting it here means the operator finds out
  // when they save it, not by wondering why nothing was ever dialled.
  if (
    input.calling_window_start &&
    input.calling_window_end &&
    input.calling_window_start.slice(0, 5) === input.calling_window_end.slice(0, 5)
  ) {
    return NextResponse.json(
      { error: "Calling window start and end cannot be the same time." },
      { status: 400 }
    );
  }

  const admin = createAdminClient();

  // `created_by` references public.users.id (the internal id), not auth.users.
  const { data: userRow } = await admin
    .from("users")
    .select("id")
    .eq("auth_id", user.id)
    .maybeSingle();

  const { data, error } = await admin
    .from("campaigns")
    .insert({
      tenant_id: tenantId,
      name: input.name,
      call_type_id: input.call_type_id,
      status: "draft",
      max_concurrent_calls: input.max_concurrent_calls,
      calls_per_minute: input.calls_per_minute,
      calling_window_start: input.calling_window_start,
      calling_window_end: input.calling_window_end,
      max_attempts: input.max_attempts,
      retry_delay_minutes: input.retry_delay_minutes,
      variables: input.variables ?? {},
      created_by: userRow?.id ?? null,
    })
    .select(CAMPAIGN_FIELDS)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("audit_events").insert({
    tenant_id: tenantId,
    actor_id: user.id,
    action: "campaign.created",
    resource_type: "campaign",
    resource_id: (data as { id: string }).id,
    metadata: { name: input.name, call_type_id: input.call_type_id },
  });

  return NextResponse.json({ data }, { status: 201 });
}
