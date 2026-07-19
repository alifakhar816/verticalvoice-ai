import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";

/**
 * The proxy in front of tenant-authored tools.
 *
 * Everything worth testing here is a decision the route makes BEFORE or AROUND
 * the outbound request — whether it makes one at all, how long it will wait,
 * and what it is willing to send. The tenant's endpoint itself is stubbed:
 * this file is about our obligations, not theirs.
 */

const mockCreateClient = vi.fn();
const mockVerifyToolToken = vi.fn();

vi.mock("@/lib/database/supabase-admin", () => ({
  createAdminClient: (...args: unknown[]) => mockCreateClient(...args),
}));

vi.mock("@/lib/telephony/tool-token", () => ({
  verifyToolToken: (...args: unknown[]) => mockVerifyToolToken(...args),
}));

const APP_URL = "https://app.example.com";
const CALL_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";
const TOOL_ID = "33333333-3333-3333-3333-333333333333";

interface ToolRow {
  id: string;
  name: string;
  http_url: string;
  http_method: string;
  enabled: boolean;
  timeout_seconds: number;
  rate_limit_per_minute: number;
}

function toolRow(overrides: Partial<ToolRow> = {}): ToolRow {
  return {
    id: TOOL_ID,
    name: "check_order_status",
    http_url: "https://api.partner.example.com/orders",
    http_method: "POST",
    enabled: true,
    timeout_seconds: 20,
    rate_limit_per_minute: 30,
    ...overrides,
  };
}

function makeSupabaseMock(tool: ToolRow | null) {
  const insertMock = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn((table: string) => {
    if (table === "custom_tools") {
      return {
        select: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: () => Promise.resolve({ data: tool, error: null }) }),
          }),
        }),
      };
    }
    if (table === "call_tool_runs") return { insert: insertMock };
    throw new Error(`Unexpected table in test mock: ${table}`);
  });
  return { client: { from }, insertMock };
}

type RouteModule = typeof import("@/app/api/v1/tools/custom/[id]/route");
let POST: RouteModule["POST"];

function makeRequest(body: Record<string, unknown> = {}) {
  return {
    json: () => Promise.resolve(body),
    headers: { get: (name: string) => (name === "authorization" ? "Bearer test-token" : null) },
  } as unknown as Parameters<RouteModule["POST"]>[0];
}

const context = { params: Promise.resolve({ id: TOOL_ID }) };

describe("custom tool proxy", () => {
  const previousAppUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(async () => {
    process.env.NEXT_PUBLIC_APP_URL = APP_URL;
    vi.resetModules();
    mockVerifyToolToken.mockReturnValue({
      call_id: CALL_ID,
      tenant_id: TENANT_ID,
      industry: "restaurant",
      is_test: false,
    });
    // Re-imported per test so the module-level rate-limit buckets, which are
    // process-global, do not leak a spent budget into the next case.
    ({ POST } = await import("@/app/api/v1/tools/custom/[id]/route"));
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = previousAppUrl;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects a request with no valid call token", async () => {
    mockVerifyToolToken.mockReturnValue(null);
    mockCreateClient.mockReturnValue(makeSupabaseMock(toolRow()).client);

    const response = await POST(makeRequest(), context);
    expect(response.status).toBe(401);
  });

  it("forwards the collected inputs to the tenant's endpoint", async () => {
    mockCreateClient.mockReturnValue(makeSupabaseMock(toolRow()).client);
    const fetchMock = vi.fn(() =>
      Promise.resolve(new Response(JSON.stringify({ status: "shipped" }), { status: 200 }))
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest({ order_id: "A-1" }), context);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "shipped" });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(url.toString()).toBe("https://api.partner.example.com/orders");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ order_id: "A-1" });
  });

  it("does NOT hand our call token to a third-party endpoint", async () => {
    // The token authenticates as this tenant against our own API. The tenant
    // typed this host into a form; it must never receive a credential of ours.
    mockCreateClient.mockReturnValue(makeSupabaseMock(toolRow()).client);
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest(), context);

    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(init.headers).not.toHaveProperty("Authorization");
    expect(JSON.stringify(init.headers)).not.toContain("test-token");
  });

  it("does forward the token to a same-origin endpoint", async () => {
    mockCreateClient.mockReturnValue(
      makeSupabaseMock(toolRow({ http_url: `${APP_URL}/api/v1/tools/execute/lookup` })).client
    );
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest(), context);

    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
  });

  it("treats a lookalike host as third-party", async () => {
    // `startsWith` on the base URL would wrongly accept this.
    mockCreateClient.mockReturnValue(
      makeSupabaseMock(toolRow({ http_url: "https://app.example.com.attacker.net/collect" }))
        .client
    );
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    await POST(makeRequest(), context);

    const [, init] = fetchMock.mock.calls[0] as unknown as [URL, RequestInit];
    expect(JSON.stringify(init.headers)).not.toContain("test-token");
  });

  it("stops calling the endpoint once the per-minute limit is spent", async () => {
    // The whole point of routing through here. Without the proxy this traffic
    // never crossed our infrastructure and could not be counted at all.
    mockCreateClient.mockReturnValue(
      makeSupabaseMock(toolRow({ rate_limit_per_minute: 2 })).client
    );
    const fetchMock = vi.fn(() => Promise.resolve(new Response("{}", { status: 200 })));
    vi.stubGlobal("fetch", fetchMock);

    expect((await POST(makeRequest(), context)).status).toBe(200);
    expect((await POST(makeRequest(), context)).status).toBe(200);

    const third = await POST(makeRequest(), context);
    expect(third.status).toBe(429);
    // The endpoint was spared the third request entirely.
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("tells the agent to stop rather than to retry when rate limited", async () => {
    mockCreateClient.mockReturnValue(
      makeSupabaseMock(toolRow({ rate_limit_per_minute: 1 })).client
    );
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: 200 }))));

    await POST(makeRequest(), context);
    const limited = await POST(makeRequest(), context);
    const body = (await limited.json()) as { error: string };

    expect(body.error).toMatch(/do not try it again/i);
    // Never a status code or raw field name read aloud to a caller.
    expect(body.error).not.toMatch(/429|rate_limit|null/);
  });

  it("gives up on a hanging endpoint instead of holding the call open", async () => {
    mockCreateClient.mockReturnValue(makeSupabaseMock(toolRow({ timeout_seconds: 1 })).client);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: URL, init: RequestInit) =>
          // Never resolves on its own — only the abort signal ends it, which is
          // exactly the failure mode an unbounded custom tool used to have.
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => {
              const error = new Error("aborted");
              error.name = "AbortError";
              reject(error);
            });
          })
      )
    );

    const response = await POST(makeRequest(), context);
    expect(response.status).toBe(504);
  });

  it("refuses a tool the tenant has since turned off", async () => {
    mockCreateClient.mockReturnValue(makeSupabaseMock(toolRow({ enabled: false })).client);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest(), context);
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a stored address that points at a private network", async () => {
    // Re-checked at call time, not merely when it was authored.
    mockCreateClient.mockReturnValue(
      makeSupabaseMock(toolRow({ http_url: "https://192.168.1.10/internal" })).client
    );
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const response = await POST(makeRequest(), context);
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("never reads the tenant's own error text back to the caller", async () => {
    mockCreateClient.mockReturnValue(makeSupabaseMock(toolRow()).client);
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve(
          new Response('{"detail":"duplicate key violates constraint orders_pkey"}', {
            status: 500,
          })
        )
      )
    );

    const response = await POST(makeRequest(), context);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(502);
    expect(body.error).not.toContain("duplicate key");
    expect(body.error).toMatch(/could not be completed/i);
  });
});
