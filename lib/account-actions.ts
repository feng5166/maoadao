"use server";

import { randomUUID, randomInt, randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { cookies, headers } from "next/headers";
import { track } from "@vercel/analytics/server";
import { prisma } from "./db";
import { getViewerId, getSessionId, ensureViewerId } from "./identity";
import { endCurrentSession, revokeAllSessions, startSession } from "./session";
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
  // 已经设过登录凭证的账户:钥匙不再单独开门(那样等于绕过密码)——
  // 走「忘记密码」的邮箱+钥匙双因子重置(doc/20 §三)
  if (user.passwordHash) {
    throw new Error("这个账户已经设过登录邮箱和密码——用邮箱和密码登录;忘了密码就去「忘记密码」用钥匙重置");
  }
  const jar = await cookies();
  jar.set("maoadao_uid", user.id, { httpOnly: true, sameSite: "lax", secure: true, maxAge: 60 * 60 * 24 * 365, path: "/" });
  await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
  await track("recover_success", { method: "code" });
  redirect("/my-cat");
}

// ============ 邮箱验证(doc/20 §八 铁律)============
// 验证码只证明"这个邮箱属于你",**永远不能用来登录或接管账户**——
// 收到验证邮件的人只有码、没有密码,拿不走别人的猫。跨设备回岛一律走邮箱+密码。

/** 签发一封验证码邮件。锚定账户与用途,一码一用。 */
async function issueCode(email: string, purpose: string, userId: string | null): Promise<{ ok: boolean; err?: string }> {
  const recent = await prisma.loginCode.findFirst({
    where: { email, purpose, createdAt: { gte: new Date(Date.now() - 60_000) } },
  });
  if (recent) return { ok: false, err: "发太快了,一分钟后再试" };
  if (!emailEnabled()) return { ok: false, err: "岛外邮路还没通,先用回岛钥匙" };

  const code = randomInt(100000, 999999).toString();
  await prisma.loginCode.create({
    data: {
      id: randomUUID(),
      email,
      purpose,
      userId,
      codeHash: hashCode(email, code),
      expiresAt: new Date(Date.now() + 10 * 60_000),
      createdAt: new Date(),
    },
  });
  const sent = await sendEmail(email, "猫啊岛验证码", otpEmailHtml(code));
  if (!sent) return { ok: false, err: "验证码没寄出去,稍后再试" };
  return { ok: true };
}

function codeError(result: string): string | null {
  if (result === "rate_limited") return "尝试次数过多,15 分钟后再试";
  if (result === "locked") return "这个验证码试错太多次已失效,请重新获取";
  if (result !== "ok") return "验证码不对或已过期";
  return null;
}

/** 当前账户请求确认自己的登录邮箱(必须已设密码——只有知道密码的人能发起验证) */
export async function requestVerifyEmailCode(): Promise<{ ok: boolean; err?: string; email?: string }> {
  const uid = await getViewerId();
  const user = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null;
  if (!user?.email || !user.passwordHash) return { ok: false, err: "先设置登录邮箱和密码,再来确认它" };
  if (user.emailVerifiedAt) return { ok: true, email: user.email };
  const r = await issueCode(user.email, "VERIFY_EMAIL", user.id);
  return r.ok ? { ok: true, email: user.email } : r;
}

/** 确认登录邮箱:只把当前账户自己的邮箱标记为已确认,不切换任何身份 */
export async function confirmEmailCode(formData: FormData): Promise<{ ok: boolean; err?: string }> {
  const code = String(formData.get("code") ?? "").trim();
  const uid = await getViewerId();
  const user = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null;
  if (!user?.email || !user.passwordHash) return { ok: false, err: "先设置登录邮箱和密码,再来确认它" };

  const result = await consumeLoginCode(user.email, code, { purpose: "VERIFY_EMAIL", userId: user.id });
  const err = codeError(result);
  if (err) return { ok: false, err };

  await prisma.user.update({ where: { id: user.id }, data: { emailVerifiedAt: new Date() } });
  await track("email_verified", {});
  revalidatePath("/account");
  return { ok: true };
}

