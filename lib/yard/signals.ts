// D1–D5 Signal 推导（doc2.0/20 双层模型的落码）。
//
// 四条实现约束（20 §四，全部 CI 看守）：
// - 零新增行为埋点：Signal 全部由领域事实推导——Placement / WindowSettlement /
//   Observation / RumorSighting / CatVisit.collectedAt / OwnedItem(purchase) /
//   SurfaceView（18 翻册面，观测层事实）。Domain Truth → Signal Derivation →
//   Analytics 单向（02 §九 冻结）：不得为了分析需求反向制造领域事实；
// - 离线可重放：deriveSignalsPure 纯函数，同事实流两次推导结果一致；
//   StageSignal 表只是快照缓存（logicVersion 版本化，定义修订后全量重算）；
// - 旗标永不反写世界：本文件不被 settle/itinerary/clues/view 引用（静态看守）——
//   没有"按学习进度调难度"这种东西；
// - Reached 不落库：Reached Dx = D1..Dx SIGNAL 全部在场（事件可乱序，认知不跳级），
//   由 Signal 派生随时可算。
//
// D5 为 v0 代理口径（组合逻辑版本化，升级即 bump + 全量重算）：
// 翻册当日随后发生布置变更，重复 ≥N 天——"围绕同一目标"的精确口径
// 待 18 渐懂层（per-cat 条目面）落地后升级。阈值全部登记在 config.SIGNALS（22）。

import { prisma } from "../db";
import { SIGNALS } from "./config";
import { dayKeyOf } from "./time";

export const SIGNALS_VERSION = "signals-v0.1.0";

export type SignalKey =
  | "first_item_placed"
  | "first_wait_completed"
  | "first_visit_result_observed"
  | "observed_multiple_outcomes"
  | "unknown_or_rumor_seen"
  | "collection_surface_seen"
  | "subsequent_placement_change"
  | "resource_collected"
  | "first_autonomous_sink"
  | "new_item_placed"
  | "targeted_adjustment";

export interface SignalHit {
  signal: SignalKey;
  firstAt: Date;
  sourceRef: string;
}

/** Dx → 所需 Signal 组合（20 §二 正典；D6/D7 先埋不判） */
export const STAGE_SIGNALS: Record<"D1" | "D2" | "D3" | "D4" | "D5", SignalKey[]> = {
  D1: ["first_item_placed", "first_wait_completed", "first_visit_result_observed"],
  D2: ["observed_multiple_outcomes"],
  D3: ["unknown_or_rumor_seen", "collection_surface_seen", "subsequent_placement_change"],
  D4: ["resource_collected", "first_autonomous_sink", "new_item_placed"],
  D5: ["targeted_adjustment"],
};

// ---------- 事实束（推导的全部输入；字段即可读边界） ----------
export interface FactBundle {
  placements: Array<{ id: string; itemKey: string; placedAt: Date; removedAt: Date | null }>;
  settlements: Array<{ id: string; settledAt: Date; snapshotCount: number }>;
  observations: Array<{ id: string; observedAt: Date; type: string; catId: string; visibility: string }>;
  rumors: Array<{ id: string; heardAt: Date }>;
  collectedVisits: Array<{ id: string; collectedAt: Date }>; // 只含真有留物的
  purchases: Array<{ id: string; itemKey: string; acquiredAt: Date }>;
  surfaceViews: Array<{ surface: string; dayKey: string; firstAt: Date }>;
}

const first = <T>(xs: T[], at: (x: T) => Date): T | undefined =>
  xs.length === 0 ? undefined : xs.reduce((a, b) => (at(a) <= at(b) ? a : b));

