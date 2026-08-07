import { config } from "dotenv";
config({ path: [".env.local", ".env"], override: true });

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

// 2026-08-06 review P2 的回归:「机会只有一次」必须是原子消费。
// 原实现先读 renamedAt 再按 id 更新——两个并发请求都能读到空值,第二次把第一次覆盖掉。
// 现改为 updateMany + where renamedAt:null,用影响行数判决。
// renameCat 本体依赖 cookies(),单测跑不了;这里测数据库层的那把锁。
// 用真库(自清理);跑不到库时整体跳过。
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("改名机会只有一次(review P2)", () => {
  const uids: string[] = [];
  const catIds: string[] = [];

  afterAll(async () => {
    const { prisma } = await import("../lib/db");
    await prisma.catState.deleteMany({ where: { catId: { in: catIds } } });
    await prisma.cat.deleteMany({ where: { id: { in: catIds } } });
    await prisma.user.deleteMany({ where: { id: { in: uids } } });
    await prisma.$disconnect();
  });

  async function makeCat() {
    const { prisma } = await import("../lib/db");
    const uid = `u-rename-${randomUUID()}`;
    const catId = `cat-rename-${randomUUID().slice(0, 8)}`;
    uids.push(uid);
    catIds.push(catId);
    await prisma.user.create({ data: { id: uid, name: "测试岛民", createdAt: new Date() } });
    await prisma.cat.create({
      data: {
        id: catId, name: "原名", isNpc: false, ownerId: uid, boldness: 50, sociability: 50, diligence: 50,
        personaTags: ["测试"], appearance: "测试", bio: "测试", createdAt: new Date(), state: { create: {} },
      },
    });
    return catId;
  }

  /** 与 renameCat 里同一句原子写 */
  async function claimRename(catId: string, name: string): Promise<number> {
    const { prisma } = await import("../lib/db");
    const r = await prisma.cat.updateMany({ where: { id: catId, renamedAt: null }, data: { name, renamedAt: new Date() } });
    return r.count;
  }

  it("并发两次改名,只有一次成功", async () => {
    const { prisma } = await import("../lib/db");
    const catId = await makeCat();

    const [a, b] = await Promise.all([claimRename(catId, "甲"), claimRename(catId, "乙")]);
    expect(a + b, "两个并发请求都改成了 = 机会被用了两次").toBe(1);

    const cat = await prisma.cat.findUnique({ where: { id: catId }, select: { name: true, renamedAt: true } });
    expect(["甲", "乙"]).toContain(cat!.name);
    expect(cat!.renamedAt).not.toBeNull();
  });

  it("已改过名的猫再改一次:影响行数为 0", async () => {
    const catId = await makeCat();
    expect(await claimRename(catId, "第一次")).toBe(1);
    expect(await claimRename(catId, "第二次")).toBe(0);

    const { prisma } = await import("../lib/db");
    const cat = await prisma.cat.findUnique({ where: { id: catId }, select: { name: true } });
    expect(cat!.name).toBe("第一次");
  });

  it("五路并发也只放行一次", async () => {
    const catId = await makeCat();
    const results = await Promise.all(["一", "二", "三", "四", "五"].map((n) => claimRename(catId, n)));
    expect(results.reduce((a, b) => a + b, 0)).toBe(1);
  });
});
