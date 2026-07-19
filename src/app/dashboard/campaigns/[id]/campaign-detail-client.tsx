"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pause, Play, XCircle } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { formatDateTime, humanize } from "@/lib/calls/display";
import {
  CAMPAIGN_STATUS_DESCRIPTIONS,
  controlsFor,
  describeAttempts,
  describeCallingWindow,
  describePacing,
  formatMinutesWords,
  isTerminal,
  progressPercent,
  TARGET_STATE_LABELS,
  TARGET_STATES,
  type CampaignProgress,
  type CampaignStatus,
  type ControlState,
  type TargetState,
} from "@/lib/campaign-ui/progress";
import { CampaignStatusBadge } from "../status-badge";

export interface CampaignDetail {
  id: string;
  name: string;
  call_type_id: string;
  status: CampaignStatus;
  max_concurrent_calls: number;
  calls_per_minute: number;
  calling_window_start: string;
  calling_window_end: string;
  max_attempts: number;
  retry_delay_minutes: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  progress: CampaignProgress;
}

/**
 * Five seconds. The dialer ticks about once a minute, so anything faster polls
 * for changes that cannot have happened yet; anything much slower and a Pause
 * looks like it did nothing. Polling stops entirely once the campaign reaches a
 * terminal state, because those numbers can never change again.
 */
const POLL_MS = 5000;

const CONTROL_ICONS = {
  running: Play,
  paused: Pause,
  cancelled: XCircle,
} as const;

/** Colour only where it carries meaning; the neutral states stay neutral. */
const STATE_TONES: Partial<Record<TargetState, string>> = {
  done: "text-success",
  dialing: "text-brand",
  failed: "text-warning",
};

