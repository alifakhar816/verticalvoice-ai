import { notFound } from "next/navigation";

import { createServerClient } from "@/lib/database/supabase-server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { getCurrentTenantId } from "@/domain/tenants/current";
import {
  TARGET_STATES,
  type CampaignProgress,
  type CampaignStatus,
} from "@/lib/campaign-ui/progress";
import { CampaignDetailClient, type CampaignDetail } from "./campaign-detail-client";

/**
 * One campaign's live progress view.
 *
 * The first paint is rendered on the server so the page arrives with real
 * numbers rather than a spinner; the client child then polls GET
 * /api/v1/campaigns/[id] to keep them current. The counts assembled here
 * deliberately match that endpoint's shape exactly — all six states present
 * even at zero — so a polled response can replace this one wholesale without
 * the component having to reconcile two different shapes.
 */

const CAMPAIGN_FIELDS =
  "id, name, call_type_id, status, max_concurrent_calls, calls_per_minute, calling_window_start, calling_window_end, max_attempts, retry_delay_minutes, started_at, completed_at, created_at" as const;

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) notFound();

  const tenantId = await getCurrentTenantId(user.id);
  if (!tenantId) notFound();

  // Same posture as the API routes: admin client, explicit tenant filter as the
  // authorization. Migration 014 revokes these tables from `authenticated`.
  const admin = createAdminClient();
  const { data: campaign } = await admin
    .from("campaigns")
    .select(CAMPAIGN_FIELDS)
    .eq("id", id)
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!campaign) notFound();

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

  const progress = Object.fromEntries(counts) as CampaignProgress;
  progress.total = counts.reduce((sum, [, n]) => sum + n, 0);

  const initial: CampaignDetail = {
    id: campaign.id,
    name: campaign.name,
    call_type_id: campaign.call_type_id,
    status: campaign.status as CampaignStatus,
    max_concurrent_calls: campaign.max_concurrent_calls,
    calls_per_minute: campaign.calls_per_minute,
    calling_window_start: campaign.calling_window_start,
    calling_window_end: campaign.calling_window_end,
    max_attempts: campaign.max_attempts,
    retry_delay_minutes: campaign.retry_delay_minutes,
    started_at: campaign.started_at,
    completed_at: campaign.completed_at,
    created_at: campaign.created_at,
    progress,
  };

  return <CampaignDetailClient initial={initial} />;
}
