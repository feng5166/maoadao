import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { YARD_VISUAL, buildPresentation, type YardVisualConfig } from "../lib/yard/present";
import type { YardView } from "../lib/yard/view";

// 11 §十二 冻结的 CI（12.6/12.7）：语义节点回溯 / VisualConfig 无世界写权 /
// 同状态同语义树 / 微动不撒谎 / 注意力中心五档 / 空院子安静合法。

function baseView(over: Partial<YardView> = {}): YardView {
  return {
    yardId: "yard-x",
    fish: 10,
    materials: [],
    weather: "晴",
    dayKey: "20260901",
    windowIndex: 4,
    slots: [
      { slotKey: "eaves", slotName: "屋檐下", itemKey: "cardboard_box", itemName: "纸箱", placedThisWindow: false },
      { slotKey: "tree", slotName: "老树旁", itemKey: null, itemName: null, placedThisWindow: false },
      { slotKey: "clearing", slotName: "空地中央", itemKey: null, itemName: null, placedThisWindow: false },
    ],
    ownedIdle: [],
    shop: [],
    present: [],
    records: [],
    traceMarks: [],
    ...over,
  };
}

const cat = (visitId: string, catId: string, slotKey: string | null) => ({
  visitId, catId, catName: "一只猫", behavior: "待着", slotKey,
});
const mark = (visitId: string) => ({
  visitId, dayKey: "20260901", windowIndex: 3, traces: ["落了一撮深黑色的毛"], left: { fish: 0, leftText: null }, collected: false,
});

describe("注意力中心五档（12.2：事实决定中心）", () => {
  it("单猫 → 这只猫", () => {
    const m = buildPresentation(baseView({ present: [cat("v1", "npc-mianhua", "eaves")] }), YARD_VISUAL);
    expect(m.attention).toEqual({ kind: "cat", refs: ["visit:v1"] });
  });

  it("双猫同物 → 这组互动本身（不强挑主角）", () => {
    const m = buildPresentation(
      baseView({ present: [cat("v1", "npc-mianhua", "eaves"), cat("v2", "npc-tangyuan", "eaves")] }),
      YARD_VISUAL,
    );
    expect(m.attention.kind).toBe("cat_interaction");
    expect(m.attention.refs).toEqual(["visit:v1", "visit:v2"]);
  });

  it("无互动双猫 → 强行为猫为中心（用物件的 > 路过的）", () => {
    const m = buildPresentation(
      baseView({ present: [cat("v1", "npc-mianhua", null), cat("v2", "npc-tangyuan", "eaves")] }),
      YARD_VISUAL,
    );
    expect(m.attention).toEqual({ kind: "cat", refs: ["visit:v2"] });
  });

  it("无猫有痕 → 痕迹与留物", () => {
    const m = buildPresentation(baseView({ traceMarks: [mark("v9")] }), YARD_VISUAL);
    expect(m.attention).toEqual({ kind: "traces", refs: ["visit:v9"] });
  });

  it("无猫无痕 → 院子本身（安静合法，模型里没有任何找补节点）", () => {
    const m = buildPresentation(baseView(), YARD_VISUAL);
    expect(m.attention).toEqual({ kind: "yard", refs: [] });
    // 空院子只剩天气/时段/已摆物件——没有 CTA/推荐/提示这类东西的存身之处
    expect(m.nodes.map((n) => n.layer).sort()).toEqual(["object", "time", "weather"]);
  });
});

describe("语义树纪律（12.1/12.6）", () => {
  it("回溯审计：所有动态语义节点的 sourceRef 都指向 YardView 里的事实", () => {
    const view = baseView({
      present: [cat("v1", "npc-mianhua", "eaves")],
      traceMarks: [mark("v9")],
    });
    const m = buildPresentation(view, YARD_VISUAL);
    const legalRefs = new Set<string>([
      `weather:${view.dayKey}`,
      `window:${view.dayKey}:${view.windowIndex}`,
      ...view.slots.filter((s) => s.itemKey).map((s) => `slot:${s.slotKey}`),
      ...view.present.map((p) => `visit:${p.visitId}`),
      ...view.traceMarks.map((t) => `visit:${t.visitId}`),
    ]);
    for (const n of m.nodes) expect(legalRefs.has(n.sourceRef), n.sourceRef).toBe(true);
    for (const mm of m.micro) if (mm.drivenBy) expect(legalRefs.has(mm.drivenBy), mm.drivenBy).toBe(true);
  });

  it("同一 YardView → 相同语义树（动画相位不入模型）", () => {
    const view = baseView({ present: [cat("v1", "npc-mianhua", "eaves")], traceMarks: [mark("v9")] });
    expect(JSON.stringify(buildPresentation(view, YARD_VISUAL))).toBe(JSON.stringify(buildPresentation(view, YARD_VISUAL)));
  });

  it("VisualConfig 只改怎么画：换 cfg 不变语义节点与注意力中心", () => {
    const view = baseView({ present: [cat("v1", "npc-mianhua", "eaves")] });
    const other: YardVisualConfig = { sceneKey: "another_scene" };
    const a = buildPresentation(view, YARD_VISUAL);
    const b = buildPresentation(view, other);
    expect(b.base.sceneKey).toBe("another_scene");
    expect(JSON.stringify(b.nodes)).toBe(JSON.stringify(a.nodes));
    expect(JSON.stringify(b.attention)).toBe(JSON.stringify(a.attention));
    expect(JSON.stringify(b.micro)).toBe(JSON.stringify(a.micro));
  });

  it("微动不撒谎：猫不在场时无任何猫形态微动；雨天才有雨反馈", () => {
    const quiet = buildPresentation(baseView(), YARD_VISUAL);
    expect(quiet.micro.filter((mm) => mm.kind.startsWith("cat_"))).toEqual([]);
    expect(quiet.micro.filter((mm) => mm.kind === "rain_on_leaves")).toEqual([]);
    const rainy = buildPresentation(baseView({ weather: "雨" }), YARD_VISUAL);
    expect(rainy.micro.some((mm) => mm.kind === "rain_on_leaves" && mm.drivenBy === "weather:20260901")).toBe(true);
    // 纯氛围底噪不携带事实语义
    for (const mm of rainy.micro.filter((x) => x.kind === "light_drift")) expect(mm.drivenBy).toBeNull();
  });
});

describe("静态看守", () => {
  it("present.ts 是纯表现层：不连库、不 import 命令/结算/信号", () => {
    const src = readFileSync("lib/yard/present.ts", "utf8");
    for (const banned of ["prisma", "./commands", "./settle", "./clues", "signals"]) {
      expect(src, banned).not.toContain(banned);
    }
  });
});
