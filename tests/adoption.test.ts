import { config } from "dotenv";
config({ path: [".env.local", ".env"], override: true });
// 审核 LLM 快速失败走词表兜底（词表命中仍然拦截）——测试关注核销时序，不是文案
process.env.ANTHROPIC_AUTH_TOKEN = "invalid-for-test";
process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:1";

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

const T = 60_000;

const hasDb = Boolean(process.env.DATABASE_URL);
const U1 = "u-test-adopt-1";
const U2 = "u-test-adopt-2";
const U3 = "u-test-adopt-3";
const TICKET = "BOAT-TEST-ADOP-TION";

const baseInput = {
  name: "测试猫",
  appearance: "测试",
  bio: "",
  tagsRaw: "",
  ownerNick: "",
  goal: "chill",
  boldness: 50,
  sociability: 50,
  diligence: 50,
  ticket: TICKET,
};

describe.skipIf(!hasDb)("船票核销时序（真实数据库，自清理）", () => {
  afterAll(async () => {
    const { prisma } = await import("../lib/db");
    const cats = await prisma.cat.findMany({ where: { ownerId: { in: [U1, U2, U3] } }, select: { id: true } });
    const catIds = cats.map((c) => c.id);
    await prisma.$transaction([
      prisma.relationship.deleteMany({ where: { catAId: { in: catIds } } }),
      prisma.catState.deleteMany({ where: { catId: { in: catIds } } }),
      prisma.cat.deleteMany({ where: { id: { in: catIds } } }),
      prisma.user.deleteMany({ where: { id: { in: [U1, U2, U3] } } }),
      prisma.inviteCode.deleteMany({ where: { code: TICKET } }),
      prisma.authAttempt.deleteMany({ where: { key: { in: [U1, U2, U3] } } }),
    ]);
    await prisma.$disconnect();
  }, T);

  async function ticketUses(): Promise<number> {
    const { prisma } = await import("../lib/db");
    const t = await prisma.inviteCode.findUnique({ where: { code: TICKET } });
    return t?.usedCount ?? -1;
  }

  it("准备：建一张 5 次船票", async () => {
    const { prisma } = await import("../lib/db");
    await prisma.inviteCode.deleteMany({ where: { code: TICKET } });
    await prisma.inviteCode.create({ data: { code: TICKET, batch: "team", maxUses: 5, createdAt: new Date() } });
    expect(await ticketUses()).toBe(0);
  }, T);

  it("审核不通过（词表命中）不扣票", async () => {
    const { adoptCat, AdoptError } = await import("../lib/adoption");
    await expect(adoptCat(U1, { ...baseInput, name: "傻逼" })).rejects.toThrow(AdoptError);
    expect(await ticketUses()).toBe(0);
  }, T);

  it("正常领养扣一次票", async () => {
    const { adoptCat } = await import("../lib/adoption");
    const r = await adoptCat(U1, baseInput);
    expect(r.ok).toBe(true);
    expect(await ticketUses()).toBe(1);
  }, T);

  it("已有猫的用户重复提交不扣票", async () => {
    const { adoptCat } = await import("../lib/adoption");
    const r = await adoptCat(U1, baseInput);
    expect(r.ok).toBe(false);
    expect(await ticketUses()).toBe(1);
  }, T);

  it("并发领养只扣一次票（输家回滚）", async () => {
    const { adoptCat } = await import("../lib/adoption");
    const { prisma } = await import("../lib/db");
    const results = await Promise.allSettled([adoptCat(U2, baseInput), adoptCat(U2, baseInput)]);
    const okCount = results.filter((r) => r.status === "fulfilled" && (r.value as { ok: boolean }).ok).length;
    expect(okCount).toBeGreaterThanOrEqual(1);
    expect(await prisma.cat.count({ where: { ownerId: U2 } })).toBe(1);
    // 票最多多扣……不：必须恰好 +1（输家事务回滚退票）
    expect(await ticketUses()).toBe(2);
  }, T);

  it("无效船票不建猫且计入限频审计", async () => {
    const { adoptCat, AdoptError } = await import("../lib/adoption");
    const { prisma } = await import("../lib/db");
    await expect(adoptCat(U3, { ...baseInput, ticket: "BOAT-NOPE-NOPE-NOPE" })).rejects.toThrow(AdoptError);
    expect(await prisma.cat.count({ where: { ownerId: U3 } })).toBe(0);
    expect(await prisma.authAttempt.count({ where: { kind: "invite_fail", key: U3 } })).toBeGreaterThanOrEqual(1);
  }, T);
});
