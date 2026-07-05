import { describe, it, expect } from "vitest";
import {
  validateConfig,
  buildWaiverOrder,
  buildProvisionPlan,
  buildDefaultRankUpdates,
  type ProvisionConfig,
} from "./plan";

function cfg(over: Partial<ProvisionConfig> = {}): ProvisionConfig {
  return {
    league: { name: "WC Fantasy League", timezone: "America/New_York", draftPickSeconds: 90 },
    groupMatchdays: ["MD1", "MD2", "MD3"],
    knockoutRounds: [
      { label: "R32", cutCount: 2 },
      { label: "R16", cutCount: 2 },
      { label: "QF", cutCount: 1 },
      { label: "SF", cutCount: 1 },
      { label: "Final", cutCount: 1 },
    ],
    managers: [
      { email: "Alice@Example.com", displayName: "Alice", isCommissioner: true, draftSlot: 1 },
      { email: "bob@example.com", displayName: "Bob", draftSlot: 2 },
      { email: "carol@example.com", displayName: "Carol", draftSlot: 3 },
    ],
    extraAllowlist: ["spectator@example.com"],
    ...over,
  };
}

describe("validateConfig", () => {
  it("accepts a well-formed config", () => {
    expect(validateConfig(cfg())).toEqual([]);
  });

  it("rejects empty name / non-positive timer / no managers / no commissioner", () => {
    expect(
      validateConfig(cfg({ league: { name: "", timezone: "UTC", draftPickSeconds: 90 } })),
    ).toContainEqual(expect.stringMatching(/name/i));
    expect(
      validateConfig(cfg({ league: { name: "L", timezone: "UTC", draftPickSeconds: 0 } })),
    ).toContainEqual(expect.stringMatching(/draftPickSeconds/i));
    expect(validateConfig(cfg({ managers: [] }))).toContainEqual(expect.stringMatching(/manager/i));
    expect(
      validateConfig(cfg({ managers: [{ email: "a@b.com", displayName: "A", draftSlot: 1 }] })),
    ).toContainEqual(expect.stringMatching(/commissioner/i));
  });

  it("requires draft slots to be exactly 1..N (contiguous, unique)", () => {
    const dupSlot = cfg({
      managers: [
        { email: "a@b.com", displayName: "A", isCommissioner: true, draftSlot: 1 },
        { email: "c@d.com", displayName: "C", draftSlot: 1 },
      ],
    });
    expect(validateConfig(dupSlot)).toContainEqual(expect.stringMatching(/slot/i));

    const gap = cfg({
      managers: [
        { email: "a@b.com", displayName: "A", isCommissioner: true, draftSlot: 1 },
        { email: "c@d.com", displayName: "C", draftSlot: 3 },
      ],
    });
    expect(validateConfig(gap)).toContainEqual(expect.stringMatching(/slot/i));
  });

  it("rejects duplicate emails case-insensitively", () => {
    const dup = cfg({
      managers: [
        { email: "Sam@Example.com", displayName: "Sam", isCommissioner: true, draftSlot: 1 },
        { email: "sam@example.com", displayName: "Sam2", draftSlot: 2 },
      ],
    });
    expect(validateConfig(dup)).toContainEqual(expect.stringMatching(/email/i));
  });

  it("rejects knockout labels that drift from the canonical WC rounds (the transition upsert key)", () => {
    // "Round of 32" ≠ "R32": the group→playoff transition upserts cut_counts by these labels, so a drift
    // would silently create a parallel knockout period. Fail loud at provision time instead.
    const drift = cfg({
      knockoutRounds: [
        { label: "Round of 32", cutCount: 2 },
        { label: "R16", cutCount: 2 },
        { label: "QF", cutCount: 1 },
        { label: "SF", cutCount: 1 },
        { label: "Final", cutCount: 1 },
      ],
    });
    expect(validateConfig(drift)).toContainEqual(expect.stringMatching(/knockout round labels/i));
  });

  it("rejects a knockout set that is missing a round", () => {
    const missing = cfg({
      knockoutRounds: [
        { label: "R32", cutCount: 2 },
        { label: "R16", cutCount: 2 },
        { label: "QF", cutCount: 1 },
        { label: "SF", cutCount: 1 },
      ],
    });
    expect(validateConfig(missing)).toContainEqual(expect.stringMatching(/knockout round labels/i));
  });

  // PII write-guard (T15-14R §3b) — the provisioning upsert is the SOLE creator of manager rows,
  // and email-shaped displayNames in prod entered through this config verbatim. Reject them loud
  // at plan time (operator-authored, re-runnable) rather than silently persist PII.
  it("rejects an email-shaped displayName (the config-borne PII vector)", () => {
    const emailName = cfg({
      managers: [
        {
          email: "yader@example.com",
          displayName: "yader.rosales@gmail.com",
          isCommissioner: true,
          draftSlot: 1,
        },
        { email: "bob@example.com", displayName: "Bob", draftSlot: 2 },
      ],
    });
    expect(validateConfig(emailName)).toContainEqual(expect.stringMatching(/email-shaped/i));
  });

  it("rejects a displayName that equals the manager's own email", () => {
    const same = cfg({
      managers: [
        {
          email: "carol@example.com",
          displayName: "carol@example.com",
          isCommissioner: true,
          draftSlot: 1,
        },
      ],
    });
    expect(validateConfig(same)).toContainEqual(expect.stringMatching(/email-shaped/i));
  });

  it("still ALLOWS a stylized displayName that merely contains @ (n@cho)", () => {
    const stylized = cfg({
      managers: [
        { email: "nacho@example.com", displayName: "n@cho", isCommissioner: true, draftSlot: 1 },
      ],
    });
    expect(validateConfig(stylized)).toEqual([]);
  });
});

