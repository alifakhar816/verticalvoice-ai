import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database/types";
import { createUltravoxCall, type UltravoxCallOptions } from "@/lib/telephony/ultravox";
import { buildSelectedTools, loadTenantToolSettings } from "@/lib/telephony/ultravox-tools";
import { withCurrentDateContext } from "@/lib/telephony/prompt-context";
import { placeOutboundCall as placeTwilioCall } from "@/lib/telephony/twilio";
import "@/industries";
import { getIndustryPack } from "@/industries/core/registry";
import { buildOutboundSystemPrompt } from "@/lib/telephony/outbound-prompt";

/**
 * The single outbound-call path, extracted from the POST handler in
 * `/api/v1/calls/outbound` so that it has exactly ONE implementation.
 *
 * It previously lived inline in that route, which meant a campaign dialer had
 * no way to place a call without re-deriving the whole sequence: policy check,
 * industry pack lookup, call-type variable validation, do-not-call check,
 * active agent snapshot, tool wiring, Ultravox session, Twilio dial, audit
 * trail. A second copy of that sequence would inevitably drift from this one,
 * and the specific ways it would drift — a missed do-not-call check, a call
 * placed with no agent snapshot, an untracked call row — are exactly the ways
 * you do not want an autodialer to drift.
 *
 * Failures are returned, not thrown, with a machine-readable `code`: the route
 * maps them to HTTP statuses and the dialer maps them to target states, and
 * those two callers need to distinguish "this number is opted out" (terminal)
 * from "Twilio was unhappy" (retryable). A thrown Error cannot express that
 * without string-matching.
 */

export type PlaceOutboundFailureCode =
  | "outbound_disabled"
  | "tenant_not_found"
  | "no_industry_pack"
  | "unknown_call_type"
  | "missing_variables"
  | "do_not_call"
  | "no_phone_number"
  | "insert_failed"
  | "config_error"
  | "ultravox_failed"
  | "twilio_failed";

export type PlaceOutboundResult =
  | { ok: true; call: Database["public"]["Tables"]["calls"]["Row"] }
  | { ok: false; code: PlaceOutboundFailureCode; error: string; status: number };

export interface PlaceOutboundParams {
  admin: SupabaseClient<Database>;
  tenantId: string;
  toNumber: string;
  callTypeId: string;
  variables: Record<string, string>;
  /** auth.users.id of the operator, or null when a background worker dialled. */
  actorId?: string | null;
  /** Extra audit metadata, e.g. { campaign_id, campaign_target_id }. */
  auditMetadata?: Record<string, unknown>;
}

function fillTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(variables, name) ? variables[name] : match
  );
}

