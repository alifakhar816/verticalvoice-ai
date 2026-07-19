import type { SupabaseClient } from "@supabase/supabase-js";
import type { IndustryPack, ToolBinding, ToolParameter } from "@/industries/core/industry-pack";
import type { Database } from "@/lib/database/types";
import { signToolToken } from "./tool-token";

interface BuildSelectedToolsOptions {
  callId: string;
  tenantId: string;
  industry: IndustryPack["id"];
  isTest?: boolean;
}

/** A tenant-authored tool, as stored in `custom_tools`. */
export interface CustomToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  http_url: string;
  http_method: string;
}

/** Per-tenant overrides applied on top of the industry pack's tool catalog. */
export interface TenantToolSettings {
  /** Keyed by pack `ToolBinding.id`. A missing key means "pack default". */
  packOverrides: Record<string, { enabled: boolean; descriptionOverride: string | null }>;
  customTools: CustomToolDefinition[];
}

/** What a tenant with no rows in either table gets: today's behaviour exactly. */
export const EMPTY_TOOL_SETTINGS: TenantToolSettings = {
  packOverrides: {},
  customTools: [],
};

function jsonSchemaType(type: ToolParameter["type"]): string {
  switch (type) {
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "object":
      return "object";
    case "array":
      return "array";
    default:
      return "string";
  }
}

function dynamicParameters(parameters: ToolParameter[]) {
  return parameters.map((param) => ({
    name: param.name,
    location: "PARAMETER_LOCATION_BODY",
    schema: { type: jsonSchemaType(param.type), description: param.description },
    required: param.required,
  }));
}

function authorizationHeader(token: string) {
  return {
    name: "Authorization",
    location: "PARAMETER_LOCATION_HEADER",
    value: `Bearer ${token}`,
  };
}

function toUltravoxTool(binding: ToolBinding, baseUrl: string, token: string, description: string) {
  return {
    temporaryTool: {
      modelToolName: binding.id,
      description,
      dynamicParameters: dynamicParameters(binding.parameters),
      staticParameters: [authorizationHeader(token)],
      http: {
        baseUrlPattern: `${baseUrl}/api/v1/tools/execute/${binding.id}`,
        httpMethod: "POST",
      },
    },
  };
}

/**
 * True only when `url` is on the same origin as our own app.
 *
 * Compared by parsed origin rather than `startsWith`, because
 * `https://evil.com/?x=https://our-app.example` and
 * `https://our-app.example.attacker.com` both pass a naive prefix check while
 * pointing somewhere else entirely.
 */
function isSameOrigin(url: string, baseUrl: string): boolean {
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

/**
 * Converts a tenant-authored tool into the same Ultravox `temporaryTool` shape
 * a pack tool uses, so the model cannot tell the two apart.
 *
 * AUTH DECISION — the call-scoped token is attached ONLY when `http_url` is on
 * our own origin.
 *
 * The token minted by `signToolToken` is a bearer credential for OUR API: it
 * carries `tenant_id`, `call_id` and `industry`, and `/api/v1/tools/execute/*`
 * accepts it as full proof of identity. Ultravox puts static parameters
 * verbatim into the outbound request, so attaching it to a third-party URL
 * would hand a working credential for this tenant's data to whatever host the
 * tenant typed in — and a tenant can type in any host, including one they do
 * not control or one that logs request headers. That is a tenant-to-tenant
 * escalation waiting to happen, and it would be silent.
 *
 * So: a same-origin custom tool (someone routing back through our own API) is
 * indistinguishable from a pack tool and gets the token. Everything else gets
 * NO `staticParameters` at all — the request still carries the tool's inputs in
 * the body, which is what a third-party endpoint actually needs. If such an
 * endpoint requires its own authentication, that belongs in a future
 * per-tool-credential field, not in a credential minted for a different system.
 */
function toUltravoxCustomTool(tool: CustomToolDefinition, baseUrl: string, token: string) {
  const sameOrigin = isSameOrigin(tool.http_url, baseUrl);

  return {
    temporaryTool: {
      modelToolName: tool.name,
      description: tool.description,
      dynamicParameters: dynamicParameters(tool.parameters),
      ...(sameOrigin ? { staticParameters: [authorizationHeader(token)] } : {}),
      http: {
        baseUrlPattern: tool.http_url,
        httpMethod: tool.http_method,
      },
    },
  };
}

/** Narrows the JSONB `parameters` column back to `ToolParameter[]`. */
function parseParameters(raw: unknown): ToolParameter[] {
  if (!Array.isArray(raw)) return [];

  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== "string" || typeof record.description !== "string") return [];

    const type = record.type;
    const isKnownType =
      type === "string" ||
      type === "number" ||
      type === "boolean" ||
      type === "object" ||
      type === "array";

    return [
      {
        name: record.name,
        // An unrecognised type degrades to "string" rather than dropping the
        // input, so a stored row written by an older shape still works.
        type: isKnownType ? type : ("string" as const),
        required: record.required === true,
        description: record.description,
      },
    ];
  });
}