function StateCount({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border p-3">
      <p className={`font-mono text-2xl font-bold tabular-nums ${tone ?? ""}`}>{value}</p>
      <p className="mt-0.5 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

export function CampaignDetailClient({ initial }: { initial: CampaignDetail }) {
  const router = useRouter();
  const [campaign, setCampaign] = useState<CampaignDetail>(initial);
  const [pendingTarget, setPendingTarget] = useState<ControlState["target"] | null>(null);
  const [confirmCancelOpen, setConfirmCancelOpen] = useState(false);

  const status = campaign.status;
  const progress = campaign.progress;
  const percent = progressPercent(progress);
  const finished = isTerminal(status);

  useEffect(() => {
    // Nothing can change once the campaign is finished or cancelled, so no
    // interval is created at all rather than one that polls forever.
    if (finished) return;

    let cancelled = false;
    // Named inner async function: awaiting directly in the effect body would
    // put a setState in the synchronous effect path (react-hooks/set-state-in-effect).
    async function poll() {
      try {
        const res = await fetch(`/api/v1/campaigns/${initial.id}`);
        if (!res.ok) return;
        const body = await res.json();
        if (!cancelled && body.data) setCampaign(body.data as CampaignDetail);
      } catch {
        // A dropped poll is not worth a toast — the next tick catches up.
      }
    }

    const timer = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [initial.id, finished]);

  async function applyStatus(target: ControlState["target"]) {
    setPendingTarget(target);
    try {
      const res = await fetch(`/api/v1/campaigns/${campaign.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // A target state, not a verb — so a double-click asks for the same
        // thing twice and the second one is a no-op rather than a toggle back.
        body: JSON.stringify({ status: target }),
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error(body.error ?? "Couldn't change this campaign.");
        return;
      }
      setCampaign((prev) => ({ ...prev, ...body.data }));
      toast.success(
        target === "running"
          ? "Calling started."
          : target === "paused"
            ? "Paused. No new calls will be placed."
            : "Campaign cancelled."
      );
      // The list page is a Server Component, so its cached render has to be
      // invalidated for the new status to show when the user navigates back.
      router.refresh();
    } catch {
      toast.error("Couldn't change this campaign.");
    } finally {
      setPendingTarget(null);
    }
  }

  function handleControl(control: ControlState) {
    // Cancelling is the one transition that cannot be undone, so it asks first.
    if (control.target === "cancelled") {
      setConfirmCancelOpen(true);
      return;
    }
    applyStatus(control.target);
  }

  const controls = controlsFor(status, progress.total > 0);
  const remaining = progress.queued + progress.dialing;

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 mb-2 text-muted-foreground"
          render={<Link href="/dashboard/campaigns" />}
        >
          <ArrowLeft className="mr-1.5 size-4" aria-hidden="true" />
          Back to campaigns
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{campaign.name}</h1>
          <CampaignStatusBadge status={status} />
        </div>
        <p className="text-muted-foreground">{CAMPAIGN_STATUS_DESCRIPTIONS[status]}</p>
      </div>

      {/* ── Controls ─────────────────────────────────────────────────── */}
      <Card>
        <CardContent className="flex flex-wrap items-start gap-4 py-4">
          {controls.map((control) => {
            const Icon = CONTROL_ICONS[control.target];
            const busy = pendingTarget === control.target;
            return (
              <div key={control.target} className="flex flex-col gap-1">
                <Button
                  variant={control.target === "cancelled" ? "destructive" : "default"}
                  disabled={!control.enabled || pendingTarget !== null}
                  onClick={() => handleControl(control)}
                >
                  {busy ? (
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden="true" />
                  ) : (
                    <Icon className="mr-2 size-4" aria-hidden="true" />
                  )}
                  {control.label}
                </Button>
                {control.reason && (
                  <p className="max-w-56 text-xs text-muted-foreground">{control.reason}</p>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* ── Progress ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progress</CardTitle>
          <CardDescription>
            {progress.total === 0
              ? "Nobody has been added to this campaign yet."
              : `${percent}% of ${progress.total} ${progress.total === 1 ? "person" : "people"} worked through` +
                (remaining > 0 ? ` — ${remaining} still to go.` : ".")}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div
            className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            role="img"
            aria-label={`${percent}% worked through`}
          >
            <div
              className="h-full rounded-full bg-brand transition-[width] duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {TARGET_STATES.map((state) => (
              <StateCount
                key={state}
                label={TARGET_STATE_LABELS[state]}
                value={progress[state]}
                tone={STATE_TONES[state]}
              />
            ))}
          </div>

          {!finished && (
            <p className="text-xs text-muted-foreground">
              These numbers refresh on their own every few seconds.
            </p>
          )}
        </CardContent>
      </Card>

      {/* ── Settings ─────────────────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Settings</CardTitle>
          <CardDescription>How this campaign calls people.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">What the calls are about</span>
            <span className="text-right font-medium">{humanize(campaign.call_type_id)}</span>
          </div>
          <Separator />
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Pace</span>
            <span className="text-right font-medium">
              {describePacing(campaign.max_concurrent_calls, campaign.calls_per_minute)}
            </span>
          </div>
          <Separator />
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Calling hours</span>
            <span className="text-right font-medium">
              {describeCallingWindow(campaign.calling_window_start, campaign.calling_window_end)}
            </span>
          </div>
          <Separator />
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">If nobody answers</span>
            <span className="text-right font-medium">
              {describeAttempts(campaign.max_attempts)}, waiting{" "}
              {formatMinutesWords(campaign.retry_delay_minutes)} between tries
            </span>
          </div>
          <Separator />
          <div className="flex justify-between gap-4">
            <span className="text-muted-foreground">Created</span>
            <span className="text-right font-medium">{formatDateTime(campaign.created_at)}</span>
          </div>
          {campaign.started_at && (
            <>
              <Separator />
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">Started</span>
                <span className="text-right font-medium">
                  {formatDateTime(campaign.started_at)}
                </span>
              </div>
            </>
          )}
          {campaign.completed_at && (
            <>
              <Separator />
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">
                  {status === "cancelled" ? "Cancelled" : "Finished"}
                </span>
                <span className="text-right font-medium">
                  {formatDateTime(campaign.completed_at)}
                </span>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* ── Cancel confirmation ──────────────────────────────────────── */}
      <Dialog open={confirmCancelOpen} onOpenChange={setConfirmCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel this campaign?</DialogTitle>
            <DialogDescription>
              {remaining > 0
                ? `${remaining} ${remaining === 1 ? "person has" : "people have"} not been called yet and never will be. `
                : ""}
              Cancelling is permanent — this campaign cannot be started again afterwards. To call
              these people later you would have to create a new campaign.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmCancelOpen(false)}>
              Keep campaign
            </Button>
            <Button
              variant="destructive"
              disabled={pendingTarget !== null}
              onClick={() => {
                setConfirmCancelOpen(false);
                applyStatus("cancelled");
              }}
            >
              <XCircle className="mr-2 size-4" aria-hidden="true" />
              Cancel campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
