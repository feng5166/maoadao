"use server";

import { randomUUID, randomInt, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { track } from "@vercel/analytics/server";
import { prisma } from "./db";
import { getViewerId, ensureViewerId } from "./identity";
import { otpEmailHtml, sendEmail, emailEnabled } from "./email";
import { consumeLoginCode, hashCode, failsInWindow } from "./authcode";

// ============ 找回码：零外部依赖的跨设备找回 ============

function makeRecoveryCode(): string {
  // ~100 bit 熵：5 组 base32（去易混淆字符）
  const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const seg = () =>
    Array.from(randomBytes(4))
      .map((b) => alphabet[b % alphabet.length])
      .join("");
  return `MAO-${seg()}-${seg()}-${seg()}-${seg()}-${seg()}`;
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

/** 用找回码在新设备上恢复身份（带滑动窗口限频） */
export async function recoverByCode(formData: FormData) {
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  if (!code) return;
  const uid = (await getViewerId()) ?? "anon";
  if ((await failsInWindow("recover_fail", uid)) >= 5) {
    throw new Error("尝试次数过多，15 分钟后再试");
  }
  const user = await prisma.user.findUnique({ where: { recoveryCode: code } });
  if (!user) {
    await prisma.authAttempt
      .create({ data: { id: randomUUID(), kind: "recover_fail", key: uid, createdAt: new Date() } })
      .catch(() => {});
    throw new Error("找回码不对，检查一下再试试");
  }
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

  if (!emailEnabled()) {
    // 邮件未配置：明确失败，不发码、不把邮箱和验证码写进生产日志
    throw new Error("邮件服务尚未开通，请先用找回码");
  }

  const code = randomInt(100000, 999999).toString();
  await prisma.loginCode.create({
    data: {
      id: randomUUID(),
      email,
      codeHash: hashCode(email, code),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      createdAt: new Date(),
    },
  });
  const sent = await sendEmail(email, "猫啊岛验证码", otpEmailHtml(code));
  if (!sent) throw new Error("验证码发送失败，稍后再试");
  revalidatePath("/account");
}

export async function verifyEmailCode(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const confirmSwitch = formData.get("confirmSwitch") === "on";

  const result = await consumeLoginCode(email, code);
  if (result === "rate_limited") throw new Error("尝试次数过多，15 分钟后再试");
  if (result === "locked") throw new Error("这个验证码试错太多次已失效，请重新获取");
  if (result !== "ok") throw new Error("验证码不对或已过期");

  const uid = await ensureViewerId();
  const existing = await prisma.user.findUnique({ where: { email } });
  const jar = await cookies();

  if (existing && existing.id !== uid) {
    // 邮箱属于另一个身份：当前身份已有猫时，静默切换会遗弃它——必须显式确认
    const currentCat = await prisma.cat.findFirst({ where: { ownerId: uid } });
    if (currentCat && !confirmSwitch) {
      throw new Error(
        `这个邮箱已绑定另一只猫的主人。继续登录会离开当前的「${currentCat.name}」（它会留在这个浏览器身份下）。确认要切换的话，勾选"我知道，切换账户"后重试`,
      );
    }
    jar.set("maoadao_uid", existing.id, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
    await prisma.user.update({ where: { id: existing.id }, data: { lastActiveAt: new Date() } });
    await track("recover_success", { method: "email" });
    redirect("/my-cat");
  }

  // 首次绑定（或邮箱本就属于当前身份）→ 挂到当前身份
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
