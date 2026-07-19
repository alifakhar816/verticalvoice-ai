import { describe, expect, it } from "vitest";
import { computeCallCost } from "@/lib/calls/cost";

/**
 * The rates lived only in src/workers/call-normalizer, which nothing invokes,
 * so no real call was ever costed and every call detail page read "N/A".
 */
describe("computeCallCost", () => {
  it("returns null for an uncosted call rather than a misleading zero", () => {
    // $0.00 would read as a free call; null lets the UI say "Calculating…".
    expect(computeCallCost(null)).toBeNull();
    expect(computeCallCost(undefined)).toBeNull();
    expect(computeCallCost(0)).toBeNull();
    expect(computeCallCost(-5)).toBeNull();
  });

  it("costs a one-minute call at the published rates", () => {
    // 1.5 + 0.8 + 2.0 = 4.3 cents
    const cost = computeCallCost(60);
    expect(cost).not.toBeNull();
    expect(cost!.tts_cost).toBeCloseTo(0.015, 5);
    expect(cost!.telephony_cost).toBeCloseTo(0.008, 5);
    expect(cost!.llm_cost).toBeCloseTo(0.02, 5);
    expect(cost!.total_cost).toBeCloseTo(0.043, 5);
    expect(cost!.currency).toBe("USD");
  });

  it("scales with duration", () => {
    const oneMin = computeCallCost(60)!;
    const twoMin = computeCallCost(120)!;
    expect(twoMin.total_cost).toBeCloseTo(oneMin.total_cost * 2, 5);
  });

  it("costs the real 39s test call to a sane figure", () => {
    const cost = computeCallCost(39)!;
    expect(cost.total_cost).toBeGreaterThan(0);
    expect(cost.total_cost).toBeLessThan(0.05);
  });

  it("never reports stt separately, since we do not bill it", () => {
    expect(computeCallCost(120)!.stt_cost).toBe(0);
  });
});
