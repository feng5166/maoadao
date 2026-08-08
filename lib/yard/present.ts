// Yard 表现层第一刀（doc2.0/11 §十二 冻结的 12.6 管线）：
//
//   YardView（唯一动态事实输入）+ YardVisualConfig（纯表现配置，无世界写权）
//   → YardPresentationModel（语义合成：注意力中心 + 分层语义节点）→ Renderer
//
// CI 红线（tests/yard-present.test.ts）：
// - 任何 Cat/Object/Trace/Weather/Time 语义节点必须能回溯至 YardView（sourceRef）；
// - VisualConfig 只能改变怎么画，不能决定画什么事实（换 cfg 不变语义树）；
// - 同一 YardView → 相同 semantic render tree（动画相位不入模型——
//   12.1"同状态同语义画面"：确定的是语义与层级，不是像素）；
// - 表现可以读事实来表现它，不能凭表现新增事实：猫不在场，无任何猫形态微动；
// - 注意力中心由事实决定（12.2）：单猫→猫；双猫同物互动→这组互动本身；
//   无互动双猫→强行为猫；无猫有痕→痕迹与留物；无猫无痕→院子本身
//   （安静合法——第三种有效首屏状态，空院子不填 CTA）。

import type { YardView } from "./view";

// ---------- 纯表现配置（Static Canon 资产指向；永不携带世界语义） ----------
export interface YardVisualConfig {
  sceneKey: string; // Base 母场景资产键（房屋/树/门口/三槽位空间关系）
}
export const YARD_VISUAL: YardVisualConfig = { sceneKey: "yard" }; // public/scenes/yard.jpg（Base LOCK 2026-08-08）

// ---------- 语义模型 ----------
export type AttentionCenter =
  | { kind: "cat"; refs: [string] } // visit ref
  | { kind: "cat_interaction"; refs: string[] } // 共处同一物件的猫（v0 互动代理：同槽）
  | { kind: "traces"; refs: string[] } // 痕迹与留物（"有谁来过"是院子最重的悬念）
  | { kind: "yard"; refs: [] }; // 安静合法，不找补

export interface SemanticNode {
  layer: "weather" | "time" | "object" | "trace" | "cat";
  key: string; // 语义身份（同 YardView 必同 key）
  sourceRef: string; // 回溯 YardView 的事实引用（CI：逐一可回溯）
}

export interface MicroMotionSpec {
  kind: "cat_breath" | "cat_tail" | "rain_on_leaves" | "light_drift";
  /** 事实驱动源（回溯 ref）；null = 纯氛围，不携带任何事实语义 */
  drivenBy: string | null;
}

export interface YardPresentationModel {
  base: { sceneKey: string }; // Static Canon
  attention: AttentionCenter;
  nodes: SemanticNode[];
  micro: MicroMotionSpec[];
}

// ---------- 注意力中心（12.2：事实决定中心，表现负责让中心被看见） ----------
function attentionOf(view: YardView): AttentionCenter {
  const present = [...view.present].sort((a, b) => a.visitId.localeCompare(b.visitId));
  if (present.length >= 2) {
    // v0 互动代理：两只猫用同一个物件（挤一个垫子）——中心是这组互动本身
    const bySlot = new Map<string, string[]>();
    for (const p of present) if (p.slotKey) bySlot.set(p.slotKey, [...(bySlot.get(p.slotKey) ?? []), `visit:${p.visitId}`]);
    for (const refs of bySlot.values()) {
      if (refs.length >= 2) return { kind: "cat_interaction", refs };
    }
    // 无互动：强行为猫（正在用物件的 > 路过的）为中心
    const strong = present.find((p) => p.slotKey) ?? present[0];
    return { kind: "cat", refs: [`visit:${strong.visitId}`] };
  }
  if (present.length === 1) return { kind: "cat", refs: [`visit:${present[0].visitId}`] };

  const traceRefs = [
    ...view.traceMarks.map((t) => `visit:${t.visitId}`),
    ...view.records.filter((r) => r.left.leftText && !r.collected).map((r) => `visit:${r.visitId}`),
  ].sort();
  if (traceRefs.length > 0) return { kind: "traces", refs: traceRefs };

  return { kind: "yard", refs: [] };
}

// ---------- 语义合成 ----------
export function buildPresentation(view: YardView, cfg: YardVisualConfig): YardPresentationModel {
  const nodes: SemanticNode[] = [];

  nodes.push({ layer: "weather", key: view.weather, sourceRef: `weather:${view.dayKey}` });
  nodes.push({ layer: "time", key: `w${view.windowIndex}`, sourceRef: `window:${view.dayKey}:${view.windowIndex}` });
  for (const s of view.slots) {
    if (s.itemKey) nodes.push({ layer: "object", key: s.itemKey, sourceRef: `slot:${s.slotKey}` });
  }
  for (const t of [...view.traceMarks].sort((a, b) => a.visitId.localeCompare(b.visitId))) {
    nodes.push({ layer: "trace", key: t.traces[0] ?? "痕迹", sourceRef: `visit:${t.visitId}` });
  }
  // 未收的留物也是院里的事实（画在它发生的地方——收下动作贴着它）
  for (const r of [...view.records].filter((x) => x.left.leftText && !x.collected).sort((a, b) => a.visitId.localeCompare(b.visitId))) {
    nodes.push({ layer: "trace", key: `left:${r.left.leftText}`, sourceRef: `visit:${r.visitId}` });
  }
  for (const p of [...view.present].sort((a, b) => a.visitId.localeCompare(b.visitId))) {
    nodes.push({ layer: "cat", key: p.catId, sourceRef: `visit:${p.visitId}` });
  }

  // 微动：可由事实驱动，绝不新增事实（猫不在场 → 无猫形态微动，结构上不可能）
  const micro: MicroMotionSpec[] = [];
  for (const p of [...view.present].sort((a, b) => a.visitId.localeCompare(b.visitId))) {
    micro.push({ kind: "cat_breath", drivenBy: `visit:${p.visitId}` });
    micro.push({ kind: "cat_tail", drivenBy: `visit:${p.visitId}` });
  }
  if (view.weather === "雨") micro.push({ kind: "rain_on_leaves", drivenBy: `weather:${view.dayKey}` });
  micro.push({ kind: "light_drift", drivenBy: null }); // 纯氛围底噪：世界没停，但不撒谎

  return { base: { sceneKey: cfg.sceneKey }, attention: attentionOf(view), nodes, micro };
}
