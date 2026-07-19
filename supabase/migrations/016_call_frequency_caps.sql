-- ============================================================================
-- Migration 016: Per-person outbound call frequency caps.
--
-- `campaigns.max_attempts` bounds how many times ONE campaign retries ONE
-- target. Nothing bounded how many times a PERSON was called. Two campaigns
-- over overlapping lists, a re-run of the same campaign, or the same contact
-- imported twice each multiply that ceiling: three campaigns politely limited
-- to three attempts is nine calls to one human in a day.
--
-- These two columns are the tenant-configurable ceiling the dialer enforces at
-- dial time, counted per phone number across every campaign the tenant runs.
--
-- Defaults are 3/day and 10/week, mined from the pre-dialer compliance worker
-- (src/workers/outbound/index.ts) which hardcoded exactly those numbers. The
-- numbers were sound; hardcoding them was not.
--
-- NULL is permitted and means "not configured", which the application resolves
-- to the default above — NOT to "unlimited". An absent setting is not consent.
-- The CHECK forbids negatives, which could only ever be a mistake; 0 is
-- allowed and legitimately means "never place outbound calls to a number
-- twice", so the dialer parks such targets indefinitely rather than dialling.
-- ============================================================================

ALTER TABLE policy_settings
  ADD COLUMN IF NOT EXISTS max_calls_per_day INTEGER DEFAULT 3,
  ADD COLUMN IF NOT EXISTS max_calls_per_week INTEGER DEFAULT 10;

ALTER TABLE policy_settings
  DROP CONSTRAINT IF EXISTS policy_settings_max_calls_per_day_check;
ALTER TABLE policy_settings
  ADD CONSTRAINT policy_settings_max_calls_per_day_check
  CHECK (max_calls_per_day IS NULL OR max_calls_per_day >= 0);

ALTER TABLE policy_settings
  DROP CONSTRAINT IF EXISTS policy_settings_max_calls_per_week_check;
ALTER TABLE policy_settings
  ADD CONSTRAINT policy_settings_max_calls_per_week_check
  CHECK (max_calls_per_week IS NULL OR max_calls_per_week >= 0);

COMMENT ON COLUMN policy_settings.max_calls_per_day IS
  'Max outbound dials to one phone number in any rolling 24h, across all campaigns. NULL = use application default (3). 0 = never re-dial.';
COMMENT ON COLUMN policy_settings.max_calls_per_week IS
  'Max outbound dials to one phone number in any rolling 7 days, across all campaigns. NULL = use application default (10). 0 = never re-dial.';

-- ----------------------------------------------------------------------------
-- Index supporting the dial-time cap query.
--
-- The dialer asks, once per target per dial: "how many outbound calls has this
-- tenant placed to this number in the last seven days?" Without this index
-- that is a scan of the tenant's entire call history on every single dial, on
-- the hottest path in the product. `started_at DESC` because the query is
-- always a recent-window slice, never the whole history.
--
-- Partial on direction='outbound': inbound calls are the large majority of
-- rows for most tenants and can never satisfy this predicate.
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_calls_tenant_called_number_started
  ON calls (tenant_id, called_number, started_at DESC)
  WHERE direction = 'outbound';

-- ----------------------------------------------------------------------------
-- Table privileges.
--
-- Deliberately NO revoke/grant statements here, which departs from migrations
-- 012 and 014 — and the reason is that this migration adds no new TABLE.
--
-- Postgres grants are table-level, not column-level, so columns added to an
-- existing table inherit that table's existing privileges. `policy_settings`
-- was granted to anon/authenticated by migration 002 and is RLS-scoped by
-- migration 001 (`is_tenant_member(tenant_id)`), and it is read through the
-- authenticated client today (see the nested select in the onboarding route).
-- Revoking the table to match the 012/014 posture would therefore not be a
-- hardening no-op — it would break existing reads.
--
-- Inheriting is also the correct outcome on the merits: these two columns are
-- a tenant's own calling policy, exposed under RLS to that tenant's own
-- members and nobody else. Writes remain admin-only in the application layer,
-- exactly as `allow_outbound` on this same table already is.
-- ----------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';
