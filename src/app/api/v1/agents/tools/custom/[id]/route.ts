import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/database/supabase-server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { getCurrentTenantId } from "@/domain/tenants/current";
import { validateCustomToolUpdate } from "@/lib/validation/agent-tools";
import "@/industries";
import { getIndustryPack } from "@/industries/core/registry";
import type { IndustryId } from "@/industries/core/industry-pack";
import type { Json } from "@/lib/database/types";

/**
 * Edit and delete for tenant-authored tools.
 *
 * Every statement filters on BOTH `id` and `tenant_id`. The id alone is a UUID
 * and unguessable in practice, but "unguessable" is not an authorization check:
 * with the tenant filter present, an id belonging to another tenant simply
 * matches zero rows and returns 404, which is the same answer a genuinely
 * missing id gets and therefore leaks nothing about what exists.
 */

async function resolveTenant() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) } as const;
  }

  const tenantId = await getCurrentTenantId(user.id);
  if (!tenantId) {
    return {
      error: NextResponse.json({ error: "No tenant found for this account." }, { status: 403 }),
    } as const;
  }

  return { user, tenantId } as const;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolved = await resolveTenant();
    if ("error" in resolved) return resolved.error;
    const { user, tenantId } = resolved;

    const { id } = await params;
    const admin = createAdminClient();

    const { data: existing } = await admin
      .from("custom_tools")
      .select("id, name, enabled")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "That tool no longer exists." }, { status: 404 });
    }

    const { data: tenant } = await admin
      .from("tenants")
      .select("industry")
      .eq("id", tenantId)
      .maybeSingle();

    const pack = tenant?.industry ? getIndustryPack(tenant.industry as IndustryId) : undefined;
    const reservedIds = (pack?.tools ?? []).map((tool) => tool.id);

    const body = await request.json().catch(() => null);
    const validation = validateCustomToolUpdate(body, reservedIds);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }
    const patch = validation.value;

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "Nothing was changed." }, { status: 400 });
    }

    const { error: updateError } = await admin
      .from("custom_tools")
      .update({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.parameters !== undefined
          ? { parameters: patch.parameters as unknown as Json }
          : {}),
        ...(patch.http_url !== undefined ? { http_url: patch.http_url } : {}),
        ...(patch.http_method !== undefined ? { http_method: patch.http_method } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.timeout_seconds !== undefined
          ? { timeout_seconds: patch.timeout_seconds }
          : {}),
        ...(patch.rate_limit_per_minute !== undefined
          ? { rate_limit_per_minute: patch.rate_limit_per_minute }
          : {}),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (updateError) {
      if (updateError.code === "23505") {
        return NextResponse.json(
          { error: `You already have a tool called "${patch.name}". Choose a different name.` },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "That change could not be saved. Nothing was changed." },
        { status: 500 }
      );
    }

    await admin.from("audit_events").insert({
      tenant_id: tenantId,
      actor_id: user.id,
      action: "agent.custom_tool_updated",
      resource_type: "custom_tool",
      resource_id: id,
      metadata: {
        name: patch.name ?? existing.name,
        previous_name: existing.name,
        changed_fields: Object.keys(patch),
        enabled: patch.enabled ?? existing.enabled,
      },
    });

    return NextResponse.json({ data: { id, name: patch.name ?? existing.name } });
  } catch {
    return NextResponse.json(
      { error: "That change could not be saved. Nothing was changed." },
      { status: 500 }
    );
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const resolved = await resolveTenant();
    if ("error" in resolved) return resolved.error;
    const { user, tenantId } = resolved;

    const { id } = await params;
    const admin = createAdminClient();

    // Read first so the audit row can record WHAT was deleted — after the
    // delete the name is gone, and "custom tool <uuid> removed" is not an
    // answer anyone can use six months later.
    const { data: existing } = await admin
      .from("custom_tools")
      .select("id, name, http_url")
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (!existing) {
      return NextResponse.json({ error: "That tool no longer exists." }, { status: 404 });
    }

    const { error: deleteError } = await admin
      .from("custom_tools")
      .delete()
      .eq("id", id)
      .eq("tenant_id", tenantId);

    if (deleteError) {
      return NextResponse.json(
        { error: "That tool could not be removed. Nothing was changed." },
        { status: 500 }
      );
    }

    await admin.from("audit_events").insert({
      tenant_id: tenantId,
      actor_id: user.id,
      action: "agent.custom_tool_deleted",
      resource_type: "custom_tool",
      resource_id: id,
      metadata: { name: existing.name, http_url: existing.http_url },
    });

    return NextResponse.json({ data: { id, name: existing.name } });
  } catch {
    return NextResponse.json(
      { error: "That tool could not be removed. Nothing was changed." },
      { status: 500 }
    );
  }
}
