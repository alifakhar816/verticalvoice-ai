import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/database/supabase-server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { getCurrentTenantId } from "@/domain/tenants/current";
import { validateAgentPrompt } from "@/lib/validation/agent-prompt";

/**
 * Publishes a hand-edited system prompt for the caller's tenant.
 *
 * The live prompt a caller hears comes from
 * `agent_config_versions.snapshot.system_prompt`, pointed at by
 * `active_agent_configs.agent_config_version_id` (see
 * `src/app/api/v1/webhooks/twilio/voice/route.ts`). The `agents` /
 * `agent_versions` tables written by `/api/v1/agents/[id]/compile` are NOT on
 * the call path, so this route deliberately does not touch them.
 *
 * Mirrors `scripts/recompile-agent.ts`: clone the active snapshot, replace only
 * `system_prompt`, INSERT a new version row, then repoint the active config.
 * The existing row is never mutated, so the previous prompt stays on record and
 * a rollback is just repointing `active_agent_configs` at the old version id.
 */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const validation = validateAgentPrompt(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }
    const { systemPrompt } = validation;

    // Returns null unless the user has an internal `users` row AND a
    // `tenant_members` membership, so this doubles as the membership check.
    const tenant_id = await getCurrentTenantId(user.id);
    if (!tenant_id) {
      return NextResponse.json(
        { error: "No tenant found for this account." },
        { status: 403 }
      );
    }

    const admin = createAdminClient();

    // `published_by` references the internal `users.id`, not the auth user id.
    const { data: internalUser } = await admin
      .from("users")
      .select("id")
      .eq("auth_id", user.id)
      .maybeSingle();

    // Resolve the exact active row the call path would read: newest activation.
    const { data: activeConfig } = await admin
      .from("active_agent_configs")
      .select("id, agent_config_version_id")
      .eq("tenant_id", tenant_id)
      .order("activated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!activeConfig) {
      return NextResponse.json(
        {
          error:
            "This agent has not been set up yet, so there are no instructions to edit.",
        },
        { status: 409 }
      );
    }

    const { data: currentVersion } = await admin
      .from("agent_config_versions")
      .select("id, draft_id, snapshot")
      .eq("id", activeConfig.agent_config_version_id)
      .single();

    if (!currentVersion) {
      return NextResponse.json(
        { error: "The current agent configuration could not be loaded." },
        { status: 409 }
      );
    }

    const currentSnapshot =
      currentVersion.snapshot &&
      typeof currentVersion.snapshot === "object" &&
      !Array.isArray(currentVersion.snapshot)
        ? (currentVersion.snapshot as Record<string, unknown>)
        : {};

    const previousPrompt =
      typeof currentSnapshot.system_prompt === "string"
        ? currentSnapshot.system_prompt
        : "";

    if (previousPrompt === systemPrompt) {
      return NextResponse.json(
        { error: "These instructions are unchanged, so nothing was published." },
        { status: 400 }
      );
    }

    // Version numbers are per tenant, so the next one is max(version) + 1 across
    // the tenant's history — not just the currently active version's number,
    // which can lag behind if an older version was reactivated for a rollback.
    const { data: latestVersion } = await admin
      .from("agent_config_versions")
      .select("version")
      .eq("tenant_id", tenant_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latestVersion?.version ?? 0) + 1;
    const publishedAt = new Date().toISOString();

    // Everything except the prompt is carried forward untouched — voice, model
    // and temperature are tenant choices this edit must not silently change.
    const { data: newVersion, error: insertError } = await admin
      .from("agent_config_versions")
      .insert({
        tenant_id,
        draft_id: currentVersion.draft_id,
        version: nextVersion,
        snapshot: { ...currentSnapshot, system_prompt: systemPrompt },
        published_by: internalUser?.id ?? null,
        published_at: publishedAt,
      })
      .select("id, version")
      .single();

    if (insertError || !newVersion) {
      return NextResponse.json(
        { error: "The new instructions could not be saved. Nothing was changed." },
        { status: 500 }
      );
    }

    const { error: activateError } = await admin
      .from("active_agent_configs")
      .update({
        agent_config_version_id: newVersion.id,
        activated_at: publishedAt,
        activated_by: internalUser?.id ?? null,
      })
      .eq("id", activeConfig.id);

    if (activateError) {
      // The new version row survives on purpose: it is a complete, inspectable
      // record of what the user wrote, and it is not live because activation
      // failed. Saying "saved but not live" beats implying the edit vanished.
      return NextResponse.json(
        {
          error:
            "The new instructions were saved but could not be made active. Your agent is still using its previous instructions.",
        },
        { status: 500 }
      );
    }

    await admin.from("audit_events").insert({
      tenant_id,
      actor_id: user.id,
      action: "agent.prompt_edited",
      resource_type: "agent_config_version",
      resource_id: newVersion.id,
      metadata: {
        version: newVersion.version,
        previous_version_id: currentVersion.id,
        previous_length: previousPrompt.length,
        new_length: systemPrompt.length,
      },
    });

    return NextResponse.json({
      data: { id: newVersion.id, version: newVersion.version },
    });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong while publishing the new instructions." },
      { status: 500 }
    );
  }
}
