import type { ToolHandler, ToolHandlerMap } from "./types";

/**
 * healthcare.ts — tool handlers for the healthcare industry pack's live
 * mid-call tools (src/industries/healthcare/pack.ts, tools array).
 *
 * There is no real provider-schedule, patient-identity, or payer-connectivity
 * system in this schema yet, so these handlers work against the closest real
 * tables (`appointments`, `refill_requests`, `insurance_intakes`) and are
 * honest about what they can and can't actually verify. The admin Supabase
 * client passed in has no RLS, so every query here manually scopes to
 * `tenant_id` for tenant isolation.
 */

// ─── check_availability ─────────────────────────────────────────────────────

const SLOT_MINUTES = 30;
const BUSINESS_START_HOUR = 9;
const BUSINESS_END_HOUR = 17;
const MAX_AVAILABILITY_DAYS = 31;

interface AvailabilitySlot {
  start: string;
  end: string;
  provider_id: string | null;
}

/**
 * Generates 30-minute slots within 9am-5pm (assumed business hours — this
 * schema has no separate provider-schedule table) for every day between
 * `dateFrom` and `dateTo`, restricted to the requested window's start/end
 * boundaries on the first/last day.
 */
function generateBusinessHourSlots(dateFrom: Date, dateTo: Date, providerId: string | null): AvailabilitySlot[] {
  const dayStart = new Date(
    Date.UTC(dateFrom.getUTCFullYear(), dateFrom.getUTCMonth(), dateFrom.getUTCDate()),
  );
  let dayEnd = new Date(Date.UTC(dateTo.getUTCFullYear(), dateTo.getUTCMonth(), dateTo.getUTCDate()));

  const totalDays = Math.floor((dayEnd.getTime() - dayStart.getTime()) / 86_400_000) + 1;
  if (totalDays > MAX_AVAILABILITY_DAYS) {
    dayEnd = new Date(dayStart.getTime() + (MAX_AVAILABILITY_DAYS - 1) * 86_400_000);
  }

  const slots: AvailabilitySlot[] = [];
  for (
    const day = new Date(dayStart);
    day.getTime() <= dayEnd.getTime();
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    for (let hour = BUSINESS_START_HOUR; hour < BUSINESS_END_HOUR; hour++) {
      for (let minute = 0; minute < 60; minute += SLOT_MINUTES) {
        const start = new Date(
          Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate(), hour, minute),
        );
        const end = new Date(start.getTime() + SLOT_MINUTES * 60_000);
        if (start.getTime() < dateFrom.getTime() || start.getTime() > dateTo.getTime()) continue;
        slots.push({ start: start.toISOString(), end: end.toISOString(), provider_id: providerId });
      }
    }
  }
  return slots;
}

const handleCheckAvailability: ToolHandler = async ({ supabase, tenantId, input }) => {
  const providerId = typeof input.provider_id === "string" ? input.provider_id : undefined;
  const appointmentType = typeof input.appointment_type === "string" ? input.appointment_type : undefined;
  const dateFromRaw = typeof input.date_from === "string" ? input.date_from : undefined;
  const dateToRaw = typeof input.date_to === "string" ? input.date_to : undefined;

  if (!dateFromRaw || !dateToRaw || !appointmentType) {
    return { available: false, slots: [], reason: "missing_required_fields" };
  }

  const dateFrom = new Date(dateFromRaw);
  const dateTo = new Date(dateToRaw);
  if (Number.isNaN(dateFrom.getTime()) || Number.isNaN(dateTo.getTime()) || dateFrom > dateTo) {
    return { available: false, slots: [], reason: "invalid_date_range" };
  }

  let query = supabase
    .from("appointments")
    .select("scheduled_at, duration_minutes, provider_id")
    .eq("tenant_id", tenantId)
    .neq("status", "cancelled")
    .gte("scheduled_at", dateFrom.toISOString())
    .lte("scheduled_at", dateTo.toISOString());

  if (providerId) {
    query = query.eq("provider_id", providerId);
  }

  const { data: existing, error } = await query;
  if (error) throw new Error(error.message);

  const bookings = (existing ?? []).map((row) => {
    const start = new Date(row.scheduled_at).getTime();
    const end = start + (row.duration_minutes ?? SLOT_MINUTES) * 60_000;
    return { start, end };
  });

  const candidateSlots = generateBusinessHourSlots(dateFrom, dateTo, providerId ?? null);
  const availableSlots = candidateSlots.filter((slot) => {
    const slotStart = new Date(slot.start).getTime();
    const slotEnd = new Date(slot.end).getTime();
    return !bookings.some((booking) => slotStart < booking.end && slotEnd > booking.start);
  });

  return { available: availableSlots.length > 0, slots: availableSlots };
};

