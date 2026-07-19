import type { SupabaseClient } from "@supabase/supabase-js";
import type { IndustryPack, ToolBinding, ToolParameter } from "@/industries/core/industry-pack";
import type { Database } from "@/lib/database/types";
import {
  DEFAULT_TOOL_RATE_LIMIT_PER_MINUTE,
  DEFAULT_TOOL_TIMEOUT_SECONDS,
} from "@/lib/validation/agent-tools";
import { signToolToken } from "./tool-token";

interface BuildSelectedToolsOptions {
  callId: string;
  tenantId: string;
  industry: IndustryPack["id"];
  isTest?: boolean;
}

/** A tenant-authored tool, as stored in `custom_tools`. */
export interface CustomToolDefinition {
  /** `custom_tools.id` — the proxy route needs it to re-read the row. */
  id: string;
  name: string;
  description: string;
  parameters: ToolParameter[];
  http_url: string;
  http_method: string;
  /** 1-120. Handed to Ultravox so it bounds the call, not just our server. */
  timeout_seconds: number;
  /** 1-600, per call. Counted at the proxy route. */
  rate_limit_per_minute: number;
}

/**
 * A tenant's override of ONE parameter of a pack tool.
 *
 * Only the two safe fields: `name`, `type` and `required` are deliberately
 * absent because the handlers in src/lib/tools/*.ts read inputs by name and
 * assume the declared shape. See migration 013 and
 * `validateParameterOverrides`.
 */
export interface ParameterOverride {
  description?: string;
  enabled?: boolean;
}

