import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  buildSelectedTools,
  type TenantToolSettings,
} from "@/lib/telephony/ultravox-tools";
import {
  validateCustomTool,
  validateCustomToolUpdate,
  validateToolSettingsPatch,
} from "@/lib/validation/agent-tools";
import type { IndustryPack } from "@/industries/core/industry-pack";

const APP_URL = "https://app.example.com";

/**
 * Minimal stand-in for a real industry pack. `buildSelectedTools` only reads
 * `id` and `tools`, so a full pack would add noise without adding coverage.
 */
const pack = {
  id: "restaurant",
  tools: [
    {
      id: "check_table_availability",
      name: "Check Table Availability",
      description: "Check available tables for a given date, time, and party size.",
      intentIds: ["create_reservation"],
      parameters: [
        { name: "date", type: "string", required: true, description: "Date to check." },
        { name: "party_size", type: "number", required: true, description: "Number of guests." },
      ],
      returnType: "{ available: boolean }",
      requiresAuth: true,
    },
    {
      id: "create_reservation",
      name: "Create Reservation",
      description: "Create a new reservation.",
      intentIds: ["create_reservation"],
      parameters: [
        { name: "guest_name", type: "string", required: true, description: "Guest name." },
      ],
      returnType: "{ reservation_id: string }",
      requiresAuth: true,
    },
  ],
} as unknown as IndustryPack;

const opts = {
  callId: "11111111-1111-1111-1111-111111111111",
  tenantId: "22222222-2222-2222-2222-222222222222",
  industry: "restaurant" as IndustryPack["id"],
};

const noSettings: TenantToolSettings = { packOverrides: {}, customTools: [] };

interface TemporaryToolEntry {
  temporaryTool?: {
    modelToolName: string;
    description: string;
    dynamicParameters: { name: string; required: boolean; schema: { type: string } }[];
    staticParameters?: { name: string; value: string }[];
    http: { baseUrlPattern: string; httpMethod: string };
  };
  toolName?: string;
}

function build(settings: TenantToolSettings = noSettings): TemporaryToolEntry[] {
  return buildSelectedTools(pack, opts, settings) as TemporaryToolEntry[];
}

function names(entries: TemporaryToolEntry[]): string[] {
  return entries.flatMap((entry) =>
    entry.temporaryTool ? [entry.temporaryTool.modelToolName] : []
  );
}

