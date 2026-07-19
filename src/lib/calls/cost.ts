/**
 * Per-call cost estimation.
 *
 * These rates previously lived only inside `src/workers/call-normalizer`, a
 * worker nothing ever invokes — so no real call was ever costed and every call
 * detail page showed "N/A" under Cost. Seeded demo calls looked fine only
 * because the seed inserted cost rows directly.
 *
 * Estimated from duration rather than billed amounts: Twilio reports its price
 * with a lag and Ultravox does not expose per-call spend, so waiting for
 * authoritative numbers would mean showing nothing for most of a call's life.
 * An estimate labelled as such beats a blank.
 */

/** Cents per minute, by component. */
export const RATE_VOICE_CENTS_PER_MIN = 1.5;
export const RATE_TELEPHONY_CENTS_PER_MIN = 0.8;
export const RATE_LLM_CENTS_PER_MIN = 2.0;

export interface CallCost {
  /** Dollars, matching the numeric columns on `call_costs`. */
  telephony_cost: number;
  stt_cost: number;
  tts_cost: number;
  llm_cost: number;
  total_cost: number;
  currency: "USD";
}

function dollars(cents: number): number {
  // Keep sub-cent precision. A short call costs a fraction of a cent per
  // component, so rounding to whole cents here would round most calls to zero
  // and stop the parts summing to the total.
  return Math.round((cents / 100) * 1e6) / 1e6;
}

/**
 * Costs a call from its duration. Returns null when duration is unknown or
 * non-positive, so callers can distinguish "not costed yet" from "$0.00" —
 * a zero would read as a free call rather than a missing measurement.
 */
export function computeCallCost(durationSeconds: number | null | undefined): CallCost | null {
  if (durationSeconds == null || durationSeconds <= 0) return null;

  const minutes = durationSeconds / 60;
  const tts = minutes * RATE_VOICE_CENTS_PER_MIN;
  const telephony = minutes * RATE_TELEPHONY_CENTS_PER_MIN;
  const llm = minutes * RATE_LLM_CENTS_PER_MIN;

  return {
    telephony_cost: dollars(telephony),
    stt_cost: 0,
    tts_cost: dollars(tts),
    llm_cost: dollars(llm),
    // Summed in cents before rounding, so the parts always add up to the total.
    total_cost: dollars(telephony + tts + llm),
    currency: "USD",
  };
}
