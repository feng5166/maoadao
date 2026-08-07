import { TEST_DB_READY } from "./db-guard";
// 让叙事 LLM 快速失败走兜底：测试关注的是数据一致性，不是文案质量
process.env.ANTHROPIC_AUTH_TOKEN = "invalid-for-test";
process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:1";

import { afterAll, describe, expect, it } from "vitest";

const hasDb = TEST_DB_READY; // 见 tests/db-guard.ts:没有 TEST_DATABASE_URL 就整体跳过,绝不误写生产库
const TEST_OWNER = "u-test-reliability";
const TEST_CATS = ["cat-test-rel-a", "cat-test-rel-b", "cat-test-firstday"];

describe.skipIf(!hasDb)("可靠性回归（真实数据库，测试数据自清理）", () => {
  afterAll(async () => {
    const { prisma } = await import("../lib/db");
    await prisma.$transaction([
      prisma.diaryEntry.deleteMany({ where: { catId: { in: TEST_CATS } } }),
      prisma.catDailySummary.deleteMany({ where: { catId: { in: TEST_CATS } } }),
      prisma.memoryEntry.deleteMany({ where: { catId: { in: TEST_CATS } } }),
      prisma.event.deleteMany({ where: { catId: { in: TEST_CATS } } }),
      prisma.relationship.deleteMany({ where: { OR: [{ catAId: { in: TEST_CATS } }, { catBId: { in: TEST_CATS } }] } }),
      prisma.storyline.deleteMany({ where: { catId: { in: TEST_CATS } } }),
      prisma.catState.deleteMany({ where: { catId: { in: TEST_CATS } } }),
      prisma.cat.deleteMany({ where: { id: { in: TEST_CATS } } }),
      prisma.user.deleteMany({ where: { id: TEST_OWNER } }),
    ]);
    await prisma.$disconnect();
  });

  it("一人一猫：并发创建同 owner 的两只猫，只有一只成功（数据库唯一约束）", async () => {
    const { prisma } = await import("../lib/db");
    await prisma.user.upsert({
      where: { id: TEST_OWNER },
      update: {},
      create: { id: TEST_OWNER, name: "测试", createdAt: new Date() },
    });
    const mk = (id: string) =>
      prisma.cat.create({
        data: {
          id,
          name: "并发猫",
          isNpc: false,
          ownerId: TEST_OWNER,
          boldness: 50,
          sociability: 50,
          diligence: 50,
          personaTags: ["测试"],
          appearance: "测试猫",
          bio: "测试",
          createdAt: new Date(),
        },
      });
    const results = await Promise.allSettled([mk("cat-test-rel-a"), mk("cat-test-rel-b")]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const dup = results.filter(
      (r) => r.status === "rejected" && (r.reason as { code?: string })?.code === "P2002",
    ).length;
    expect(ok).toBe(1);
    expect(dup).toBe(1);
    const count = await prisma.cat.count({ where: { ownerId: TEST_OWNER } });
    expect(count).toBe(1);
  }, 30_000);

  it("首日生成幂等：连续调用两次只产生一份事件/日记/摘要/事件线", async () => {
    const { prisma } = await import("../lib/db");
    const { generateArrivalDay } = await import("../lib/firstday");
    await prisma.cat.upsert({
      where: { id: "cat-test-firstday" },
      update: {},
      create: {
        id: "cat-test-firstday",
        name: "首日猫",
        isNpc: false,
        boldness: 50,
        sociability: 50,
        diligence: 50,
        personaTags: ["测试"],
        appearance: "测试猫",
        bio: "测试",
        createdAt: new Date(),
        state: { create: {} },
      },
    });
    await generateArrivalDay("cat-test-firstday");
    await generateArrivalDay("cat-test-firstday"); // 重试

    const [events, diaries, summaries, threads] = await Promise.all([
      prisma.event.count({ where: { catId: "cat-test-firstday" } }),
      prisma.diaryEntry.count({ where: { catId: "cat-test-firstday" } }),
      prisma.catDailySummary.count({ where: { catId: "cat-test-firstday" } }),
      prisma.storyline.count({ where: { catId: "cat-test-firstday", kind: "arrival_key" } }),
    ]);
    expect(events).toBe(3); // 到岛 + 旧钥匙 + 小秘密(doc/12 §八.7)，各一条
    expect(diaries).toBe(1);
    expect(summaries).toBe(1);
    expect(threads).toBe(1);
    // 追溯链：日记 eventIds 指向真实事件
    const diary = await prisma.diaryEntry.findFirst({ where: { catId: "cat-test-firstday" } });
    expect(diary?.eventIds.length).toBe(3);
  }, 60_000);

  it("叙事缺口探测：有事件无日记的猫会被 narrationGap 计入", async () => {
    const { prisma } = await import("../lib/db");
    const { narrationGap } = await import("../lib/sim/renarrate");
    const diary = await prisma.diaryEntry.findFirst({ where: { catId: "cat-test-firstday" } });
    if (!diary) return;
    // 删掉日记制造缺口 → gap 增加；补回后归零（对该猫而言）
    const world = await prisma.worldState.findUnique({ where: { id: 1 } });
    const baseline = await narrationGap(world?.day ?? 0);
    await prisma.diaryEntry.delete({ where: { id: diary.id } });
    const withGap = await narrationGap(world?.day ?? 0);
    // 首日猫的事件在当前世界日 → 缺日记应被计入
    expect(withGap).toBeGreaterThanOrEqual(baseline + (diary.day === world?.day ? 1 : 0));
    // 还原
    await prisma.diaryEntry.create({ data: { ...diary, eventIds: diary.eventIds } });
  }, 30_000);
});
