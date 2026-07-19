import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database/types";

// The shared dial path is mocked: these tests are about the dialer's DECISIONS
// (who gets called, who doesn't, what happens when a call fails), not about
// Twilio or Ultravox. `place-outbound-call` is exercised by the outbound route.
const placeOutboundCallForTenant = vi.fn();
vi.mock("@/lib/calls/place-outbound-call", () => ({
  placeOutboundCallForTenant: (...args: unknown[]) => placeOutboundCallForTenant(...args),
}));

const { runCampaignDialerTick } = await import("@/lib/campaigns/dialer");

// ---------------------------------------------------------------------------
// A minimal in-memory stand-in for the PostgREST client.
//
// Written rather than hand-stubbed per test because the dialer's correctness is
// mostly about which ROW ends up in which STATE, and asserting that against
// real stored rows is far more convincing than asserting that some mock was
// called with some object.
// ---------------------------------------------------------------------------

type Row = Record<string, unknown>;
interface Store {
  campaigns: Row[];
  campaign_targets: Row[];
  contacts: Row[];
  calls: Row[];
  business_profiles: Row[];
  policy_settings: Row[];
  audit_events: Row[];
}

interface Filter {
  op: "eq" | "in" | "gte";
  col: string;
  val: unknown;
}

function matches(row: Row, filters: Filter[]): boolean {
  return filters.every((f) => {
    const value = row[f.col];
    if (f.op === "eq") return value === f.val;
    if (f.op === "in") return (f.val as unknown[]).includes(value);
    if (f.op === "gte") return String(value) >= String(f.val);
    return true;
  });
}

interface QueryResult {
  data: unknown;
  error: null;
  count: number | null;
}

class Query implements PromiseLike<QueryResult> {
  private filters: Filter[] = [];
  private mode: "select" | "update" | "insert" = "select";
  private payload: Row | Row[] | null = null;
  private wantCount = false;
  private head = false;
  private limitN: number | null = null;

  constructor(private store: Store, private table: keyof Store) {}

  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.wantCount = true;
    if (opts?.head) this.head = true;
    return this;
  }
  update(patch: Row) {
    this.mode = "update";
    this.payload = patch;
    return this;
  }
  insert(rows: Row | Row[]) {
    this.mode = "insert";
    this.payload = rows;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ op: "eq", col, val });
    return this;
  }
  in(col: string, val: unknown[]) {
    this.filters.push({ op: "in", col, val });
    return this;
  }
  gte(col: string, val: unknown) {
    this.filters.push({ op: "gte", col, val });
    return this;
  }
  order() {
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }

  private run(): QueryResult {
    const table = this.store[this.table];

    if (this.mode === "insert") {
      const rows = Array.isArray(this.payload) ? this.payload : [this.payload as Row];
      table.push(...rows);
      return { data: rows, error: null, count: rows.length };
    }

    let hits = table.filter((r) => matches(r, this.filters));

    if (this.mode === "update") {
      for (const row of hits) Object.assign(row, this.payload);
      return { data: hits, error: null, count: hits.length };
    }

    if (this.limitN !== null) hits = hits.slice(0, this.limitN);
    return {
      data: this.head ? null : hits,
      error: null,
      count: this.wantCount ? hits.length : null,
    };
  }

  maybeSingle() {
    const { data } = this.run();
    const rows = (data ?? []) as Row[];
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }
  single() {
    const { data } = this.run();
    const rows = (data ?? []) as Row[];
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }
  then<R1, R2 = never>(
    onfulfilled?: ((v: QueryResult) => R1 | PromiseLike<R1>) | null,
    onrejected?: ((r: unknown) => R2 | PromiseLike<R2>) | null
  ): PromiseLike<R1 | R2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