/** 修改登录邮箱(doc/20 §八 的逃生舱:填错邮箱要能自己改回来)。
 *  需当前密码;不验证旧邮箱;新邮箱立即生效但回到未确认态,想用邮件找回再去确认。 */
export async function changeLoginEmail(formData: FormData): Promise<{ ok: boolean; err?: string }> {
  const newEmail = String(formData.get("newEmail") ?? "").trim().toLowerCase();
  const pw = String(formData.get("currentPassword") ?? "");
  if (!EMAIL_RE.test(newEmail)) return { ok: false, err: "邮箱格式不对,检查一下" };

  const uid = await getViewerId();
  const user = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null;
  if (!user?.passwordHash) return { ok: false, err: "先设置登录邮箱和密码" };
  if ((await failsInWindow("login_fail", `${uid}:change_email`)) >= 8) return { ok: false, err: "试得太频繁,15 分钟后再来" };

  const { verifyPassword } = await import("./password");
  if (!verifyPassword(pw, user.passwordHash)) {
    await prisma.authAttempt.create({ data: { id: randomUUID(), kind: "login_fail", key: `${uid}:change_email`, createdAt: new Date() } }).catch(() => {});
    return { ok: false, err: "当前密码不正确" };
  }
  if (newEmail === (user.email ?? "").toLowerCase()) return { ok: false, err: "这就是现在的登录邮箱" };

  const taken = await prisma.user.findUnique({ where: { email: newEmail } });
  if (taken && taken.id !== user.id) return { ok: false, err: UNIFORM_TAKEN_ERR };

  // 换邮箱 = 换登录名:新地址未经确认,能力回到未验证档
  await prisma.user.update({ where: { id: user.id }, data: { email: newEmail, emailVerifiedAt: null } });
  await track("email_changed", {});
  revalidatePath("/account");
  return { ok: true };
}

/** 修改密码:需当前密码。回岛钥匙不变(它是离线灾备,不因改密码作废)。 */
export async function changePassword(formData: FormData): Promise<{ ok: boolean; err?: string }> {
  const cur = String(formData.get("currentPassword") ?? "");
  const pw = String(formData.get("password") ?? "");
  const pw2 = String(formData.get("password2") ?? "");
  if (pw !== pw2) return { ok: false, err: "两次输入的新密码不一样" };

  const uid = await getViewerId();
  const user = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null;
  if (!user?.passwordHash) return { ok: false, err: "还没有设置过密码" };
  if ((await failsInWindow("login_fail", `${uid}:change_pw`)) >= 8) return { ok: false, err: "试得太频繁,15 分钟后再来" };

  const { verifyPassword, passwordPolicyError, hashPassword } = await import("./password");
  if (!verifyPassword(cur, user.passwordHash)) {
    await prisma.authAttempt.create({ data: { id: randomUUID(), kind: "login_fail", key: `${uid}:change_pw`, createdAt: new Date() } }).catch(() => {});
    return { ok: false, err: "当前密码不正确" };
  }
  const policyErr = passwordPolicyError(pw);
  if (policyErr) return { ok: false, err: policyErr };

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(pw) } });
  // 换了密码,旧令牌一律作废——包括可能被盗的那一个。全踢之后给这台设备换发新会话:
  // 本人无感,别处(含窃取者)当场掉线(2026-08-06 review P1)。
  const revoked = await revokeAllSessions(user.id);
  await startSession(user.id);
  await track("password_changed", { revokedSessions: revoked });
  revalidatePath("/account");
  return { ok: true };
}

// ---- 邮件重置密码(已确认邮箱才有的能力,doc/20 §六)----

