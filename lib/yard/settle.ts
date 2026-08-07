// 窗口结算（doc2.0/16 状态机的系统面）。
// 纯函数核 settleWindowPure：同输入必同输出——确定性种子 =
// yardId × dayKey × windowIndex × rulesVersion（刷新永不重 roll，CI 级红线）。
// DB 面 ensureWindowSettled：lazy、以 @@unique 收敛、快照取窗口起点——
// 「Lazy settlement 可以晚算，绝不能晚取事实输入」（16 快照红线，14 §九 护栏②）。

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { hashSeed, mulberry32, pick, weightedPick } from "../sim/rng";
import {
  DEFAULT_TRACE, IDLE_BEHAVIORS, ITEMS, ITEM_TRACES, POOL_V0, PREF, RULES_VERSION, SLOTS,
  WEATHER_DIST, type PoolCatDef,
} from "./config";
import { windowLenMin, windowStart } from "./time";

export interface SnapshotEntry {
  slotKey: string;
  itemKey: string;
}
export interface SettleInput {
  yardId: string;
  dayKey: string;
  windowIndex: number;
  rulesVersion: string;
  snapshot: SnapshotEntry[];
  weather: string;
}
export interface VisitDraft {
  catId: string;
  slotKey: string | null;
  itemKey: string | null;
  arriveMin: number;
  leaveMin: number;
  behaviors: string[];
  fish: number;
  traces: string[];
  visibility: "FULL_RECORD" | "TRACE_ONLY";
}
export interface SettleResult {
  seed: number;
  visits: VisitDraft[];
}

/** 天气 v0：由 dayKey 确定性派生（可复现）；批次二接世界天气史后替换 */
export function weatherOf(dayKey: string): string {
  const rng = mulberry32(hashSeed("weather", dayKey));
  const r = rng();
  let acc = 0;
  for (const w of WEATHER_DIST) {
    acc += w.p;
    if (r < acc) return w.key;
  }
  return WEATHER_DIST[0].key;
}

/** 布置快照 → 标签权重（含槽位标签；同类堆叠衰减，22 §四） */
function tagWeights(snapshot: SnapshotEntry[]): Map<string, number> {
  const slotTags = new Map(SLOTS.map((s) => [s.key, s.tags]));
  const itemTags = new Map(ITEMS.map((i) => [i.key, i.tags]));
  const counts = new Map<string, number>();
  const weights = new Map<string, number>();
  for (const p of snapshot) {
    const tags: Record<string, number> = { ...(itemTags.get(p.itemKey) ?? {}) };
    for (const t of slotTags.get(p.slotKey) ?? []) tags[t] = (tags[t] ?? 0) + 1;
    for (const [tag, strength] of Object.entries(tags)) {
      const n = counts.get(tag) ?? 0;
      const mult = PREF.stackMults[Math.min(n, PREF.stackMults.length - 1)];
      weights.set(tag, (weights.get(tag) ?? 0) + strength * mult);
      counts.set(tag, n + 1);
    }
  }
  return weights;
}

/** Preference（17 §一 三语义区）：AVOID 强冲突=硬 0，惊喜采样永不触碰 */
function preferenceWeight(cat: PoolCatDef, tags: Map<string, number>): number {
  let avoidHits = 0;
  for (const t of cat.avoid) if (tags.has(t)) avoidHits++;
  if (avoidHits >= 2) return 0; // 讨厌不是低（17 红线）
  let w = PREF.base;
  for (const t of cat.favor) {
    const s = tags.get(t);
    if (s) w += PREF.favorPerPoint * Math.min(s, 3);
  }
  if (avoidHits === 1) w *= PREF.avoidWeakMult;
  return w;
}

/** 它用哪个位置：偏好重合越多越可能；也可能只是路过 */
function pickSpot(rng: () => number, cat: PoolCatDef, snapshot: SnapshotEntry[]): SnapshotEntry | null {
  if (snapshot.length === 0 || rng() < PREF.passByP) return null;
  const itemTags = new Map(ITEMS.map((i) => [i.key, i.tags]));
  const weights = snapshot.map((p) => {
    const tags = itemTags.get(p.itemKey) ?? {};
    let overlap = 0;
    for (const t of cat.favor) overlap += tags[t] ?? 0;
    return 1 + overlap;
  });
  return weightedPick(rng, snapshot, weights);
}

