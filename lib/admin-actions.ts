"use server";

import { randomBytes, randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { prisma } from "./db";
import { isAdmin } from "./admin-auth";

// 后台写操作：全部经 isAdmin() 会话校验（v0.7.1）

async function requireAdmin() {
  if (!(await isAdmin())) throw new Error("无权限");
}

function makeCode(): string {
  // 12 位随机（~59 bit）：船票兼作成本闸门，空间必须够大
  const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const body = Array.from(randomBytes(12))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
  return `BOAT-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

/** 发放邀请码（船票）：批次 + 每码可用次数 + 张数 */
export async function createInviteCodes(formData: FormData) {
  await requireAdmin();
  const batch = String(formData.get("batch") ?? "team");
  const maxUses = Math.max(1, Math.min(50, Number(formData.get("maxUses") ?? 1)));
  const count = Math.max(1, Math.min(20, Number(formData.get("count") ?? 1)));
  for (let i = 0; i < count; i++) {
    await prisma.inviteCode.create({
      data: { code: makeCode(), batch, maxUses, createdAt: new Date() },
    });
  }
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
