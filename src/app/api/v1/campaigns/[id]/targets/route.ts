import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/database/supabase-server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { getCurrentTenantId } from "@/domain/tenants/current";

/**
 * Builds a campaign's target list from the tenant's contact book.
 *
 * Three ways to choose who goes in, in order of precedence: explicit
 * `contact_ids`, a `tags` filter, or `all_contacts`. Whichever is used, the
 * same two filters apply on the way out — do-not-call contacts are excluded,
 * and numbers are deduplicated.
 *
 * Both filters are applied here AND at dial time, deliberately. This one keeps
 * an opted-out person from ever appearing in the list an operator looks at;
 * the dial-time one (in the dialer and in the shared dial path) catches the
 * person who opts out AFTER the list was built. Neither is redundant: this
 * check alone would dial people who opted out yesterday, and the dial-time
 * check alone would show them queued in the UI until the moment they were
 * skipped.
 */

const MAX_TARGETS_PER_REQUEST = 5000;

const buildTargetsSchema = z
  .object({
    contact_ids: z.array(z.string().uuid()).max(MAX_TARGETS_PER_REQUEST).optional(),
    tags: z.array(z.string().trim().min(1).max(50)).max(25).optional(),
    all_contacts: z.boolean().optional(),
    /** Extra numbers not in the contact book, e.g. a one-off pasted list. */
    phones: z.array(z.string().trim().min(7).max(32)).max(MAX_TARGETS_PER_REQUEST).optional(),
  })
  .refine(
    (v) =>
      Boolean(v.contact_ids?.length) ||
      Boolean(v.tags?.length) ||
      Boolean(v.phones?.length) ||
      v.all_contacts === true,
    { message: "Choose contacts by id, by tag, by phone, or set all_contacts." }
  );

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: campaignId } = await params;

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

  const parsed = buildTargetsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const input = parsed.data;

  const admin = createAdminClient();

  const { data: campaign } = await admin
    .from("campaigns")
    .select("id, status")
    .eq("id", campaignId)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });

  // Adding people to a campaign that has already been cancelled or completed
  // would queue calls that either never happen or resurrect a finished
  // campaign the moment someone reopened it.
  if (campaign.status === "cancelled" || campaign.status === "completed") {
    return NextResponse.json(
      { error: `Cannot add targets to a ${campaign.status} campaign.` },
      { status: 409 }
    );
  }

  // ── Gather candidates ────────────────────────────────────────────────────
  let contactQuery = admin
    .from("contacts")
    .select("id, phone, do_not_call")
    .eq("tenant_id", tenantId)
    .limit(MAX_TARGETS_PER_REQUEST);

  let usedContactSource = false;
  if (input.contact_ids?.length) {
    contactQuery = contactQuery.in("id", input.contact_ids);
    usedContactSource = true;
  } else if (input.tags?.length) {
    contactQuery = contactQuery.overlaps("tags", input.tags);
    usedContactSource = true;
  } else if (input.all_contacts) {
    usedContactSource = true;
  }

  const contacts = usedContactSource ? ((await contactQuery).data ?? []) : [];

  // ── Filter and dedupe ────────────────────────────────────────────────────
  const seen = new Set<string>();
  const rows: { campaign_id: string; contact_id: string | null; phone: string }[] = [];
  let skippedDoNotCall = 0;
  let skippedDuplicate = 0;

  for (const contact of contacts) {
    if (contact.do_not_call) {
      skippedDoNotCall += 1;
      continue;
    }
    const phone = contact.phone.trim();
    if (!phone) continue;
    if (seen.has(phone)) {
      skippedDuplicate += 1;
      continue;
    }
    seen.add(phone);
    rows.push({ campaign_id: campaignId, contact_id: contact.id, phone });
  }

  // Raw pasted numbers still have to clear do-not-call. A number typed by hand
  // is exactly how an opted-out person gets called again by accident, so it is
  // checked against the contact book rather than trusted.
  if (input.phones?.length) {
    const cleaned = [...new Set(input.phones.map((p) => p.trim()).filter(Boolean))];
    const { data: blocked } = await admin
      .from("contacts")
      .select("phone")
      .eq("tenant_id", tenantId)
      .eq("do_not_call", true)
      .in("phone", cleaned);
    const blockedSet = new Set((blocked ?? []).map((b) => b.phone));

    for (const phone of cleaned) {
      if (blockedSet.has(phone)) {
        skippedDoNotCall += 1;
        continue;
      }
      if (seen.has(phone)) {
        skippedDuplicate += 1;
        continue;
      }
      seen.add(phone);
      rows.push({ campaign_id: campaignId, contact_id: null, phone });
    }
  }

  if (rows.length === 0) {
    return NextResponse.json({
      data: {
        added: 0,
        skipped_already_queued: 0,
        skipped_do_not_call: skippedDoNotCall,
        skipped_duplicate: skippedDuplicate,
      },
    });
  }

  // `ignoreDuplicates` against the (campaign_id, phone) unique constraint makes
  // re-running this endpoint safe: a second run with an overlapping list adds
  // only the genuinely new people instead of erroring, and — critically —
  // cannot re-queue someone already dialled in this campaign.
  const { data: inserted, error } = await admin
    .from("campaign_targets")
    .upsert(rows, { onConflict: "campaign_id,phone", ignoreDuplicates: true })
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const added = inserted?.length ?? 0;

  await admin.from("audit_events").insert({
    tenant_id: tenantId,
    actor_id: user.id,
    action: "campaign.targets_added",
    resource_type: "campaign",
    resource_id: campaignId,
    metadata: {
      added,
      considered: rows.length,
      skipped_do_not_call: skippedDoNotCall,
      skipped_duplicate: skippedDuplicate,
    },
  });

  return NextResponse.json(
    {
      data: {
        added,
        // rows.length - added is the count already present in this campaign.
        skipped_already_queued: rows.length - added,
        skipped_do_not_call: skippedDoNotCall,
        skipped_duplicate: skippedDuplicate,
      },
    },
    { status: 201 }
  );
}
