-- ============================================================================
-- Migration 014: Outbound calling campaigns.
--
-- Until now outbound calling was strictly one-number-at-a-time: a human typed
-- a number into /api/v1/calls/outbound and a call went out. There was no way
-- to work a list, no pacing, no retry policy, and no record of "we intended to
-- call this person and haven't yet".
--
-- Two tables:
--
--   campaigns        — the policy. What agent script to run, how fast to dial,
--                      what hours are acceptable, how many times to retry.
--                      Deliberately holds NO list of people: a campaign's
--                      settings change independently of its list.
--
--   campaign_targets — one row per person per campaign, and the unit of work
--                      the dialer claims. This is a QUEUE, and it is treated
--                      like one: `state` is a lifecycle, not a label, and the
--                      claim path (see claim_campaign_targets below) is the
--                      only thing permitted to move a row out of 'queued'.
--
-- THE CENTRAL SAFETY PROPERTY of this migration is that two overlapping cron
-- ticks can never dial the same human twice. Everything below — the state
-- column, the claim index, the SKIP LOCKED claim function — exists to serve
-- that one property. Double-dialling a real customer is the worst thing this
-- subsystem can do, worse than dialling nobody at all.
-- ============================================================================

CREATE TABLE IF NOT EXISTS campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  -- Matches an `OutboundCallType.id` in the tenant's industry pack. Plain TEXT
  -- with no FK for the same reason `agent_tool_settings.tool_id` is: call types
  -- live in TypeScript (src/industries/**), not in Postgres.
  call_type_id TEXT NOT NULL,
  -- draft | running | paused | completed | cancelled.
  -- The dialer dials for exactly ONE of these values. Anything that is not
  -- literally 'running' is a full stop, which is why the check constraint is
  -- explicit rather than left to the application layer.
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'running', 'paused', 'completed', 'cancelled')),

  -- ── Pacing ──────────────────────────────────────────────────────────────
  -- Both are ceilings the dialer enforces per tick. Bounded in the schema as
  -- well as in the API because a bad value here is not a validation error, it
  -- is a phone system hammering strangers.
  max_concurrent_calls INTEGER NOT NULL DEFAULT 1
    CHECK (max_concurrent_calls BETWEEN 1 AND 50),
  calls_per_minute INTEGER NOT NULL DEFAULT 1
    CHECK (calls_per_minute BETWEEN 1 AND 60),

  -- ── Calling window ──────────────────────────────────────────────────────
  -- LOCAL wall-clock times, stored without a zone on purpose: the zone is not
  -- a property of the campaign, it is a property of the person being called.
  -- The dialer resolves each target's own timezone (from the phone's country /
  -- NANP area code, falling back to the tenant's) and compares against these.
  -- Storing a fixed offset here would mean a campaign run by a New York tenant
  -- dialled Californians at 06:00 their time.
  calling_window_start TIME NOT NULL DEFAULT '09:00',
  calling_window_end   TIME NOT NULL DEFAULT '20:00',

  -- ── Retry policy ────────────────────────────────────────────────────────
  max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  retry_delay_minutes INTEGER NOT NULL DEFAULT 60
    CHECK (retry_delay_minutes BETWEEN 1 AND 10080),

  -- Variables handed to the call type's prompt template for every target in
  -- this campaign. Per-target values (campaign_targets.variables) override
  -- these key-by-key. Without this a campaign could never satisfy a call type
  -- that declares required variables, and every dial would fail validation.
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- public.users.id (internal id), matching audit_events.actor_id usage.
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Dashboard listing: this tenant's campaigns, newest first.
CREATE INDEX IF NOT EXISTS idx_campaigns_tenant_created
  ON campaigns(tenant_id, created_at DESC);

-- The dialer's own lookup, every tick: "which campaigns are running?".
-- Partial, because every other status is dead weight to that query.
CREATE INDEX IF NOT EXISTS idx_campaigns_running
  ON campaigns(status) WHERE status = 'running';

CREATE TABLE IF NOT EXISTS campaign_targets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  -- Nullable: a target may be a bare number typed/imported without ever
  -- becoming a contact row. When present it is the authority for do_not_call,
  -- which the dialer re-reads at dial time rather than trusting this row.
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  -- Denormalised from the contact deliberately. The number we intend to dial
  -- must not change under us because someone edited a contact mid-campaign.
  phone TEXT NOT NULL,

  -- queued     — eligible, waiting for a claim
  -- dialing    — CLAIMED by a dialer tick; owned, not to be touched by another
  -- done       — a call was actually placed
  -- failed     — retries exhausted, or a permanent failure
  -- opted_out  — do_not_call at dial time. TERMINAL. Never retried, ever.
  -- skipped    — excluded for a non-consent reason (no phone, bad number)
  state TEXT NOT NULL DEFAULT 'queued'
    CHECK (state IN ('queued', 'dialing', 'done', 'failed', 'opted_out', 'skipped')),

  attempts INTEGER NOT NULL DEFAULT 0,
  last_attempt_at TIMESTAMPTZ,
  -- NULL means "due now". Set on retry backoff, and also when a target is
  -- deferred because it is outside its own calling window — in that case it
  -- points at the next local window opening, so the row simply stops being
  -- due until then instead of being re-examined every single minute.
  next_attempt_at TIMESTAMPTZ,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  failure_reason TEXT,
  -- Per-target prompt variables, merged over campaigns.variables.
  variables JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- A number cannot be queued twice in one campaign. This is the structural
  -- half of the no-double-dial guarantee: even if the list builder is invoked
  -- twice, or two operators upload overlapping CSVs, the person exists once.
  -- The claim function guarantees the other half (no concurrent claim of that
  -- single row); together they mean one person is dialled at most once per
  -- campaign attempt cycle.
  CONSTRAINT campaign_targets_campaign_phone_key UNIQUE (campaign_id, phone)
);

-- THE claim index. The claim subquery filters campaign_id + state and orders by
-- due time, so this covers it end to end and the claim stays an index scan of
-- exactly `limit` rows rather than a scan of a million-row campaign.
CREATE INDEX IF NOT EXISTS idx_campaign_targets_claim
  ON campaign_targets(campaign_id, state, next_attempt_at);

-- Recovery sweep: find rows abandoned in 'dialing' without scanning the table.
CREATE INDEX IF NOT EXISTS idx_campaign_targets_dialing
  ON campaign_targets(last_attempt_at) WHERE state = 'dialing';

-- ----------------------------------------------------------------------------
-- claim_campaign_targets — the atomic claim.
--
-- This is the most safety-critical statement in the codebase.
--
-- It is ONE statement. A read-then-write pattern (SELECT the due rows, then
-- UPDATE them) is not merely slower, it is WRONG: two cron ticks that overlap
-- — and they do overlap, because a tick that places real phone calls can
-- easily outlive its one-minute schedule — would both SELECT the same rows and
-- both dial the same human being. There is no application-level retry, lock
-- file, or "is another tick running?" flag that closes that race; the database
-- is the only place it can be closed.
--
-- How it closes:
--   FOR UPDATE       — the inner SELECT takes a row lock on each row it returns
--   SKIP LOCKED      — a concurrent claimer does not block on those locked
--                      rows and does not see them either; it walks past to the
--                      next unlocked rows and fills its own LIMIT from those
--   UPDATE ... IN    — the outer UPDATE flips state off 'queued' before the
--                      lock is released at commit, so once the lock lifts the
--                      rows no longer match the `state = 'queued'` predicate
--
-- The result: two overlapping calls return DISJOINT sets, always. Not usually,
-- not with high probability — disjoint by construction.
--
-- Note what this function deliberately does NOT do: it does not increment
-- `attempts`. Claiming is not attempting. A tick that claims a row and then
-- crashes, or declines to dial it because the person is outside their calling
-- window, must not burn one of that person's finite attempts. Attempts are
-- incremented by the dialer only when a call is genuinely placed or genuinely
-- fails, and rows abandoned in 'dialing' are recovered by
-- release_stale_campaign_targets below.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION claim_campaign_targets(p_campaign_id UUID, p_limit INTEGER)
RETURNS SETOF campaign_targets
LANGUAGE sql
AS $$
  UPDATE campaign_targets AS t
     SET state = 'dialing',
         last_attempt_at = now(),
         updated_at = now()
   WHERE t.id IN (
     SELECT c.id
       FROM campaign_targets AS c
      WHERE c.campaign_id = p_campaign_id
        AND c.state = 'queued'
        AND (c.next_attempt_at IS NULL OR c.next_attempt_at <= now())
      ORDER BY c.next_attempt_at NULLS FIRST, c.created_at
      LIMIT GREATEST(p_limit, 0)
      FOR UPDATE SKIP LOCKED
   )
  RETURNING t.*;
$$;

-- ----------------------------------------------------------------------------
-- release_stale_campaign_targets — the crash-recovery half of the claim.
--
-- 'dialing' means "a tick owns this row". If that tick dies between the claim
-- and the dial (deploy, OOM, VPS reboot), nothing else would ever touch the
-- row again and that person would silently never be called. This returns such
-- rows to 'queued' and — unlike the claim — DOES charge an attempt, because
-- from the person's side we cannot prove a call didn't reach them, and the
-- safe assumption when unsure is that it did.
--
-- Targets that exhaust max_attempts this way are failed outright rather than
-- looped forever.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION release_stale_campaign_targets(p_stale_minutes INTEGER DEFAULT 15)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  released INTEGER;
BEGIN
  WITH stale AS (
    SELECT t.id,
           t.attempts + 1 AS next_attempts,
           c.max_attempts,
           c.retry_delay_minutes
      FROM campaign_targets t
      JOIN campaigns c ON c.id = t.campaign_id
     WHERE t.state = 'dialing'
       AND t.last_attempt_at < now() - make_interval(mins => GREATEST(p_stale_minutes, 1))
     FOR UPDATE OF t SKIP LOCKED
  ), updated AS (
    UPDATE campaign_targets t
       SET attempts = s.next_attempts,
           state = CASE WHEN s.next_attempts >= s.max_attempts THEN 'failed' ELSE 'queued' END,
           next_attempt_at = CASE
             WHEN s.next_attempts >= s.max_attempts THEN NULL
             ELSE now() + make_interval(mins => s.retry_delay_minutes)
           END,
           failure_reason = CASE
             WHEN s.next_attempts >= s.max_attempts THEN 'abandoned_mid_dial'
             ELSE t.failure_reason
           END,
           updated_at = now()
      FROM stale s
     WHERE t.id = s.id
     RETURNING t.id
  )
  SELECT count(*)::INTEGER INTO released FROM updated;
  RETURN released;
END;
$$;

-- ----------------------------------------------------------------------------
-- Row Level Security — same tenant-scoped pattern as migrations 009 and 012.
-- Migration 001's RLS loop only covered the tables that existed then, so a
-- table added later must enable RLS and declare its policies explicitly.
--
-- `campaign_targets` has no tenant_id of its own (its campaign owns that), so
-- its policies reach through the campaign. Denormalising tenant_id onto every
-- target row purely to simplify a policy would create a second, drift-prone
-- source of truth for which tenant a target belongs to.
-- ----------------------------------------------------------------------------
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaigns_tenant_select ON campaigns;
DROP POLICY IF EXISTS campaigns_tenant_insert ON campaigns;
DROP POLICY IF EXISTS campaigns_tenant_update ON campaigns;
DROP POLICY IF EXISTS campaigns_tenant_delete ON campaigns;

CREATE POLICY campaigns_tenant_select ON campaigns FOR SELECT
  USING (is_tenant_member(tenant_id));
CREATE POLICY campaigns_tenant_insert ON campaigns FOR INSERT
  WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY campaigns_tenant_update ON campaigns FOR UPDATE
  USING (is_tenant_member(tenant_id));
CREATE POLICY campaigns_tenant_delete ON campaigns FOR DELETE
  USING (is_tenant_member(tenant_id));

ALTER TABLE campaign_targets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS campaign_targets_tenant_select ON campaign_targets;
DROP POLICY IF EXISTS campaign_targets_tenant_insert ON campaign_targets;
DROP POLICY IF EXISTS campaign_targets_tenant_update ON campaign_targets;
DROP POLICY IF EXISTS campaign_targets_tenant_delete ON campaign_targets;

CREATE POLICY campaign_targets_tenant_select ON campaign_targets FOR SELECT
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND is_tenant_member(c.tenant_id)));
CREATE POLICY campaign_targets_tenant_insert ON campaign_targets FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND is_tenant_member(c.tenant_id)));
CREATE POLICY campaign_targets_tenant_update ON campaign_targets FOR UPDATE
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND is_tenant_member(c.tenant_id)));
CREATE POLICY campaign_targets_tenant_delete ON campaign_targets FOR DELETE
  USING (EXISTS (SELECT 1 FROM campaigns c WHERE c.id = campaign_id AND is_tenant_member(c.tenant_id)));

-- ----------------------------------------------------------------------------
-- Table privileges.
--
-- Migration 002 runs `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
-- TABLES TO postgres, anon, authenticated, service_role`, which silently
-- auto-grants both tables above to anon/authenticated the moment they are
-- created. Revoked explicitly and immediately, per the posture established in
-- migration 012. Nothing legitimate breaks: every campaign handler
-- authenticates the user with `createServerClient` + `getCurrentTenantId` and
-- then does all reads and writes through `createAdminClient` (service_role),
-- and the dialer is service_role throughout.
--
-- The claim function is likewise service_role-only. An `authenticated` role
-- able to EXECUTE it could mark another tenant's targets as 'dialing' — the
-- function is unqualified by tenant, because its only caller is the trusted
-- worker that has already resolved the campaign.
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE campaigns FROM anon, authenticated;
REVOKE ALL ON TABLE campaign_targets FROM anon, authenticated;

GRANT ALL ON TABLE campaigns TO postgres, service_role;
GRANT ALL ON TABLE campaign_targets TO postgres, service_role;

REVOKE ALL ON FUNCTION claim_campaign_targets(UUID, INTEGER) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION release_stale_campaign_targets(INTEGER) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION claim_campaign_targets(UUID, INTEGER) TO postgres, service_role;
GRANT EXECUTE ON FUNCTION release_stale_campaign_targets(INTEGER) TO postgres, service_role;