export async function placeOutboundCallForTenant(
  params: PlaceOutboundParams
): Promise<PlaceOutboundResult> {
  const { admin, tenantId, toNumber, callTypeId, variables, actorId = null } = params;

  const { data: policy } = await admin
    .from("policy_settings")
    .select("allow_outbound")
    .eq("tenant_id", tenantId)
    .single();

  if (!policy?.allow_outbound) {
    return {
      ok: false,
      code: "outbound_disabled",
      status: 403,
      error: "Outbound calling is not enabled for this tenant. Enable it first.",
    };
  }

  const { data: tenant } = await admin
    .from("tenants")
    .select("industry")
    .eq("id", tenantId)
    .single();

  if (!tenant) {
    return { ok: false, code: "tenant_not_found", status: 404, error: "Tenant not found" };
  }

  const pack = getIndustryPack(tenant.industry as "healthcare" | "restaurant" | "real_estate");
  if (!pack) {
    return {
      ok: false,
      code: "no_industry_pack",
      status: 400,
      error: `No industry pack found for: ${tenant.industry}`,
    };
  }

  const callType = pack.outboundCallTypes.find((t) => t.id === callTypeId);
  if (!callType) {
    return {
      ok: false,
      code: "unknown_call_type",
      status: 400,
      error: `Unknown call_type_id "${callTypeId}" for industry ${tenant.industry}`,
    };
  }

  const missingVars = callType.variables
    .filter((v) => v.required && !variables[v.name]?.trim())
    .map((v) => v.name);
  if (missingVars.length > 0) {
    return {
      ok: false,
      code: "missing_variables",
      status: 400,
      error: `Missing required variables: ${missingVars.join(", ")}`,
    };
  }

  // Respect the contact book's do-not-call flag — a flag that doesn't stop
  // a dial is worse than no flag at all. Checked here, immediately before the
  // call is placed, so that it holds for a campaign target queued days ago as
  // firmly as for a number typed in a second ago.
  const { data: dncContact } = await admin
    .from("contacts")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("phone", toNumber)
    .eq("do_not_call", true)
    .maybeSingle();

  if (dncContact) {
    return {
      ok: false,
      code: "do_not_call",
      status: 403,
      error: "This number is marked do-not-call in your contacts.",
    };
  }

  const { data: businessProfile } = await admin
    .from("business_profiles")
    .select("business_name, timezone")
    .eq("tenant_id", tenantId)
    .single();

  const { data: phoneNumber } = await admin
    .from("phone_numbers")
    .select("number")
    .eq("tenant_id", tenantId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!phoneNumber) {
    return {
      ok: false,
      code: "no_phone_number",
      status: 400,
      error: "This tenant has no active phone number to call from.",
    };
  }

  const { data: activeConfig } = await admin
    .from("active_agent_configs")
    .select("agent_config_version_id")
    .eq("tenant_id", tenantId)
    .order("activated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let voiceId: string | null = null;
  let compiledPrompt: string | null = null;
  // Engine settings the tenant chose. Hoisted out of the block below so they
  // survive to the createUltravoxCall call — they are stored and shown on the
  // agent dashboard, so they have to actually reach the call.
  let engineOptions: UltravoxCallOptions = {};
  if (activeConfig) {
    const { data: version } = await admin
      .from("agent_config_versions")
      .select("snapshot")
      .eq("id", activeConfig.agent_config_version_id)
      .single();
    const snapshot = version?.snapshot as {
      system_prompt?: string;
      model?: string;
      temperature?: number;
      voice?: { voice_id?: string; speed?: number; language?: string } | null;
    } | null;
    voiceId = snapshot?.voice?.voice_id ?? null;
    compiledPrompt = snapshot?.system_prompt ?? null;
    engineOptions = {
      temperature: snapshot?.temperature,
      model: snapshot?.model,
      speed: snapshot?.voice?.speed,
      language: snapshot?.voice?.language,
    };
  }

  const businessName = businessProfile?.business_name ?? "the business";
  const baseSystemPrompt = buildOutboundSystemPrompt({
    compiledPrompt,
    businessName,
    category: callType.category,
    filledScript: fillTemplate(callType.promptTemplate, variables),
  });
  const systemPrompt = withCurrentDateContext(baseSystemPrompt, businessProfile?.timezone);

  // Insert the call row first (provider_call_id is nullable) so we have
  // our internal call.id to scope this call's tools to before Ultravox
  // or Twilio are ever contacted.
  const { data: call, error: insertError } = await admin
    .from("calls")
    .insert({
      tenant_id: tenantId,
      direction: "outbound",
      status: "initiating",
      caller_number: phoneNumber.number,
      called_number: toNumber,
      started_at: new Date().toISOString(),
      outbound_purpose: callTypeId,
      outbound_context: variables,
    })
    .select()
    .single();

  if (insertError || !call) {
    return {
      ok: false,
      code: "insert_failed",
      status: 500,
      error: insertError?.message ?? "Failed to create call record",
    };
  }

  // Same tenant tool settings the inbound path applies, so an outbound call
  // and an inbound call for one tenant expose an identical tool catalog.
  const toolSettings = await loadTenantToolSettings(admin, tenantId);

  const selectedTools = buildSelectedTools(
    pack,
    { callId: call.id, tenantId, industry: pack.id },
    toolSettings
  );

  const ultravoxCall = await createUltravoxCall(
    systemPrompt,
    voiceId,
    selectedTools,
    engineOptions
  );
  if (!ultravoxCall.joinUrl) {
    await admin.from("calls").update({ status: "failed" }).eq("id", call.id);
    return {
      ok: false,
      code: "ultravox_failed",
      status: 502,
      error: "Ultravox call was created without a joinUrl",
    };
  }

  // Twilio rejects a relative StatusCallback, which would silently cost us
  // every status transition for the call. Fail loudly at the source instead.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;
  if (!appUrl?.startsWith("http")) {
    await admin.from("calls").update({ status: "failed" }).eq("id", call.id);
    return {
      ok: false,
      code: "config_error",
      status: 500,
      error: "NEXT_PUBLIC_APP_URL must be an absolute URL for call status callbacks.",
    };
  }
  const statusCallbackUrl = `${appUrl}/api/v1/webhooks/twilio`;

  // A Twilio rejection (unverified caller ID, geo-permission, bad number)
  // used to escape to the generic 500 handler, leaving the call row stuck in
  // "initiating" forever and hiding Twilio's actual reason from the operator.
  let twilioCall;
  try {
    twilioCall = await placeTwilioCall({
      to: toNumber,
      from: phoneNumber.number,
      ultravoxJoinUrl: ultravoxCall.joinUrl,
      statusCallbackUrl,
    });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Twilio call failed";
    // `calls` has no failure-reason column, so the durable record of *why*
    // goes to audit_events; the row itself just stops lying about being live.
    await admin
      .from("calls")
      .update({ status: "failed", ended_at: new Date().toISOString() })
      .eq("id", call.id);
    await admin.from("audit_events").insert({
      tenant_id: tenantId,
      actor_id: actorId,
      action: "call.outbound_failed",
      resource_type: "call",
      resource_id: call.id,
      metadata: {
        to_number: toNumber,
        call_type_id: callTypeId,
        reason: reason.slice(0, 500),
        ...params.auditMetadata,
      },
    });
    return { ok: false, code: "twilio_failed", status: 502, error: reason };
  }

  await admin
    .from("calls")
    .update({
      provider_call_id: twilioCall.sid,
      ultravox_call_id: ultravoxCall.callId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", call.id);
  call.provider_call_id = twilioCall.sid;

  await admin.from("audit_events").insert({
    tenant_id: tenantId,
    actor_id: actorId,
    action: "call.outbound_initiated",
    resource_type: "call",
    resource_id: call.id,
    metadata: {
      to_number: toNumber,
      call_type_id: callTypeId,
      provider_call_id: twilioCall.sid,
      ...params.auditMetadata,
    },
  });

  return { ok: true, call };
}
