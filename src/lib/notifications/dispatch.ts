import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Json } from "@/lib/database/types";
import { sendEmail } from "./email";

interface NotifyStaffParams {
  tenantId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

/**
 * Records an in-app notification and best-effort emails the tenant's
 * configured contact address (business_profiles.email, captured during
 * onboarding as "contactEmail"). Most call-time tools only capture a
 * caller's phone number, not email, so this is staff-facing (new booking,
 * new lead, escalation) rather than a customer confirmation — customer
 * email confirmations only apply to the handful of tools that actually
 * collect an email address on the call (e.g. capture_lead).
 */
export async function notifyStaff(
  supabase: SupabaseClient<Database>,
  { tenantId, type, title, body, data }: NotifyStaffParams
): Promise<void> {
  const { data: notification } = await supabase
    .from("notifications")
    .insert({
      tenant_id: tenantId,
      channel: "email",
      type,
      title,
      body,
      data: (data ?? {}) as unknown as Json,
    })
    .select("id")
    .single();

  const { data: profile } = await supabase
    .from("business_profiles")
    .select("email")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (!profile?.email) return;

  const result = await sendEmail({
    to: profile.email,
    subject: title,
    html: `<p>${body}</p>`,
  });

  if (result.sent && notification) {
    await supabase
      .from("notifications")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", notification.id);
  }
}
