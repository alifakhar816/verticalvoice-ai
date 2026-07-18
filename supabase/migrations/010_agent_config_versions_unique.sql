-- ============================================================================
-- agent_config_versions: one row per (tenant, version)
--
-- Version numbers are assigned as max(version) + 1 by both the prompt editor
-- (/api/v1/agents/prompt) and scripts/recompile-agent.ts. With only a primary
-- key on `id`, two concurrent publishes both read the same max and both insert
-- — silently producing two rows claiming the same version number. Nothing
-- errors; the history just quietly becomes ambiguous, and "roll back to v3"
-- stops having a single answer.
--
-- Verified no duplicates exist before adding this.
-- ============================================================================

ALTER TABLE agent_config_versions
  ADD CONSTRAINT agent_config_versions_tenant_version_key
  UNIQUE (tenant_id, version);