export function settleWindowPure(input: SettleInput): SettleResult {
  const seed = hashSeed(input.yardId, input.dayKey, input.windowIndex, input.rulesVersion);
  const rng = mulberry32(seed);
  const tags = tagWeights(input.snapshot);
  const lenMin = windowLenMin(input.windowIndex);
  const visits: VisitDraft[] = [];

  for (const cat of POOL_V0) {
    if (visits.length >= PREF.maxVisitsPerWindow) break;
    // Eligibility v0（可替换）：活跃窗；世界侧完整裁决（时间/天气/state/社会/硬条件）接批次二
    if (!cat.windows.includes(input.windowIndex)) continue;
    // Composition 层（22 §四）：solitary 猫独占本窗
    if (cat.solitary && visits.length > 0) continue;
    if (visits.some((v) => POOL_V0.find((p) => p.catId === v.catId)?.solitary)) continue;

    const w = preferenceWeight(cat, tags);
    let p = 0;
    if (w > 0) {
      const jitter = 1 + (rng() * 2 - 1) * PREF.jitter;
      p = Math.min(0.9, w * jitter * PREF.baseVisitP);
      // 域内惊喜（17：低不是无——NEUTRAL/LOW 仍可能来；AVOID 硬 0 不在此路径）
      if (w <= PREF.base && rng() < PREF.surpriseP) p = Math.max(p, PREF.surpriseP);
    }
    if (rng() >= p) continue;

    const spot = pickSpot(rng, cat, input.snapshot);
    const arriveMin = Math.floor(rng() * Math.max(1, lenMin - 20));
    const stay = 10 + Math.floor(rng() * 80);
    const leaveMin = Math.min(lenMin, arriveMin + stay);
    const behaviors = [pick(rng, cat.behaviors)];
    if (rng() < 0.5) behaviors.push(pick(rng, IDLE_BEHAVIORS)); // L3 无用层供给（16 §五）
    const fish = rng() < cat.leaveChance ? cat.leaveMin + Math.floor(rng() * (cat.leaveMax - cat.leaveMin + 1)) : 0;
    const traces = [spot ? (ITEM_TRACES[spot.itemKey] ?? DEFAULT_TRACE) : DEFAULT_TRACE];
    // Disclosure（22 §四）：每猫 traceBias 承担差异；稀缺档不得进入本公式
    const shortStay = stay < 15;
    const traceP = Math.max(
      0,
      Math.min(PREF.trace.cap, PREF.trace.base + cat.traceBias + (shortStay ? PREF.trace.shortStay : 0) + (stay > 60 ? PREF.trace.longStay : 0)),
    );
    const visibility = rng() < traceP ? "TRACE_ONLY" : "FULL_RECORD";
    visits.push({ catId: cat.catId, slotKey: spot?.slotKey ?? null, itemKey: spot?.itemKey ?? null, arriveMin, leaveMin, behaviors, fish, traces, visibility });
  }
  return { seed, visits };
}

type Db = Prisma.TransactionClient | typeof prisma;

/** 某时点的布置快照：由 Placement 历史重建（同槽取该时点最后一次摆放） */
export async function snapshotAt(db: Db, yardId: string, at: Date): Promise<SnapshotEntry[]> {
  const rows = await db.placement.findMany({
    where: { yardId, placedAt: { lte: at }, OR: [{ removedAt: null }, { removedAt: { gt: at } }] },
    orderBy: { placedAt: "asc" },
  });
  const bySlot = new Map<string, string>();
  for (const r of rows) bySlot.set(r.slotKey, r.itemKey);
  return [...bySlot.entries()]
    .map(([slotKey, itemKey]) => ({ slotKey, itemKey }))
    .sort((a, b) => a.slotKey.localeCompare(b.slotKey));
}

/** lazy 结算：只结已开始的窗；重复/并发调用以 @@unique 收敛到同一事实 */
export async function ensureWindowSettled(yardId: string, dayKey: string, windowIndex: number, now = new Date()) {
  const startAt = windowStart(dayKey, windowIndex);
  if (startAt.getTime() > now.getTime()) return null; // 未开始的窗不结算（16 时间轴）

  const found = await prisma.windowSettlement.findUnique({
    where: { yardId_dayKey_windowIndex: { yardId, dayKey, windowIndex } },
    include: { visits: true },
  });
  if (found) return found;

  // 晚算不晚取：快照按窗口起点重建，与查询时的院子现状无关
  const snapshot = await snapshotAt(prisma, yardId, startAt);
  const weather = weatherOf(dayKey);
  const result = settleWindowPure({ yardId, dayKey, windowIndex, rulesVersion: RULES_VERSION, snapshot, weather });

  try {
    return await prisma.$transaction(async (tx) => {
      const settlement = await tx.windowSettlement.create({
        data: {
          id: `ws-${randomUUID().slice(0, 12)}`,
          yardId, dayKey, windowIndex,
          rulesVersion: RULES_VERSION,
          placementSnapshot: snapshot as unknown as Prisma.InputJsonValue,
          weather,
          settledAt: now,
        },
      });
      for (const v of result.visits) {
        await tx.catVisit.create({
          data: {
            id: `cv-${randomUUID().slice(0, 12)}`,
            settlementId: settlement.id,
            yardId, catId: v.catId, dayKey, windowIndex,
            slotKey: v.slotKey, itemKey: v.itemKey,
            arriveAt: new Date(startAt.getTime() + v.arriveMin * 60_000),
            leaveAt: new Date(startAt.getTime() + v.leaveMin * 60_000),
            behaviors: v.behaviors as unknown as Prisma.InputJsonValue,
            leftBehind: { fish: v.fish } as unknown as Prisma.InputJsonValue,
            traces: v.traces as unknown as Prisma.InputJsonValue,
            visibility: v.visibility,
            rulesVersion: RULES_VERSION,
          },
        });
      }
      return tx.windowSettlement.findUniqueOrThrow({ where: { id: settlement.id }, include: { visits: true } });
    });
  } catch (err) {
    // 并发输家：另一请求已结算——收敛到同一事实（不重 roll）
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return prisma.windowSettlement.findUnique({
        where: { yardId_dayKey_windowIndex: { yardId, dayKey, windowIndex } },
        include: { visits: true },
      });
    }
    throw err;
  }
}
