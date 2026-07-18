import { describe, expect, it } from "vitest";
import { displayCounterparty } from "@/lib/calls/display";

/**
 * Regression guard for a bug visible on the live dashboard: the call list,
 * call detail and overview all rendered `caller_number`, which on an outbound
 * call is the business's OWN Twilio number. Under a column headed "Caller",
 * every outbound row showed Harbor House calling itself.
 */
describe("displayCounterparty", () => {
  it("shows who we called on an outbound call, not our own number", () => {
    expect(
      displayCounterparty({
        direction: "outbound",
        caller_number: "+19083390672",
        called_number: "+923313320944",
      }),
    ).toBe("+923313320944");
  });

  it("shows who called us on an inbound call", () => {
    expect(
      displayCounterparty({
        direction: "inbound",
        caller_number: "+13615548879",
        called_number: "+19083390672",
      }),
    ).toBe("+1 (361) 554-8879");
  });

  it("still renders browser test calls readably", () => {
    expect(
      displayCounterparty({
        direction: "inbound",
        caller_number: "client:browser-test-3d6a5826",
        called_number: "+19083390672",
      }),
    ).toBe("Browser test call");
  });

  it("falls back to the other end rather than showing a placeholder", () => {
    expect(
      displayCounterparty({
        direction: "outbound",
        caller_number: "+19083390672",
        called_number: null,
      }),
    ).toBe("+1 (908) 339-0672");
  });

  it("does not claim a caller when neither number is known", () => {
    expect(
      displayCounterparty({ direction: "inbound", caller_number: null, called_number: null }),
    ).toBe("Unknown caller");
  });
});
