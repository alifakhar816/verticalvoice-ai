import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/database/supabase-server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { getCurrentTenantId } from "@/domain/tenants/current";
import { findVoice, getVoiceCatalog } from "@/lib/voices/catalog";

/**
 * Switches the caller's tenant to a different Ultravox voice.
 *
 * Deliberately mirrors `src/app/api/v1/agents/prompt/route.ts`, because both
 * edit the same live object: the voice a caller hears comes from
 * `agent_config_versions.snapshot.voice`, pointed at by
 * `active_agent_configs.agent_config_version_id`. Clone the active snapshot,
 * change only the voice keys, INSERT a new version row, then repoint the
 * active config. The existing row is never mutated, so the previous voice
 * stays on record and a rollback is just repointing at the old version id.
 *
 * Everything outside `snapshot.voice` — the system prompt above all — is
 * carried forward untouched, so changing a voice can never quietly rewrite
 * what the agent says.
 */

/**
 * `voice_profiles.provider` stores lowercase slugs ("elevenlabs"), but the
 * Ultravox catalog reports display names ("Eleven Labs"). Normalise so the
 * snapshot keeps using the vocabulary the rest of the schema already uses.
 */
function normaliseProvider(provider: string | null | undefined): string | null {
  if (!provider) return null;
  return provider.toLowerCase().replace(/[^a-z0-9]/g, "");
}

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
    const requestedVoiceId =
      body &&
      typeof body === "object" &&
      typeof (body as { voice_id?: unknown }).voice_id === "string"
        ? (body as { voice_id: string }).voice_id.trim()
        : "";

    if (!requestedVoiceId) {
      return NextResponse.json(
        { error: "Choose a voice before saving." },
        { status: 400 }
      );
    }

    // Returns null unless the user has an internal `users` row AND a
    // `tenant_members` membership, so this doubles as the membership check.
    const tenant_id = await getCurrentTenantId(user.id);
    if (!tenant_id) {
      return NextResponse.json(
        { error: "No tenant found for this account." },
        { status: 403 }
      );
    }

    // Validate against the real catalog BEFORE writing anything. An id
    // Ultravox does not recognise would save cleanly here and then fail every
    // single future call with "Voice X does not exist" — a silent outage that
    // only surfaces when a customer phones in.
    let chosenVoice;
    try {
      const catalog = await getVoiceCatalog();
      chosenVoice = findVoice(catalog, requestedVoiceId);
    } catch {
      return NextResponse.json(
        {
          error:
            "The list of voices could not be checked right now, so the voice was not changed. Please try again.",
        },
        { status: 502 }
      );
    }

    if (!chosenVoice) {
      return NextResponse.json(
        { error: "That voice is no longer available. Pick another one." },
        { status: 400 }
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
            "This agent has not been set up yet, so there is no voice to change.",
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

    const previousVoiceId =
      typeof currentVoice.voice_id === "string" ? currentVoice.voice_id : null;

    if (previousVoiceId === requestedVoiceId) {
      return NextResponse.json(
        { error: "Your agent already uses this voice." },
        { status: 400 }
      );
    }

    // Version numbers are per tenant, so the next one is max(version) + 1
    // across the tenant's history — not just the currently active version's
    // number, which can lag behind if an older version was reactivated for a
    // rollback. Migration 010's UNIQUE(tenant_id, version) is the backstop.
    const { data: latestVersion } = await admin
      .from("agent_config_versions")
      .select("version")
      .eq("tenant_id", tenant_id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersion = (latestVersion?.version ?? 0) + 1;
    const publishedAt = new Date().toISOString();

    // `speed` is a separate tenant choice and is carried forward. Language and
    // provider follow the chosen voice, because a snapshot claiming a language
    // the voice does not speak describes a voice we are not actually using.
    // `currentVoice` values are `unknown` (it came out of a jsonb column), so
    // each carried-forward field is narrowed to a string before it can be
    // written back into another jsonb column.
    const previousProvider =
      typeof currentVoice.provider === "string" ? currentVoice.provider : null;
    const previousLanguage =
      typeof currentVoice.language === "string" ? currentVoice.language : null;

    const nextVoice = {
      ...currentVoice,
      voice_id: chosenVoice.voiceId,
      provider: normaliseProvider(chosenVoice.provider) ?? previousProvider,
      language: chosenVoice.primaryLanguage ?? previousLanguage,
    };

    const { data: newVersion, error: insertError } = await admin
      .from("agent_config_versions")
      .insert({
        tenant_id,
        draft_id: currentVersion.draft_id,
        version: nextVersion,
        snapshot: { ...currentSnapshot, voice: nextVoice },
        published_by: internalUser?.id ?? null,
        published_at: publishedAt,
      })
      .select("id, version")
      .single();

    if (insertError || !newVersion) {
      return NextResponse.json(
        { error: "The new voice could not be saved. Nothing was changed." },
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
      // record of the choice, and it is not live because activation failed.
      // Saying "saved but not live" beats implying the change vanished.
      return NextResponse.json(
        {
          error:
            "The new voice was saved but could not be made active. Your agent is still using its previous voice.",
        },
        { status: 500 }
      );
    }

    await admin.from("audit_events").insert({
      tenant_id,
      actor_id: user.id,
      action: "agent.voice_changed",
      resource_type: "agent_config_version",
      resource_id: newVersion.id,
      metadata: {
        version: newVersion.version,
        previous_version_id: currentVersion.id,
        previous_voice_id: previousVoiceId,
        new_voice_id: chosenVoice.voiceId,
        new_voice_name: chosenVoice.name,
        new_voice_language: chosenVoice.primaryLanguage ?? null,
      },
    });

    return NextResponse.json({
      data: {
        id: newVersion.id,
        version: newVersion.version,
        voice_id: chosenVoice.voiceId,
        name: chosenVoice.name,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Something went wrong while changing the voice." },
      { status: 500 }
    );
  }
}
