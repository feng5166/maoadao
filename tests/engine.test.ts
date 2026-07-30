import { describe, expect, it } from "vitest";
import { runDay } from "../lib/sim/engine";
import { NPC_CATS } from "../lib/sim/npcs";
import type { SimCat, SimCatState, SimRelationship, SimThread, WorldSnapshot } from "../lib/sim/types";

function makeCats(): SimCat[] {
  return NPC_CATS.map((n) => ({
    id: n.id,
    name: n.name,
    isNpc: true,
    role: n.role,
    boldness: n.boldness,
    sociability: n.sociability,
    diligence: n.diligence,
    personaTags: n.personaTags,
  }));
}

/** 内存态跑 N 天，返回终态与全部事实 */
function simulate(days: number) {
  const cats = makeCats();
  const states = new Map<string, SimCatState>(
    cats.map((c) => [c.id, { coins: 50, energy: 100, mood: "平静", location: "自家小屋" }]),
  );
  const relationships: SimRelationship[] = [];
  const threads: SimThread[] = [];
  const lastUsedDay = new Map<string, number>();
  let recentBadOutcomes = new Map<string, number>();
  let seq = 0;
  const allFacts = [];
  const mainTypesByCatDay = new Map<string, string>();

  for (let day = 1; day <= days; day++) {
    const world: WorldSnapshot = {
      day,
      season: "夏",
      weather: ["晴", "晴", "多云", "雨"][day % 4],
      cats,
      states,
      relationships,
      threads,
      lastUsedDay,
      recentBadOutcomes,
    };
    const result = runDay(world);
    for (const [catId, st] of result.stateChanges) states.set(catId, st);
    for (const ac of result.affinityChanges) {
      const rel = relationships.find(
        (r) => (r.catAId === ac.catAId && r.catBId === ac.catBId) || (r.catAId === ac.catBId && r.catBId === ac.catAId),
      );
      if (rel) rel.affinity = Math.max(-100, Math.min(100, rel.affinity + ac.delta));
      else relationships.push({ catAId: ac.catAId, catBId: ac.catBId, affinity: ac.delta, kind: "acquaintance" });
    }
    const pendingIdMap = new Map<string, string>();
    for (const nt of result.newThreads) {
      const id = `th-${++seq}`;
      pendingIdMap.set(`pending:${nt.key}:${nt.catId}`, id);
      threads.push({ id, key: nt.key, catId: nt.catId, step: nt.step, status: "active", data: { ...nt.data }, startDay: nt.startDay, lastAdvanceDay: nt.startDay });
    }
    for (const tu of result.threadUpdates) {
      const id = pendingIdMap.get(tu.threadId) ?? tu.threadId;
      const t = threads.find((x) => x.id === id);
      if (!t) continue;
      if (tu.step !== undefined) t.step = tu.step;
      if (tu.status) t.status = tu.status;
      if (tu.data) t.data = { ...tu.data };
      if (tu.lastAdvanceDay !== undefined) t.lastAdvanceDay = tu.lastAdvanceDay;
    }
    for (const f of result.facts) lastUsedDay.set(`${f.catId}:${f.type}`, day);
    recentBadOutcomes = new Map(
      cats.map((c) => [c.id, result.facts.filter((f) => f.catId === c.id && (f.outcome === "fail" || f.outcome === "complication")).length]),
    );
    allFacts.push(...result.facts);
    for (const [catId, idx] of result.mainFactIndexByCat) {
      mainTypesByCatDay.set(`${catId}:${day}`, result.facts[idx].type);
    }
  }
  return { states, allFacts, mainTypesByCatDay, cats };
}

describe("模拟引擎不变量", () => {
  it("30 天内鱼币和体力永不越界", () => {
    const { states, allFacts } = simulate(30);
    expect(allFacts.length).toBeGreaterThan(500);
    for (const st of states.values()) {
      expect(st.coins).toBeGreaterThanOrEqual(0);
      expect(st.energy).toBeGreaterThanOrEqual(0);
      expect(st.energy).toBeLessThanOrEqual(100);
    }
  });

  it("同一天同种子完全可复现（确定性）", () => {
    const a = simulate(5);
    const b = simulate(5);
    expect(a.allFacts.length).toBe(b.allFacts.length);
    expect(JSON.stringify(a.allFacts)).toBe(JSON.stringify(b.allFacts));
  });

  it("主事件连续两天同类型比例低于 30%（抗重复红线）", () => {
    const { mainTypesByCatDay, cats } = simulate(30);
    let repeats = 0;
    let pairs = 0;
    for (const cat of cats) {
      for (let d = 2; d <= 30; d++) {
        const a = mainTypesByCatDay.get(`${cat.id}:${d - 1}`);
        const b = mainTypesByCatDay.get(`${cat.id}:${d}`);
        if (a && b) {
          pairs++;
          if (a === b) repeats++;
        }
      }
    }
    expect(repeats / Math.max(1, pairs)).toBeLessThan(0.3);
  });

  it("每天每猫每时段最多 1 主行动 + 1 社交", () => {
    const { allFacts, cats } = simulate(10);
    for (const cat of cats) {
      for (let d = 1; d <= 10; d++) {
        for (const seg of ["morning", "afternoon", "evening"]) {
          const n = allFacts.filter((f) => f.catId === cat.id && f.day === d && f.segment === seg && f.type !== "shop_day" && f.type !== "debt_collect").length;
          expect(n).toBeLessThanOrEqual(2);
        }
      }
    }
  });
});
