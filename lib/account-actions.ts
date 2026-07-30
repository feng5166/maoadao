"use server";

import { randomUUID, randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { track } from "@vercel/analytics/server";
import { prisma } from "./db";
import { getViewerId, ensureViewerId } from "./identity";
import { otpEmailHtml, sendEmail } from "./email";

// ============ 找回码：零外部依赖的跨设备找回 ============

function makeRecoveryCode(): string {
  const seg = () => randomInt(0, 36 ** 4).toString(36).toUpperCase().padStart(4, "0");
  return `MAO-${seg()}-${seg()}`;
}

/** 确保当前用户有找回码（领养后在 /account 展示） */
export async function ensureRecoveryCode(): Promise<string | null> {
  const uid = await getViewerId();
  if (!uid) return null;
  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) return null;
  if (user.recoveryCode) return user.recoveryCode;
  const code = makeRecoveryCode();
  await prisma.user.update({ where: { id: uid }, data: { recoveryCode: code } });
  return code;
}

/** 用找回码在新设备上恢复身份 */
export async function recoverByCode(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return;
  const user = await prisma.user.findUnique({ where: { recoveryCode: code } });
  if (!user) throw new Error("找回码不对，检查一下再试试");
  const jar = await cookies();
  jar.set("maoadao_uid", user.id, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
  await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
  await track("recover_success", { method: "code" });
  redirect("/my-cat");
}

// ============ 邮箱验证码：绑定与登录 ============

export async function requestEmailCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("邮箱格式不对");

  // 限频：同邮箱 1 分钟一条
  const recent = await prisma.loginCode.findFirst({
    where: { email, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recent) throw new Error("发太快了，一分钟后再试");

  const code = randomInt(100000, 999999).toString();
  await prisma.loginCode.create({
    data: { id: randomUUID(), email, code, expiresAt: new Date(Date.now() + 10 * 60_000), createdAt: new Date() },
  });
  const sent = await sendEmail(email, "猫啊岛验证码", otpEmailHtml(code));
  if (!sent) {
    // 邮件服务未配置：验证码进服务端日志，内测期由管理员转告
    console.warn(`[account] 邮箱验证码（邮件未发出）：${email} → ${code}`);
  }
  revalidatePath("/account");
}

export async function verifyEmailCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const row = await prisma.loginCode.findFirst({
    where: { email, code, usedAt: null, expiresAt: { gte: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) throw new Error("验证码不对或已过期");
  await prisma.loginCode.update({ where: { id: row.id }, data: { usedAt: new Date() } });

  const existing = await prisma.user.findUnique({ where: { email } });
  const jar = await cookies();
  if (existing) {
    // 该邮箱已绑定过 → 登录到那个身份（跨设备找回）
    jar.set("maoadao_uid", existing.id, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
    await prisma.user.update({ where: { id: existing.id }, data: { lastActiveAt: new Date() } });
    await track("recover_success", { method: "email" });
    redirect("/my-cat");
  }
  // 首次绑定 → 挂到当前身份
  const uid = await ensureViewerId();
  await prisma.user.upsert({
    where: { id: uid },
    update: { email, emailVerifiedAt: new Date(), status: "registered" },
    create: { id: uid, name: "岛民", email, emailVerifiedAt: new Date(), status: "registered", createdAt: new Date() },
  });
  await track("email_bound", {});
  revalidatePath("/account");
}

export async function toggleNotify() {
  const uid = await getViewerId();
  if (!uid) return;
  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) return;
  await prisma.user.update({ where: { id: uid }, data: { notifyDaily: !user.notifyDaily } });
  revalidatePath("/account");
}
