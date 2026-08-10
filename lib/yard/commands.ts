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
import type { LeftBehind } from "./settle";
import { dayKeyOf, windowStart } from "./time";
import { ensureWelcomeVisit } from "./welcome";

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
  }, { timeout: 15000, maxWait: 10000 }).then(async (r) => {
    // 欢迎结算(16/14 §九②):首摆 3-5 分钟内第一位客人到;幂等,失败不挡摆放
    await ensureWelcomeVisit(home.id, yard.id, itemKey, now).catch((e) => console.error("[welcome]", e instanceof Error ? e.message : e));
    return r;
  });
}

export async function removeItem(userId: string, slotKey: string, now = new Date()) {
  const { yard } = await yardOf(userId);
  await prisma.placement.updateMany({
    where: { yardId: yard.id, slotKey, removedAt: null },
    data: { removedAt: now },
  });
  return { effectiveFrom: nextWindowAfter(now) };
}

export type CollectResult = { ok: true; left: LeftBehind } | { ok: false; reason: "already" | "not_yet" };

export async function collectVisit(userId: string, visitId: string, now = new Date()): Promise<CollectResult> {
  const { home, yard } = await yardOf(userId);
  return prisma.$transaction(async (tx) => {
    const visit = await tx.catVisit.findUnique({ where: { id: visitId } });
    if (!visit || visit.yardId !== yard.id) throw new YardError("院子里没有这个");
    if (visit.leaveAt.getTime() > now.getTime()) return { ok: false, reason: "not_yet" }; // 它还在——东西是走的时候留下的
    const raw = (visit.leftBehind ?? {}) as Partial<LeftBehind>;
    const left: LeftBehind = { fish: Number(raw.fish ?? 0), material: raw.material, memento: raw.memento };
    // 幂等入账：条件更新抢 claim，输家不再记账（并发/重放安全）
    const claimed = await tx.catVisit.updateMany({
      where: { id: visitId, collectedAt: null },
      data: { collectedAt: now },
    });
    if (claimed.count === 0) return { ok: false, reason: "already" };
    if (left.fish > 0) {
      await tx.home.update({ where: { id: home.id }, data: { fish: { increment: left.fish } } });
    }
    if (left.material) {
      await tx.homeMaterial.upsert({
        where: { homeId_materialKey: { homeId: home.id, materialKey: left.material.key } },
        update: { qty: { increment: left.material.qty }, updatedAt: now },
        create: { homeId: home.id, materialKey: left.material.key, qty: left.material.qty, updatedAt: now },
      });
    }
    if (left.memento) {
      // 纪念物（19 P0）：只进历史/收藏,挂来访溯源;本文件不存在任何消耗它的路径
      await tx.memento.create({
        data: { id: `mm-${randomUUID().slice(0, 12)}`, homeId: home.id, mementoKey: left.memento.key, sourceVisitId: visit.id, acquiredAt: now },
      });
    }
    return { ok: true, left };
  }, { timeout: 15000, maxWait: 10000 }); // 跨洋链路:连接等待也放宽(承 claim 口径)
}

export type BuyResult = { ok: true; fish: number } | { ok: false; reason: "not_enough" };

/** 第一个 Sink（19）：小鱼干 → 新物件。条件扣款抢余额,并发下鱼干永不为负 */
export async function buyItem(userId: string, itemKey: string, now = new Date()): Promise<BuyResult> {
  const item = ITEMS.find((i) => i.key === itemKey);
  if (!item || item.price == null) throw new YardError("店里没有这样东西");
  const { home } = await yardOf(userId);
  const price = item.price;
  return prisma.$transaction(async (tx) => {
    const paid = await tx.home.updateMany({
      where: { id: home.id, fish: { gte: price } },
      data: { fish: { decrement: price } },
    });
    if (paid.count === 0) return { ok: false, reason: "not_enough" };
    await tx.ownedItem.create({
      data: { id: randomUUID(), homeId: home.id, itemKey, source: "purchase", acquiredAt: now },
    });
    const after = await tx.home.findUniqueOrThrow({ where: { id: home.id }, select: { fish: true } });
    return { ok: true, fish: after.fish };
  }, { timeout: 15000, maxWait: 10000 }); // 跨洋链路:连接等待也放宽(承 claim 口径)
}
