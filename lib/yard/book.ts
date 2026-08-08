// 岛猫册最小条目（doc2.0/18 认知镜像的第一次落码）。
//
// 第一原则（18 冻结）：**岛猫册记录的是你的认知，不是世界的百科**——
// 条目全部由本用户的 Observation 派生（同一只猫在不同人的册子里不一样）；
// 抄数据库（用户从未观察过却已在册）= P0（认知镜像审计）。
//
// 三种认知状态（评审拍板：不做"16 个猫卡片列表"）：
//   已确认的猫（LIVE/RECORD 观察过）
//   疑似 / 传闻中的猫（世界给过线索——供给=Director 线索投放器，下一格；本层先立结构）
//   尚未归因的证据（TRACE 观察聚成证据簇——与普通收集游戏拉开差异的地方）
//
// 归因红线（18 冻结）：认知层不得用隐藏 catId 替用户完成归因——
// 证据簇按**可见特征**（毛色痕 × 时段带）聚合，聚合逻辑不读 catId；
// EvidenceClusterView 在类型层就没有身份字段；不做自动 resolve（"我猜是同一只"
// 的用户动作后置）。

import { prisma } from "../db";
import { CLUE_SUPPLY } from "./config";

export interface ConfirmedCatEntry {
  catId: string;
  name: string;
  firstSeenDayKey: string;
  lastSeenDayKey: string;
  seenBand: "来过一次" | "来过几次" | "常客"; // 世界语言呈现（18：精确计数不露）
  behaviorsSeen: string[]; // 只含你亲眼所见（认知镜像）
  tracesSeen: string[];
}
export interface RumorEntry {
  id: string;
  text: string;
  heardDayKey: string;
}
/** 证据簇视图：类型层无 catId/catName（18 归因红线 + 06 §九 TraceView） */
export interface EvidenceClusterView {
  clusterKey: string;
  band: "夜里" | "白天";
  traits: string[]; // 可见特征（毛色痕/物件痕），可推理不点名
  countBand: "一次" | "不止一次";
  firstDayKey: string;
  lastDayKey: string;
}
export interface CatBook {
  confirmedCount: number; // "已认识 N 只"= 经历总结，合法（18）
  confirmed: ConfirmedCatEntry[];
  rumors: RumorEntry[];
  evidence: EvidenceClusterView[];
}

export const bandOf = (windowIndex: number): "夜里" | "白天" => (windowIndex >= 10 || windowIndex === 12 ? "夜里" : "白天");
const FUR_MARK = "毛"; // 毛色痕识别（trace 文本约定，pool.furTrace 产出）
/** 簇的可见特征键（clues.ts 与本文件同键——传闻要接得上用户已经在追的那团未知） */
export const furKeyOf = (traces: string[]): string => traces.find((t) => t.includes(FUR_MARK)) ?? "没留下毛";

interface EvidenceItem {
  visitId: string;
  windowIndex: number;
  dayKey: string;
  traces: string[];
}

/** 纯函数：证据聚簇——只读可见特征，永不读 catId（可单测） */
export function clusterEvidence(items: EvidenceItem[]): EvidenceClusterView[] {
  const map = new Map<string, { band: "夜里" | "白天"; traits: Set<string>; days: string[]; count: number }>();
  for (const it of items) {
    const band = bandOf(it.windowIndex);
    const fur = furKeyOf(it.traces);
    const key = `${band}|${fur}`;
    const cur = map.get(key) ?? { band, traits: new Set<string>(), days: [], count: 0 };
    for (const t of it.traces) cur.traits.add(t);
    cur.days.push(it.dayKey);
    cur.count += 1;
    map.set(key, cur);
  }
  return [...map.entries()].map(([clusterKey, c]) => {
    const days = c.days.sort();
    return {
      clusterKey,
      band: c.band,
      traits: [...c.traits],
      countBand: c.count > 1 ? "不止一次" : "一次",
      firstDayKey: days[0],
      lastDayKey: days[days.length - 1],
    } as EvidenceClusterView;
  }).sort((a, b) => a.clusterKey.localeCompare(b.clusterKey));
}

const arr = (x: unknown): string[] => (Array.isArray(x) ? (x as string[]) : []);

export async function buildCatBook(userId: string): Promise<CatBook> {
  const obs = await prisma.observation.findMany({
    where: { viewerId: userId },
    include: { visit: true },
    orderBy: { observedAt: "asc" },
  });

  // 已确认：LIVE / RECORD 观察过的猫（TRACE 不确认——错过合法，A01 #14）
  const confirmedVisits = obs.filter((o) => o.type === "LIVE" || o.type === "RECORD");
  const byCat = new Map<string, typeof confirmedVisits>();
  for (const o of confirmedVisits) {
    const list = byCat.get(o.visit.catId) ?? [];
    list.push(o);
    byCat.set(o.visit.catId, list);
  }
  const names = byCat.size > 0
    ? new Map((await prisma.cat.findMany({ where: { id: { in: [...byCat.keys()] } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]))
    : new Map<string, string>();

  const confirmed: ConfirmedCatEntry[] = [...byCat.entries()].map(([catId, os]) => {
    const days = os.map((o) => o.visit.dayKey).sort();
    const behaviors = [...new Set(os.flatMap((o) => arr(o.visit.behaviors)))];
    const traces = [...new Set(os.flatMap((o) => arr(o.visit.traces)))];
    const n = new Set(os.map((o) => o.visit.id)).size;
    return {
      catId,
      name: names.get(catId) ?? "一只猫",
      firstSeenDayKey: days[0],
      lastSeenDayKey: days[days.length - 1],
      seenBand: (n >= 5 ? "常客" : n >= 2 ? "来过几次" : "来过一次") as ConfirmedCatEntry["seenBand"],
      behaviorsSeen: behaviors,
      tracesSeen: traces,
    };
  }).sort((a, b) => a.firstSeenDayKey.localeCompare(b.firstSeenDayKey));

  // 尚未归因的证据：TRACE 观察 → 按可见特征聚簇（不读 catId）
  const traceObs = obs.filter((o) => o.type === "TRACE");
  const evidence = clusterEvidence(traceObs.map((o) => ({
    visitId: o.visit.id,
    windowIndex: o.visit.windowIndex,
    dayKey: o.visit.dayKey,
    traces: arr(o.visit.traces),
  })));

  // 传闻：由线索投放器落库的 RumorSighting 回显（lib/yard/clues.ts）——
  // 只读 text/dayKey；sourceRefs（世界层溯源）与 clueKey（内含内部 id）
  // 永不进入认知层视图，条目 id 用不透明行 id（CI：泄漏审计）
  const sightings = await prisma.rumorSighting.findMany({
    where: { userId },
    orderBy: { heardAt: "desc" },
    take: CLUE_SUPPLY.rumorPageSize,
  });
  const rumors: RumorEntry[] = sightings.map((r) => ({ id: r.id, text: r.text, heardDayKey: r.dayKey }));

  return { confirmedCount: confirmed.length, confirmed, rumors, evidence };
}
