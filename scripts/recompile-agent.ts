/**
 * Recompiles a tenant's agent config from the current industry pack and
 * activates it.
 *
 * Why this exists: the live prompt a caller hears comes from
 * `agent_config_versions.snapshot.system_prompt`, which is a frozen copy made
 * at onboarding time. Editing the industry packs does NOT retroactively
 * rewrite that row — so prompt work stays invisible in production until
 * something recompiles and re-activates. That "something" was missing; the
 * only compile path (`/api/v1/agents/[id]/compile`) writes to a different
 * table (`agent_versions`) that the call path never reads.
 *
 * Publishes a NEW version rather than mutating the active row, so the previous
 * prompt stays on record and activation can be rolled back by repointing
 * `active_agent_configs` at the old version id.
 *
 * Usage:
 *   SUPABASE_URL=... SERVICE_KEY=... npx vite-node scripts/recompile-agent.ts <tenant_id>
 */
import "@/industries";
import { getIndustryPack } from "@/industries/core/registry";
import { compileAgent } from "@/industries/core/compiler";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SERVICE_KEY;
const tenantId = process.argv[2];

if (!SUPABASE_URL || !SERVICE_KEY || !tenantId) {
  console.error("need SUPABASE_URL, SERVICE_KEY env and <tenant_id> arg");
  process.exit(1);
}

const REST = `${SUPABASE_URL}/rest/v1`;
const headers = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  "Content-Type": "application/json",
};

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${REST}/${path}`, { headers });
  if (!res.ok) throw new Error(`GET ${path} -> ${res.status} ${await res.text()}`);
  return res.json() as Promise<T>;
}

async function main() {
  const [tenant] = await get<any[]>(`tenants?select=*&id=eq.${tenantId}`);
  if (!tenant) throw new Error(`no tenant ${tenantId}`);

  const [profile] = await get<any[]>(
    `business_profiles?select=*&tenant_id=eq.${tenantId}`,
  );
  const flags = await get<any[]>(
    `feature_flags?select=flag_name,enabled&tenant_id=eq.${tenantId}`,
  );

  const pack = getIndustryPack(tenant.industry);
  if (!pack) throw new Error(`no industry pack for ${tenant.industry}`);

  const features: Record<string, boolean> = {};
  for (const f of flags) features[f.flag_name] = f.enabled;

  // The previous version is the source of truth for settings a recompile must
  // not silently change (voice, model, temperature) — those are tenant
  // choices, not pack output. Only the prompt is regenerated.
  const [prev] = await get<any[]>(
    `agent_config_versions?select=*&tenant_id=eq.${tenantId}&order=version.desc&limit=1`,
  );
  if (!prev) throw new Error("no existing agent_config_version to clone");
  const prevSnap = prev.snapshot ?? {};

  // Descriptor answers captured at onboarding. Kept aligned with the seeded
  // menu so the agent's self-description matches what it can actually sell.
  const onboardingAnswers: Record<string, unknown> =
    tenant.industry === "restaurant" ? { cuisine_type: "coastal American" } : {};

  const compiled = compileAgent(
    {
      tenantId,
      industryId: tenant.industry,
      businessName: profile?.business_name || tenant.name,
      businessPhone: profile?.phone || "",
      timezone: profile?.timezone || "UTC",
      locale: "en-US",
      features,
      overrides: {},
    },
    pack,
    onboardingAnswers,
  );

  // Fail loudly rather than publishing a prompt with the exact defects this
  // work set out to remove.
  const leftover = compiled.systemPrompt.match(/\{\{[^}]+\}\}/g);
  if (leftover) throw new Error(`unresolved placeholders: ${leftover.join(", ")}`);
  for (const marker of ["ONE QUESTION AT A TIME", "ENDING THE CALL"]) {
    if (!compiled.systemPrompt.includes(marker)) {
      throw new Error(`compiled prompt missing voice rule section: ${marker}`);
    }
  }

  const snapshot = {
    ...prevSnap,
    system_prompt: compiled.systemPrompt,
    tools: compiled.activeTools,
    business_name: profile?.business_name || tenant.name,
    compiled_at: compiled.compiledAt,
  };

  const nextVersion = (prev.version ?? 0) + 1;
  const insertRes = await fetch(`${REST}/agent_config_versions`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=representation" },
    body: JSON.stringify({
      tenant_id: tenantId,
      draft_id: prev.draft_id,
      version: nextVersion,
      snapshot,
      published_by: prev.published_by,
      published_at: new Date().toISOString(),
    }),
  });
  if (!insertRes.ok) throw new Error(`insert failed: ${await insertRes.text()}`);
  const [version] = await insertRes.json();

  const activateRes = await fetch(
    `${REST}/active_agent_configs?tenant_id=eq.${tenantId}`,
    {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=representation" },
      body: JSON.stringify({
        agent_config_version_id: version.id,
        activated_at: new Date().toISOString(),
      }),
    },
  );
  if (!activateRes.ok) throw new Error(`activate failed: ${await activateRes.text()}`);

  console.log(`published v${nextVersion} (${version.id})`);
  console.log(`prompt: ${prevSnap.system_prompt?.length ?? 0} -> ${compiled.systemPrompt.length} chars`);
  console.log(`rollback: PATCH active_agent_configs -> ${prev.id}`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
