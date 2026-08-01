import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "./db";
import { moderateTexts } from "./moderation";
import { NPC_CATS } from "./sim/npcs";
import { failsInWindow } from "./authcode";
import { grantBoatTickets } from "./tickets";

// 领养核心（与 Server Action 解耦，可单测）。
// 关键时序（review P0）：船票核销必须发生在"确定能建猫"之后的同一事务里——
// 已有猫 / 审核不通过 / 建猫失败 / 并发输家，都不消耗船票。

export interface AdoptInput {
  name: string;
  appearance: string;
  bio: string;
  tagsRaw: string;
  ownerNick: string;
  goal: string;
  boldness: number;
  sociability: number;
  diligence: number;
  ticket: string;
}

export type AdoptResult = { ok: true; catId: string } | { ok: false; reason: "has_cat"; catId: string };

export class AdoptError extends Error {}

export async function adoptCat(uid: string, input: AdoptInput): Promise<AdoptResult> {
  // 1. 身份先行（不带船票信息）
  await prisma.user.upsert({
    where: { id: uid },
    update: {},
    create: { id: uid, name: "岛民", createdAt: new Date() },
  });

  // 2. 已有猫：直接回它身边，不碰船票
  const owned = await prisma.cat.findFirst({ where: { ownerId: uid } });
  if (owned) return { ok: false, reason: "has_cat", catId: owned.id };

  // 3. 无效船票尝试限频（防枚举）
  if ((await failsInWindow("invite_fail", uid)) >= 10) {
    throw new AdoptError("试了太多张船票，15 分钟后再来");
  }

  // 4. 内容审核（船票尚未消耗）
  const mod = await moderateTexts([input.name, input.appearance, input.bio, input.tagsRaw, input.ownerNick]);
  if (!mod.ok) throw new AdoptError(mod.reason ?? "内容未通过审核，请修改后重试");

  const personaTags = input.tagsRaw
    ? input.tagsRaw.split(/[,，、\s]+/).filter(Boolean).slice(0, 5)
    : ["神秘"];
  const catId = `cat-${randomUUID().slice(0, 8)}`;
  const second =
    input.sociability > 60 ? "npc-juzi" : input.boldness > 60 ? "npc-doudou" : input.diligence > 60 ? "npc-tudou" : "npc-tangyuan";

  // 5. 单事务：暂停复查 → 扣票 → 建猫 → 初始关系。任一步失败整体回滚（票退回）
  try {
    await prisma.$transaction(async (tx) => {
      const world = await tx.worldState.findUnique({ where: { id: 1 } });
      if (world?.adoptionPaused) throw new AdoptError("码头暂时不办理入岛，过几天再来吧");

      const claimed = await tx.inviteCode.updateMany({
        where: { code: input.ticket, disabled: false, usedCount: { lt: tx.inviteCode.fields.maxUses } },
        data: { usedCount: { increment: 1 } },
      });
      if (claimed.count === 0) {
        await prisma.authAttempt
          .create({ data: { id: randomUUID(), kind: "invite_fail", key: uid, createdAt: new Date() } })
          .catch(() => {});
        throw new AdoptError("这张船票不能用了——问问给你票的人");
      }
      const ticketRow = await tx.inviteCode.findUnique({ where: { code: input.ticket } });

      await tx.user.update({
        where: { id: uid },
        data: { inviteCode: input.ticket, inviteBatch: ticketRow?.batch ?? null },
      });
      await tx.cat.create({
        data: {
          id: catId,
          name: input.name,
          isNpc: false,
          ownerId: uid,
          ownerNick: input.ownerNick || null,
          goal: input.goal,
          boldness: input.boldness,
          sociability: input.sociability,
          diligence: input.diligence,
          personaTags,
          appearance: input.appearance || "一只还没被描述过的猫",
          bio: input.bio || `${input.name}刚刚搬来猫啊岛，一切都是新的。`,
          createdAt: new Date(),
          state: { create: {} },
        },
      });
      const day = world?.day ?? 0;
      await tx.relationship.createMany({
        data: ["npc-mianhua", second]
          .filter((npcId) => NPC_CATS.some((n) => n.id === npcId))
          .map((npcId) => ({ id: randomUUID(), catAId: catId, catBId: npcId, affinity: 10, lastInteractionDay: day })),
      });
      // 新岛民自己也成为邀请人：5 张可转赠船票，与建猫同事务（失败一起回滚）
      await grantBoatTickets(tx, uid);
    },
    // 跨洋链路下 6 个往返轻松超过默认 5s；放宽而不是拆事务（时序约束见文件头）
    { timeout: 15000 });
  } catch (err) {
    // 并发输家：另一只已建成（事务回滚，票已退回）→ 回到那只猫
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      const existing = await prisma.cat.findFirst({ where: { ownerId: uid } });
      if (existing) return { ok: false, reason: "has_cat", catId: existing.id };
    }
    throw err;
  }

  return { ok: true, catId };
}
