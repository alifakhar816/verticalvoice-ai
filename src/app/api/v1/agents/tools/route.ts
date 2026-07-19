import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/database/supabase-server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { getCurrentTenantId } from "@/domain/tenants/current";
import {
  DEFAULT_TOOL_RATE_LIMIT_PER_MINUTE,
  DEFAULT_TOOL_TIMEOUT_SECONDS,
  validateCustomTool,
} from "@/lib/validation/agent-tools";
import "@/industries";
import { getIndustryPack } from "@/industries/core/registry";
import type { IndustryId, ToolParameter } from "@/industries/core/industry-pack";
import type { Json } from "@/lib/database/types";

/**
 * The tenant's effective tool catalog, and the endpoint for authoring new ones.
 *
 * "Effective" means the same merge the call path performs in
 * `buildSelectedTools`: pack tools with the tenant's enabled/description
 * overrides applied, plus their own custom tools. If this list and the list the
 * agent actually receives ever disagree, the dashboard is lying — so both read
 * the same two tables and apply the same defaulting rules.
 */

export interface ToolParameterView {
  name: string;
  type: ToolParameter["type"];
  required: boolean;
  /** What the agent is told this input collects, after any override. */
  description: string;
  /** The pack's original wording, so the UI can offer "reset to default". */
  defaultDescription: string | null;
  descriptionOverride: string | null;
  /**
   * Whether the agent collects this at all. Always true for a required
   * parameter and for every custom-tool parameter — only an OPTIONAL pack
   * parameter can be switched off.
   */
  enabled: boolean;
  /** False when the UI must not offer the on/off switch (required inputs). */
  canDisable: boolean;
}

export interface EffectiveTool {
  /** `modelToolName` — what the agent calls. Unique within the catalog. */
  id: string;
  /** Human label. Pack tools have a curated one; custom tools reuse the id. */
  name: string;
  source: "pack" | "custom";
  enabled: boolean;
  /** What the agent is told the tool does, after any override. */
  description: string;
  /** The pack's original wording, so the UI can offer "reset to default". */
  defaultDescription: string | null;
  descriptionOverride: string | null;
  parameters: ToolParameterView[];
  /** Which caller intents route to this tool. Pack tools only. */
  intentIds: string[];
  returnType: string | null;
  /** Custom tools only — where the request is sent. */
  httpUrl: string | null;
  httpMethod: string | null;
  /** Custom tools only — the row id, needed to edit or delete it. */
  customToolId: string | null;
  /**
   * Runtime limits. Custom tools carry the tenant's stored values; pack tools
   * report what their binding declares (falling back to the same defaults), so
   * the UI can show that a built-in tool is bounded too rather than implying
   * only custom tools have limits.
   */
  timeoutSeconds: number;
  rateLimitPerMinute: number | null;
}

function parseParameters(raw: unknown): ToolParameterView[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== "string" || typeof record.description !== "string") return [];
    const type = record.type;
    const known =
      type === "string" || type === "number" || type === "boolean" || type === "object" || type === "array";
    return [
      {
        name: record.name,
        type: known ? type : ("string" as const),
        required: record.required === true,
        description: record.description,
        // A custom tool's parameters ARE the tenant's own wording already —
        // there is no pack default to diverge from and nothing to override, so
        // they are edited through the tool form rather than per-parameter.
        defaultDescription: null,
        descriptionOverride: null,
        enabled: true,
        canDisable: false,
      },
    ];
  });
}

/** Narrows the JSONB `parameter_overrides` column to a name-keyed map. */
function parseParameterOverrides(
  raw: unknown
): Record<string, { description?: string; enabled?: boolean }> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const parsed: Record<string, { description?: string; enabled?: boolean }> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    parsed[name] = {
      ...(typeof entry.description === "string" ? { description: entry.description } : {}),
      ...(typeof entry.enabled === "boolean" ? { enabled: entry.enabled } : {}),
    };
  }
  return parsed;
}

/** Resolves the caller to a tenant, or explains why not. */
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