/** 请求重置邮件。响应对"邮箱是否存在/是否已确认"一律中性,防账号枚举。 */
export async function requestPasswordResetEmail(formData: FormData): Promise<{ ok: boolean; err?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return { ok: false, err: "邮箱格式不对,检查一下" };
  const user = await prisma.user.findUnique({ where: { email } });
  // 只有"已确认归属 + 已设密码"的账户才真的寄信;其余情况静默走过,对外表现一致
  if (user?.emailVerifiedAt && user.passwordHash) {
    const r = await issueCode(email, "RESET_PASSWORD", user.id);
    // ⚠️ 失败原因**绝不外抛**:限频("一分钟后再试")或发信失败一旦回给前台,
    // 连点两次就能分辨"这个邮箱存在且已验证",中性响应形同虚设(review P2)。
    // 只写内部日志——真实用户没收到信会自己再试或走回岛钥匙。
    if (!r.ok) console.warn("[reset-email] 未寄出(对外仍中性):", r.err);
  }
  return { ok: true };
}

/** 用邮件验证码设新密码。回岛钥匙保持不变(没被用到就不必旋转)。 */
export async function resetPasswordWithEmailCode(formData: FormData): Promise<{ ok: boolean; err?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim();
  const pw = String(formData.get("password") ?? "");
  const pw2 = String(formData.get("password2") ?? "");
  if (pw !== pw2) return { ok: false, err: "两次输入的密码不一样" };
  const { passwordPolicyError, hashPassword } = await import("./password");
  const policyErr = passwordPolicyError(pw);
  if (policyErr) return { ok: false, err: policyErr };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.emailVerifiedAt || !user.passwordHash) return { ok: false, err: "验证码不对或已过期" };

  const result = await consumeLoginCode(email, code, { purpose: "RESET_PASSWORD", userId: user.id });
  const err = codeError(result);
  if (err) return { ok: false, err };

  await prisma.user.update({ where: { id: user.id }, data: { passwordHash: hashPassword(pw) } });
  // 重置路径上人还没登录:全部旧会话作废,不换发——让他用新密码正常登录一次
  const revoked = await revokeAllSessions(user.id);
  await track("password_reset", { method: "email", revokedSessions: revoked });
  return { ok: true };
}

// ============ 登录凭证(doc/20 渐进验证):邮箱+密码注册即用,验证是能力升级门槛 ============

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UNIFORM_LOGIN_ERR = "邮箱或密码不正确"; // 统一话术,防账号枚举
const UNIFORM_TAKEN_ERR = "无法使用这个邮箱。可以试着用它登录,或者换一个邮箱";

/** 把当前设备身份存进岛民册:设置登录邮箱+密码,立即生效(邮箱状态 UNVERIFIED) */
export async function setupCredentials(formData: FormData): Promise<{ ok: boolean; err?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const pw = String(formData.get("password") ?? "");
  const pw2 = String(formData.get("password2") ?? "");
  if (!EMAIL_RE.test(email)) return { ok: false, err: "邮箱格式不对,检查一下" };
  if (pw !== pw2) return { ok: false, err: "两次输入的密码不一样" };
  const { passwordPolicyError, hashPassword } = await import("./password");
  const policyErr = passwordPolicyError(pw);
  if (policyErr) return { ok: false, err: policyErr };

  const uid = await ensureViewerId();
  if ((await failsInWindow("setup_fail", uid)) >= 8) return { ok: false, err: "试得太频繁,15 分钟后再来" };

  const taken = await prisma.user.findUnique({ where: { email } });
  if (taken && taken.id !== uid) {
    await prisma.authAttempt.create({ data: { id: randomUUID(), kind: "setup_fail", key: uid, createdAt: new Date() } }).catch(() => {});
    return { ok: false, err: UNIFORM_TAKEN_ERR };
  }

  await prisma.user.upsert({
    where: { id: uid },
    // 注意:不动 emailVerifiedAt——注册即用,验证归验证(doc/20)
    update: { email, passwordHash: hashPassword(pw), status: "registered" },
    create: { id: uid, name: "岛民", email, passwordHash: hashPassword(pw), status: "registered", createdAt: new Date() },
  });
  // 设了凭证之后 uid cookie 不再单独算登录——当场换发会话,否则这台设备立刻掉线
  await startSession(uid);
  await track("credentials_setup", {});
  revalidatePath("/account");
  return { ok: true };
}

