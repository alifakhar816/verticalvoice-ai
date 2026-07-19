-- ============================================================================
-- Migration 012: Tool platform — per-tenant control over what the agent can do.
--
-- Until now the agent's tool catalog was hard-coded: `buildSelectedTools` read
-- `pack.tools` straight from the industry pack and handed all of them to
-- Ultravox on every call. A tenant could not turn one off, could not reword how
-- a tool is described to the model, and could not add one of their own. The
-- Agent tab even rendered a switch-shaped `<span role="img">` next to each tool
-- that was decorative — it looked like a control and was not one.
--
-- Two tables, deliberately separate rather than one polymorphic table:
--
--   agent_tool_settings — OVERRIDES for tools that already exist in the
--     industry pack. Rows here are sparse: absence means "pack default"
--     (enabled, pack description). The pack stays the source of truth for the
--     tool's parameters and its handler; this table only ever answers "is it
--     on, and is the description reworded?". A tool_id here that no longer
--     exists in the pack is inert, not an error — packs evolve.
--
--   custom_tools — tools that exist ONLY for one tenant, defined entirely by
--     that tenant. These have no handler in `src/lib/tools/*`; they carry their
--     own `http_url` and Ultravox calls that URL directly, so they never reach
--     `/api/v1/tools/execute/[toolId]`.
--
-- Both are per-tenant and cascade with the tenant, because neither has any
-- meaning outside the tenant that authored it.
-- ============================================================================

CREATE TABLE IF NOT EXISTS agent_tool_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Matches `ToolBinding.id` in the tenant's industry pack. Intentionally a
  -- plain TEXT with no FK: pack tools live in TypeScript, not in Postgres.
  tool_id TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  -- When set, replaces the pack's description in the Ultravox tool definition.
  -- This is the text the MODEL reads to decide when to call the tool, so it is
  -- a behavioural setting, not a cosmetic label.
  description_override TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- One override row per tool per tenant. Also the ON CONFLICT target for the
  -- PATCH upsert in /api/v1/agents/tools/[toolId].
  CONSTRAINT agent_tool_settings_tenant_tool_key UNIQUE (tenant_id, tool_id)
);

-- The call path reads every row for one tenant on every call setup, so the
-- tenant_id lookup is the one that has to be cheap.
CREATE INDEX IF NOT EXISTS idx_agent_tool_settings_tenant
  ON agent_tool_settings(tenant_id);

CREATE TABLE IF NOT EXISTS custom_tools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  -- Becomes Ultravox's `modelToolName`, which restricts it to
  -- letters/digits/underscore. Enforced in the API layer
  -- (src/lib/validation/agent-tools.ts) so the rejection can be phrased in
  -- plain English rather than surfacing a CHECK constraint violation.
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  -- Array of ToolParameter objects: { name, type, required, description }.
  -- Stored as JSONB rather than a child table because it is always read and
  -- written whole, is never queried by element, and mirrors a TypeScript shape
  -- (`ToolParameter[]`) that the pack already defines.
  parameters JSONB NOT NULL DEFAULT '[]'::jsonb,
  http_url TEXT NOT NULL,
  http_method TEXT NOT NULL DEFAULT 'POST',
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Two tools with the same name would give the model an ambiguous catalog.
  CONSTRAINT custom_tools_tenant_name_key UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_custom_tools_tenant ON custom_tools(tenant_id);

-- ----------------------------------------------------------------------------
-- Row Level Security — same tenant-scoped pattern as migration 001's
-- `tenant_tables` block and migration 009. Migration 001's RLS loop only
-- covered tables that existed then, so a table added later must enable RLS and
-- declare its policies explicitly.
-- ----------------------------------------------------------------------------
ALTER TABLE agent_tool_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS agent_tool_settings_tenant_select ON agent_tool_settings;
DROP POLICY IF EXISTS agent_tool_settings_tenant_insert ON agent_tool_settings;
DROP POLICY IF EXISTS agent_tool_settings_tenant_update ON agent_tool_settings;
DROP POLICY IF EXISTS agent_tool_settings_tenant_delete ON agent_tool_settings;

CREATE POLICY agent_tool_settings_tenant_select ON agent_tool_settings FOR SELECT
  USING (is_tenant_member(tenant_id));
CREATE POLICY agent_tool_settings_tenant_insert ON agent_tool_settings FOR INSERT
  WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY agent_tool_settings_tenant_update ON agent_tool_settings FOR UPDATE
  USING (is_tenant_member(tenant_id));
CREATE POLICY agent_tool_settings_tenant_delete ON agent_tool_settings FOR DELETE
  USING (is_tenant_member(tenant_id));

ALTER TABLE custom_tools ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS custom_tools_tenant_select ON custom_tools;
DROP POLICY IF EXISTS custom_tools_tenant_insert ON custom_tools;
DROP POLICY IF EXISTS custom_tools_tenant_update ON custom_tools;
DROP POLICY IF EXISTS custom_tools_tenant_delete ON custom_tools;

CREATE POLICY custom_tools_tenant_select ON custom_tools FOR SELECT
  USING (is_tenant_member(tenant_id));
CREATE POLICY custom_tools_tenant_insert ON custom_tools FOR INSERT
  WITH CHECK (is_tenant_member(tenant_id));
CREATE POLICY custom_tools_tenant_update ON custom_tools FOR UPDATE
  USING (is_tenant_member(tenant_id));
CREATE POLICY custom_tools_tenant_delete ON custom_tools FOR DELETE
  USING (is_tenant_member(tenant_id));

-- ----------------------------------------------------------------------------
-- Table privileges.
--
-- Migration 002 runs `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON
-- TABLES TO postgres, anon, authenticated, service_role`. That default applies
-- to tables created afterwards by the same role, so BOTH tables above are
-- auto-granted to `anon` and `authenticated` the moment they are created —
-- silently, with nothing in this file saying so. That auto-grant is the exact
-- footgun this project has been bitten by before, so it is revoked explicitly
-- and immediately rather than left to be discovered.
--
-- Nothing legitimate breaks: every handler that touches these tables
-- (`/api/v1/agents/tools/**`) authenticates the user with `createServerClient`
-- and then does all reads and writes through `createAdminClient`, i.e. as
-- `service_role`, which keeps its grant below. The call path
-- (`buildSelectedTools` callers) is likewise service_role. No browser-side
-- client ever queries these tables directly.
--
-- The RLS policies above are kept as defence in depth: if a future change does
-- re-grant `authenticated` (another ALTER DEFAULT PRIVILEGES run, a manual
-- GRANT, a Supabase platform bootstrap), row scoping still holds instead of
-- every tenant's tool catalog becoming world-readable.
--
-- NOTE: this diverges from migration 009 (`contacts`), which GRANTs to
-- anon/authenticated and relies on RLS alone. That is the older convention;
-- these tables use the stricter posture because nothing outside service_role
-- needs them.
-- ----------------------------------------------------------------------------
REVOKE ALL ON TABLE agent_tool_settings FROM anon, authenticated;
REVOKE ALL ON TABLE custom_tools FROM anon, authenticated;

GRANT ALL ON TABLE agent_tool_settings TO postgres, service_role;
GRANT ALL ON TABLE custom_tools TO postgres, service_role;
