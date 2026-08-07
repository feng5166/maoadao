// claimYard（doc2.0/14 §九②）：接替 adoptCat 的事务位——
// 船票原子核销、身份建立、岛民登记全部保留；不再创建猫。
//
// 幂等与事务（14 §九 护栏①）：
// - Home.userId / Yard.homeId / HomeGrant 主键 = 数据库层唯一兜底，不靠先查再插；
// - 单事务全成或全败：Home 创建（幂等闩）→ 核销船票 → Yard/槽位 → 初始资产哨兵+发放
//   → 转赠船票。任一步失败整体回滚（票退回）；
// - 并发/重复/Serverless 重入：输家撞 Home 唯一约束（P2002）→ 收敛到既有院子，
//   不多核销、不多发、不多建。
// 时序红线承 adoptCat（review P0）：核销必须发生在"确定能建院"之后的同一事务里。

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { grantBoatTickets } from "../tickets";
import { INITIAL_GRANT_BATCH, INITIAL_ITEMS, SLOTS } from "./config";

export class ClaimError extends Error {}

export type ClaimResult = { ok: true; yardId: string; created: boolean };

export async function claimYard(uid: string, ticket: string): Promise<ClaimResult> {
  // 身份先行（不带船票信息，沿 adoptCat 序）
  await prisma.user.upsert({
    where: { id: uid },
    update: {},
    create: { id: uid, name: "岛民", createdAt: new Date() },
  });

  // 已是岛民：直接回自己的院子，不碰船票（幂等快路径）
  const existing = await prisma.home.findUnique({ where: { userId: uid }, include: { yard: true } });
  if (existing?.yard) return { ok: true, yardId: existing.yard.id, created: false };

  try {
    const yardId = await prisma.$transaction(
      async (tx) => {
        // 1. Home 创建即幂等闩（unique userId）：并发输家在这里撞 P2002
        const home = await tx.home.create({
          data: { id: `home-${randomUUID().slice(0, 8)}`, userId: uid, createdAt: new Date() },
        });

        // 2. 核销船票（确定能建院之后、同一事务内）
        const claimed = await tx.inviteCode.updateMany({
          where: { code: ticket, disabled: false, usedCount: { lt: tx.inviteCode.fields.maxUses } },
          data: { usedCount: { increment: 1 } },
        });
        if (claimed.count === 0) throw new ClaimError("这张船票不能用了——问问给你票的人");
        const ticketRow = await tx.inviteCode.findUnique({ where: { code: ticket } });
        await tx.user.update({
          where: { id: uid },
          data: { inviteCode: ticket, inviteBatch: ticketRow?.batch ?? null },
        });

        // 3. 院子与槽位（Yard.homeId 唯一 + [yardId, slotKey] 唯一）
        const yard = await tx.yard.create({
          data: { id: `yard-${randomUUID().slice(0, 8)}`, homeId: home.id, createdAt: new Date() },
        });
        await tx.yardSlot.createMany({
          data: SLOTS.map((s) => ({ id: randomUUID(), yardId: yard.id, slotKey: s.key })),
        });

        // 4. 初始资产：哨兵行唯一约束收敛（护栏①——初始资产恰好一份）
        await tx.homeGrant.create({
          data: { homeId: home.id, batchKey: INITIAL_GRANT_BATCH, grantedAt: new Date() },
        });
        await tx.ownedItem.createMany({
          data: INITIAL_ITEMS.map((k) => ({
            id: randomUUID(), homeId: home.id, itemKey: k, source: "initial", acquiredAt: new Date(),
          })),
        });

        // 5. 新岛民自己也成为邀请人（船票裂变机制 KEEP，与建院同事务）
        await grantBoatTickets(tx, uid);

        return yard.id;
      },
      // 跨洋链路多往返，放宽而不是拆事务（承 adoptCat 口径）
      { timeout: 15000 },
    );
    return { ok: true, yardId, created: true };
  } catch (err) {
    // 并发输家：另一请求已建成（本事务整体回滚，票未消耗）→ 回到那座院子
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const h = await prisma.home.findUnique({ where: { userId: uid }, include: { yard: true } });
      if (h?.yard) return { ok: true, yardId: h.yard.id, created: false };
    }
    throw err;
  }
}
