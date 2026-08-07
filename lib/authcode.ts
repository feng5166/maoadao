import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "./db";

// 验证码核心逻辑（与 Server Action 解耦，可单测）。
// 防爆破：哈希存储、单码限试 5 次（先记后比）、按 key 滑动窗口限频、原子消费。

const MAX_ATTEMPTS_PER_CODE = 5;
const FAIL_WINDOW_MS = 15 * 60_000;
const MAX_FAILS_PER_WINDOW = 10;

export function hashCode(email: string, code: string): string {
  // 生产上不许回退到固定的 "dev-secret"(2026-08-07 review P2):
  // 那等于验证码哈希的密钥是公开常量,拿到库就能反推/伪造任何人的码。
  const secret = process.env.AUTH_SECRET ?? "";
  if (secret.length < 16) {
    if (process.env.NODE_ENV === "production") throw new Error("[authcode] AUTH_SECRET 缺失或过短:拒绝生成验证码哈希");
    return createHmac("sha256", secret || "dev-secret").update(`${email}:${code}`).digest("hex");
  }
  return createHmac("sha256", secret).update(`${email}:${code}`).digest("hex");
}

async function recordFail(kind: string, key: string) {
  await prisma.authAttempt
    .create({ data: { id: randomUUID(), kind, key, createdAt: new Date() } })
    .catch(() => {});
}

/** 滑动窗口限频：窗口内失败次数达到上限则拒绝 */
export async function failsInWindow(kind: string, key: string): Promise<number> {
  return prisma.authAttempt.count({
    where: { kind, key, createdAt: { gte: new Date(Date.now() - FAIL_WINDOW_MS) } },
  });
}

export type ConsumeResult = "ok" | "invalid" | "locked" | "rate_limited";

/** 校验并原子消费验证码。任何失败路径都计入审计。
 *  purpose/userId:一码一用途、锚定账户(doc/20 §七)——签发给"改邮箱"的码换不到"重置密码"。 */
export async function consumeLoginCode(
  email: string,
  code: string,
  opts: { purpose?: string; userId?: string | null } = {},
): Promise<ConsumeResult> {
  if ((await failsInWindow("verify_email_fail", email)) >= MAX_FAILS_PER_WINDOW) {
    return "rate_limited";
  }

  const row = await prisma.loginCode.findFirst({
    where: {
      email,
      usedAt: null,
      expiresAt: { gte: new Date() },
      purpose: opts.purpose ?? "VERIFY_EMAIL",
      ...(opts.userId ? { userId: opts.userId } : {}),
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) {
    await recordFail("verify_email_fail", email);
    return "invalid";
  }

  // 先占尝试名额（条件更新原子递增，超限即锁）：比对前记账，杜绝并发猜码
  const claimed = await prisma.loginCode.updateMany({
    where: { id: row.id, attemptCount: { lt: MAX_ATTEMPTS_PER_CODE }, usedAt: null },
    data: { attemptCount: { increment: 1 } },
  });
  if (claimed.count === 0) {
    await recordFail("verify_email_fail", email);
    return "locked";
  }

  const expect = Buffer.from(row.codeHash, "hex");
  const got = Buffer.from(hashCode(email, code), "hex");
  const match = expect.length === got.length && timingSafeEqual(expect, got);
  if (!match) {
    await recordFail("verify_email_fail", email);
    return "invalid";
  }

  // 原子消费：并发命中只允许一个赢家
  const consumed = await prisma.loginCode.updateMany({
    where: { id: row.id, usedAt: null, expiresAt: { gte: new Date() } },
    data: { usedAt: new Date() },
  });
  return consumed.count === 1 ? "ok" : "invalid";
}