describe("buildWaiverOrder — reverse draft order", () => {
  it("gives the last drafter (highest slot) waiver priority 1", () => {
    const order = buildWaiverOrder([{ draftSlot: 1 }, { draftSlot: 2 }, { draftSlot: 3 }]);
    expect(order).toEqual({ 1: 3, 2: 2, 3: 1 }); // slot → waiverOrderPosition
  });
});

describe("buildProvisionPlan", () => {
  it("builds league + periods + managers (waiver order, normalized email) + allowlist", () => {
    const plan = buildProvisionPlan(cfg());

    // league: defaults from LEAGUE_SEED_DEFAULTS, status 'draft'
    expect(plan.league).toMatchObject({
      name: "WC Fantasy League",
      timezone: "America/New_York",
      draftPickSeconds: 90,
      seasonYear: 2026,
      resultFreezeHours: 6,
      status: "draft",
    });

    // periods: group matchdays then knockout rounds, kind + cutCount
    expect(plan.periods).toEqual([
      { kind: "group_md", label: "MD1", cutCount: null },
      { kind: "group_md", label: "MD2", cutCount: null },
      { kind: "group_md", label: "MD3", cutCount: null },
      { kind: "knockout_round", label: "R32", cutCount: 2 },
      { kind: "knockout_round", label: "R16", cutCount: 2 },
      { kind: "knockout_round", label: "QF", cutCount: 1 },
      { kind: "knockout_round", label: "SF", cutCount: 1 },
      { kind: "knockout_round", label: "Final", cutCount: 1 },
    ]);

    // managers: slot-ascending, normalized email, reverse-draft waiver order, default faab
    expect(plan.managers).toEqual([
      {
        email: "alice@example.com",
        displayName: "Alice",
        isCommissioner: true,
        draftSlot: 1,
        faabBudget: 100,
        waiverOrderPosition: 3,
      },
      {
        email: "bob@example.com",
        displayName: "Bob",
        isCommissioner: false,
        draftSlot: 2,
        faabBudget: 100,
        waiverOrderPosition: 2,
      },
      {
        email: "carol@example.com",
        displayName: "Carol",
        isCommissioner: false,
        draftSlot: 3,
        faabBudget: 100,
        waiverOrderPosition: 1,
      },
    ]);

    // allowlist: manager emails ∪ extras, normalized + deduped + sorted
    expect(plan.allowlist).toEqual([
      "alice@example.com",
      "bob@example.com",
      "carol@example.com",
      "spectator@example.com",
    ]);
  });
});

describe("buildDefaultRankUpdates", () => {
  it("assigns 1-based ranks in the given order", () => {
    expect(buildDefaultRankUpdates([10, 20, 30])).toEqual([
      { key: 10, defaultRank: 1 },
      { key: 20, defaultRank: 2 },
      { key: 30, defaultRank: 3 },
    ]);
  });
});