/** 邮箱+密码登录(跨设备回岛)。统一报错;当前设备已有别的猫时需显式确认切换。 */
export async function loginWithPassword(formData: FormData): Promise<{ ok: boolean; err?: string; needSwitch?: boolean }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const pw = String(formData.get("password") ?? "");
  const confirmSwitch = formData.get("confirmSwitch") === "on";
  if (!email || !pw) return { ok: false, err: UNIFORM_LOGIN_ERR };

  // uid 仍用于"切换保护"(判断这台设备上是不是已经住着另一只猫),但**不再参与限流键**
  const uid = (await getViewerId()) ?? "anon";
  // 限流键不能只挂在匿名 cookie 上(2026-08-07 review P2):uid 来自客户端,
  // 清一下 cookie 就换到新的八次窗口,等于没限。改为**账号维度 + 来源 IP 维度**
  // 双闸:账号闸挡"盯着一个邮箱撞",IP 闸挡"换着邮箱撞"。
  const ip =
    (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() ||
    (await headers()).get("x-real-ip") ||
    "noip";
  const acctKey = `email:${email}`;
  const ipKey = `ip:${ip}`;
  if ((await failsInWindow("login_fail", acctKey)) >= 8 || (await failsInWindow("login_fail", ipKey)) >= 30) {
    return { ok: false, err: "尝试次数过多,15 分钟后再试" };
  }
  const fail = async () => {
    // 两个维度各记一次:任一超阈值都拦
    await prisma.authAttempt
      .createMany({
        data: [
          { id: randomUUID(), kind: "login_fail", key: acctKey, createdAt: new Date() },
          { id: randomUUID(), kind: "login_fail", key: ipKey, createdAt: new Date() },
        ],
      })
      .catch(() => {});
    return { ok: false as const, err: UNIFORM_LOGIN_ERR };
  };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user?.passwordHash) return fail();
  const { verifyPassword } = await import("./password");
  if (!verifyPassword(pw, user.passwordHash)) return fail();

  // 切换保护:当前设备已有另一只猫,静默切换等于遗弃它
  if (uid !== "anon" && user.id !== uid) {
    const currentCat = await prisma.cat.findFirst({ where: { ownerId: uid } });
    if (currentCat && !confirmSwitch) {
      return {
        ok: false,
        needSwitch: true,
        err: `这台设备上还住着「${currentCat.name}」——登录后它会留在原来的身份下。确认要切换,勾选后重试`,
      };
    }
  }
  // 登录前先看这个账户原本有没有别的活跃设备——用来判断是不是"新设备登录"
  const priorSessions = await prisma.session.count({ where: { userId: user.id, revokedAt: null } });
  await startSession(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } });
  await track("login_success", { method: "password" });

  // 异常登录提醒(doc/20 §八):账户已有别的设备在线 + 邮箱已确认归属 → 寄一封知会信。
  // after() 里发,不挡登录;失败只记日志。
  if (priorSessions > 0 && user.emailVerifiedAt && user.email) {
    const ua = (await headers()).get("user-agent") ?? "";
    const email = user.email;
    after(async () => {
      const { newDeviceLoginEmailHtml } = await import("./email");
      await sendEmail(email, "猫啊岛:有新设备登录了你的账户", newDeviceLoginEmailHtml(ua)).catch(() => false);
    });
  }
  redirect("/my-cat");
}

/** 踢出其他设备:作废本账户除当前会话外的全部会话 */
export async function revokeOtherSessions(): Promise<{ ok: boolean; revoked?: number; err?: string }> {
  const uid = await getViewerId();
  const sid = await getSessionId();
  if (!uid || !sid) return { ok: false, err: "先登录再管理设备" };
  const r = await prisma.session.updateMany({
    where: { userId: uid, revokedAt: null, id: { not: sid } },
    data: { revokedAt: new Date() },
  });
  await track("sessions_revoked", { count: r.count });
  revalidatePath("/account");
  return { ok: true, revoked: r.count };
}

