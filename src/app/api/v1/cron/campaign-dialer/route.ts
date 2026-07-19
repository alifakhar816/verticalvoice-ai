import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { runCampaignDialerTick } from "@/lib/campaigns/dialer";

/**
 * Cron-driven campaign dialer. A VPS crontab hits this every minute to place
 * the next batch of outbound campaign calls. Authenticated by a shared secret
 * header rather than a user session, since no human is on the other end —
 * the same pattern as the post-call reconciler next door.
 *
 * Ticks are expected to overlap: dialling real phone calls can take longer
 * than the minute between invocations. That is safe by construction, because
 * work is taken with an atomic SKIP LOCKED claim (migration 014) — two
 * concurrent ticks receive disjoint sets of people and cannot double-dial.
 * This route therefore takes no lock of its own and refuses no request; a
 * "one at a time" guard here would be both unnecessary and, if it ever failed
 * open, falsely reassuring.
 */
async function handle(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 500 });
  }
  const provided = request.headers.get("x-cron-secret");
  if (provided !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const admin = createAdminClient();
    const result = await runCampaignDialerTick(admin);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Campaign dialer failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  return handle(request);
}

export async function GET(request: NextRequest) {
  return handle(request);
}