function makeAdmin(store: Store) {
  return {
    from: (table: keyof Store) => new Query(store, table),
    // Mirrors the real claim function's contract: flips due 'queued' rows to
    // 'dialing' and returns them, without touching `attempts`.
    rpc: (name: string, args: Record<string, unknown>) => {
      if (name === "release_stale_campaign_targets") {
        return Promise.resolve({ data: 0, error: null });
      }
      if (name === "claim_campaign_targets") {
        const nowIso = new Date().toISOString();
        const due = store.campaign_targets
          .filter(
            (t) =>
              t.campaign_id === args.p_campaign_id &&
              t.state === "queued" &&
              (t.next_attempt_at == null || String(t.next_attempt_at) <= nowIso)
          )
          .slice(0, Number(args.p_limit));
        for (const t of due) {
          t.state = "dialing";
          t.last_attempt_at = nowIso;
        }
        return Promise.resolve({ data: due, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    },
  } as unknown as SupabaseClient<Database>;
}

const CAMPAIGN_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_ID = "22222222-2222-2222-2222-222222222222";

function makeStore(overrides: Partial<Store> = {}): Store {
  return {
    campaigns: [
      {
        id: CAMPAIGN_ID,
        tenant_id: TENANT_ID,
        name: "Test campaign",
        call_type_id: "reminder",
        status: "running",
        max_concurrent_calls: 5,
        calls_per_minute: 5,
        // Wide open by default so window logic doesn't interfere with tests
        // that are about something else. Window behaviour has its own tests.
        calling_window_start: "00:00",
        calling_window_end: "23:59",
        max_attempts: 3,
        retry_delay_minutes: 60,
        variables: {},
        created_at: "2026-07-01T00:00:00.000Z",
      },
    ],
    campaign_targets: [],
    contacts: [],
    calls: [],
    business_profiles: [{ tenant_id: TENANT_ID, timezone: "America/New_York" }],
    // Nulls mean "unconfigured", which resolves to the conservative defaults
    // (3/day, 10/week) — the same thing a real tenant who never touched the
    // setting gets.
    policy_settings: [
      { tenant_id: TENANT_ID, max_calls_per_day: null, max_calls_per_week: null },
    ],
    audit_events: [],
    ...overrides,
  };
}

function target(overrides: Row = {}): Row {
  return {
    id: "aaaaaaaa-0000-0000-0000-000000000001",
    campaign_id: CAMPAIGN_ID,
    contact_id: null,
    phone: "+12125550100",
    state: "queued",
    attempts: 0,
    last_attempt_at: null,
    next_attempt_at: null,
    call_id: null,
    failure_reason: null,
    variables: {},
    created_at: "2026-07-01T00:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  placeOutboundCallForTenant.mockReset();
  placeOutboundCallForTenant.mockResolvedValue({
    ok: true,
    call: { id: "cccccccc-0000-0000-0000-000000000001" },
  });
});

describe("campaign dialer — do-not-call enforcement", () => {
  it("marks a contact opted out at DIAL time and never dials them", async () => {
    // The contact was queued while callable and flagged do-not-call afterwards,
    // which is exactly the case a build-time-only check would miss.
    const store = makeStore({
      campaign_targets: [target({ contact_id: "dddddddd-0000-0000-0000-000000000001" })],
      contacts: [
        {
          id: "dddddddd-0000-0000-0000-000000000001",
          tenant_id: TENANT_ID,
          phone: "+12125550100",
          do_not_call: true,
        },
      ],
    });

    const result = await runCampaignDialerTick(makeAdmin(store));

    expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
    expect(result.optedOut).toBe(1);
    expect(result.dialed).toBe(0);
    expect(store.campaign_targets[0].state).toBe("opted_out");
  });

  it("catches do-not-call by phone even when the target has no contact_id", async () => {
    const store = makeStore({
      campaign_targets: [target({ contact_id: null })],
      contacts: [
        {
          id: "dddddddd-0000-0000-0000-000000000002",
          tenant_id: TENANT_ID,
          phone: "+12125550100",
          do_not_call: true,
        },
      ],
    });

    await runCampaignDialerTick(makeAdmin(store));

    expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
    expect(store.campaign_targets[0].state).toBe("opted_out");
  });

  it("never retries an opted-out target — it is terminal, not a failure", async () => {
    const store = makeStore({
      campaign_targets: [target()],
      contacts: [
        {
          id: "dddddddd-0000-0000-0000-000000000003",
          tenant_id: TENANT_ID,
          phone: "+12125550100",
          do_not_call: true,
        },
      ],
    });

    await runCampaignDialerTick(makeAdmin(store));
    // No backoff scheduled and no attempt charged: nothing will pick it up again.
    expect(store.campaign_targets[0].state).toBe("opted_out");
    expect(store.campaign_targets[0].next_attempt_at).toBeNull();
    expect(store.campaign_targets[0].attempts).toBe(0);

    await runCampaignDialerTick(makeAdmin(store));
    expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
  });

  it("treats a do_not_call verdict from the shared dial path as terminal too", async () => {
    // Simulates the contact opting out in the moment between our check and the
    // dial. The dial path is the last line of defence and it fired.
    placeOutboundCallForTenant.mockResolvedValue({
      ok: false,
      code: "do_not_call",
      status: 403,
      error: "This number is marked do-not-call in your contacts.",
    });
    const store = makeStore({ campaign_targets: [target()] });

    const result = await runCampaignDialerTick(makeAdmin(store));

    expect(result.optedOut).toBe(1);
    expect(store.campaign_targets[0].state).toBe("opted_out");
    expect(store.campaign_targets[0].attempts).toBe(0);
  });
});

describe("campaign dialer — campaign status", () => {
  it("does not dial a paused campaign", async () => {
    const store = makeStore({ campaign_targets: [target()] });
    store.campaigns[0].status = "paused";

    const result = await runCampaignDialerTick(makeAdmin(store));

    expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
    expect(result.campaignsConsidered).toBe(0);
    expect(store.campaign_targets[0].state).toBe("queued");
  });

  it("does not dial a cancelled, draft or completed campaign", async () => {
    for (const status of ["cancelled", "draft", "completed"]) {
      placeOutboundCallForTenant.mockClear();
      const store = makeStore({ campaign_targets: [target()] });
      store.campaigns[0].status = status;
      await runCampaignDialerTick(makeAdmin(store));
      expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
    }
  });
});

describe("campaign dialer — calling window", () => {
  it("will not dial a west-coast number at 06:00 their time", async () => {
    // 13:00 UTC = 09:00 New York (tenant, in window) but 06:00 Los Angeles.
    // The window must follow the CALLEE, so this target is deferred.
    const store = makeStore({ campaign_targets: [target({ phone: "+14155550100" })] });
    store.campaigns[0].calling_window_start = "09:00";
    store.campaigns[0].calling_window_end = "20:00";

    const result = await runCampaignDialerTick(makeAdmin(store), {
      now: new Date("2026-07-19T13:00:00Z"),
    });

    expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
    expect(result.deferred).toBe(1);
    const row = store.campaign_targets[0];
    expect(row.state).toBe("queued");
    // Parked on the next opening rather than re-checked every minute all night.
    expect(row.next_attempt_at).toBeTruthy();
    expect(new Date(String(row.next_attempt_at)).getTime()).toBeGreaterThan(
      new Date("2026-07-19T13:00:00Z").getTime()
    );
    // And no attempt was burned for merely being asleep.
    expect(row.attempts).toBe(0);
  });

  it("dials an east-coast number at the same instant", async () => {
    const store = makeStore({ campaign_targets: [target({ phone: "+12125550100" })] });
    store.campaigns[0].calling_window_start = "09:00";
    store.campaigns[0].calling_window_end = "20:00";

    const result = await runCampaignDialerTick(makeAdmin(store), {
      now: new Date("2026-07-19T13:00:00Z"),
    });

    expect(placeOutboundCallForTenant).toHaveBeenCalledTimes(1);
    expect(result.dialed).toBe(1);
    expect(store.campaign_targets[0].state).toBe("done");
  });
});

describe("campaign dialer — retry, backoff and give-up", () => {
  it("increments attempts and schedules a backoff after a failed dial", async () => {
    placeOutboundCallForTenant.mockResolvedValue({
      ok: false,
      code: "twilio_failed",
      status: 502,
      error: "no-answer",
    });
    const store = makeStore({ campaign_targets: [target({ attempts: 0 })] });
    const now = new Date("2026-07-19T15:00:00Z");

    await runCampaignDialerTick(makeAdmin(store), { now });

    const row = store.campaign_targets[0];
    expect(row.state).toBe("queued");
    expect(row.attempts).toBe(1);
    expect(row.failure_reason).toBe("no-answer");
    // retry_delay_minutes is 60, first retry is 1x that.
    expect(new Date(String(row.next_attempt_at)).getTime()).toBe(now.getTime() + 60 * 60_000);
  });

  it("gives up at max_attempts and stops scheduling", async () => {
    placeOutboundCallForTenant.mockResolvedValue({
      ok: false,
      code: "twilio_failed",
      status: 502,
      error: "busy",
    });
    // max_attempts is 3 and this target has already used 2.
    const store = makeStore({ campaign_targets: [target({ attempts: 2 })] });

    const result = await runCampaignDialerTick(makeAdmin(store), {
      now: new Date("2026-07-19T15:00:00Z"),
    });

    const row = store.campaign_targets[0];
    expect(row.state).toBe("failed");
    expect(row.attempts).toBe(3);
    expect(row.next_attempt_at).toBeNull();
    expect(result.failed).toBe(1);
  });

  it("does not pick up a target whose backoff has not elapsed", async () => {
    const store = makeStore({
      campaign_targets: [target({ attempts: 1, next_attempt_at: "2099-01-01T00:00:00.000Z" })],
    });

    const result = await runCampaignDialerTick(makeAdmin(store));

    expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
    expect(result.claimed).toBe(0);
    expect(store.campaign_targets[0].state).toBe("queued");
  });

  it("skips (does not retry) a target the call type has no variables for", async () => {
    placeOutboundCallForTenant.mockResolvedValue({
      ok: false,
      code: "missing_variables",
      status: 400,
      error: "Missing required variables: appointment_time",
    });
    const store = makeStore({ campaign_targets: [target()] });

    await runCampaignDialerTick(makeAdmin(store));

    // Retrying cannot conjure a missing value, so attempts are not burned.
    expect(store.campaign_targets[0].state).toBe("skipped");
    expect(store.campaign_targets[0].attempts).toBe(0);
  });

  it("returns a target unharmed when the CAMPAIGN is misconfigured", async () => {
    // Outbound disabled is not this person's fault; charging them an attempt
    // would march the whole list to 'failed' over one settings mistake.
    placeOutboundCallForTenant.mockResolvedValue({
      ok: false,
      code: "outbound_disabled",
      status: 403,
      error: "Outbound calling is not enabled for this tenant.",
    });
    const store = makeStore({
      campaign_targets: [
        target({ id: "aaaaaaaa-0000-0000-0000-000000000001" }),
        target({ id: "aaaaaaaa-0000-0000-0000-000000000002", phone: "+12125550101" }),
      ],
    });

    await runCampaignDialerTick(makeAdmin(store));

    // First target requeued untouched, and the tick stopped rather than
    // burning the second one too.
    expect(store.campaign_targets[0].state).toBe("queued");
    expect(store.campaign_targets[0].attempts).toBe(0);
    expect(placeOutboundCallForTenant).toHaveBeenCalledTimes(1);
  });
});

describe("campaign dialer — pacing caps", () => {
  function manyTargets(n: number): Row[] {
    return Array.from({ length: n }, (_, i) =>
      target({
        id: `aaaaaaaa-0000-0000-0000-00000000000${i}`,
        phone: `+1212555010${i}`,
      })
    );
  }

  it("dials no more than calls_per_minute in one tick", async () => {
    const store = makeStore({ campaign_targets: manyTargets(8) });
    store.campaigns[0].calls_per_minute = 2;
    store.campaigns[0].max_concurrent_calls = 50;

    const result = await runCampaignDialerTick(makeAdmin(store));

    expect(result.claimed).toBe(2);
    expect(placeOutboundCallForTenant).toHaveBeenCalledTimes(2);
  });

  it("respects max_concurrent_calls, counting the tenant's live calls", async () => {
    const store = makeStore({ campaign_targets: manyTargets(8) });
    store.campaigns[0].max_concurrent_calls = 3;
    store.campaigns[0].calls_per_minute = 50;
    // Two calls already up for this tenant leaves headroom for one.
    store.calls = [
      {
        id: "c1",
        tenant_id: TENANT_ID,
        status: "in_progress",
        direction: "outbound",
        started_at: "2020-01-01T00:00:00.000Z",
      },
      {
        id: "c2",
        tenant_id: TENANT_ID,
        status: "ringing",
        direction: "inbound",
        started_at: "2020-01-01T00:00:00.000Z",
      },
    ];

    const result = await runCampaignDialerTick(makeAdmin(store));

    expect(result.claimed).toBe(1);
    expect(placeOutboundCallForTenant).toHaveBeenCalledTimes(1);
  });

  it("claims nothing at all when already at capacity", async () => {
    const store = makeStore({ campaign_targets: manyTargets(5) });
    store.campaigns[0].max_concurrent_calls = 1;
    store.calls = [
      {
        id: "c1",
        tenant_id: TENANT_ID,
        status: "in_progress",
        direction: "outbound",
        started_at: "2020-01-01T00:00:00.000Z",
      },
    ];

    const result = await runCampaignDialerTick(makeAdmin(store));

    // Crucially the rows stay 'queued' — claiming work we cannot do would
    // strand them in 'dialing' until the stale sweep charged them an attempt.
    expect(result.claimed).toBe(0);
    expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
    expect(store.campaign_targets.every((t) => t.state === "queued")).toBe(true);
  });
});

describe("campaign dialer — completion", () => {
  it("marks a campaign completed once no work remains", async () => {
    const store = makeStore({ campaign_targets: [target()] });

    await runCampaignDialerTick(makeAdmin(store));

    expect(store.campaign_targets[0].state).toBe("done");
    expect(store.campaigns[0].status).toBe("completed");
    expect(store.campaigns[0].completed_at).toBeTruthy();
  });

  it("leaves a campaign running while targets are still queued", async () => {
    const store = makeStore({
      campaign_targets: [
        target({ id: "aaaaaaaa-0000-0000-0000-000000000001" }),
        target({ id: "aaaaaaaa-0000-0000-0000-000000000002", phone: "+12125550101" }),
      ],
    });
    store.campaigns[0].calls_per_minute = 1;

    await runCampaignDialerTick(makeAdmin(store));

    expect(store.campaigns[0].status).toBe("running");
  });
});

describe("campaign dialer — per-person frequency caps", () => {
  const NOW = new Date("2026-07-19T15:00:00.000Z");
  const HOUR = 60 * 60 * 1000;

  /** A completed outbound dial to `to`, `n` hours before NOW. */
  function priorDial(n: number, overrides: Row = {}): Row {
    return {
      id: `call-${n}-${Math.random()}`,
      tenant_id: TENANT_ID,
      direction: "outbound",
      status: "completed",
      caller_number: "+13615550199", // the tenant's own line
      called_number: "+12125550100", // the person
      started_at: new Date(NOW.getTime() - n * HOUR).toISOString(),
      ...overrides,
    };
  }

  it("dials when the person is under the daily limit", async () => {
    // Two prior calls against a default cap of three: still callable.
    const store = makeStore({
      campaign_targets: [target()],
      calls: [priorDial(2), priorDial(6)],
    });

    const result = await runCampaignDialerTick(makeAdmin(store), { now: NOW });

    expect(placeOutboundCallForTenant).toHaveBeenCalledTimes(1);
    expect(result.dialed).toBe(1);
  });

  it("defers — does not fail — the person at the limit", async () => {
    // This person is not uninterested. We have simply rung them enough today.
    const store = makeStore({
      campaign_targets: [target()],
      calls: [priorDial(2), priorDial(6), priorDial(10)],
    });

    const result = await runCampaignDialerTick(makeAdmin(store), { now: NOW });

    expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
    expect(result.deferred).toBe(1);
    expect(result.failed).toBe(0);
    expect(result.dialed).toBe(0);

    const row = store.campaign_targets[0];
    // Retryable later, not terminal.
    expect(row.state).toBe("queued");
    expect(row.failure_reason).toBeNull();
    // And crucially: no attempt burned. Being called too often is OUR doing,
    // and it must not consume the attempts this person is owed.
    expect(row.attempts).toBe(0);
    // Parked on the roll-off rather than re-examined every minute.
    expect(new Date(String(row.next_attempt_at)).getTime()).toBe(
      NOW.getTime() - 10 * HOUR + 24 * HOUR,
    );
  });

  it("counts across ALL campaigns, not just this one", async () => {
    // The whole point of the cap: three campaigns each politely limited to
    // three attempts is nine calls to one human. These prior dials carry no
    // campaign id at all — they are simply calls this tenant placed.
    const store = makeStore({
      campaign_targets: [target()],
      calls: [priorDial(1), priorDial(2), priorDial(3)],
    });

    await runCampaignDialerTick(makeAdmin(store), { now: NOW });

    expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
  });

  it("rolls the window off — yesterday's calls stop counting", async () => {
    // Three calls, all older than 24h. The rolling window is empty again, so
    // this person is callable. A calendar-day cap would also allow this; the
    // test below is the one that separates them.
    const store = makeStore({
      campaign_targets: [target()],
      calls: [priorDial(26), priorDial(30), priorDial(36)],
    });

    const result = await runCampaignDialerTick(makeAdmin(store), { now: NOW });

    expect(result.dialed).toBe(1);
  });

  it("does not reset at midnight the way a calendar-day cap would", async () => {
    // Three calls in the last four hours that happen to straddle local
    // midnight. A calendar-day cap resets and dials; a rolling one does not.
    const store = makeStore({
      campaign_targets: [target()],
      calls: [priorDial(1), priorDial(2), priorDial(4)],
    });

    await runCampaignDialerTick(makeAdmin(store), {
      now: new Date("2026-07-20T04:30:00.000Z"), // 00:30 in New York
    });

    expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
  });

  it("is tenant-scoped — another tenant's calls to the same number don't count", async () => {
    // Numbers are not globally unique to a tenant, and one tenant's dialling
    // history must never suppress another's.
    const store = makeStore({
      campaign_targets: [target()],
      calls: [
        priorDial(1, { tenant_id: "99999999-9999-9999-9999-999999999999" }),
        priorDial(2, { tenant_id: "99999999-9999-9999-9999-999999999999" }),
        priorDial(3, { tenant_id: "99999999-9999-9999-9999-999999999999" }),
      ],
    });

    const result = await runCampaignDialerTick(makeAdmin(store), { now: NOW });

    expect(result.dialed).toBe(1);
  });

  it("counts called_number, not caller_number, for outbound", async () => {
    // For direction='outbound' the counterparty is `called_number`;
    // `caller_number` is the tenant's own line. Reading the wrong column would
    // count every campaign call the tenant ever placed against one person.
    const store = makeStore({
      campaign_targets: [target({ phone: "+12125550100" })],
      calls: [
        priorDial(1, { called_number: "+15555550001", caller_number: "+12125550100" }),
        priorDial(2, { called_number: "+15555550002", caller_number: "+12125550100" }),
        priorDial(3, { called_number: "+15555550003", caller_number: "+12125550100" }),
      ],
    });

    const result = await runCampaignDialerTick(makeAdmin(store), { now: NOW });

    // Those three went to three OTHER people. This person is callable.
    expect(result.dialed).toBe(1);
  });

  it("ignores inbound calls — the person ringing US is not us ringing them", async () => {
    const store = makeStore({
      campaign_targets: [target()],
      calls: [
        priorDial(1, { direction: "inbound" }),
        priorDial(2, { direction: "inbound" }),
        priorDial(3, { direction: "inbound" }),
      ],
    });

    const result = await runCampaignDialerTick(makeAdmin(store), { now: NOW });

    expect(result.dialed).toBe(1);
  });

  it("honours a tenant's stricter configured cap", async () => {
    const store = makeStore({
      campaign_targets: [target()],
      calls: [priorDial(3)],
    });
    store.policy_settings[0].max_calls_per_day = 1;

    const result = await runCampaignDialerTick(makeAdmin(store), { now: NOW });

    expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
    expect(result.deferred).toBe(1);
    expect(store.campaign_targets[0].attempts).toBe(0);
  });

  it("honours a tenant's more permissive configured cap", async () => {
    const store = makeStore({
      campaign_targets: [target()],
      calls: [priorDial(2), priorDial(6), priorDial(10)],
    });
    store.policy_settings[0].max_calls_per_day = 5;

    const result = await runCampaignDialerTick(makeAdmin(store), { now: NOW });

    expect(result.dialed).toBe(1);
  });

  it("applies the default cap when the tenant has no policy row at all", async () => {
    // A missing row must not read as "no limit".
    const store = makeStore({
      campaign_targets: [target()],
      calls: [priorDial(2), priorDial(6), priorDial(10)],
      policy_settings: [],
    });

    const result = await runCampaignDialerTick(makeAdmin(store), { now: NOW });

    expect(placeOutboundCallForTenant).not.toHaveBeenCalled();
    expect(result.deferred).toBe(1);
  });

  it("leaves the campaign running rather than completing it on a deferral", async () => {
    // A deferred person is unfinished work. Completing the campaign here would
    // strand them permanently.
    const store = makeStore({
      campaign_targets: [target()],
      calls: [priorDial(2), priorDial(6), priorDial(10)],
    });

    await runCampaignDialerTick(makeAdmin(store), { now: NOW });

    expect(store.campaigns[0].status).toBe("running");
  });
});
