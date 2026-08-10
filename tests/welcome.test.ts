import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DB_READY, fx } from "./db-guard";
import { WELCOME } from "../lib/yard/config";

// 欢迎结算验收(16/14 §九②;20 唯一白名单):首摆 3-5 分钟内一位客人;
// 幂等一次性(HomeGrant "welcome" 闩);已有来访的院子不发;失败不挡摆放。

const users: string[] = [];

describe.skipIf(!TEST_DB_READY)("欢迎结算", () => {
  beforeAll(async () => {
    const { prisma } = await import("../lib/db");
    for (let i = 0; i < 5; i++) {
      try { await prisma.$queryRaw`SELECT 1`; return; } catch { await new Promise((r) => setTimeout(r, 2000)); }
    }
  }, 30_000);

  it("首摆后恰好一位欢迎客,3-5 分钟内到;重复摆放不再发", { timeout: 180_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { claimYard } = await import("../lib/yard/claim");
    const { placeItem } = await import("../lib/yard/commands");
    const uid = fx("u-welcome");
    users.push(uid);
    await prisma.inviteCode.create({ data: { code: fx("TK-w"), batch: "team", maxUses: 1, usedCount: 0, createdAt: new Date() } });
    const { yardId } = await claimYard(uid, fx("TK-w"));

    // 固定到当日白天窗(北京时 14:00,w5):深夜窗可能无合适欢迎客(空窗合法),别让测试跟着时区赌
    const now = (() => { const d = new Date(); d.setUTCHours(6, 0, 0, 0); return d; })();
    await placeItem(uid, "clearing", "old_cushion", now);
    const visits = await prisma.catVisit.findMany({ where: { yardId } });
    // 当前窗的确定性 roll 可能另有来访;欢迎客的判据=存在一位 arriveAt 在 now+3~5min 的客人
    const welcome = visits.filter((v) => {
      const dm = (v.arriveAt.getTime() - now.getTime()) / 60_000;
      return dm >= WELCOME.delayMinMin - 0.1 && dm <= WELCOME.delayMaxMin + 0.1;
    });
    expect(welcome.length).toBe(1);
    expect(welcome[0].visibility).toBe("FULL_RECORD");

    // 再摆一次:不再发第二位欢迎客
    await placeItem(uid, "eaves", "cardboard_box", new Date(now.getTime() + 60_000));
    const after = await prisma.catVisit.findMany({ where: { yardId } });
    const welcome2 = after.filter((v) => {
      const dm = (v.arriveAt.getTime() - now.getTime()) / 60_000;
      return dm >= WELCOME.delayMinMin - 0.1 && dm <= WELCOME.delayMaxMin + 5 + 0.1;
    });
    expect(welcome2.length).toBe(1);
    const grants = await prisma.homeGrant.findMany({ where: { batchKey: "welcome" } });
    expect(grants.some((g) => users.length > 0)).toBe(true);
  });
});

afterAll(async () => {
  if (!TEST_DB_READY) return;
  const { prisma } = await import("../lib/db");
  const homes = await prisma.home.findMany({ where: { userId: { in: users } }, include: { yard: true } });
  const yardIds = homes.map((h) => h.yard?.id).filter((x): x is string => Boolean(x));
  const homeIds = homes.map((h) => h.id);
  await prisma.observation.deleteMany({ where: { viewerId: { in: users } } });
  await prisma.catVisit.deleteMany({ where: { yardId: { in: yardIds } } });
  await prisma.windowSettlement.deleteMany({ where: { yardId: { in: yardIds } } });
  await prisma.placement.deleteMany({ where: { yardId: { in: yardIds } } });
  await prisma.yardSlot.deleteMany({ where: { yardId: { in: yardIds } } });
  await prisma.yard.deleteMany({ where: { id: { in: yardIds } } });
  await prisma.ownedItem.deleteMany({ where: { homeId: { in: homeIds } } });
  await prisma.homeGrant.deleteMany({ where: { homeId: { in: homeIds } } });
  await prisma.home.deleteMany({ where: { id: { in: homeIds } } });
  await prisma.inviteCode.deleteMany({ where: { code: { startsWith: fx("") } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});
