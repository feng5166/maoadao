import { TEST_DB_READY } from "./db-guard";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const hasDb = TEST_DB_READY; // 见 tests/db-guard.ts:没有 TEST_DATABASE_URL 就整体跳过,绝不误写生产库
const EMAIL = "brute-test@example.com";

describe.skipIf(!hasDb)("验证码防爆破（真实数据库，自清理）", () => {
  afterAll(async () => {
    const { prisma } = await import("../lib/db");
    await prisma.loginCode.deleteMany({ where: { email: EMAIL } });
    await prisma.authAttempt.deleteMany({ where: { key: EMAIL } });
    await prisma.$disconnect();
  });

  it("单个验证码最多尝试 5 次，之后即使猜对也失效", async () => {
    const { prisma } = await import("../lib/db");
    const { consumeLoginCode, hashCode } = await import("../lib/authcode");
    await prisma.authAttempt.deleteMany({ where: { key: EMAIL } });
    await prisma.loginCode.deleteMany({ where: { email: EMAIL } });
    await prisma.loginCode.create({
      data: { id: randomUUID(), email: EMAIL, codeHash: hashCode(EMAIL, "123456"), expiresAt: new Date(Date.now() + 600_000), createdAt: new Date() },
    });
    for (let i = 0; i < 5; i++) {
      expect(await consumeLoginCode(EMAIL, "000000")).toBe("invalid");
    }
    // 第 6 次起锁定——正确的码也进不来
    expect(await consumeLoginCode(EMAIL, "123456")).toBe("locked");
  }, 30_000);

  it("正确验证码只能被消费一次（原子消费）", async () => {
    const { prisma } = await import("../lib/db");
    const { consumeLoginCode, hashCode } = await import("../lib/authcode");
    await prisma.authAttempt.deleteMany({ where: { key: EMAIL } });
    await prisma.loginCode.deleteMany({ where: { email: EMAIL } });
    await prisma.loginCode.create({
      data: { id: randomUUID(), email: EMAIL, codeHash: hashCode(EMAIL, "654321"), expiresAt: new Date(Date.now() + 600_000), createdAt: new Date() },
    });
    expect(await consumeLoginCode(EMAIL, "654321")).toBe("ok");
    expect(await consumeLoginCode(EMAIL, "654321")).not.toBe("ok");
  }, 30_000);

  it("滑动窗口限频：连续失败达到上限后直接拒绝", async () => {
    const { prisma } = await import("../lib/db");
    const { consumeLoginCode } = await import("../lib/authcode");
    await prisma.authAttempt.deleteMany({ where: { key: EMAIL } });
    // 制造 10 条失败审计
    await prisma.authAttempt.createMany({
      data: Array.from({ length: 10 }, () => ({ id: randomUUID(), kind: "verify_email_fail", key: EMAIL, createdAt: new Date() })),
    });
    expect(await consumeLoginCode(EMAIL, "111111")).toBe("rate_limited");
  }, 30_000);

  it("数据库不存明文验证码", async () => {
    const { prisma } = await import("../lib/db");
    const { hashCode } = await import("../lib/authcode");
    const row = await prisma.loginCode.findFirst({ where: { email: EMAIL } });
    if (!row) return;
    expect(row.codeHash).not.toBe("654321");
    expect(row.codeHash).toBe(hashCode(EMAIL, "654321"));
  }, 15_000);
});