/** Per-tenant overrides applied on top of the industry pack's tool catalog. */
export interface TenantToolSettings {
  /** Keyed by pack `ToolBinding.id`. A missing key means "pack default". */
  packOverrides: Record<
    string,
    {
      enabled: boolean;
      descriptionOverride: string | null;
      /** Keyed by parameter name. A missing key means "pack default". */
      parameterOverrides?: Record<string, ParameterOverride>;
    }
  >;
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

function dynamicParameters(
  parameters: ToolParameter[],
  overrides: Record<string, ParameterOverride> = {}
) {
  return (
    parameters
      // A parameter switched off is dropped from the definition entirely, so
      // the model is never told it exists and never asks the caller for it.
      // Only OPTIONAL parameters can reach this state — the API layer refuses
      // to store `enabled: false` for a required one, because the handler
      // reads those unconditionally and would throw mid-call.
      .filter((param) => param.required || overrides[param.name]?.enabled !== false)
      .map((param) => {
        // An override that is empty/whitespace falls back to the pack wording,
        // matching how description_override behaves one level up: a parameter
        // with no description is one the model fills in badly.
        const reworded = overrides[param.name]?.description?.trim();
        return {
          name: param.name,
          location: "PARAMETER_LOCATION_BODY",
          schema: {
            type: jsonSchemaType(param.type),
            description: reworded || param.description,
          },
          // Never taken from the override. `required` is part of the contract
          // the handler was written against, not a tenant preference.
          required: param.required,
        };
      })
  );
}

/**
 * Ultravox expects a protobuf Duration string ("20s"), not a number.
 *
 * Applied to pack tools as well as custom ones. Pack `ToolBinding`s have
 * declared a `timeout` (in milliseconds) since the packs were written, but
 * nothing ever read it — neither `/api/v1/tools/execute/[toolId]` nor the
 * call-setup path — so a slow built-in tool could hold a call open just as
 * long as a slow custom one. Emitting it here is what makes the declaration
 * mean something, and is why custom tools can honestly be said to have parity.
 */
function durationSeconds(seconds: number): string {
  return `${Math.max(1, Math.round(seconds))}s`;
}

function authorizationHeader(token: string) {
  return {
    name: "Authorization",
    location: "PARAMETER_LOCATION_HEADER",
    value: `Bearer ${token}`,
  };
}

function toUltravoxTool(
  binding: ToolBinding,
  baseUrl: string,
  token: string,
  description: string,
  parameterOverrides: Record<string, ParameterOverride> = {}
) {
  return {
    temporaryTool: {
      modelToolName: binding.id,
      description,
      dynamicParameters: dynamicParameters(binding.parameters, parameterOverrides),
      staticParameters: [authorizationHeader(token)],
      // `binding.timeout` is milliseconds; omitted bindings fall back to the
      // same 20s default a custom tool gets, so no tool is unbounded.
      timeout: durationSeconds(
        binding.timeout ? binding.timeout / 1000 : DEFAULT_TOOL_TIMEOUT_SECONDS
      ),
      http: {
        baseUrlPattern: `${baseUrl}/api/v1/tools/execute/${binding.id}`,
        httpMethod: "POST",
      },
    },
  };
}

/**
 * Converts a tenant-authored tool into the same Ultravox `temporaryTool` shape
 * a pack tool uses, so the model cannot tell the two apart.
 *
 * ROUTING DECISION — Ultravox is pointed at OUR proxy
 * (/api/v1/tools/custom/[id]), not at the tenant's `http_url`. The proxy makes
 * the outbound request itself.
 *
 * Previously Ultravox dialled `http_url` directly. That is why a custom tool
 * could not be rate limited at all: the traffic never crossed our
 * infrastructure, so there was nothing to count. `rate_limit_per_minute` would
 * have been a field the UI displayed and nothing honoured — worse than not
 * offering it. With the proxy in front, a per-call budget is countable, and
 * the tenant's endpoint gets a request only when that budget allows it.
 *
 * AUTH — the call-scoped token is now always attached, because the address it
 * is attached to is always our own. The original hazard is unchanged and still
 * respected: `signToolToken` mints a bearer credential for OUR API carrying
 * `tenant_id`/`call_id`/`industry`, so it must never reach a host the tenant
 * merely typed into a form. The proxy is what decides whether to forward it on
 * the outbound leg, and it forwards it only for a same-origin `http_url`.
 * A third-party endpoint still receives the tool's inputs in the body and no
 * credential of ours. If it needs its own authentication, that belongs in a
 * per-tool-credential field, not in a credential minted for a different system.
 *
 * `timeout` bounds the leg Ultravox owns even when the far end never replies;
 * the proxy applies the same number to its own outbound fetch, so neither leg
 * can outlive the tenant's setting.
 */
function toUltravoxCustomTool(tool: CustomToolDefinition, baseUrl: string, token: string) {
  return {
    temporaryTool: {
      modelToolName: tool.name,
      description: tool.description,
      dynamicParameters: dynamicParameters(tool.parameters),
      staticParameters: [authorizationHeader(token)],
      timeout: durationSeconds(tool.timeout_seconds),
      http: {
        baseUrlPattern: `${baseUrl}/api/v1/tools/custom/${tool.id}`,
        // Always POST to the proxy regardless of the tool's own method: the
        // proxy re-reads `http_method` from the row and applies it on the
        // outbound leg. Ultravox can only send dynamic parameters as a body,
        // so a GET here would drop every input the model collected.
        httpMethod: "POST",
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
 * Narrows the JSONB `parameter_overrides` column back to a name-keyed map.
 *
 * Unknown keys within an entry are dropped rather than carried through: this
 * column feeds the tool definition handed to the model, and the only two
 * fields that may influence it are `description` and `enabled`. If a future
 * writer ever stored `required` here — the exact change this design refuses —
 * it would be ignored at read time too, not just rejected at write time.
 */
function parseParameterOverrides(raw: unknown): Record<string, ParameterOverride> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};

  const parsed: Record<string, ParameterOverride> = {};
  for (const [name, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const entry = value as Record<string, unknown>;
    const override: ParameterOverride = {};
    if (typeof entry.description === "string") override.description = entry.description;
    if (typeof entry.enabled === "boolean") override.enabled = entry.enabled;
    if (override.description !== undefined || override.enabled !== undefined) {
      parsed[name] = override;
    }
  }
  return parsed;
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
      .select("tool_id, enabled, description_override, parameter_overrides")
      .eq("tenant_id", tenantId),
    supabase
      .from("custom_tools")
      .select(
        "id, name, description, parameters, http_url, http_method, timeout_seconds, rate_limit_per_minute"
      )
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
      parameterOverrides: parseParameterOverrides(row.parameter_overrides),
    };
  }

  const customTools: CustomToolDefinition[] = (customResult.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    parameters: parseParameters(row.parameters),
    http_url: row.http_url,
    http_method: row.http_method,
    // A row written before migration 013 cannot exist (the columns are NOT
    // NULL with defaults), but a null still degrades to the safe default
    // rather than to `undefined` reaching `durationSeconds`.
    timeout_seconds: row.timeout_seconds ?? DEFAULT_TOOL_TIMEOUT_SECONDS,
    rate_limit_per_minute: row.rate_limit_per_minute ?? DEFAULT_TOOL_RATE_LIMIT_PER_MINUTE,
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
      const settingsForTool = settings.packOverrides[binding.id];
      const override = settingsForTool?.descriptionOverride;
      // An override that is empty/whitespace falls back to the pack wording —
      // a tool with no description is one the model cannot use correctly.
      const description = override?.trim() ? override.trim() : binding.description;
      return toUltravoxTool(
        binding,
        baseUrl,
        token,
        description,
        settingsForTool?.parameterOverrides ?? {}
      );
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