describe("buildSelectedTools", () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const previousSecret = process.env.TOOL_TOKEN_SECRET;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;
    process.env.TOOL_TOKEN_SECRET ??= "test-secret-for-unit-tests";
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    if (previousSecret === undefined) delete process.env.TOOL_TOKEN_SECRET;
    else process.env.TOOL_TOKEN_SECRET = previousSecret;
  });

  it("includes every pack tool when the tenant has no settings", () => {
    expect(names(build())).toEqual(["check_table_availability", "create_reservation"]);
  });

  it("always appends the built-in hangUp tool", () => {
    // Without this the agent physically cannot end a call, so it must survive
    // every combination of tenant settings.
    for (const settings of [
      noSettings,
      { packOverrides: { check_table_availability: { enabled: false, descriptionOverride: null } }, customTools: [] },
      {
        packOverrides: {
          check_table_availability: { enabled: false, descriptionOverride: null },
          create_reservation: { enabled: false, descriptionOverride: null },
        },
        customTools: [],
      },
    ] satisfies TenantToolSettings[]) {
      const entries = build(settings);
      expect(entries.at(-1)).toEqual({ toolName: "hangUp" });
    }
  });

  it("omits a pack tool the tenant disabled", () => {
    const entries = build({
      packOverrides: { create_reservation: { enabled: false, descriptionOverride: null } },
      customTools: [],
    });

    expect(names(entries)).toEqual(["check_table_availability"]);
    expect(names(entries)).not.toContain("create_reservation");
  });

  it("keeps a pack tool whose override row says enabled", () => {
    const entries = build({
      packOverrides: { create_reservation: { enabled: true, descriptionOverride: null } },
      customTools: [],
    });
    expect(names(entries)).toContain("create_reservation");
  });

  it("substitutes description_override when present", () => {
    const entries = build({
      packOverrides: {
        create_reservation: {
          enabled: true,
          descriptionOverride: "Only book tables for parties of six or more.",
        },
      },
      customTools: [],
    });

    const tool = entries.find((e) => e.temporaryTool?.modelToolName === "create_reservation");
    expect(tool?.temporaryTool?.description).toBe(
      "Only book tables for parties of six or more."
    );
  });

  it("falls back to the pack description when the override is blank", () => {
    const entries = build({
      packOverrides: {
        create_reservation: { enabled: true, descriptionOverride: "   " },
      },
      customTools: [],
    });

    const tool = entries.find((e) => e.temporaryTool?.modelToolName === "create_reservation");
    expect(tool?.temporaryTool?.description).toBe("Create a new reservation.");
  });

  it("appends an enabled custom tool in the Ultravox temporaryTool shape", () => {
    const entries = build({
      packOverrides: {},
      customTools: [
        {
          name: "check_order_status",
          description: "Look up an order by its reference.",
          parameters: [
            {
              name: "order_id",
              type: "string",
              required: true,
              description: "The order reference.",
            },
          ],
          http_url: "https://api.partner.example.com/orders",
          http_method: "POST",
        },
      ],
    });

    const custom = entries.find((e) => e.temporaryTool?.modelToolName === "check_order_status");
    expect(custom).toBeDefined();
    expect(custom?.temporaryTool?.description).toBe("Look up an order by its reference.");
    expect(custom?.temporaryTool?.http).toEqual({
      baseUrlPattern: "https://api.partner.example.com/orders",
      httpMethod: "POST",
    });
    expect(custom?.temporaryTool?.dynamicParameters).toEqual([
      {
        name: "order_id",
        location: "PARAMETER_LOCATION_BODY",
        schema: { type: "string", description: "The order reference." },
        required: true,
      },
    ]);
  });

  it("does NOT send our internal tool token to a third-party endpoint", () => {
    // The token authenticates requests to /api/v1/tools/execute as this tenant.
    // Handing it to an arbitrary host the tenant typed in would be a credential
    // leak, so a non-same-origin custom tool carries no staticParameters at all.
    const entries = build({
      packOverrides: {},
      customTools: [
        {
          name: "third_party_lookup",
          description: "Calls someone else's API.",
          parameters: [],
          http_url: "https://evil.example.net/collect",
          http_method: "POST",
        },
      ],
    });

    const custom = entries.find((e) => e.temporaryTool?.modelToolName === "third_party_lookup");
    expect(custom?.temporaryTool?.staticParameters).toBeUndefined();

    const serialized = JSON.stringify(custom);
    expect(serialized).not.toContain("Authorization");
    expect(serialized).not.toContain("Bearer");
  });

  it("does send the token to a same-origin custom tool", () => {
    const entries = build({
      packOverrides: {},
      customTools: [
        {
          name: "internal_lookup",
          description: "Routes back through our own API.",
          parameters: [],
          http_url: `${APP_URL}/api/v1/tools/execute/internal_lookup`,
          http_method: "POST",
        },
      ],
    });

    const custom = entries.find((e) => e.temporaryTool?.modelToolName === "internal_lookup");
    expect(custom?.temporaryTool?.staticParameters?.[0]?.name).toBe("Authorization");
    expect(custom?.temporaryTool?.staticParameters?.[0]?.value).toMatch(/^Bearer .+/);
  });

  it("treats a lookalike host as third-party, not same-origin", () => {
    // `startsWith` on the base URL would wrongly accept this.
    const entries = build({
      packOverrides: {},
      customTools: [
        {
          name: "lookalike",
          description: "Host that merely starts with our app URL.",
          parameters: [],
          http_url: "https://app.example.com.attacker.net/collect",
          http_method: "POST",
        },
      ],
    });

    const custom = entries.find((e) => e.temporaryTool?.modelToolName === "lookalike");
    expect(custom?.temporaryTool?.staticParameters).toBeUndefined();
  });

  it("still attaches the token to pack tools, which are always same-origin", () => {
    const entries = build();
    const packTool = entries.find(
      (e) => e.temporaryTool?.modelToolName === "create_reservation"
    );
    expect(packTool?.temporaryTool?.staticParameters?.[0]?.name).toBe("Authorization");
    expect(packTool?.temporaryTool?.http.baseUrlPattern).toBe(
      `${APP_URL}/api/v1/tools/execute/create_reservation`
    );
  });
});