export async function GET() {
  try {
    const resolved = await resolveTenant();
    if ("error" in resolved) return resolved.error;
    const { tenantId } = resolved;

    const admin = createAdminClient();

    const { data: tenant } = await admin
      .from("tenants")
      .select("industry")
      .eq("id", tenantId)
      .maybeSingle();

    const pack = tenant?.industry ? getIndustryPack(tenant.industry as IndustryId) : undefined;

    const [{ data: settingRows }, { data: customRows }] = await Promise.all([
      admin
        .from("agent_tool_settings")
        .select("tool_id, enabled, description_override, parameter_overrides")
        .eq("tenant_id", tenantId),
      admin
        .from("custom_tools")
        .select(
          "id, name, description, parameters, http_url, http_method, enabled, timeout_seconds, rate_limit_per_minute"
        )
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: true }),
    ]);

    const overrides = new Map(
      (settingRows ?? []).map((row) => [
        row.tool_id,
        {
          enabled: row.enabled,
          descriptionOverride: row.description_override,
          parameterOverrides: parseParameterOverrides(row.parameter_overrides),
        },
      ])
    );

    const packTools: EffectiveTool[] = (pack?.tools ?? []).map((binding) => {
      const override = overrides.get(binding.id);
      const descriptionOverride = override?.descriptionOverride?.trim() ? override.descriptionOverride : null;
      return {
        id: binding.id,
        name: binding.name,
        source: "pack",
        // No row means enabled — matching buildSelectedTools' defaulting.
        enabled: override?.enabled !== false,
        description: descriptionOverride ?? binding.description,
        defaultDescription: binding.description,
        descriptionOverride,
        parameters: binding.parameters.map((param) => {
          const paramOverride = override?.parameterOverrides?.[param.name];
          const reworded = paramOverride?.description?.trim() ? paramOverride.description : null;
          return {
            name: param.name,
            type: param.type,
            required: param.required,
            description: reworded ?? param.description,
            defaultDescription: param.description,
            descriptionOverride: reworded,
            // A required parameter is always collected — see
            // validateParameterOverrides for why switching one off is refused.
            enabled: param.required || paramOverride?.enabled !== false,
            canDisable: !param.required,
          };
        }),
        intentIds: binding.intentIds,
        returnType: binding.returnType,
        httpUrl: null,
        httpMethod: null,
        customToolId: null,
        timeoutSeconds: binding.timeout
          ? Math.round(binding.timeout / 1000)
          : DEFAULT_TOOL_TIMEOUT_SECONDS,
        // Pack tools have no per-tenant rate setting to show. `rateLimit` on
        // the binding is per-tool-per-window rather than per-minute-per-call,
        // so reporting it here as if it were the same number would be a lie.
        rateLimitPerMinute: null,
      };
    });

    const customTools: EffectiveTool[] = (customRows ?? []).map((row) => ({
      id: row.name,
      name: row.name,
      source: "custom",
      enabled: row.enabled,
      description: row.description,
      defaultDescription: null,
      descriptionOverride: null,
      parameters: parseParameters(row.parameters),
      intentIds: [],
      returnType: null,
      httpUrl: row.http_url,
      httpMethod: row.http_method,
      customToolId: row.id,
      timeoutSeconds: row.timeout_seconds ?? DEFAULT_TOOL_TIMEOUT_SECONDS,
      rateLimitPerMinute: row.rate_limit_per_minute ?? DEFAULT_TOOL_RATE_LIMIT_PER_MINUTE,
    }));

    return NextResponse.json({
      data: {
        tools: [...packTools, ...customTools],
        industry: tenant?.industry ?? null,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Your agent's tools could not be loaded." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const resolved = await resolveTenant();
    if ("error" in resolved) return resolved.error;
    const { user, tenantId } = resolved;

    const admin = createAdminClient();

    const { data: tenant } = await admin
      .from("tenants")
      .select("industry")
      .eq("id", tenantId)
      .maybeSingle();

    const pack = tenant?.industry ? getIndustryPack(tenant.industry as IndustryId) : undefined;
    const reservedIds = (pack?.tools ?? []).map((binding) => binding.id);

    const body = await request.json().catch(() => null);
    const validation = validateCustomTool(body, reservedIds);
    if (!validation.ok) {
      return NextResponse.json({ error: validation.message }, { status: 400 });
    }
    const tool = validation.value;

    const { data: created, error: insertError } = await admin
      .from("custom_tools")
      .insert({
        tenant_id: tenantId,
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters as unknown as Json,
        http_url: tool.http_url,
        http_method: tool.http_method,
        enabled: tool.enabled,
        timeout_seconds: tool.timeout_seconds,
        rate_limit_per_minute: tool.rate_limit_per_minute,
      })
      .select("id, name")
      .single();

    if (insertError || !created) {
      // 23505 is the (tenant_id, name) unique constraint — a real user action
      // (two tools, same name), so it gets a real explanation rather than a 500.
      if (insertError?.code === "23505") {
        return NextResponse.json(
          { error: `You already have a tool called "${tool.name}". Choose a different name.` },
          { status: 409 }
        );
      }
      return NextResponse.json(
        { error: "That tool could not be saved. Nothing was changed." },
        { status: 500 }
      );
    }

    await admin.from("audit_events").insert({
      tenant_id: tenantId,
      actor_id: user.id,
      action: "agent.custom_tool_created",
      resource_type: "custom_tool",
      resource_id: created.id,
      metadata: {
        name: tool.name,
        http_url: tool.http_url,
        http_method: tool.http_method,
        parameter_count: tool.parameters.length,
        enabled: tool.enabled,
        timeout_seconds: tool.timeout_seconds,
        rate_limit_per_minute: tool.rate_limit_per_minute,
      },
    });

    return NextResponse.json({ data: { id: created.id, name: created.name } }, { status: 201 });
  } catch {
    return NextResponse.json(
      { error: "That tool could not be saved. Nothing was changed." },
      { status: 500 }
    );
  }
}
