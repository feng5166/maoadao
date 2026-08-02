import { describe, expect, it } from "vitest";
import { runDay } from "../lib/sim/engine";
import { COMMISSIONS } from "../lib/sim/commissions";
import { NPC_CATS } from "../lib/sim/npcs";
import type { SimCat, SimCatState, SimRelationship, SimThread, WorldSnapshot } from "../lib/sim/types";

// NPC 委托：只给用户猫、需要交情、首周让位给旧钥匙主线、次日必兑现、同一件不重派。

const USER_CAT = "cat-test";

function makeWorld(overrides: Partial<WorldSnapshot> & { threads: SimThread[]; relationships: SimRelationship[]; day: number }): WorldSnapshot {
  const cats: SimCat[] = [
    ...NPC_CATS.map((n) => ({
      id: n.id, name: n.name, isNpc: true, role: n.role,
      boldness: n.boldness, sociability: n.sociability, diligence: n.diligence, personaTags: n.personaTags,
    })),
    { id: USER_CAT, name: "煤球", isNpc: false, boldness: 50, sociability: 50, diligence: 50, personaTags: ["好奇"] },
  ];
  const states = new Map<string, SimCatState>(
    cats.map((c) => [c.id, { coins: 50, energy: 100, mood: "平静", location: "自家小屋" }]),
  );
  return {
    day: overrides.day,
    season: "夏",
    weather: "晴",
    cats,
    states,
    relationships: overrides.relationships,
    threads: overrides.threads,
    lastUsedDay: new Map(),
    recentBadOutcomes: new Map(),
    suggestions: overrides.suggestions,
  };
}

/** 与所有委托 NPC 都有交情 */
function friendlyRels(): SimRelationship[] {
  return COMMISSIONS.map((c) => ({ catAId: USER_CAT, catBId: c.npcId, affinity: 40, kind: "friend" as const }));
}

/** 跑若干天，直到用户猫收到委托 */
function runUntilCommission(maxDays: number, threads: SimThread[] = []) {
  const rels = friendlyRels();
  for (let day = 1; day <= maxDays; day++) {
    const result = runDay(makeWorld({ day, relationships: rels, threads }));
    const letter = result.facts.find((f) => f.catId === USER_CAT && f.type === "npc_commission");
    if (letter) return { day, letter, result };
  }
  return null;
}

describe("NPC 委托", () => {
  it("有交情的用户猫几天内会收到委托，且带两个选项", () => {
    const hit = runUntilCommission(12);
    expect(hit).not.toBeNull();
    const choices = hit!.letter.data.choices as { value: string; label: string }[];
    expect(choices).toHaveLength(2);
    // 选项值必须能通过 saveNudge 的 story: 白名单
    for (const c of choices) expect(c.value).toMatch(/^story:[a-z_]+$/);
    expect(String(hit!.letter.data.scene).length).toBeGreaterThan(20);
  });

  it("委托只发给用户猫，不发给 NPC", () => {
    const rels = [
      ...friendlyRels(),
      ...COMMISSIONS.map((c) => ({ catAId: "npc-juzi", catBId: c.npcId, affinity: 40, kind: "friend" as const })),
    ];
    for (let day = 1; day <= 12; day++) {
      const result = runDay(makeWorld({ day, relationships: rels, threads: [] }));
      expect(result.facts.filter((f) => f.type === "npc_commission" && f.catId !== USER_CAT)).toHaveLength(0);
    }
  });

  it("旧钥匙主线还没完结时不派委托（首周不撞车）", () => {
    const keyThread: SimThread = {
      id: "th-key", key: "arrival_key", catId: USER_CAT, step: 2, status: "active",
      data: {}, startDay: 1, lastAdvanceDay: 1,
    };
    const rels = friendlyRels();
    for (let day = 1; day <= 12; day++) {
      const result = runDay(makeWorld({ day, relationships: rels, threads: [keyThread] }));
      expect(result.facts.filter((f) => f.catId === USER_CAT && f.type === "npc_commission")).toHaveLength(0);
    }
  });

  it("主人选了哪个，第二天就按哪个兑现", () => {
    const hit = runUntilCommission(12)!;
    const nt = hit.result.newThreads.find((t) => t.key === "commission")!;
    const commission = COMMISSIONS.find((c) => c.key === nt.data.commissionKey)!;
    const choice = commission.choices[1].value; // 挑第二个选项
    const thread: SimThread = {
      id: "th-c", key: "commission", catId: USER_CAT, step: 1, status: "active",
      data: nt.data, startDay: hit.day, lastAdvanceDay: hit.day,
    };
    const next = runDay(
      makeWorld({
        day: hit.day + 1,
        relationships: friendlyRels(),
        threads: [thread],
        suggestions: new Map([[USER_CAT, choice]]),
      }),
    );
    const done = next.facts.find((f) => f.catId === USER_CAT && f.type === "commission_done");
    expect(done).toBeDefined();
    expect(done!.data.nudged).toBe(true);
    expect(done!.data.scene).toBe(commission.outcomes[choice](false).scene);
    // 事件线落幕，不会再被派一次
    expect(next.threadUpdates.some((t) => t.threadId === "th-c" && t.status === "resolved")).toBe(true);
  });

  it("主人没选也会办，走性格兜底", () => {
    const hit = runUntilCommission(12)!;
    const nt = hit.result.newThreads.find((t) => t.key === "commission")!;
    const commission = COMMISSIONS.find((c) => c.key === nt.data.commissionKey)!;
    const thread: SimThread = {
      id: "th-c", key: "commission", catId: USER_CAT, step: 1, status: "active",
      data: nt.data, startDay: hit.day, lastAdvanceDay: hit.day,
    };
    const next = runDay(makeWorld({ day: hit.day + 1, relationships: friendlyRels(), threads: [thread] }));
    const done = next.facts.find((f) => f.catId === USER_CAT && f.type === "commission_done");
    expect(done).toBeDefined();
    expect(done!.data.nudged).toBe(false);
    expect(done!.data.scene).toBe(commission.fallback(false).scene);
  });

  it("同一件委托不会派第二次", () => {
    const hit = runUntilCommission(12)!;
    const nt = hit.result.newThreads.find((t) => t.key === "commission")!;
    const resolved: SimThread = {
      id: "th-done", key: "commission", catId: USER_CAT, step: 2, status: "resolved",
      data: nt.data, startDay: hit.day, lastAdvanceDay: hit.day + 1,
    };
    for (let day = hit.day + 2; day <= hit.day + 14; day++) {
      const result = runDay(makeWorld({ day, relationships: friendlyRels(), threads: [resolved] }));
      const letter = result.facts.find((f) => f.catId === USER_CAT && f.type === "npc_commission");
      if (letter) expect(letter.data.commission).not.toBe(nt.data.commissionKey);
    }
  });

  it("没有交情就不会有猫来托事", () => {
    for (let day = 1; day <= 12; day++) {
      const result = runDay(makeWorld({ day, relationships: [], threads: [] }));
      expect(result.facts.filter((f) => f.type === "npc_commission")).toHaveLength(0);
    }
  });
});