// ─── book_appointment_slot ──────────────────────────────────────────────────

const handleBookAppointmentSlot: ToolHandler = async ({ supabase, tenantId, callId, input }) => {
  const patientId = typeof input.patient_id === "string" ? input.patient_id : undefined;
  const slotId = typeof input.slot_id === "string" ? input.slot_id : undefined;
  const appointmentType = typeof input.appointment_type === "string" ? input.appointment_type : undefined;
  const reasonForVisit = typeof input.reason_for_visit === "string" ? input.reason_for_visit : undefined;
  const patientPhone = typeof input.patient_phone === "string" ? input.patient_phone : "unknown";

  if (!patientId || !slotId || !appointmentType) {
    return { booked: false, reason: "missing_required_fields" };
  }

  // check_availability returns ISO start times, not opaque ids — slot_id IS
  // the ISO datetime the AI booked from.
  const scheduledAt = new Date(slotId);
  if (Number.isNaN(scheduledAt.getTime())) {
    return { booked: false, reason: "invalid_slot_id" };
  }

  const reason = reasonForVisit ? `${appointmentType}: ${reasonForVisit}` : appointmentType;

  const { data, error } = await supabase
    .from("appointments")
    .insert({
      tenant_id: tenantId,
      call_id: callId,
      patient_name: patientId,
      patient_phone: patientPhone,
      scheduled_at: scheduledAt.toISOString(),
      duration_minutes: SLOT_MINUTES,
      status: "scheduled",
      reason,
    })
    .select("id, scheduled_at")
    .single();

  if (error) throw new Error(error.message);

  return {
    booked: true,
    appointment_id: data.id,
    scheduled_at: data.scheduled_at,
    appointment_type: appointmentType,
  };
};

// ─── cancel_appointment ─────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const handleCancelAppointment: ToolHandler = async ({ supabase, tenantId, input }) => {
  const appointmentIdRaw = typeof input.appointment_id === "string" ? input.appointment_id : undefined;
  const reason = typeof input.reason === "string" ? input.reason : null;
  const patientName = typeof input.patient_name === "string" ? input.patient_name : undefined;
  const patientPhone = typeof input.patient_phone === "string" ? input.patient_phone : undefined;

  if (!appointmentIdRaw && !patientName && !patientPhone) {
    return { cancelled: false, appointment_id: appointmentIdRaw ?? null, reason: "missing_identifier" };
  }

  let targetId: string | null = null;

  if (appointmentIdRaw && UUID_RE.test(appointmentIdRaw)) {
    targetId = appointmentIdRaw;
  } else {
    // Be lenient — the AI may pass a name/phone instead of a real
    // appointment id. Find the most recent non-cancelled match.
    let lookup = supabase
      .from("appointments")
      .select("id")
      .eq("tenant_id", tenantId)
      .neq("status", "cancelled")
      .order("scheduled_at", { ascending: false })
      .limit(1);

    if (patientPhone) {
      lookup = lookup.eq("patient_phone", patientPhone);
    } else if (patientName) {
      lookup = lookup.ilike("patient_name", `%${patientName}%`);
    } else if (appointmentIdRaw) {
      lookup = lookup.ilike("patient_name", `%${appointmentIdRaw}%`);
    }

    const { data: found, error: lookupError } = await lookup.maybeSingle();
    if (lookupError) throw new Error(lookupError.message);
    if (!found) {
      return { cancelled: false, appointment_id: appointmentIdRaw ?? null, reason: "not_found" };
    }
    targetId = found.id;
  }

  const { data: updated, error: updateError } = await supabase
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancellation_reason: reason,
    })
    .eq("id", targetId)
    .eq("tenant_id", tenantId)
    .select("id")
    .maybeSingle();

  if (updateError) throw new Error(updateError.message);
  if (!updated) {
    return { cancelled: false, appointment_id: targetId, reason: "not_found" };
  }

  return { cancelled: true, appointment_id: updated.id };
};

// ─── get_patient_info ───────────────────────────────────────────────────────