/** 看完整的回岛钥匙:已设密码的账户必须验一次密码——钥匙等同身份,不在页面源码里裸奔 */
export async function revealRecoveryKey(formData: FormData): Promise<{ ok: boolean; code?: string; err?: string }> {
  const pw = String(formData.get("password") ?? "");
  const uid = await getViewerId();
  const user = uid ? await prisma.user.findUnique({ where: { id: uid } }) : null;
  if (!user) return { ok: false, err: "先登录" };

  if (user.passwordHash) {
    if ((await failsInWindow("login_fail", `${uid}:reveal`)) >= 8) return { ok: false, err: "试得太频繁,15 分钟后再来" };
    const { verifyPassword } = await import("./password");
    if (!verifyPassword(pw, user.passwordHash)) {
      await prisma.authAttempt.create({ data: { id: randomUUID(), kind: "login_fail", key: `${uid}:reveal`, createdAt: new Date() } }).catch(() => {});
      return { ok: false, err: "密码不正确" };
    }
  }
  const code = user.recoveryCode ?? (await ensureRecoveryCode());
  if (!code) return { ok: false, err: "还没有钥匙" };
  return { ok: true, code };
}

/** 忘记密码:登录邮箱 + 回岛钥匙 → 设新密码;旧钥匙作废并旋转,新钥匙当场展示一次。不自动登录。 */
export async function resetPasswordWithRecovery(formData: FormData): Promise<{ ok: boolean; err?: string; newKey?: string }> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const code = String(formData.get("code") ?? "").trim().toUpperCase();
  const pw = String(formData.get("password") ?? "");
  const pw2 = String(formData.get("password2") ?? "");
  if (!email || !code) return { ok: false, err: "邮箱和回岛钥匙都要填" };
  if (pw !== pw2) return { ok: false, err: "两次输入的密码不一样" };
  const { passwordPolicyError, hashPassword } = await import("./password");
  const policyErr = passwordPolicyError(pw);
  if (policyErr) return { ok: false, err: policyErr };

  const uid = (await getViewerId()) ?? "anon";
  if ((await failsInWindow("recover_fail", uid)) >= 5) return { ok: false, err: "尝试次数过多,15 分钟后再试" };

  // 双因子匹配:钥匙 + 登录邮箱必须同属一人
  const user = await prisma.user.findUnique({ where: { recoveryCode: code } });
  if (!user || (user.email ?? "").toLowerCase() !== email) {
    await prisma.authAttempt.create({ data: { id: randomUUID(), kind: "recover_fail", key: uid, createdAt: new Date() } }).catch(() => {});
    return { ok: false, err: "邮箱或回岛钥匙不对" };
  }
  const newKey = makeRecoveryCode();
  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: hashPassword(pw), recoveryCode: newKey },
  });
  // 钥匙路径同理:密码换了,旧会话一律作废(能拿钥匙重置的人,不该继续背着旧令牌)
  const revoked = await revokeAllSessions(user.id);
  await track("password_reset", { method: "recovery_key", revokedSessions: revoked });
  // 不自动登录(doc/20):让用户走一次正常登录;新钥匙当场展示,这是唯一一次
  return { ok: true, newKey };
}

/** 退出登录:作废这台设备的会话并清 cookie(UI 只对已设密码的用户展示——匿名身份退出即失联) */
export async function logout() {
  await endCurrentSession();
  const jar = await cookies();
  jar.delete("maoadao_uid");
  redirect("/");
}

export async function toggleNotify() {
  const uid = await getViewerId();
  if (!uid) return;
  const user = await prisma.user.findUnique({ where: { id: uid } });
  if (!user) return;
  await prisma.user.update({ where: { id: uid }, data: { notifyDaily: !user.notifyDaily } });
  revalidatePath("/account");
}

