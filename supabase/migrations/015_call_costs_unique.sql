-- ============================================================================
-- call_costs: one cost row per call
--
-- The reconcile sweep writes costs with
--   .upsert({...}, { onConflict: "call_id" })
-- but `call_costs` only ever had a primary key on `id`. Postgres rejects
-- ON CONFLICT when no unique index matches the named column, so every one of
-- those upserts failed — and the result was never checked, so it failed
-- silently. Real calls therefore never got a cost, and the detail page sat on
-- "Calculating…" indefinitely while seeded demo rows (inserted directly) showed
-- figures, which made the feature look like it worked.
--
-- Verified no duplicate call_id rows exist before adding this.
-- ============================================================================

ALTER TABLE call_costs
  ADD CONSTRAINT call_costs_call_id_key UNIQUE (call_id);
