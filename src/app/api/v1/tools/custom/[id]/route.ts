import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { verifyToolToken } from "@/lib/telephony/tool-token";
import { checkRateLimit } from "@/lib/security/rate-limit";
import { httpUrlSchema } from "@/lib/validation/agent-tools";
import { logger } from "@/lib/observability/logger";
import type { Json } from "@/lib/database/types";

/**
 * Dispatch point for TENANT-AUTHORED tools, mirroring
 * /api/v1/tools/execute/[toolId] for pack tools.
 *
 * Why this route exists at all: until now `buildSelectedTools` handed Ultravox
 * the tenant's own `http_url` and Ultravox dialled it directly. That traffic
 * never crossed our infrastructure, which meant a custom tool had no timeout
 * we controlled and — more importantly — no rate limit that was even
 * countable. A tenant-authored tool could be invoked by the model in a loop
 * against someone else's endpoint and nothing here would know. Putting one hop
 * in front is what turns `rate_limit_per_minute` from a number in a form into
 * a number that is enforced.
 *
 * What this route deliberately does NOT do is decide anything about the
 * request beyond its limits. It does not inspect, reshape or validate the
 * tool's inputs: those are the tenant's own contract with their own endpoint,
 * and a proxy that second-guessed them would break tools it does not
 * understand.
 */

/** Same wording the pack-tool route uses, for the same reason. */
export const CALLER_SAFE_TOOL_ERROR =
  "That action could not be completed right now. Apologize briefly to the caller, do not mention any technical details, and offer to take their name and number so a staff member can follow up.";

/**
 * What the model is told when the tool has been used too often in one call.
 *
 * Distinct from the generic failure above because the recovery is different:
 * retrying immediately is exactly the wrong move, and the agent needs to be
 * told to stop rather than to apologize and try again.
 */
export const RATE_LIMITED_TOOL_ERROR =
  "This tool has already been used as many times as it is allowed in this call. Do not try it again. Continue the conversation without it and offer to take the caller's details for follow-up.";

/** Methods that carry no body, so the collected inputs go in the query string. */
const BODYLESS_METHODS = new Set(["GET", "HEAD"]);

