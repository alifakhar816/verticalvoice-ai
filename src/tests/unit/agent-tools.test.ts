import { beforeEach, afterEach, describe, expect, it } from "vitest";
import {
  buildSelectedTools,
  type CustomToolDefinition,
  type TenantToolSettings,
} from "@/lib/telephony/ultravox-tools";
import {
  validateCustomTool,
  validateCustomToolUpdate,
  validateParameterOverrides,
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
        // Optional on purpose: the only kind of parameter a tenant is allowed
        // to stop collecting.
        {
          name: "seating_preference",
          type: "string",
          required: false,
          description: "Indoor or outdoor, if the caller says.",
        },
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

/**
 * A custom tool with the runtime limits filled in, so a test that cares about
 * routing does not have to restate a timeout it is not testing.
 */
function customTool(
  overrides: Partial<CustomToolDefinition> & Pick<CustomToolDefinition, "name">
): CustomToolDefinition {
  return {
    id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
    description: "A tenant-authored tool.",
    parameters: [],
    http_url: "https://api.partner.example.com/orders",
    http_method: "POST",
    timeout_seconds: 20,
    rate_limit_per_minute: 30,
    ...overrides,
  };
}

interface TemporaryToolEntry {
  temporaryTool?: {
    modelToolName: string;
    description: string;
    dynamicParameters: {
      name: string;
      required: boolean;
      schema: { type: string; description: string };
    }[];
    staticParameters?: { name: string; value: string }[];
    timeout?: string;
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
        customTool({
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
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
        }),
      ],
    });

    const custom = entries.find((e) => e.temporaryTool?.modelToolName === "check_order_status");
    expect(custom).toBeDefined();
    expect(custom?.temporaryTool?.description).toBe("Look up an order by its reference.");
    expect(custom?.temporaryTool?.dynamicParameters).toEqual([
      {
        name: "order_id",
        location: "PARAMETER_LOCATION_BODY",
        schema: { type: "string", description: "The order reference." },
        required: true,
      },
    ]);
  });

  it("points a custom tool at our own proxy, never at the tenant's host", () => {
    // This is what makes rate limiting possible at all: if Ultravox dialled
    // `http_url` directly the traffic would never cross our infrastructure and
    // there would be nothing to count. The tenant's host is reached on the
    // outbound leg by /api/v1/tools/custom/[id], not by Ultravox.
    const entries = build({
      packOverrides: {},
      customTools: [
        customTool({
          id: "cccccccc-cccc-cccc-cccc-cccccccccccc",
          name: "third_party_lookup",
          http_url: "https://evil.example.net/collect",
          http_method: "PUT",
        }),
      ],
    });

    const custom = entries.find((e) => e.temporaryTool?.modelToolName === "third_party_lookup");
    expect(custom?.temporaryTool?.http).toEqual({
      baseUrlPattern: `${APP_URL}/api/v1/tools/custom/cccccccc-cccc-cccc-cccc-cccccccccccc`,
      // Always POST to the proxy: Ultravox can only send collected inputs as a
      // body, so a GET/PUT here would drop them. The row's own method is
      // applied by the proxy on the outbound leg.
      httpMethod: "POST",
    });

    // The tenant's host must not appear in the definition Ultravox holds.
    expect(JSON.stringify(custom)).not.toContain("evil.example.net");
  });

  it("keeps our internal tool token on our own origin", () => {
    // The token authenticates as this tenant against our API. It is attached
    // here because the address it is attached to is now always ours; the
    // decision about whether it travels any further is made by the proxy,
    // which forwards it only for a same-origin http_url.
    const entries = build({
      packOverrides: {},
      customTools: [
        customTool({ name: "third_party_lookup", http_url: "https://evil.example.net/collect" }),
      ],
    });

    const custom = entries.find((e) => e.temporaryTool?.modelToolName === "third_party_lookup");
    expect(custom?.temporaryTool?.staticParameters?.[0]?.name).toBe("Authorization");
    expect(custom?.temporaryTool?.http.baseUrlPattern.startsWith(APP_URL)).toBe(true);
  });

  it("gives a custom tool the timeout the tenant configured", () => {
    const entries = build({
      packOverrides: {},
      customTools: [customTool({ name: "slow_lookup", timeout_seconds: 45 })],
    });

    const custom = entries.find((e) => e.temporaryTool?.modelToolName === "slow_lookup");
    expect(custom?.temporaryTool?.timeout).toBe("45s");
  });

  it("bounds a pack tool with the timeout its binding declares", () => {
    // The packs have carried `timeout` since they were written and nothing
    // read it — a slow built-in tool could hold a call open indefinitely.
    const timedPack = {
      id: "restaurant",
      tools: [
        {
          ...(pack.tools[0] as unknown as Record<string, unknown>),
          timeout: 5000,
        },
      ],
    } as unknown as IndustryPack;

    const entries = buildSelectedTools(timedPack, opts, noSettings) as TemporaryToolEntry[];
    expect(entries[0]?.temporaryTool?.timeout).toBe("5s");
  });

  it("falls back to the default timeout for a binding that declares none", () => {
    // No pack tool may be unbounded just because its author omitted a number.
    const entries = build();
    expect(entries[0]?.temporaryTool?.timeout).toBe("20s");
  });

  it("rewords a pack parameter's description without touching its contract", () => {
    const entries = build({
      packOverrides: {
        check_table_availability: {
          enabled: true,
          descriptionOverride: null,
          parameterOverrides: {
            party_size: { description: "How many people are dining with us." },
          },
        },
      },
      customTools: [],
    });

    const tool = entries.find(
      (e) => e.temporaryTool?.modelToolName === "check_table_availability"
    );
    const partySize = tool?.temporaryTool?.dynamicParameters.find(
      (p) => p.name === "party_size"
    );

    expect(partySize?.schema.description).toBe("How many people are dining with us.");
    // The three fields a handler depends on are unchanged.
    expect(partySize?.name).toBe("party_size");
    expect(partySize?.schema.type).toBe("number");
    expect(partySize?.required).toBe(true);
  });

  it("falls back to the pack wording when a parameter override is blank", () => {
    const entries = build({
      packOverrides: {
        check_table_availability: {
          enabled: true,
          descriptionOverride: null,
          parameterOverrides: { party_size: { description: "   " } },
        },
      },
      customTools: [],
    });

    const partySize = entries
      .find((e) => e.temporaryTool?.modelToolName === "check_table_availability")
      ?.temporaryTool?.dynamicParameters.find((p) => p.name === "party_size");

    expect(partySize?.schema.description).toBe("Number of guests.");
  });

  it("drops an OPTIONAL parameter the tenant stopped collecting", () => {
    const entries = build({
      packOverrides: {
        check_table_availability: {
          enabled: true,
          descriptionOverride: null,
          parameterOverrides: { seating_preference: { enabled: false } },
        },
      },
      customTools: [],
    });

    const names = entries
      .find((e) => e.temporaryTool?.modelToolName === "check_table_availability")
      ?.temporaryTool?.dynamicParameters.map((p) => p.name);

    expect(names).not.toContain("seating_preference");
    expect(names).toContain("date");
  });

  it("keeps a REQUIRED parameter even if a stored override says otherwise", () => {
    // The API layer refuses to write this, but a row could arrive by another
    // path. Honouring it would produce a handler that throws mid-call on a
    // real caller, so the builder refuses it too — defence in depth.
    const entries = build({
      packOverrides: {
        check_table_availability: {
          enabled: true,
          descriptionOverride: null,
          parameterOverrides: { date: { enabled: false } },
        },
      },
      customTools: [],
    });

    const names = entries
      .find((e) => e.temporaryTool?.modelToolName === "check_table_availability")
      ?.temporaryTool?.dynamicParameters.map((p) => p.name);

    expect(names).toContain("date");
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

  it("accepts a parameter override on its own", () => {
    expect(
      validateToolSettingsPatch({
        parameter_overrides: { party_size: { description: "How many are dining." } },
      }).ok
    ).toBe(true);
  });

  it("refuses a parameter override that tries to change the contract", () => {
    // `required`, `name` and `type` are what the handlers read by name. The
    // schema is strict so an attempt to smuggle one through is a 400, not a
    // silently ignored field.
    for (const forbidden of [
      { party_size: { required: false } },
      { party_size: { name: "guests" } },
      { party_size: { type: "string" } },
    ]) {
      expect(validateToolSettingsPatch({ parameter_overrides: forbidden }).ok).toBe(false);
    }
  });
});