// ============ 送它离开：放弃当前的猫，重新领养 ============
// 世界观口径是"送它离开小岛"，数据口径是彻底删除——日记/照片/关系/记忆一并清空，无法找回。
// 重新领养走正常流程（需要一张新船票）。visitDays/lastSeenDay 归零，新猫的关系曲线从头开始。

export async function releaseCat(formData: FormData) {
  if (formData.get("confirmRelease") !== "on") {
    throw new Error("要送它离开的话，先勾选确认——这一步没有回头路");
  }
  const uid = await getViewerId();
  if (!uid) return;
  const cat = await prisma.cat.findFirst({ where: { ownerId: uid, isNpc: false } });
  if (!cat) return;

  await prisma.$transaction(
    async (tx) => {
      const summaries = await tx.catDailySummary.findMany({ where: { catId: cat.id }, select: { id: true } });
      if (summaries.length > 0) {
        await tx.contentRating.deleteMany({ where: { summaryId: { in: summaries.map((s) => s.id) } } });
      }
      // 无外键的表直接清
      await tx.catDailySummary.deleteMany({ where: { catId: cat.id } });
      await tx.event.deleteMany({ where: { catId: cat.id } });
      await tx.relationship.deleteMany({ where: { OR: [{ catAId: cat.id }, { catBId: cat.id }] } });
      await tx.memoryEntry.deleteMany({ where: { catId: cat.id } });
      await tx.ownerNudge.deleteMany({ where: { catId: cat.id } });
      await tx.portrait.deleteMany({ where: { catId: cat.id } });
      await tx.catPose.deleteMany({ where: { catId: cat.id } });
      // 留声也要删:/api/voice/[catId] 是公开接口,留着等于旧猫的声音还能被放出来
      await tx.catVoiceNote.deleteMany({ where: { catId: cat.id } });
      // 已排队未发的旧猫消息:不删的话,猫都离岛了微信还会替它说话
      await tx.outboundMessage.deleteMany({ where: { catId: cat.id } });
      await tx.arrivalPhoto.deleteMany({ where: { catId: cat.id } });
      await tx.arrivalNote.deleteMany({ where: { catId: cat.id } });
      await tx.weekBook.deleteMany({ where: { catId: cat.id } });
      await tx.newsTip.deleteMany({ where: { catId: cat.id } });
      await tx.islandNews.deleteMany({ where: { catId: cat.id } });
      await tx.item.deleteMany({ where: { catId: cat.id } });
      // 2.1 院子事实（用户猫理论上不进来访池，但"清干净"不变量按 schema 全覆盖）：
      // 先删观察（外键挂来访），再删来访与机会累积
      const visits = await tx.catVisit.findMany({ where: { catId: cat.id }, select: { id: true } });
      if (visits.length > 0) {
        await tx.observation.deleteMany({ where: { visitId: { in: visits.map((v) => v.id) } } });
      }
      await tx.catVisit.deleteMany({ where: { catId: cat.id } });
      await tx.catOpportunityState.deleteMany({ where: { catId: cat.id } });
      // Birth Canon 与经历层（用户猫一般不建档，同样按不变量全覆盖）
      await tx.catProfile.deleteMany({ where: { catId: cat.id } });
      await tx.sealedCatCanon.deleteMany({ where: { catId: cat.id } });
      await tx.lifeImprint.deleteMany({ where: { catId: cat.id } });
      // 有外键约束的子表先删，最后删猫
      await tx.diaryEntry.deleteMany({ where: { catId: cat.id } });
      await tx.storyline.deleteMany({ where: { catId: cat.id } });
      await tx.catState.deleteMany({ where: { catId: cat.id } });
      await tx.cat.delete({ where: { id: cat.id } });
      // 回访计数归零：新猫的关系曲线（bondStage）从头开始
      await tx.user.update({ where: { id: uid }, data: { lastSeenDay: null, visitDays: 0 } });
    },
    { timeout: 15000 },
  );

  await track("release_cat", {});
  revalidatePath("/");
  // 不直接落领养表单——先经过「船开走了」的过场，给告别一个收尾
  redirect("/account/farewell/sailed");
}
