import { describe, expect, it } from "vitest";
import { settleWindowPure, weatherOf, type SettleInput } from "../lib/yard/settle";
import { RULES_VERSION, WINDOWS } from "../lib/yard/config";
import { VISIT_POOL } from "../lib/yard/pool";
import { dayKeyOf, windowAt, windowLenMin, windowStart } from "../lib/yard/time";

// 结算确定性：整个 Gameplay Simulation 最基础的一条 CI（14 §九 评审指定）。
// 同一 yardId + Window + rulesVersion + placementSnapshot 重复结算，结果逐字段一致——
// "刷新不重 roll"从口号变成可执行断言。

const SNAPSHOT = [
  { slotKey: "eaves", itemKey: "cardboard_box" },
  { slotKey: "tree", itemKey: "old_cushion" },
  { slotKey: "clearing", itemKey: "water_basin" },
];

function input(overrides: Partial<SettleInput> = {}): SettleInput {
  return {
    yardId: "yard-fixed",
    dayKey: "20260807",
    windowIndex: 3,
    rulesVersion: RULES_VERSION,
    snapshot: SNAPSHOT,
    weather: "晴",
    ...overrides,
  };
}

describe("窗口结算确定性（核心 CI）", () => {
  it("同输入重复结算 100 次，结果逐字段一致", () => {
    const first = JSON.stringify(settleWindowPure(input()));
    for (let i = 0; i < 100; i++) {
      expect(JSON.stringify(settleWindowPure(input()))).toBe(first);
    }
  });

  it("跨窗跨日各结算 100 次，仍然逐次一致（含深夜长窗）", () => {
    for (const windowIndex of [0, 6, 11, 12]) {
      for (const dayKey of ["20260807", "20260819", "20261001"]) {
        const base = JSON.stringify(settleWindowPure(input({ dayKey, windowIndex })));
        for (let i = 0; i < 100; i++) {
          expect(JSON.stringify(settleWindowPure(input({ dayKey, windowIndex })))).toBe(base);
        }
      }
    }
  });

  it("规则版本变化 → 种子变化（历史事实锁版本的前提）", () => {
    const a = settleWindowPure(input());
    const b = settleWindowPure(input({ rulesVersion: "yard-vNEXT" }));
    expect(a.seed).not.toBe(b.seed);
  });

  it("不同院子/不同窗互不相同（种子含 yardId 与 windowIndex）", () => {
    const a = settleWindowPure(input());
    expect(settleWindowPure(input({ yardId: "yard-other" })).seed).not.toBe(a.seed);
    expect(settleWindowPure(input({ windowIndex: 4 })).seed).not.toBe(a.seed);
  });
});

describe("组合层与稀疏度（16/22 红线的干跑面）", () => {
  const OLD_SNAPSHOT = [...SNAPSHOT, { slotKey: "tree", itemKey: "old_crate" }]; // 含 old 标签：老怪的硬条件满足

  it("solitary 猫永不与他猫同窗（Composition 层）", () => {
    const solitaryIds = new Set(VISIT_POOL.filter((c) => c.solitary).map((c) => c.catId));
    expect(solitaryIds.size).toBeGreaterThan(0);
    for (let d = 1; d <= 60; d++) {
      const dayKey = `2027${String(100 + d).slice(1)}01`.slice(0, 8);
      for (const w of WINDOWS) {
        const r = settleWindowPure(input({ dayKey: `${dayKey}${d}`.slice(0, 8), windowIndex: w.index, yardId: `yard-${d}`, snapshot: OLD_SNAPSHOT }));
        if (r.visits.some((v) => solitaryIds.has(v.catId))) {
          expect(r.visits.length).toBe(1);
        }
        expect(r.visits.length).toBeLessThanOrEqual(2); // 每窗上限（22 §一）
      }
    }
  });

  it("YardWorldFacts 硬条件：院内无 old 物件，老怪永不出现（Eligibility=0）", () => {
    for (let d = 1; d <= 80; d++) {
      for (const w of [9, 10, 11, 12]) {
        const r = settleWindowPure(input({ dayKey: `202801${String(10 + (d % 20))}`.slice(0, 8), windowIndex: w, yardId: `yard-hc-${d}` }));
        expect(r.visits.some((v) => v.catId === "npc-laoguai")).toBe(false);
      }
    }
  });

  it("空布置也能合法结算（空窗合法：安静是质感）", () => {
    const r = settleWindowPure(input({ snapshot: [] }));
    expect(Array.isArray(r.visits)).toBe(true);
  });
});

describe("窗口时间轴（16 §三）", () => {
  it("13 窗/日，首尾覆盖 24 小时", () => {
    expect(WINDOWS.length).toBe(13);
    const total = WINDOWS.reduce((acc, w) => acc + (w.endMin - w.startMin), 0);
    expect(total).toBe(1440);
  });

  it("windowAt / windowStart 往返一致（北京时边界）", () => {
    // 北京时 06:00 整 = 第 0 窗起点
    const at0600 = new Date(Date.UTC(2026, 7, 7, 0, 0, 0) - 8 * 3600_000 + 6 * 3600_000);
    const w = windowAt(at0600);
    expect(w.windowIndex).toBe(0);
    expect(windowStart(w.dayKey, 0).getTime()).toBe(at0600.getTime());
    // 北京时 05:59 属深夜长窗
    const at0559 = new Date(at0600.getTime() - 60_000);
    expect(windowAt(at0559).windowIndex).toBe(12);
    expect(dayKeyOf(at0559)).toBe(w.dayKey);
    expect(windowLenMin(12)).toBe(360);
  });
});

describe("天气 v0（确定性派生）", () => {
  it("同日重复取值一致，且值域合法", () => {
    for (const dayKey of ["20260807", "20260808", "20260901"]) {
      const first = weatherOf(dayKey);
      expect(["晴", "阴", "雨"]).toContain(first);
      for (let i = 0; i < 20; i++) expect(weatherOf(dayKey)).toBe(first);
    }
  });
});