describe("validateParameterOverrides", () => {
  const parameters = [
    { name: "date", required: true },
    { name: "seating_preference", required: false },
  ];

  it("accepts rewording either kind of parameter", () => {
    const result = validateParameterOverrides(
      {
        date: { description: "The day they want to come in." },
        seating_preference: { description: "Indoor or outdoor." },
      },
      parameters
    );
    expect(result.ok).toBe(true);
  });

  it("accepts switching an OPTIONAL parameter off", () => {
    const result = validateParameterOverrides(
      { seating_preference: { enabled: false } },
      parameters
    );
    expect(result.ok).toBe(true);
  });

  it("refuses switching a REQUIRED parameter off", () => {
    // This is the whole safety boundary: the handler reads `date`
    // unconditionally, so an agent that never collected it fails mid-call.
    const result = validateParameterOverrides({ date: { enabled: false } }, parameters);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.message).toMatch(/required/i);
      expect(result.message).toContain("date");
    }
  });

  it("still allows rewording a required parameter", () => {
    const result = validateParameterOverrides(
      { date: { description: "The day they want to come in." } },
      parameters
    );
    expect(result.ok).toBe(true);
  });

  it("refuses an override for a parameter the tool does not have", () => {
    const result = validateParameterOverrides({ nonsense: { enabled: false } }, parameters);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toContain("nonsense");
  });
});

