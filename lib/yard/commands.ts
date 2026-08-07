// 院子动作（竖切第二格）。两条数据原则（14 §九 后续实现约束②③）：
//
// ② 摆放/更换是 PlacementCommand：只写 placedAt/removedAt 并计算 effectiveFromWindow
//    ——WindowSettlement 永远只读窗口起点快照。UI 可以立即显示"已摆下"，
//    但世界侧从下一个合法窗才开始受影响（环境语言轻表达，永不倒计时）。
//    无冷却（08 冻结：按钮 CD 不默认存在）。
//
// ③ collect 不创造 Leave Behind：CatVisit 结算时 entitlement 已存在，
//    收下只是确认/转移——条件更新 collectedAt null→时刻 幂等入账，
//    离线/重放/并发都不会多记一条鱼（19「资源是往来，不是产出」的代码面）。

import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { ITEMS, SLOTS, WINDOWS } from "./config";
import { dayKeyOf, windowStart } from "./time";

export class YardError extends Error {}

/** 下一个尚未开始的窗（摆放的生效点，16 §三） */
export function nextWindowAfter(now: Date): { dayKey: string; windowIndex: number; startAt: Date } {
  const candidates: Array<{ dayKey: string; windowIndex: number; startAt: Date }> = [];
  for (const offset of [0, 1]) {
    const dk = dayKeyOf(new Date(now.getTime() + offset * 86400_000));
    for (const w of WINDOWS) {
      const startAt = windowStart(dk, w.index);
      if (startAt.getTime() > now.getTime()) candidates.push({ dayKey: dk, windowIndex: w.index, startAt });
    }
  }
  candidates.sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
  return candidates[0];
}

async function yardOf(userId: string) {
  const home = await prisma.home.findUnique({ where: { userId }, include: { yard: true } });
  if (!home?.yard) throw new YardError("你在岛上还没有自己的院子");
  return { home, yard: home.yard };
}

export async function placeItem(userId: string, slotKey: string, itemKey: string, now = new Date()) {
  if (!SLOTS.some((s) => s.key === slotKey)) throw new YardError("没有这个位置");
  if (!ITEMS.some((i) => i.key === itemKey)) throw new YardError("没有这样东西");
  const { home, yard } = await yardOf(userId);

  return prisma.$transaction(async (tx) => {
    const ownedCount = await tx.ownedItem.count({ where: { homeId: home.id, itemKey } });
    if (ownedCount === 0) throw new YardError("手边没有这样东西");
    const activeElsewhere = await tx.placement.count({
      where: { yardId: yard.id, itemKey, removedAt: null, slotKey: { not: slotKey } },
    });
    if (activeElsewhere >= ownedCount) throw new YardError("它已经摆在别处了");

    // 同槽换物：旧摆放收束（历史保留，快照按时点重建）
    await tx.placement.updateMany({
      where: { yardId: yard.id, slotKey, removedAt: null },
      data: { removedAt: now },
    });
    await tx.placement.create({
      data: { id: randomUUID(), yardId: yard.id, slotKey, itemKey, placedAt: now },
    });
    // 世界侧生效点：只算不存——快照按 placedAt 时间锚定，effectiveFrom 供 UI 表达
    return { effectiveFrom: nextWindowAfter(now) };
  }, { timeout: 15000 });
}

export async function removeItem(userId: string, slotKey: string, now = new Date()) {
  const { yard } = await yardOf(userId);
  await prisma.placement.updateMany({
    where: { yardId: yard.id, slotKey, removedAt: null },
    data: { removedAt: now },
  });
  return { effectiveFrom: nextWindowAfter(now) };
}

export type CollectResult = { ok: true; fish: number } | { ok: false; reason: "already" | "not_yet" };

export async function collectVisit(userId: string, visitId: string, now = new Date()): Promise<CollectResult> {
  const { home, yard } = await yardOf(userId);
  return prisma.$transaction(async (tx) => {
    const visit = await tx.catVisit.findUnique({ where: { id: visitId } });
    if (!visit || visit.yardId !== yard.id) throw new YardError("院子里没有这个");
    if (visit.leaveAt.getTime() > now.getTime()) return { ok: false, reason: "not_yet" }; // 它还在——东西是走的时候留下的
    const fish = Number((visit.leftBehind as { fish?: number } | null)?.fish ?? 0);
    // 幂等入账：条件更新抢 claim，输家不再记账（并发/重放安全）
    const claimed = await tx.catVisit.updateMany({
      where: { id: visitId, collectedAt: null },
      data: { collectedAt: now },
    });
    if (claimed.count === 0) return { ok: false, reason: "already" };
    if (fish > 0) {
      await tx.home.update({ where: { id: home.id }, data: { fish: { increment: fish } } });
    }
    return { ok: true, fish };
  }, { timeout: 15000 });
}
