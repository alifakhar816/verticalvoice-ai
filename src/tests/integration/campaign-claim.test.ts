import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

/**
 * Atomic-claim integration tests.
 *
 * These prove THE safety property of the campaign dialer: two overlapping
 * ticks can never claim the same person, and therefore can never dial them
 * twice. That property lives entirely in Postgres (`claim_campaign_targets`,
 * migration 014) — it depends on `FOR UPDATE SKIP LOCKED` semantics, which no
 * amount of in-memory mocking can simulate. So this file talks to a real
 * database or it skips; a mocked version of this test would be worse than no
 * test, because it would report success for a guarantee it never checked.
 *
 * Following the pattern in rls.test.ts: if the Supabase stack isn't reachable,
 * every test here is skipped rather than failed, so CI without Docker doesn't
 * hard-fail.
 */

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

let dbAvailable = false;

async function checkHealth(): Promise<boolean> {
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) return false;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);
    const res = await fetch(`${SUPABASE_URL}/rest/v1/`, {
      headers: { apikey: ANON_KEY },
      signal: controller.signal,
    });
    clearTimeout(timeout);
    return res.status < 500;
  } catch {
    return false;
  }
}

describe("claim_campaign_targets — atomic claim", () => {
  let admin: SupabaseClient;
  let tenantId: string;
  let campaignId: string;
  const suffix = randomUUID().slice(0, 8);

  beforeAll(async () => {
    dbAvailable = await checkHealth();
    if (!dbAvailable) return;

    admin = createClient(SUPABASE_URL!, SERVICE_ROLE_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const { data: tenant, error: tenantError } = await admin
      .from("tenants")
      .insert({
        name: `Claim test ${suffix}`,
        slug: `claim-test-${suffix}`,
        industry: "healthcare",
        status: "active",
      })
      .select("id")
      .single();
    if (tenantError || !tenant) throw new Error(`Failed to seed tenant: ${tenantError?.message}`);
    tenantId = tenant.id;

    const { data: campaign, error: campaignError } = await admin
      .from("campaigns")
      .insert({
        tenant_id: tenantId,
        name: `ZZ claim test ${suffix}`,
        call_type_id: "probe",
        status: "running",
      })
      .select("id")
      .single();
    if (campaignError || !campaign) {
      throw new Error(`Failed to seed campaign: ${campaignError?.message}`);
    }
    campaignId = campaign.id;
  });

  afterAll(async () => {
    if (!dbAvailable || !admin) return;
    // Targets cascade from the campaign, campaigns cascade from the tenant.
    if (tenantId) await admin.from("tenants").delete().eq("id", tenantId);
  });

  async function seedTargets(count: number): Promise<void> {
    await admin.from("campaign_targets").delete().eq("campaign_id", campaignId);
    const rows = Array.from({ length: count }, (_, i) => ({
      campaign_id: campaignId,
      phone: `+1555${String(i).padStart(7, "0")}`,
    }));
    const { error } = await admin.from("campaign_targets").insert(rows);
    if (error) throw new Error(`Failed to seed targets: ${error.message}`);
  }

  it.skipIf(!dbAvailable)(
    "returns DISJOINT sets to two concurrent claims — nobody is dialled twice",
    async () => {
      await seedTargets(20);

      // Fired without awaiting in between, so both are in flight at once. This
      // is the exact race an overlapping cron tick creates.
      const [a, b] = await Promise.all([
        admin.rpc("claim_campaign_targets", { p_campaign_id: campaignId, p_limit: 10 }),
        admin.rpc("claim_campaign_targets", { p_campaign_id: campaignId, p_limit: 10 }),
      ]);

      const idsA = new Set(((a.data ?? []) as { id: string }[]).map((r) => r.id));
      const idsB = new Set(((b.data ?? []) as { id: string }[]).map((r) => r.id));

      const overlap = [...idsA].filter((id) => idsB.has(id));
      expect(overlap).toEqual([]);

      // And between them they took every row exactly once — the claim skips
      // locked rows, it does not lose them.
      expect(idsA.size + idsB.size).toBe(20);
      expect(new Set([...idsA, ...idsB]).size).toBe(20);
    }
  );

  it.skipIf(!dbAvailable)("hands out every row exactly once under heavy contention", async () => {
    await seedTargets(30);

    // Six simultaneous claimers for thirty rows. Any read-then-write
    // implementation would hand the same rows to several of these.
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        admin.rpc("claim_campaign_targets", { p_campaign_id: campaignId, p_limit: 5 })
      )
    );

    const allIds = results.flatMap((r) => ((r.data ?? []) as { id: string }[]).map((x) => x.id));
    expect(allIds.length).toBe(30);
    expect(new Set(allIds).size).toBe(30); // no id appears twice

    const { count } = await admin
      .from("campaign_targets")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaignId)
      .eq("state", "queued");
    expect(count).toBe(0);
  });

  it.skipIf(!dbAvailable)("claims a person without consuming one of their attempts", async () => {
    // Claiming is not attempting: a tick that claims and then declines to dial
    // (out of hours, opted out, crashed) must not burn a finite attempt.
    await seedTargets(3);

    await admin.rpc("claim_campaign_targets", { p_campaign_id: campaignId, p_limit: 3 });

    const { data } = await admin
      .from("campaign_targets")
      .select("state, attempts, last_attempt_at")
      .eq("campaign_id", campaignId);

    const rows = (data ?? []) as { state: string; attempts: number; last_attempt_at: string }[];
    for (const row of rows) {
      expect(row.state).toBe("dialing");
      expect(row.attempts).toBe(0);
      expect(row.last_attempt_at).toBeTruthy();
    }
  });

  it.skipIf(!dbAvailable)("does not claim targets whose backoff has not elapsed", async () => {
    await seedTargets(4);
    const future = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    await admin
      .from("campaign_targets")
      .update({ next_attempt_at: future })
      .eq("campaign_id", campaignId);

    const { data } = await admin.rpc("claim_campaign_targets", {
      p_campaign_id: campaignId,
      p_limit: 10,
    });

    expect((data ?? []).length).toBe(0);
  });

  it.skipIf(!dbAvailable)("returns rows abandoned mid-dial, charging one attempt", async () => {
    await seedTargets(2);
    await admin.rpc("claim_campaign_targets", { p_campaign_id: campaignId, p_limit: 2 });

    // Backdate the claim so it looks like a tick died holding these rows.
    const longAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    await admin
      .from("campaign_targets")
      .update({ last_attempt_at: longAgo })
      .eq("campaign_id", campaignId);

    const { data: released } = await admin.rpc("release_stale_campaign_targets", {
      p_stale_minutes: 15,
    });
    expect(released).toBe(2);

    const { data } = await admin
      .from("campaign_targets")
      .select("state, attempts")
      .eq("campaign_id", campaignId);

    const rows = (data ?? []) as { state: string; attempts: number }[];
    for (const row of rows) {
      // max_attempts defaults to 3, so one charged attempt returns them to the
      // queue rather than failing them outright.
      expect(row.state).toBe("queued");
      expect(row.attempts).toBe(1);
    }
  });
});