describe("custom tool limits", () => {
  const base = {
    name: "check_order_status",
    description: "Look up the status of a customer order using their reference number.",
    parameters: [],
    http_url: "https://api.example.com/orders",
    http_method: "POST",
  };

  it("defaults both limits when the tenant does not set them", () => {
    const result = validateCustomTool(base);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.timeout_seconds).toBe(20);
      expect(result.value.rate_limit_per_minute).toBe(30);
    }
  });

  it("accepts values inside the bounds", () => {
    const result = validateCustomTool({
      ...base,
      timeout_seconds: 45,
      rate_limit_per_minute: 5,
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.timeout_seconds).toBe(45);
  });

  it("refuses a timeout long enough to strand the caller", () => {
    const result = validateCustomTool({ ...base, timeout_seconds: 600 });
    expect(result.ok).toBe(false);
    // Phrased for a business owner, not as a schema violation.
    if (!result.ok) expect(result.message).not.toMatch(/zod|number|invalid_/i);
  });

  it("refuses a zero or negative timeout", () => {
    expect(validateCustomTool({ ...base, timeout_seconds: 0 }).ok).toBe(false);
    expect(validateCustomTool({ ...base, timeout_seconds: -5 }).ok).toBe(false);
  });

  it("refuses a rate limit outside the bounds", () => {
    expect(validateCustomTool({ ...base, rate_limit_per_minute: 0 }).ok).toBe(false);
    expect(validateCustomTool({ ...base, rate_limit_per_minute: 100_000 }).ok).toBe(false);
  });

  it("refuses a fractional limit", () => {
    expect(validateCustomTool({ ...base, timeout_seconds: 2.5 }).ok).toBe(false);
  });

  it("lets an existing tool change just its limits", () => {
    const result = validateCustomToolUpdate({ timeout_seconds: 10 });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.timeout_seconds).toBe(10);
  });
});
