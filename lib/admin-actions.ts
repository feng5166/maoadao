"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { isAdmin } from "./admin-auth";
import { makeTicketCode } from "./tickets";

// 后台写操作：全部经 isAdmin() 会话校验（v0.7.1）

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("无权限");
}

/** 发放邀请码（船票）：批次 + 张数。
 *  产品规则(2026-08-02 拍板)：一张船票只能上一个人——激活一次即失效,
 *  所有批次一律 maxUses=1。要邀多人就发多张,不发多次票。 */
export async function createInviteCodes(formData: FormData) {
  await requireAdmin();
  const batch = String(formData.get("batch") ?? "team");
  const count = Math.max(1, Math.min(20, Number(formData.get("count") ?? 1)));
  await prisma.inviteCode.createMany({
    data: Array.from({ length: count }, () => ({ code: makeTicketCode(), batch, maxUses: 1, createdAt: new Date() })),
  });
  revalidatePath("/admin");
}

export async function disableInviteCode(formData: FormData) {
  await requireAdmin();
  const code = String(formData.get("code") ?? "");
  await prisma.inviteCode.update({ where: { code }, data: { disabled: true } }).catch(() => {});
  revalidatePath("/admin");
}

/** 一键暂停/恢复新领养 */
export async function toggleAdoptionPause() {
  await requireAdmin();
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  if (!world) return;
  await prisma.worldState.update({ where: { id: 1 }, data: { adoptionPaused: !world.adoptionPaused } });
  revalidatePath("/admin");
}

/** 微信通道熔断开关(doc/13 T8):监控自动停发后也从这里恢复 */
export async function toggleWechatPause() {
  await requireAdmin();
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  if (!world) return;
  await prisma.worldState.update({ where: { id: 1 }, data: { wechatPaused: !world.wechatPaused } });
  revalidatePath("/admin");
}

/** 内容人工评分（7 维，可反复修改） */
export async function rateContent(formData: FormData) {
  await requireAdmin();
  const summaryId = String(formData.get("summaryId") ?? "");
  if (!summaryId) return;
  const num = (k: string) => {
    const v = Number(formData.get(k));
    return Number.isInteger(v) && v >= 1 && v <= 5 ? v : null;
  };
  const bool = (k: string) => formData.get(k) === "on";
  await prisma.contentRating.upsert({
    where: { summaryId },
    update: {
      continuity: num("continuity"),
      persona: num("persona"),
      fun: num("fun"),
      emotion: num("emotion"),
      suspense: num("suspense"),
      templated: bool("templated"),
      factError: bool("factError"),
      shareworthy: bool("shareworthy"),
    },
    create: {
      id: randomUUID(),
      summaryId,
      continuity: num("continuity"),
      persona: num("persona"),
      fun: num("fun"),
      emotion: num("emotion"),
      suspense: num("suspense"),
      templated: bool("templated"),
      factError: bool("factError"),
      shareworthy: bool("shareworthy"),
      createdAt: new Date(),
    },
  });
  revalidatePath("/admin");
}
