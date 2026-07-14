import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/database/supabase-server";
import { createTenant, type Industry } from "@/domain/tenants/service";
import { z } from "zod";

const startOnboardingSchema = z.object({
  businessName: z.string().min(1).max(200),
  industry: z.enum(["healthcare", "restaurant", "real_estate"]),
});

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const parsed = startOnboardingSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const tenant = await createTenant({
      name: parsed.data.businessName,
      industry: parsed.data.industry as Industry,
      userId: user.id,
    });

    return NextResponse.json({ tenant }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: membership } = await supabase
      .from("tenant_members")
      .select("tenant_id, role, tenants(*, business_profiles(*), voice_profiles(*), policy_settings(*))")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!membership) {
      return NextResponse.json({ onboarding: null });
    }

    return NextResponse.json({
      onboarding: {
        tenantId: membership.tenant_id,
        role: membership.role,
        tenant: membership.tenants,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
