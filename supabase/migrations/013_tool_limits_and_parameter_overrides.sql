-- ============================================================================
-- Migration 013: bounds for tenant-authored tools, and per-parameter overrides
-- for built-in ones.
--
-- Two independent gaps, one migration because they share a review and a
-- deploy.
--
-- (1) custom_tools had no bound of any kind. A tenant-authored tool pointed at
--     a slow or hostile endpoint could hold a live phone call open for as long
--     as the far end kept the socket alive, and could be invoked by the model
--     as many times as it liked. Pack tools DECLARE `timeout` and `rateLimit`
--     on their `ToolBinding` — but see the note below, because what those
--     declarations were actually doing is not what it looks like.
--
--     `timeout_seconds` becomes Ultravox's own per-tool timeout, so it bounds
--     the call even for a third-party URL we never see the traffic for.
--     `rate_limit_per_minute` is counted server-side, which is only possible
--     because this migration ships alongside the change that routes custom
--     tool invocations through /api/v1/tools/custom/[id] instead of letting
--     Ultravox dial the tenant's host directly.
--
--     Defaults are the ones a tenant who never opens the field should get:
--     20s matches Ultravox's own default so existing tools keep behaving
--     exactly as they do today, and 30/min matches the per-call tool budget
--     already in the gateway. The CHECK bounds are the enforcement of record —
--     the zod schema in src/lib/validation/agent-tools.ts states the same
--     numbers so the rejection can be phrased in English, but a row that
--     reaches Postgres by any other path is still bounded.
--
-- (2) agent_tool_settings could reword a pack tool's description but could say
--     nothing about its parameters. `parameter_overrides` is a SPARSE map,
--     keyed by parameter name:
--
--       { "party_size": { "description": "How many people are dining." },
--         "notes":      { "enabled": false } }
--
--     Absence of a key — and absence of a field within a key — means "use the
--     pack's value", exactly like the description_override convention above
--     it. Deliberately NOT stored as an array: an array would imply order and
--     completeness, and this is neither.
--
--     What it can express is bounded on purpose. A parameter's `name`, `type`
--     and `required` flag are NOT overridable, because the handlers in
--     src/lib/tools/*.ts read their inputs by name and assume the shape the
--     pack declared. Letting a tenant rename `date` or make a required field
--     optional would break the handler at call time, in production, on a live
--     call, with no way for the tenant to know why. So the override surface is
--     the human-facing description plus the ability to stop COLLECTING an
--     already-optional parameter. Both are validated in the API layer against
--     the live pack binding; this column stores whatever survives that.
--
-- NOTE on "pack tools already have limits": they declare them, but nothing
-- enforced them. src/lib/tools/gateway.ts (which applies fixed per-call and
-- per-tenant budgets, not the per-binding numbers) is referenced only by
-- src/tests/contract/tool-gateway.test.ts — the live tool path is
-- /api/v1/tools/execute/[toolId], which read neither `timeout` nor
-- `rateLimit`. The code shipping with this migration starts honouring both,
-- for pack and custom tools alike, so the parity this migration claims is real
-- rather than aspirational.
-- ============================================================================

ALTER TABLE custom_tools
  ADD COLUMN IF NOT EXISTS timeout_seconds INTEGER NOT NULL DEFAULT 20,
  ADD COLUMN IF NOT EXISTS rate_limit_per_minute INTEGER NOT NULL DEFAULT 30;

-- Guarded because ADD CONSTRAINT has no IF NOT EXISTS, and this migration has
-- to be safe to re-run against a database that already has it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'custom_tools_timeout_seconds_range'
  ) THEN
    ALTER TABLE custom_tools
      ADD CONSTRAINT custom_tools_timeout_seconds_range
      CHECK (timeout_seconds >= 1 AND timeout_seconds <= 120);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'custom_tools_rate_limit_per_minute_range'
  ) THEN
    ALTER TABLE custom_tools
      ADD CONSTRAINT custom_tools_rate_limit_per_minute_range
      CHECK (rate_limit_per_minute >= 1 AND rate_limit_per_minute <= 600);
  END IF;
END $$;

COMMENT ON COLUMN custom_tools.timeout_seconds IS
  'How long the agent waits for this tool before giving up, 1-120s. Sent to Ultravox as the tool timeout, so it bounds third-party endpoints too.';
COMMENT ON COLUMN custom_tools.rate_limit_per_minute IS
  'Maximum invocations of this tool per minute per call, 1-600. Counted at /api/v1/tools/custom/[id].';

ALTER TABLE agent_tool_settings
  ADD COLUMN IF NOT EXISTS parameter_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;

-- An array here would be a shape error, not a value error: every reader treats
-- this as a name-keyed map, and `[]` would silently read as "no overrides"
-- while hiding a bug in whatever wrote it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'agent_tool_settings_parameter_overrides_object'
  ) THEN
    ALTER TABLE agent_tool_settings
      ADD CONSTRAINT agent_tool_settings_parameter_overrides_object
      CHECK (jsonb_typeof(parameter_overrides) = 'object');
  END IF;
END $$;

COMMENT ON COLUMN agent_tool_settings.parameter_overrides IS
  'Sparse map of parameter name -> { description?, enabled? }. Never overrides name/type/required — handlers read those by name.';

-- Migration 002's ALTER DEFAULT PRIVILEGES only fires on CREATE TABLE, so
-- adding columns cannot re-grant anything. Re-asserted anyway: this is the
-- footgun 012 documented, and a REVOKE that is already true costs nothing.
REVOKE ALL ON TABLE agent_tool_settings FROM anon, authenticated;
REVOKE ALL ON TABLE custom_tools FROM anon, authenticated;