const handleGetPatientInfo: ToolHandler = async ({ supabase, tenantId, input }) => {
  const patientName = typeof input.patient_name === "string" ? input.patient_name : undefined;
  const dateOfBirth = typeof input.date_of_birth === "string" ? input.date_of_birth : undefined;

  if (!patientName) {
    return { found: false, upcoming_appointments: [] };
  }

  // This schema has no dedicated patient table — look up the patient's
  // appointment history by name instead. date_of_birth is captured for
  // the caller's identity claim, but there is no patient_dob backfilled
  // on every row to hard-verify against, so it is not used as a filter.
  const { data, error } = await supabase
    .from("appointments")
    .select("id, scheduled_at, duration_minutes, status, reason, provider_id")
    .eq("tenant_id", tenantId)
    .ilike("patient_name", `%${patientName}%`)
    .order("scheduled_at", { ascending: false })
    .limit(25);

  if (error) throw new Error(error.message);

  const records = data ?? [];
  const nowMs = Date.now();
  const upcomingAppointments = records
    .filter((row) => row.status !== "cancelled" && new Date(row.scheduled_at).getTime() >= nowMs)
    .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime())
    .map((row) => ({
      appointment_id: row.id,
      scheduled_at: row.scheduled_at,
      duration_minutes: row.duration_minutes,
      status: row.status,
      reason: row.reason,
      provider_id: row.provider_id,
    }));

  return {
    found: records.length > 0,
    date_of_birth_provided: dateOfBirth ?? null,
    upcoming_appointments: upcomingAppointments,
  };
};

// ─── submit_refill_request ──────────────────────────────────────────────────

const handleSubmitRefillRequest: ToolHandler = async ({ supabase, tenantId, callId, input }) => {
  const patientId = typeof input.patient_id === "string" ? input.patient_id : undefined;
  const medicationName = typeof input.medication_name === "string" ? input.medication_name : undefined;
  const pharmacyId = typeof input.pharmacy_id === "string" ? input.pharmacy_id : undefined;
  const patientPhone = typeof input.patient_phone === "string" ? input.patient_phone : "unknown";

  if (!patientId || !medicationName) {
    return { submitted: false, reason: "missing_required_fields" };
  }

  const { data, error } = await supabase
    .from("refill_requests")
    .insert({
      tenant_id: tenantId,
      call_id: callId,
      patient_name: patientId,
      patient_phone: patientPhone,
      medication_name: medicationName,
      pharmacy_name: pharmacyId ?? null,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return {
    submitted: true,
    request_id: data.id,
    medication_name: medicationName,
    status: "pending",
  };
};

// ─── verify_insurance ───────────────────────────────────────────────────────

const handleVerifyInsurance: ToolHandler = async ({ supabase, tenantId, callId, input }) => {
  const insuranceCarrier = typeof input.insurance_carrier === "string" ? input.insurance_carrier : undefined;
  const memberId = typeof input.member_id === "string" ? input.member_id : undefined;
  const groupNumber = typeof input.group_number === "string" ? input.group_number : null;
  const patientName = typeof input.patient_name === "string" ? input.patient_name : "unknown";
  const patientPhone = typeof input.patient_phone === "string" ? input.patient_phone : "unknown";

  if (!insuranceCarrier || !memberId) {
    return {
      verified: false,
      status: "invalid_input",
      message: "Insurance carrier and member ID are required to start verification.",
    };
  }

  // There is no real payer-connectivity integration yet — record the intake
  // for staff follow-up instead of fabricating a coverage answer, which
  // would be a real compliance/trust problem for a healthcare product.
  const { data, error } = await supabase
    .from("insurance_intakes")
    .insert({
      tenant_id: tenantId,
      call_id: callId,
      patient_name: patientName,
      patient_phone: patientPhone,
      insurance_provider: insuranceCarrier,
      policy_number: memberId,
      group_number: groupNumber,
      status: "pending",
    })
    .select("id")
    .single();

  if (error) throw new Error(error.message);

  return {
    verified: false,
    status: "pending_manual_review",
    intake_id: data.id,
    message: "Insurance details captured; our team will confirm coverage and follow up.",
  };
};

export const healthcareToolHandlers: ToolHandlerMap = {
  check_availability: handleCheckAvailability,
  book_appointment_slot: handleBookAppointmentSlot,
  cancel_appointment: handleCancelAppointment,
  get_patient_info: handleGetPatientInfo,
  submit_refill_request: handleSubmitRefillRequest,
  verify_insurance: handleVerifyInsurance,
};
