import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/database/supabase-server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { getCurrentTenantId } from "@/domain/tenants/current";
import { validateToolSettingsPatch } from "@/lib/validation/agent-tools";
import "@/industries";
import { getIndustryPack } from "@/industries/core/registry";
import type { IndustryId } from "@/industries/core/industry-pack";

/**
 * Per-tenant settings for ONE industry-pack tool.
 *
 * Upsert rather than update: the absence of a row is the default state
 * ("enabled, pack wording"), so the first time a tenant touches a tool there is
 * nothing to update yet. `(tenant_id, tool_id)` is the conflict target, which
 * is also what makes a double-click idempotent instead of a duplicate-key 500.
 *
 * Custom tools are NOT editable here — they are rows, not overrides, and live
 * at /api/v1/agents/tools/custom/[id].
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ toolId: string }> }
) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const tenantId = await getCurrentTenantId(user.id);
    if (!tenantId) {
      return NextResponse.json({ error: "No tenant found for this account." }, { status: 403 });
    }

    const { toolId } = await params;

    const body = await request.json().catch(() => null);
    const validation = validateToolSettingsPatch(body);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }
    const patch = validation.value;

    const admin = createAdminClient();

    // The tool must exist in this tenant's own pack. Without this check a
    // request could seed settings rows for another industry's tools, which
    // would be invisible in the UI and silently wrong if the tenant ever
    // switched industry.
    const { data: tenant } = await admin
      .from("tenants")
      .select("industry")
      .eq("id", tenantId)
      .maybeSingle();

    const pack = tenant?.industry ? getIndustryPack(tenant.industry as IndustryId) : undefined;
    const binding = pack?.tools.find((tool) => tool.id === toolId);
    if (!binding) {
      return NextResponse.json(
        { error: "That tool is not part of your agent's toolkit." },
        { status: 404 }
      );
    }

    // Read the current row so an omitted field keeps its stored value rather
    // than being reset to the column default by the upsert.
    const { data: existing } = await admin
      .from("agent_tool_settings")
      .select("id, enabled, description_override")
      .eq("tenant_id", tenantId)
      .eq("tool_id", toolId)
      .maybeSingle();

    const nextEnabled = patch.enabled ?? existing?.enabled ?? true;
    const nextOverride =
      patch.description_override === undefined
        ? (existing?.description_override ?? null)
        // An empty string is "go back to the built-in wording", stored as NULL
        // so the pack stays the single source of that text.
        : patch.description_override?.trim()
          ? patch.description_override.trim()
          : null;

    const { error: upsertError } = await admin
      .from("agent_tool_settings")
      .upsert(
        {
          tenant_id: tenantId,
          tool_id: toolId,
          enabled: nextEnabled,
          description_override: nextOverride,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "tenant_id,tool_id" }
      );

    if (upsertError) {
      return NextResponse.json(
        { error: "That change could not be saved. Nothing was changed." },
        { status: 500 }
      );
    }

    await admin.from("audit_events").insert({
      tenant_id: tenantId,
      actor_id: user.id,
      action: "agent.tool_setting_updated",
      resource_type: "agent_tool_setting",
      resource_id: toolId,
      metadata: {
        tool_id: toolId,
        enabled: nextEnabled,
        previous_enabled: existing?.enabled ?? true,
        description_overridden: nextOverride !== null,
      },
    });

    return NextResponse.json({
      data: {
        id: toolId,
        enabled: nextEnabled,
        description: nextOverride ?? binding.description,
        descriptionOverride: nextOverride,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "That change could not be saved. Nothing was changed." },
      { status: 500 }
    );
  }
}