/** 纯推导：同事实束必同输出（重放一致性 CI） */
export function deriveSignalsPure(f: FactBundle): SignalHit[] {
  const hits: SignalHit[] = [];
  const put = (signal: SignalKey, firstAt: Date | undefined, sourceRef: string | undefined) => {
    if (firstAt && sourceRef) hits.push({ signal, firstAt, sourceRef });
  };

  // D1：摆过 / 等过一个窗 / 观察过任意档次的结果
  const p0 = first(f.placements, (p) => p.placedAt);
  put("first_item_placed", p0?.placedAt, p0 && `placement:${p0.id}`);
  const waited = first(f.settlements.filter((s) => s.snapshotCount > 0), (s) => s.settledAt);
  put("first_wait_completed", waited?.settledAt, waited && `settlement:${waited.id}`);
  const o0 = first(f.observations, (o) => o.observedAt);
  put("first_visit_result_observed", o0?.observedAt, o0 && `observation:${o0.id}`);

  // D2：≥N 种可区分的来访结果（结果键 = 猫 × 暴露档；只证"不固定"）
  {
    const seen = new Set<string>();
    for (const o of [...f.observations].sort((a, b) => a.observedAt.getTime() - b.observedAt.getTime())) {
      seen.add(`${o.catId}|${o.visibility}`);
      if (seen.size >= SIGNALS.outcomesMin) {
        put("observed_multiple_outcomes", o.observedAt, `observation:${o.id}`);
        break;
      }
    }
  }

  // D3：看见未知（传闻或 TRACE 动静）+ 翻过册 + 随后布置变更（系统不替用户造目标）
  const rumor0 = first(f.rumors, (r) => r.heardAt);
  const trace0 = first(f.observations.filter((o) => o.type === "TRACE"), (o) => o.observedAt);
  const unknownAt = [rumor0 && { at: rumor0.heardAt, ref: `rumor:${rumor0.id}` }, trace0 && { at: trace0.observedAt, ref: `observation:${trace0.id}` }]
    .filter((x): x is { at: Date; ref: string } => Boolean(x))
    .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
  put("unknown_or_rumor_seen", unknownAt?.at, unknownAt?.ref);
  const book0 = first(f.surfaceViews.filter((s) => s.surface === "cat_book"), (s) => s.firstAt);
  put("collection_surface_seen", book0?.firstAt, book0 && `surface:cat_book:${book0.dayKey}`);
  if (unknownAt && book0) {
    const evidenceAt = Math.max(unknownAt.at.getTime(), book0.firstAt.getTime());
    const changes = f.placements
      .flatMap((p) => [
        { at: p.placedAt, ref: `placement:${p.id}` },
        ...(p.removedAt ? [{ at: p.removedAt, ref: `placement:${p.id}:removed` }] : []),
      ])
      .filter((c) => c.at.getTime() > evidenceAt)
      .sort((a, b) => a.at.getTime() - b.at.getTime());
    put("subsequent_placement_change", changes[0]?.at, changes[0]?.ref);
  }

  // D4：收过留物 + 第一次自主花掉 + 新物件摆进院子
  const c0 = first(f.collectedVisits, (c) => c.collectedAt);
  put("resource_collected", c0?.collectedAt, c0 && `visit:${c0.id}`);
  const buy0 = first(f.purchases, (b) => b.acquiredAt);
  put("first_autonomous_sink", buy0?.acquiredAt, buy0 && `purchase:${buy0.id}`);
  {
    const boughtAt = new Map<string, Date>();
    for (const b of f.purchases) {
      const cur = boughtAt.get(b.itemKey);
      if (!cur || b.acquiredAt < cur) boughtAt.set(b.itemKey, b.acquiredAt);
    }
    const placedBought = f.placements
      .filter((p) => {
        const at = boughtAt.get(p.itemKey);
        return at && p.placedAt.getTime() >= at.getTime();
      })
      .sort((a, b) => a.placedAt.getTime() - b.placedAt.getTime())[0];
    put("new_item_placed", placedBought?.placedAt, placedBought && `placement:${placedBought.id}`);
  }

  // D5（v0 代理）：翻册当日随后发生布置变更，累计 ≥N 天
  {
    const viewByDay = new Map<string, Date>();
    for (const s of f.surfaceViews) {
      if (s.surface !== "cat_book") continue;
      const cur = viewByDay.get(s.dayKey);
      if (!cur || s.firstAt < cur) viewByDay.set(s.dayKey, s.firstAt);
    }
    const adjustDays: Array<{ day: string; at: Date; ref: string }> = [];
    for (const [day, viewedAt] of viewByDay) {
      const change = f.placements
        .flatMap((p) => [
          { at: p.placedAt, ref: `placement:${p.id}` },
          ...(p.removedAt ? [{ at: p.removedAt, ref: `placement:${p.id}:removed` }] : []),
        ])
        .filter((c) => dayKeyOf(c.at) === day && c.at.getTime() > viewedAt.getTime())
        .sort((a, b) => a.at.getTime() - b.at.getTime())[0];
      if (change) adjustDays.push({ day, at: change.at, ref: change.ref });
    }
    adjustDays.sort((a, b) => a.at.getTime() - b.at.getTime());
    const nth = adjustDays[SIGNALS.targetedAdjustDays - 1];
    put("targeted_adjustment", nth?.at, nth?.ref);
  }

  return hits.sort((a, b) => a.firstAt.getTime() - b.firstAt.getTime() || a.signal.localeCompare(b.signal));
}

