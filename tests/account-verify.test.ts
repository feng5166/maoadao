import { TEST_DB_READY } from "./db-guard";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

// doc/20 §八 铁律的回归测试:验证码只证明邮箱归属,永远不能用来登录或接管账户。
// 用真库(自清理);跑不到库时整体跳过。
const hasDb = TEST_DB_READY; // 见 tests/db-guard.ts:没有 TEST_DATABASE_URL 就整体跳过,绝不误写生产库
const VICTIM = "victim-verify-test@example.com";
const OTHER = "other-verify-test@example.com";

describe.skipIf(!hasDb)("邮箱验证不能接管账户(doc/20 §八)", () => {
  afterAll(async () => {
    const { prisma } = await import("../lib/db");
    await prisma.loginCode.deleteMany({ where: { email: { in: [VICTIM, OTHER] } } });
    await prisma.user.deleteMany({ where: { email: { in: [VICTIM, OTHER] } } });
    await prisma.$disconnect();
  });

  it("一码一用途:签发给确认邮箱的码,换不到重置密码", async () => {
    const { prisma } = await import("../lib/db");
    const { hashCode, consumeLoginCode } = await import("../lib/authcode");
    const uid = `u-test-${randomUUID()}`;
    await prisma.user.create({
      data: { id: uid, name: "测试岛民", email: VICTIM, status: "registered", createdAt: new Date() },
    });
    await prisma.loginCode.create({
      data: {
        id: randomUUID(),
        email: VICTIM,
        purpose: "VERIFY_EMAIL",
        userId: uid,
        codeHash: hashCode(VICTIM, "123456"),
        expiresAt: new Date(Date.now() + 600_000),
        createdAt: new Date(),
      },
    });

    // 拿 VERIFY_EMAIL 的码去兑 RESET_PASSWORD:找不到匹配的挑战
    const crossPurpose = await consumeLoginCode(VICTIM, "123456", { purpose: "RESET_PASSWORD", userId: uid });
    expect(crossPurpose).toBe("invalid");

    // 同一个码换错账户也不行(锚定 userId)
    const wrongUser = await consumeLoginCode(VICTIM, "123456", { purpose: "VERIFY_EMAIL", userId: `u-test-${randomUUID()}` });
    expect(wrongUser).toBe("invalid");

    // 用途与账户都对才放行
    const ok = await consumeLoginCode(VICTIM, "123456", { purpose: "VERIFY_EMAIL", userId: uid });
    expect(ok).toBe("ok");
  }, 30_000);

  // 注:confirmEmailCode/changeLoginEmail 依赖 Next 请求上下文(cookies),
  // 单测里跑不起来;它们的安全性由"锚定 userId + 一码一用途"这条底座保证,即上面那条用例。

  it("挑战锚定账户:别人的邮箱挑战改不动我的账户", async () => {
    const { prisma } = await import("../lib/db");
    const { hashCode, consumeLoginCode } = await import("../lib/authcode");
    const attacker = `u-test-${randomUUID()}`;
    // 攻击者为受害者邮箱签发一份自己的挑战(伪造锚定)
    await prisma.loginCode.create({
      data: {
        id: randomUUID(), email: VICTIM, purpose: "VERIFY_EMAIL", userId: attacker,
        codeHash: hashCode(VICTIM, "654321"), expiresAt: new Date(Date.now() + 600_000), createdAt: new Date(),
      },
    });
    // 受害者账户去消费时按自己的 userId 查——查不到攻击者那份
    const victim = await prisma.user.findUnique({ where: { email: VICTIM } });
    const r = await consumeLoginCode(VICTIM, "654321", { purpose: "VERIFY_EMAIL", userId: victim!.id });
    expect(r).toBe("invalid");
  }, 30_000);

  it("未确认归属的邮箱不能走邮件重置(响应保持中性)", async () => {
    const { prisma } = await import("../lib/db");
    const { requestPasswordResetEmail } = await import("../lib/account-actions");
    const uid = `u-test-${randomUUID()}`;
    await prisma.user.create({
      data: {
        id: uid, name: "测试岛民", email: OTHER, status: "registered",
        passwordHash: "x", emailVerifiedAt: null, createdAt: new Date(),
      },
    });
    const fd = new FormData();
    fd.set("email", OTHER);
    const r = await requestPasswordResetEmail(fd);
    expect(r.ok).toBe(true); // 对外中性,不暴露账户状态
    // 但实际上没有签发任何重置挑战
    const issued = await prisma.loginCode.count({ where: { email: OTHER, purpose: "RESET_PASSWORD" } });
    expect(issued).toBe(0);
  }, 30_000);
});
