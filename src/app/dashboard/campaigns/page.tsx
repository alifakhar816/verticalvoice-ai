import Link from "next/link";
import { Megaphone, Plus } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createServerClient } from "@/lib/database/supabase-server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { getCurrentTenantId } from "@/domain/tenants/current";
import { formatDateTime, humanize } from "@/lib/calls/display";
import {
  progressPercent,
  progressSummary,
  type CampaignProgress,
  type CampaignStatus,
} from "@/lib/campaign-ui/progress";
import { CampaignStatusBadge } from "./status-badge";

/**
 * Campaign list.
 *
 * Reads through `createAdminClient` scoped by an explicit `tenant_id`, exactly
 * as the campaign API routes do. That is not a shortcut: migration 014 revokes
 * `campaigns` and `campaign_targets` from the `authenticated` role outright, so
 * the ordinary server client cannot see these tables at all. The tenant filter
 * below is therefore the authorization, and it is stated on every query rather
 * than inherited from RLS.
 */

// A tenant with hundreds of campaigns would otherwise cost hundreds of count
// queries on one page load. The newest 25 is what this screen is for; the
// detail page is where a specific campaign gets looked at properly.
const LIST_LIMIT = 25;

const TH =
  "px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

interface CampaignRow {
  id: string;
  name: string;
  call_type_id: string;
  status: CampaignStatus;
  created_at: string;
  progress: CampaignProgress;
}

/**
 * Counts a campaign's list without pulling the rows back.
 *
 * Only the three numbers this screen shows are counted (called, unreachable,
 * total) rather than all six states — the detail page is where the full
 * breakdown belongs, and three head-counts per row instead of six halves the
 * cost of rendering the list.
 */
async function countsFor(
  admin: ReturnType<typeof createAdminClient>,
  campaignId: string
): Promise<{ done: number; failed: number; total: number }> {
  const countTargets = async (state?: string) => {
    let query = admin
      .from("campaign_targets")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId);
    if (state) query = query.eq("state", state);
    const { count } = await query;
    return count ?? 0;
  };

  const [done, failed, total] = await Promise.all([
    countTargets("done"),
    countTargets("failed"),
    countTargets(),
  ]);
  return { done, failed, total };
}

function EmptyState() {
  return (
    <Card>
      <CardContent className="flex flex-col items-center px-6 py-16 text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Megaphone className="size-6" aria-hidden="true" />
        </div>
        <p className="text-lg font-medium">No campaigns yet</p>
        <p className="mt-2 max-w-md text-sm text-muted-foreground">
          A campaign works through a list of people for you: your agent calls each one in turn,
          only during the hours you allow, at a pace you set, and tries again later if nobody
          picks up. Anyone marked do not call is left out automatically.
        </p>
        <Button className="mt-6" render={<Link href="/dashboard/campaigns/new" />}>
          <Plus className="mr-2 size-4" aria-hidden="true" />
          Create your first campaign
        </Button>
      </CardContent>
    </Card>
  );
}

function NoTenantState() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No tenant configured for this account</CardTitle>
        <CardDescription>
          Your account isn&apos;t linked to any tenant yet, so there&apos;s nothing to show here.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

export default async function CampaignsPage() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return <NoTenantState />;

  const tenantId = await getCurrentTenantId(user.id);
  if (!tenantId) return <NoTenantState />;

  const admin = createAdminClient();
  const { data: campaignRows } = await admin
    .from("campaigns")
    .select("id, name, call_type_id, status, created_at")
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(LIST_LIMIT);

  const campaigns: CampaignRow[] = await Promise.all(
    (campaignRows ?? []).map(async (c) => {
      const counts = await countsFor(admin, c.id);
      return {
        id: c.id,
        name: c.name,
        call_type_id: c.call_type_id,
        status: c.status as CampaignStatus,
        created_at: c.created_at,
        // The remaining states aren't counted for the list view; the bar and
        // the two numbers shown here only need these three.
        progress: {
          queued: 0,
          dialing: 0,
          done: counts.done,
          failed: counts.failed,
          opted_out: 0,
          skipped: 0,
          total: counts.total,
        },
      };
    })
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <Megaphone className="size-7 text-brand" aria-hidden="true" />
            Campaigns
          </h1>
          <p className="text-muted-foreground">
            Work through a list of people with your AI agent, at a pace and within hours you
            control.
          </p>
        </div>
        {campaigns.length > 0 && (
          <Button render={<Link href="/dashboard/campaigns/new" />}>
            <Plus className="mr-2 size-4" aria-hidden="true" />
            New campaign
          </Button>
        )}
      </div>

      {campaigns.length === 0 ? (
        <EmptyState />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className={TH}>Campaign</th>
                    <th className={TH}>Status</th>
                    <th className={TH}>What it calls about</th>
                    <th className={TH}>Progress</th>
                    <th className={TH}>Couldn&apos;t reach</th>
                    <th className={TH}>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {campaigns.map((campaign) => {
                    const percent = progressPercent(campaign.progress);
                    return (
                      <tr key={campaign.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3">
                          <Link
                            href={`/dashboard/campaigns/${campaign.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {campaign.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          <CampaignStatusBadge status={campaign.status} />
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {humanize(campaign.call_type_id)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <div
                              className="h-1 w-24 overflow-hidden rounded-full bg-muted"
                              role="img"
                              aria-label={`${percent}% worked through`}
                            >
                              <div
                                className="h-full rounded-full bg-brand"
                                style={{ width: `${percent}%` }}
                              />
                            </div>
                            <span className="font-mono tabular-nums text-muted-foreground">
                              {progressSummary(campaign.progress)}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono tabular-nums">
                          {campaign.progress.failed > 0 ? (
                            <span className="text-warning">{campaign.progress.failed}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {formatDateTime(campaign.created_at)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {campaigns.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {campaigns.length === 1
            ? "Showing your only campaign."
            : `Showing your ${campaigns.length} most recent campaigns, newest first.`}
        </p>
      )}
    </div>
  );
}