/** Reached：D1..Dx 全部 Signal 在场；成立时刻 = 所需证据的最晚首次时刻 */
export function deriveReached(hits: SignalHit[]): Partial<Record<keyof typeof STAGE_SIGNALS, Date>> {
  const at = new Map(hits.map((h) => [h.signal, h.firstAt]));
  const reached: Partial<Record<keyof typeof STAGE_SIGNALS, Date>> = {};
  const need: SignalKey[] = [];
  for (const stage of ["D1", "D2", "D3", "D4", "D5"] as const) {
    need.push(...STAGE_SIGNALS[stage]);
    if (need.every((s) => at.has(s))) {
      reached[stage] = new Date(Math.max(...need.map((s) => at.get(s)!.getTime())));
    } else break; // 认知不跳级：链断处停（后面的 Signal 可以乱序存在，但 Reached 不成立）
  }
  return reached;
}

// ---------- DB 面：事实束装配 + 快照持久化（观测台用） ----------

export async function loadFactBundle(userId: string): Promise<FactBundle> {
  const home = await prisma.home.findUnique({ where: { userId }, include: { yard: true } });
  const yardId = home?.yard?.id;
  const [placements, settlements, observations, rumors, collectedRaw, purchases, surfaceViews] = await Promise.all([
    yardId ? prisma.placement.findMany({ where: { yardId }, select: { id: true, itemKey: true, placedAt: true, removedAt: true } }) : [],
    yardId ? prisma.windowSettlement.findMany({ where: { yardId }, select: { id: true, settledAt: true, placementSnapshot: true } }) : [],
    prisma.observation.findMany({ where: { viewerId: userId }, select: { id: true, observedAt: true, type: true, visit: { select: { catId: true, visibility: true } } } }),
    prisma.rumorSighting.findMany({ where: { userId }, select: { id: true, heardAt: true } }),
    yardId ? prisma.catVisit.findMany({ where: { yardId, collectedAt: { not: null } }, select: { id: true, collectedAt: true, leftBehind: true } }) : [],
    home ? prisma.ownedItem.findMany({ where: { homeId: home.id, source: "purchase" }, select: { id: true, itemKey: true, acquiredAt: true } }) : [],
    prisma.surfaceView.findMany({ where: { userId }, select: { surface: true, dayKey: true, firstAt: true } }),
  ]);
  const hasLeft = (lb: unknown) => {
    const raw = (lb ?? {}) as { fish?: number; material?: unknown; memento?: unknown };
    return Number(raw.fish ?? 0) > 0 || Boolean(raw.material) || Boolean(raw.memento);
  };
  return {
    placements,
    settlements: settlements.map((s) => ({ id: s.id, settledAt: s.settledAt, snapshotCount: Array.isArray(s.placementSnapshot) ? s.placementSnapshot.length : 0 })),
    observations: observations.map((o) => ({ id: o.id, observedAt: o.observedAt, type: o.type, catId: o.visit.catId, visibility: o.visit.visibility })),
    rumors,
    collectedVisits: collectedRaw.filter((c) => hasLeft(c.leftBehind)).map((c) => ({ id: c.id, collectedAt: c.collectedAt as Date })),
    purchases,
    surfaceViews,
  };
}

export async function deriveUserStages(userId: string) {
  const facts = await loadFactBundle(userId);
  const signals = deriveSignalsPure(facts);
  return { signals, reached: deriveReached(signals) };
}

/** 快照持久化（Signal 缓存可全量重算；delete+create = 版本化重放的幂等形态） */
export async function persistStageSignals(userId: string): Promise<SignalHit[]> {
  const { signals } = await deriveUserStages(userId);
  await prisma.$transaction([
    prisma.stageSignal.deleteMany({ where: { userId } }),
    prisma.stageSignal.createMany({
      data: signals.map((h) => ({ userId, signal: h.signal, firstAt: h.firstAt, sourceRef: h.sourceRef, logicVersion: SIGNALS_VERSION })),
    }),
  ]);
  return signals;
}

/** 观测面日见事实（18 翻册；幂等——每 surface 每北京日至多一行） */
export async function recordSurfaceView(userId: string, surface: string, now = new Date()): Promise<void> {
  await prisma.surfaceView.createMany({
    data: [{ userId, surface, dayKey: dayKeyOf(now), firstAt: now }],
    skipDuplicates: true,
  });
}