function isSameOrigin(url: string, baseUrl: string | undefined): boolean {
  if (!baseUrl) return false;
  try {
    return new URL(url).origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = verifyToolToken(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = createAdminClient();

  // Filtered by tenant as well as id: the token proves which tenant the call
  // belongs to, and a tool id from another tenant must read as "gone", not as
  // someone else's row.
  const { data: tool } = await supabase
    .from("custom_tools")
    .select(
      "id, name, http_url, http_method, enabled, timeout_seconds, rate_limit_per_minute"
    )
    .eq("id", id)
    .eq("tenant_id", auth.tenant_id)
    .maybeSingle();

  if (!tool || !tool.enabled) {
    // Re-read rather than trusted from the call-setup snapshot: a tenant who
    // turns a tool off mid-call means it, and the definition Ultravox is
    // holding was built before they said so.
    return NextResponse.json({ error: CALLER_SAFE_TOOL_ERROR }, { status: 404 });
  }

  // Keyed per call, not per tenant: the limit a tenant sets is about how often
  // the agent may reach for this tool while talking to ONE caller. A busy
  // business with ten simultaneous calls should not have the tenth caller
  // silently denied because the first nine were chatty.
  const limit = checkRateLimit(
    `custom-tool:${auth.call_id}:${tool.id}`,
    tool.rate_limit_per_minute,
    60_000
  );
  if (!limit.allowed) {
    logger.warn("custom-tool: rate limited", {
      toolId: tool.id,
      toolName: tool.name,
      tenantId: auth.tenant_id,
      callId: auth.call_id,
      limit: tool.rate_limit_per_minute,
    });

    await supabase.from("call_tool_runs").insert({
      call_id: auth.call_id,
      tool_name: tool.name,
      input: {} as unknown as Json,
      output: { error: "rate_limited" } as unknown as Json,
      status: "error",
      error_message: `Rate limit of ${tool.rate_limit_per_minute}/min reached for this call`,
      duration_ms: 0,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({ error: RATE_LIMITED_TOOL_ERROR }, { status: 429 });
  }

  // Re-validated at call time, not merely at authoring time. The row could
  // have been written before a rule tightened, or edited by a path that did
  // not go through the API. This is the last point before we make an outbound
  // request on the tenant's behalf, so it is the right place to refuse a
  // private-network or non-HTTPS address.
  const urlCheck = httpUrlSchema.safeParse(tool.http_url);
  if (!urlCheck.success) {
    logger.error("custom-tool: stored URL failed validation", {
      toolId: tool.id,
      tenantId: auth.tenant_id,
    });
    return NextResponse.json({ error: CALLER_SAFE_TOOL_ERROR }, { status: 400 });
  }

  const input = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const startedAt = Date.now();

  // Both legs share one number. Ultravox is already holding a `timeout` built
  // from the same column, so this bounds our own wait rather than adding a
  // second, longer one that would outlive the caller's patience.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), tool.timeout_seconds * 1000);

  try {
    const method = tool.http_method.toUpperCase();
    const target = new URL(urlCheck.data);

    if (BODYLESS_METHODS.has(method)) {
      for (const [key, value] of Object.entries(input)) {
        if (value === undefined || value === null) continue;
        target.searchParams.set(
          key,
          typeof value === "object" ? JSON.stringify(value) : String(value)
        );
      }
    }

    const response = await fetch(target, {
      method,
      headers: {
        "Content-Type": "application/json",
        // The call-scoped token is forwarded ONLY back to our own origin.
        // It is a bearer credential for our API carrying this tenant's
        // identity; handing it to a host the tenant merely typed into a form
        // would be a silent tenant-to-tenant escalation. A third-party
        // endpoint gets the inputs and nothing else.
        ...(isSameOrigin(urlCheck.data, process.env.NEXT_PUBLIC_APP_URL)
          ? { Authorization: request.headers.get("authorization") ?? "" }
          : {}),
      },
      ...(BODYLESS_METHODS.has(method) ? {} : { body: JSON.stringify(input) }),
      signal: controller.signal,
      // A redirect is not followed: the validation above proved the address
      // the tenant configured is public and HTTPS, and following a 302 would
      // let the far end move the request somewhere neither of us checked.
      redirect: "manual",
    });

    const text = await response.text();
    let output: unknown;
    try {
      output = JSON.parse(text);
    } catch {
      // A tenant endpoint returning plain text is not an error — the model can
      // read a sentence back to the caller perfectly well.
      output = { result: text };
    }

    await supabase.from("call_tool_runs").insert({
      call_id: auth.call_id,
      tool_name: tool.name,
      input: input as unknown as Json,
      output: output as unknown as Json,
      status: response.ok ? "success" : "error",
      error_message: response.ok ? null : `Endpoint returned ${response.status}`,
      duration_ms: Date.now() - startedAt,
      completed_at: new Date().toISOString(),
    });

    if (!response.ok) {
      logger.warn("custom-tool: endpoint returned an error", {
        toolId: tool.id,
        tenantId: auth.tenant_id,
        callId: auth.call_id,
        status: response.status,
      });
      // The tenant's own error body is not passed through: it was written for
      // their logs, not to be read aloud to a caller.
      return NextResponse.json({ error: CALLER_SAFE_TOOL_ERROR }, { status: 502 });
    }

    return NextResponse.json(output);
  } catch (error) {
    const timedOut = error instanceof Error && error.name === "AbortError";
    const message = timedOut
      ? `Timed out after ${tool.timeout_seconds}s`
      : error instanceof Error
        ? error.message
        : "Custom tool request failed";

    logger.error("custom-tool: request failed", {
      toolId: tool.id,
      toolName: tool.name,
      tenantId: auth.tenant_id,
      callId: auth.call_id,
      timedOut,
      error: message,
    });

    await supabase.from("call_tool_runs").insert({
      call_id: auth.call_id,
      tool_name: tool.name,
      input: input as unknown as Json,
      output: { error: message } as unknown as Json,
      status: "error",
      error_message: message,
      duration_ms: Date.now() - startedAt,
      completed_at: new Date().toISOString(),
    });

    return NextResponse.json({ error: CALLER_SAFE_TOOL_ERROR }, { status: 504 });
  } finally {
    clearTimeout(timer);
  }
}
