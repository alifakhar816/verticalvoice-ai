import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/database/supabase-server";
import { createAdminClient } from "@/lib/database/supabase-admin";
import { getCurrentTenantId } from "@/domain/tenants/current";
import { placeOutboundCallForTenant } from "@/lib/calls/place-outbound-call";
import { z } from "zod";
import { phoneSchema } from "@/lib/validation/schemas";

const outboundCallSchema = z.object({
  to_number: phoneSchema,
  call_type_id: z.string().min(1),
  variables: z.record(z.string(), z.string()).default({}),
});

/**
 * Places one outbound call on behalf of the signed-in operator.
 *
 * The actual dialling sequence (policy, industry pack, do-not-call, agent
 * snapshot, tools, Ultravox, Twilio, audit) lives in
 * `@/lib/calls/place-outbound-call` so the campaign dialer can run exactly the
 * same code rather than a second copy of it. This handler is now only what a
 * route should be: authenticate, validate, delegate, map the result to HTTP.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = outboundCallSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { to_number, call_type_id, variables } = parsed.data;

    const tenant_id = await getCurrentTenantId(user.id);
    if (!tenant_id) {
      return NextResponse.json({ error: "No tenant found for this account" }, { status: 403 });
    }

    const result = await placeOutboundCallForTenant({
      admin: createAdminClient(),
      tenantId: tenant_id,
      toNumber: to_number,
      callTypeId: call_type_id,
      variables,
      actorId: user.id,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    return NextResponse.json({ data: result.call }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
