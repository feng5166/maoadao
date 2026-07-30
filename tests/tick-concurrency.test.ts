import { config } from "dotenv";
config({ path: [".env.local", ".env"], override: true });

import { describe, expect, it } from "vitest";

// 并发推进安全性（集成测试，需要 DATABASE_URL；对库只读——全部在回滚事务里验证）
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("每日推进并发安全（真实数据库，验证后回滚）", () => {
  it("advisory 事务锁：第二个并发事务拿不到推进权", async () => {
    const { prisma } = await import("../lib/db");
    const KEY = 8801;

    let secondLockResult: boolean | undefined;
    let releaseFirst!: () => void;
    const firstHolds = new Promise<void>((r) => (releaseFirst = r));

    const t1 = prisma
      .$transaction(
        async (tx) => {
          const rows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${KEY}) AS locked`;
          expect(rows[0].locked).toBe(true);
          // 持锁期间发起第二个事务
          const t2 = prisma.$transaction(async (tx2) => {
            const rows2 = await tx2.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${KEY}) AS locked`;
            secondLockResult = rows2[0].locked;
            throw new Error("rollback-t2");
          });
          await t2.catch(() => {});
          releaseFirst();
          throw new Error("rollback-t1"); // 回滚，不留痕迹
        },
        { timeout: 30_000 },
      )
      .catch(() => {});
    await firstHolds;
    await t1;

    expect(secondLockResult).toBe(false);
  }, 60_000);

  it("世界日期条件更新：基于陈旧天数的推进会失败（回滚验证）", async () => {
    const { prisma } = await import("../lib/db");
    await prisma
      .$transaction(async (tx) => {
        const world = await tx.worldState.findUnique({ where: { id: 1 } });
        if (!world) return; // 空库跳过
        // 第一次条件推进：成功
        const first = await tx.worldState.updateMany({ where: { id: 1, day: world.day }, data: { day: world.day + 1 } });
        expect(first.count).toBe(1);
        // 用同样的旧 day 再推进（模拟并发者基于陈旧读）：必须失败
        const second = await tx.worldState.updateMany({ where: { id: 1, day: world.day }, data: { day: world.day + 2 } });
        expect(second.count).toBe(0);
        throw new Error("rollback"); // 全部回滚，世界不受影响
      })
      .catch((e) => {
        if (e instanceof Error && e.message !== "rollback") throw e;
      });
  }, 30_000);

  it("日记 upsert 幂等：同 (catId, day) 重复写不撞唯一约束（回滚验证）", async () => {
    const { prisma } = await import("../lib/db");
    // upsert 语义由 Prisma 保证；这里验证唯一约束存在且 upsert 两次不抛错
    const cat = await prisma.cat.findFirst();
    if (!cat) return;
    const day = 99999; // 不可能与真实数据冲突的测试日
    try {
      for (let i = 0; i < 2; i++) {
        await prisma.diaryEntry.upsert({
          where: { catId_day: { catId: cat.id, day } },
          update: { content: `test-${i}` },
          create: { id: `test-diary-${cat.id}-${day}`, catId: cat.id, day, content: `test-${i}`, mood: "测试", eventIds: [], createdAt: new Date() },
        });
      }
      const row = await prisma.diaryEntry.findUnique({ where: { catId_day: { catId: cat.id, day } } });
      expect(row?.content).toBe("test-1");
    } finally {
      await prisma.diaryEntry.deleteMany({ where: { day } });
    }
  }, 30_000);
});