/**
 * Loads a tenant's tool overrides and custom tools.
 *
 * Both queries are scoped by `tenant_id`. Disabled custom tools are filtered in
 * the query rather than in JS so a disabled tool never enters the process.
 * A failure to read either table degrades to pack defaults rather than throwing:
 * losing a customisation is bad, but dropping the agent's whole tool catalog
 * mid-call — so it can neither book nor look anything up — is worse.
 */
export async function loadTenantToolSettings(
  supabase: SupabaseClient<Database>,
  tenantId: string
): Promise<TenantToolSettings> {
  const [settingsResult, customResult] = await Promise.all([
    supabase
      .from("agent_tool_settings")
      .select("tool_id, enabled, description_override")
      .eq("tenant_id", tenantId),
    supabase
      .from("custom_tools")
      .select("name, description, parameters, http_url, http_method")
      .eq("tenant_id", tenantId)
      .eq("enabled", true),
  ]);

  if (settingsResult.error) {
    console.warn(
      "[ultravox-tools] could not read tool settings — using pack defaults for this call",
      settingsResult.error.message
    );
  }
  if (customResult.error) {
    console.warn(
      "[ultravox-tools] could not read custom tools — omitting them from this call",
      customResult.error.message
    );
  }

  const packOverrides: TenantToolSettings["packOverrides"] = {};
  for (const row of settingsResult.data ?? []) {
    packOverrides[row.tool_id] = {
      enabled: row.enabled,
      descriptionOverride: row.description_override,
    };
  }

  const customTools: CustomToolDefinition[] = (customResult.data ?? []).map((row) => ({
    name: row.name,
    description: row.description,
    parameters: parseParameters(row.parameters),
    http_url: row.http_url,
    http_method: row.http_method,
  }));

  return { packOverrides, customTools };
}

/**
 * Builds Ultravox's `selectedTools` payload from an industry pack's tool
 * catalog, so the AI can actually invoke our backend mid-call instead of
 * just talking about it. Each tool gets a signed token (scoped to this one
 * call) baked in as a static header — Ultravox has no concept of "the call
 * that's running", so the call/tenant identity has to travel with the tool
 * definition itself.
 *
 * `settings` layers the tenant's own choices on top of the pack: tools they
 * turned off are omitted, descriptions they reworded are substituted, and tools
 * they authored themselves are appended. Omitting `settings` yields the pack
 * catalog unchanged, which is what the pre-tool-platform behaviour was.
 */
export function buildSelectedTools(
  pack: IndustryPack,
  opts: BuildSelectedToolsOptions,
  settings: TenantToolSettings = EMPTY_TOOL_SETTINGS
) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!baseUrl) {
    console.warn("[ultravox-tools] NEXT_PUBLIC_APP_URL not set — skipping tool wiring for this call");
    return [];
  }

  const token = signToolToken({
    call_id: opts.callId,
    tenant_id: opts.tenantId,
    industry: opts.industry,
    is_test: opts.isTest ?? false,
  });

  const packTools = pack.tools
    // Absence of an override row means enabled: a tenant who has never touched
    // this screen must keep every tool their pack gives them.
    .filter((binding) => settings.packOverrides[binding.id]?.enabled !== false)
    .map((binding) => {
      const override = settings.packOverrides[binding.id]?.descriptionOverride;
      // An override that is empty/whitespace falls back to the pack wording —
      // a tool with no description is one the model cannot use correctly.
      const description = override?.trim() ? override.trim() : binding.description;
      return toUltravoxTool(binding, baseUrl, token, description);
    });

  const customTools = settings.customTools.map((tool) =>
    toUltravoxCustomTool(tool, baseUrl, token)
  );

  return [
    ...packTools,
    ...customTools,
    // Ultravox's built-in hang-up tool. Without this the agent has no way to
    // end a call no matter what the prompt says, so the caller was always the
    // one forced to hang up. Appended unconditionally: it is not a pack tool,
    // so no tenant setting can remove it.
    { toolName: "hangUp" },
  ];
}