describe("validateCustomTool", () => {
  const valid = {
    name: "check_order_status",
    description: "Look up the status of a customer order using their reference number.",
    parameters: [
      { name: "order_id", type: "string", required: true, description: "The order reference." },
    ],
    http_url: "https://api.example.com/orders",
    http_method: "POST",
  };

  it("accepts a well-formed tool", () => {
    const result = validateCustomTool(valid);
    expect(result.ok).toBe(true);
  });

  it("rejects a name with a space", () => {
    const result = validateCustomTool({ ...valid, name: "check order" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/letters, numbers and underscores/);
  });

  it("rejects a name with a dash", () => {
    expect(validateCustomTool({ ...valid, name: "check-order" }).ok).toBe(false);
  });

  it("rejects a name starting with a digit", () => {
    expect(validateCustomTool({ ...valid, name: "1tool" }).ok).toBe(false);
  });

  it("rejects a trivially short description", () => {
    const result = validateCustomTool({ ...valid, description: "lookup" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/at least/);
  });

  it("rejects a non-https endpoint", () => {
    const result = validateCustomTool({ ...valid, http_url: "http://api.example.com/orders" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/https/);
  });

  it("rejects a relative endpoint", () => {
    expect(validateCustomTool({ ...valid, http_url: "/api/orders" }).ok).toBe(false);
  });

  it("rejects an endpoint only reachable on a private network", () => {
    const result = validateCustomTool({ ...valid, http_url: "https://192.168.1.10/orders" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/publicly reachable/);
  });

  it("rejects a name that collides with a pack tool id", () => {
    const result = validateCustomTool(
      { ...valid, name: "create_reservation" },
      ["check_table_availability", "create_reservation"]
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/already has a built-in tool/);
  });

  it("rejects a collision regardless of casing", () => {
    const result = validateCustomTool({ ...valid, name: "Create_Reservation" }, [
      "create_reservation",
    ]);
    expect(result.ok).toBe(false);
  });

  it("rejects duplicate parameter names", () => {
    const result = validateCustomTool({
      ...valid,
      parameters: [
        { name: "order_id", type: "string", required: true, description: "First." },
        { name: "order_id", type: "string", required: false, description: "Second." },
      ],
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/twice/);
  });

  it("rejects a parameter with an unknown type", () => {
    expect(
      validateCustomTool({
        ...valid,
        parameters: [
          { name: "order_id", type: "date", required: true, description: "The reference." },
        ],
      }).ok
    ).toBe(false);
  });

  it("defaults method and enabled when omitted", () => {
    const result = validateCustomTool({
      name: valid.name,
      description: valid.description,
      parameters: [],
      http_url: valid.http_url,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.http_method).toBe("POST");
      expect(result.value.enabled).toBe(true);
    }
  });
});

describe("validateCustomToolUpdate", () => {
  it("accepts a single-field change", () => {
    expect(validateCustomToolUpdate({ enabled: false }).ok).toBe(true);
  });

  it("still rejects an invalid name on update", () => {
    expect(validateCustomToolUpdate({ name: "bad name" }).ok).toBe(false);
  });

  it("still rejects a pack-tool collision on rename", () => {
    expect(
      validateCustomToolUpdate({ name: "create_reservation" }, ["create_reservation"]).ok
    ).toBe(false);
  });
});

describe("validateToolSettingsPatch", () => {
  it("accepts a toggle", () => {
    expect(validateToolSettingsPatch({ enabled: false }).ok).toBe(true);
  });

  it("accepts a description override", () => {
    expect(
      validateToolSettingsPatch({ description_override: "Only for large parties." }).ok
    ).toBe(true);
  });

  it("accepts an empty override, which clears it", () => {
    expect(validateToolSettingsPatch({ description_override: "" }).ok).toBe(true);
  });

  it("rejects an empty patch", () => {
    const result = validateToolSettingsPatch({});
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Nothing was changed/);
  });
});
