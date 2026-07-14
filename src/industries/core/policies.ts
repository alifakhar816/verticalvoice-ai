import type {
  IndustryId,
  PolicyCondition,
  PolicyDefinition,
  PolicySeverity,
} from "@/industries/core/industry-pack";

// ─── Policy Context & Decision ────────────────────────────────────────────────

export interface PolicyContext {
  industryId: IndustryId;
  tenantId: string;
  callId: string;
  intentId: string;
  callerPhone?: string;
  callerVerified: boolean;
  callRecordingConsent?: boolean;
  region?: string;
  currentTime: Date;
  customFields: Record<string, string | number | boolean>;
}

export interface PolicyDecision {
  allowed: boolean;
  reason: string;
  policyId: string;
  severity: PolicySeverity;
  regulation?: string;
  timestamp: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function defaultAllow(policyId: string): PolicyDecision {
  return {
    allowed: true,
    reason: "no_policy_defined",
    policyId,
    severity: "log",
    timestamp: new Date().toISOString(),
  };
}

/**
 * Resolve a dotted field path against the PolicyContext.
 * Supports top-level fields, nested `customFields.*`, and derived fields
 * like `currentTime.hour` and `currentTime.dayOfWeek`.
 */
function resolveField(
  context: PolicyContext,
  field: string,
): string | number | boolean | undefined {
  // Derived time fields
  if (field === "currentTime.hour") {
    return context.currentTime.getHours();
  }
  if (field === "currentTime.dayOfWeek") {
    return context.currentTime.getDay(); // 0 = Sunday
  }

  // Custom fields namespace
  if (field.startsWith("customFields.")) {
    const key = field.slice("customFields.".length);
    return context.customFields[key];
  }

  // Top-level context fields
  const top = field as keyof PolicyContext;
  const value = context[top];

  if (value === undefined || value === null) return undefined;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") return undefined; // customFields object itself
  return value as string | number | boolean;
}

/**
 * Evaluate a single PolicyCondition against the context.
 */
function evaluateCondition(
  context: PolicyContext,
  condition: PolicyCondition,
): boolean {
  const actual = resolveField(context, condition.field);
  const expected = condition.value;

  switch (condition.operator) {
    case "eq":
      return actual === expected;

    case "neq":
      return actual !== expected;

    case "in":
      if (Array.isArray(expected)) {
        return expected.includes(actual as string);
      }
      return false;

    case "not_in":
      if (Array.isArray(expected)) {
        return !expected.includes(actual as string);
      }
      return true;

    case "gt":
      return typeof actual === "number" && typeof expected === "number"
        ? actual > expected
        : false;

    case "lt":
      return typeof actual === "number" && typeof expected === "number"
        ? actual < expected
        : false;

    case "gte":
      return typeof actual === "number" && typeof expected === "number"
        ? actual >= expected
        : false;

    case "lte":
      return typeof actual === "number" && typeof expected === "number"
        ? actual <= expected
        : false;

    case "exists":
      return actual !== undefined;

    case "not_exists":
      return actual === undefined;

    case "matches":
      if (typeof actual === "string" && typeof expected === "string") {
        try {
          return new RegExp(expected).test(actual);
        } catch {
          return false;
        }
      }
      return false;

    default:
      return false;
  }
}

// ─── Generic Policy Evaluation ────────────────────────────────────────────────

/**
 * Evaluate a single PolicyDefinition against the context.
 * All conditions must pass for the policy's action to take effect.
 */
export function evaluatePolicy(
  context: PolicyContext,
  policy: PolicyDefinition,
): PolicyDecision {
  const allConditionsMet = policy.conditions.every((c) =>
    evaluateCondition(context, c),
  );

  // When conditions are met, the policy's action applies
  if (allConditionsMet) {
    const allowed = policy.action === "allow";
    return {
      allowed,
      reason: policy.reason,
      policyId: policy.id,
      severity: policy.severity,
      regulation: policy.regulation,
      timestamp: new Date().toISOString(),
    };
  }

  // Conditions not met: the policy does not trigger.
  // For "deny" policies, not triggering means the action is allowed.
  // For "allow" policies, not triggering means the action is denied.
  const allowed = policy.action !== "allow";
  return {
    allowed,
    reason: allowed
      ? `policy_conditions_not_met:${policy.id}`
      : `required_conditions_not_met:${policy.id}`,
    policyId: policy.id,
    severity: policy.severity,
    regulation: policy.regulation,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Evaluate all policies and return every decision.
 */
export function evaluateAllPolicies(
  context: PolicyContext,
  policies: PolicyDefinition[],
): PolicyDecision[] {
  return policies.map((p) => evaluatePolicy(context, p));
}

// ─── Domain-Specific Policy Checks ───────────────────────────────────────────

function findPoliciesByIdPattern(
  policies: PolicyDefinition[],
  pattern: string,
): PolicyDefinition[] {
  return policies.filter((p) => p.id.includes(pattern));
}

/**
 * Most restrictive wins: if any matching policy denies, the overall result
 * is denied. If no policies match the pattern, returns a default allow.
 */
function evaluateMatchingPolicies(
  context: PolicyContext,
  policies: PolicyDefinition[],
  pattern: string,
  fallbackPolicyId: string,
): PolicyDecision {
  const matched = findPoliciesByIdPattern(policies, pattern);

  if (matched.length === 0) {
    return defaultAllow(fallbackPolicyId);
  }

  const decisions = matched.map((p) => evaluatePolicy(context, p));
  const denied = decisions.find((d) => !d.allowed);
  return denied ?? decisions[0];
}

/**
 * Check whether an outbound call is allowed based on time-of-day,
 * region restrictions, and consent requirements.
 */
export function canStartOutboundCall(
  context: PolicyContext,
  policies: PolicyDefinition[],
): PolicyDecision {
  return evaluateMatchingPolicies(
    context,
    policies,
    "outbound_call",
    "outbound_call_default",
  );
}

/**
 * Check whether recording is permitted.
 * Evaluates consent and regional recording-consent laws.
 */
export function canRecordCall(
  context: PolicyContext,
  policies: PolicyDefinition[],
): PolicyDecision {
  return evaluateMatchingPolicies(
    context,
    policies,
    "call_recording",
    "call_recording_default",
  );
}

/**
 * Healthcare: check whether patient information can be disclosed.
 * Requires caller verification and HIPAA compliance policies.
 */
export function canDisclosePatientInformation(
  context: PolicyContext,
  policies: PolicyDefinition[],
): PolicyDecision {
  return evaluateMatchingPolicies(
    context,
    policies,
    "patient_disclosure",
    "patient_disclosure_default",
  );
}

/**
 * Restaurant: check whether an allergen statement can be provided.
 * Verifies that allergen data is available and current.
 */
export function canProvideAllergenStatement(
  context: PolicyContext,
  policies: PolicyDefinition[],
): PolicyDecision {
  return evaluateMatchingPolicies(
    context,
    policies,
    "allergen_statement",
    "allergen_statement_default",
  );
}

/**
 * Real estate: check fair housing compliance before answering
 * listing-related questions.
 */
export function canAnswerListingQuestion(
  context: PolicyContext,
  policies: PolicyDefinition[],
): PolicyDecision {
  return evaluateMatchingPolicies(
    context,
    policies,
    "listing_question",
    "listing_question_default",
  );
}

/**
 * Check whether a booking can be created given business hours,
 * capacity constraints, and other operational policies.
 */
export function canCreateBooking(
  context: PolicyContext,
  policies: PolicyDefinition[],
): PolicyDecision {
  return evaluateMatchingPolicies(
    context,
    policies,
    "create_booking",
    "create_booking_default",
  );
}

/**
 * Check whether a call can be transferred to a human agent,
 * considering transfer limits and agent availability.
 */
export function canTransferToHuman(
  context: PolicyContext,
  policies: PolicyDefinition[],
): PolicyDecision {
  return evaluateMatchingPolicies(
    context,
    policies,
    "transfer_human",
    "transfer_human_default",
  );
}
