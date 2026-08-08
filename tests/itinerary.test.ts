import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { auditVisitAgainstItinerary, eligibilityAt, itineraryBlockAt, itineraryFor } from "../lib/sim/itinerary";
import { CANON } from "../lib/sim/profile";
import { RULES_VERSION, WINDOWS } from "../lib/yard/config";
import { settleWindowPure } from "../lib/yard/settle";
import { windowLenMin } from "../lib/yard/time";

// 行程派生器四条验收（14 §九 拍板）——全部 CI 化。

const DAYS = ["20260810", "20260811", "20260823", "20260901"];
const RICH_SNAPSHOT = [
  { slotKey: "eaves", itemKey: "cardboard_box" },
  { slotKey: "tree", itemKey: "old_crate" },
  { slotKey: "clearing", itemKey: "long_bench" },
];

describe("验收①：同 WorldDay + 同猫 + 同世界输入可重放一致", () => {
  it("全池 × 多日 × 13 窗，行程块 50 次重放逐字段一致", () => {
    for (const catId of Object.keys(CANON)) {
      for (const dayKey of DAYS.slice(0, 2)) {
        const base = JSON.stringify(itineraryFor(catId, dayKey, RULES_VERSION));
        for (let i = 0; i < 50; i++) {
          expect(JSON.stringify(itineraryFor(catId, dayKey, RULES_VERSION))).toBe(base);
        }
      }
    }
  });

  it("rulesVersion 变化 → 行程可以不同（世界输入计入种子）", () => {
    const a = JSON.stringify(itineraryFor("npc-mianhua", "20260810", RULES_VERSION));
    const b = JSON.stringify(itineraryFor("npc-mianhua", "20260810", "yard-vNEXT"));
    expect(a).not.toBe(b);
  });
});

describe("验收②：职务时间段不可离开", () => {
  it("职务猫在非自由窗 = on_duty，canLeave=false；自由窗照常可离开", () => {
    for (const catId of ["npc-xiaomei", "npc-qiuqiu", "npc-mantou", "npc-jiangjun", "npc-yantai"]) {
      for (const dayKey of DAYS) {
        for (const w of WINDOWS) {
          const block = itineraryBlockAt(catId, dayKey, RULES_VERSION, w.index);
          const el = eligibilityAt(catId, dayKey, RULES_VERSION, w.index, windowLenMin(w.index));
          if (!block.canLeave) {
            expect(el.eligible).toBe(false);
            expect(["on_duty", "resting"]).toContain(el.reasonCode);
          }
        }
      }
    }
    // 爆米花只有 8/9 窗可能自由，其余全天在报社（职务=时间约束的极端档）
    for (const w of WINDOWS) {
      if (w.index === 8 || w.index === 9) continue;
      const block = itineraryBlockAt("npc-xiaomei", "20260810", RULES_VERSION, w.index);
      expect(block.canLeave).toBe(false);
      expect(block.area).toBe("报社");
    }
  });
});

describe("验收③：可达性审计抓时间重叠与瞬移", () => {
  it("干跑全窗：每个产出的 CatVisit 都过行程审计（无重叠、无瞬移）", () => {
    for (const dayKey of DAYS) {
      for (const w of WINDOWS) {
        const r = settleWindowPure({ yardId: `yard-a-${dayKey}`, dayKey, windowIndex: w.index, rulesVersion: RULES_VERSION, snapshot: RICH_SNAPSHOT, weather: "晴" });
        for (const v of r.visits) {
          const audit = auditVisitAgainstItinerary(v.catId, dayKey, RULES_VERSION, w.index, v.arriveMin, windowLenMin(w.index));
          expect(audit).toEqual({ ok: true });
        }
      }
    }
  });

  it("负例：走不开的时段伪造来访 → overlap；早于最早可达 → teleport", () => {
    // 爆米花第 0 窗在报社值班——伪造一条来访必须被抓
    const overlap = auditVisitAgainstItinerary("npc-xiaomei", "20260810", RULES_VERSION, 0, 30, windowLenMin(0));
    expect(overlap.ok).toBe(false);
    expect(overlap.violation).toBe("overlap_unleavable");
    // 找一只自由窗猫，取其最早可达，再伪造一个更早的到达
    outer: for (const dayKey of DAYS) {
      for (const w of WINDOWS) {
        const el = eligibilityAt("npc-laoguai", dayKey, RULES_VERSION, w.index, windowLenMin(w.index));
        if (el.eligible && el.earliestArriveMin > 0) {
          const tp = auditVisitAgainstItinerary("npc-laoguai", dayKey, RULES_VERSION, w.index, el.earliestArriveMin - 1, windowLenMin(w.index));
          expect(tp.ok).toBe(false);
          expect(tp.violation).toBe("teleport_too_early");
          break outer;
        }
      }
    }
  });
});

describe("验收④：结算与叙事共用同一事实源", () => {
  it("结算内的 Eligibility 判定 = 独立重算的 eligibilityAt（同一函数同一事实）", () => {
    for (const dayKey of DAYS.slice(0, 2)) {
      for (const w of WINDOWS) {
        const r = settleWindowPure({ yardId: `yard-b-${dayKey}`, dayKey, windowIndex: w.index, rulesVersion: RULES_VERSION, snapshot: RICH_SNAPSHOT, weather: "晴" });
        for (const v of r.visits) {
          // 出现过的猫，独立重算必然 eligible（行程块即 itineraryFor 的同一块）
          const el = eligibilityAt(v.catId, dayKey, RULES_VERSION, w.index, windowLenMin(w.index));
          expect(el.eligible).toBe(true);
          const block = itineraryFor(v.catId, dayKey, RULES_VERSION)[w.index];
          expect(block.canLeave).toBe(true);
          expect(block.area).toBe(el.area);
        }
      }
    }
  });

  it("行程派生器不读偏好/affinity/用户数据（01 禁读清单，静态看守）", () => {
    const src = readFileSync("lib/sim/itinerary.ts", "utf8");
    for (const banned of ["corePreference", "Affinity", "fish", "yardAccess", "userId"]) {
      expect(src).not.toContain(banned);
    }
  });
});
