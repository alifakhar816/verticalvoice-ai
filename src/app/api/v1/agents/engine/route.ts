import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/database/supabase-server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { getCurrentTenantId } from "@/domain/tenants/current";
import { validateAgentEngine } from "@/lib/validation/agent-engine";
import type { Json } from "@/lib/database/types";

/**
 * Publishes engine settings (creativity, speaking speed, language, model) for
 * the caller's tenant.
 *
 * These live in `agent_config_versions.snapshot` — `temperature` and `model` at
 * the top level, `speed` and `language` under `voice` — and are read on both
 * call paths (`webhooks/twilio/voice` and `calls/outbound`) and forwarded to
 * Ultravox as `temperature`, `model`, `languageHint` and `voiceOverrides`.
 *
 * Mirrors `src/app/api/v1/agents/prompt/route.ts` exactly: clone the active
 * snapshot, change only the given fields, INSERT a new version row, then
 * repoint the active config. The existing row is never mutated, so the previous
 * settings stay on record and a rollback is just repointing
 * `active_agent_configs` at the old version id.
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
    const validation = validateAgentEngine(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }
    const { settings } = validation;

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
            "This agent has not been set up yet, so there are no settings to change.",
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

    const currentVoice =
      currentSnapshot.voice &&
      typeof currentSnapshot.voice === "object" &&
      !Array.isArray(currentSnapshot.voice)
        ? (currentSnapshot.voice as Record<string, unknown>)
        : {};

    // Only the fields actually supplied are changed. Everything else — the
    // system prompt, the chosen voice, the tools — is carried forward
    // untouched, because this edit must not silently change them.
    const nextSnapshot: Record<string, unknown> = { ...currentSnapshot };
    if (settings.temperature !== undefined) {
      nextSnapshot.temperature = settings.temperature;
    }
    if (settings.model !== undefined) {
      nextSnapshot.model = settings.model;
    }
    if (settings.speed !== undefined || settings.language !== undefined) {
      nextSnapshot.voice = {
        ...currentVoice,
        ...(settings.speed !== undefined ? { speed: settings.speed } : {}),
        ...(settings.language !== undefined
          ? { language: settings.language }
          : {}),
      };
    }

    const unchanged =
      (settings.temperature === undefined ||
        currentSnapshot.temperature === settings.temperature) &&
      (settings.model === undefined ||
        currentSnapshot.model === settings.model) &&
      (settings.speed === undefined || currentVoice.speed === settings.speed) &&
      (settings.language === undefined ||
        currentVoice.language === settings.language);

    if (unchanged) {
      return NextResponse.json(
        { error: "These settings are unchanged, so nothing was published." },
        { status: 400 }
      );
    }

    // Version numbers are per tenant, so the next one is max(version) + 1 across
    // the tenant's history — not just the currently active version's number,
    // which can lag behind if an older version was reactivated for a rollback.
    // Migration 010 added UNIQUE(tenant_id, version), so this must be exact.
    const { data: latestVersion } = await admin
      .from("agent_config_versions")
      .select("version")
      .eq("tenant_id", tenant_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latestVersion?.version ?? 0) + 1;
    const publishedAt = new Date().toISOString();

    const { data: newVersion, error: insertError } = await admin
      .from("agent_config_versions")
      .insert({
        tenant_id,
        draft_id: currentVersion.draft_id,
        version: nextVersion,
        snapshot: nextSnapshot as Json,
        published_by: internalUser?.id ?? null,
        published_at: publishedAt,
      })
      .select("id, version")
      .single();

    if (insertError || !newVersion) {
      return NextResponse.json(
        { error: "The new settings could not be saved. Nothing was changed." },
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
      // record of what the user chose, and it is not live because activation
      // failed. Saying "saved but not live" beats implying the edit vanished.
      return NextResponse.json(
        {
          error:
            "The new settings were saved but could not be made active. Your agent is still using its previous settings.",
        },
        { status: 500 }
      );
    }

    const nextVoice = nextSnapshot.voice as Record<string, unknown> | undefined;

    await admin.from("audit_events").insert({
      tenant_id,
      actor_id: user.id,
      action: "agent.engine_updated",
      resource_type: "agent_config_version",
      resource_id: newVersion.id,
      metadata: {
        version: newVersion.version,
        previous_version_id: currentVersion.id,
        changed: Object.keys(settings).filter(
          (k) => settings[k as keyof typeof settings] !== undefined
        ),
        temperature: (nextSnapshot.temperature as Json) ?? null,
        model: (nextSnapshot.model as Json) ?? null,
        speed: (nextVoice?.speed as Json) ?? null,
        language: (nextVoice?.language as Json) ?? null,
      },
    });

    return NextResponse.json({
      data: { id: newVersion.id, version: newVersion.version },
    });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong while saving the new settings." },
      { status: 500 }
    );
  }
}
