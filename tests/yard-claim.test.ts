import { TEST_DB_READY, fx } from "./db-guard";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

// claimYard 幂等 CI（14 §九 护栏①，上线前必过）：
// 同一用户并发/重复执行 claimYard，最终 Home/Yard 唯一，初始资产恰好一份，
// 船票恰好核销一次。另测快照重建与 lazy settlement 的"晚算不晚取"。

const users: string[] = [];

async function makeTicket(code: string) {
  const { prisma } = await import("../lib/db");
  await prisma.inviteCode.create({
    data: { code, batch: "team", maxUses: 1, usedCount: 0, createdAt: new Date() },
  });
  return code;
}

describe.skipIf(!TEST_DB_READY)("claimYard 幂等与事务（护栏①）", () => {
  it("并发 5 次：Home/Yard 唯一、槽位 3、初始物件恰好 3、票只核销 1 次", async () => {
    const { prisma } = await import("../lib/db");
    const { claimYard } = await import("../lib/yard/claim");
    const uid = fx("u-conc");
    users.push(uid);
    const code = await makeTicket(fx("TICKET-A"));

    const results = await Promise.all(Array.from({ length: 5 }, () => claimYard(uid, code).catch((e) => e)));
    const oks = results.filter((r) => r && r.ok === true);
    expect(oks.length).toBeGreaterThan(0);
    const yardIds = new Set(oks.map((r) => r.yardId));
    expect(yardIds.size).toBe(1);

    const homes = await prisma.home.findMany({ where: { userId: uid } });
    expect(homes.length).toBe(1);
    const yards = await prisma.yard.findMany({ where: { homeId: homes[0].id } });
    expect(yards.length).toBe(1);
    expect(await prisma.yardSlot.count({ where: { yardId: yards[0].id } })).toBe(3);
    expect(await prisma.ownedItem.count({ where: { homeId: homes[0].id, source: "initial" } })).toBe(3);
    expect(await prisma.homeGrant.count({ where: { homeId: homes[0].id } })).toBe(1);
    const ticket = await prisma.inviteCode.findUnique({ where: { code } });
    expect(ticket?.usedCount).toBe(1);
  });

  it("已是岛民后重复调用（换一张新票）：直接回院子，不再核销", async () => {
    const { prisma } = await import("../lib/db");
    const { claimYard } = await import("../lib/yard/claim");
    const uid = fx("u-conc"); // 上一个用例已建院
    const code2 = await makeTicket(fx("TICKET-B"));
    const r = await claimYard(uid, code2);
    expect(r.ok).toBe(true);
    expect(r.created).toBe(false);
    const t2 = await prisma.inviteCode.findUnique({ where: { code: code2 } });
    expect(t2?.usedCount).toBe(0);
  });

  it("废票整体回滚：不留半个 Home", async () => {
    const { prisma } = await import("../lib/db");
    const { claimYard, ClaimError } = await import("../lib/yard/claim");
    const uid = fx("u-bad");
    users.push(uid);
    const code = await makeTicket(fx("TICKET-SPENT"));
    await prisma.inviteCode.update({ where: { code }, data: { usedCount: 1 } }); // 用光
    await expect(claimYard(uid, code)).rejects.toThrow(ClaimError);
    expect(await prisma.home.findUnique({ where: { userId: uid } })).toBeNull();
  });
});

describe.skipIf(!TEST_DB_READY)("快照与 lazy settlement（护栏②：晚算不晚取）", () => {
  it("窗口起点快照只含起点前的布置；后来的更换不改写历史", async () => {
    const { prisma } = await import("../lib/db");
    const { claimYard } = await import("../lib/yard/claim");
    const { snapshotAt, ensureWindowSettled } = await import("../lib/yard/settle");
    const { windowAt, windowStart } = await import("../lib/yard/time");

    const uid = fx("u-snap");
    users.push(uid);
    const code = await makeTicket(fx("TICKET-C"));
    const claim = await claimYard(uid, code);
    const yardId = claim.yardId;

    // 选一个已经开始的窗（3 小时前所在的窗）
    const past = new Date(Date.now() - 3 * 3600_000);
    const w = windowAt(past);
    const startAt = windowStart(w.dayKey, w.windowIndex);

    // 起点前摆了纸箱；起点后（现在）换成了陶罐
    await prisma.placement.create({
      data: { id: randomUUID(), yardId, slotKey: "eaves", itemKey: "cardboard_box", placedAt: new Date(startAt.getTime() - 3600_000) },
    });
    await prisma.placement.create({
      data: { id: randomUUID(), yardId, slotKey: "tree", itemKey: "clay_pot", placedAt: new Date(startAt.getTime() + 60_000) },
    });

    const snap = await snapshotAt(prisma, yardId, startAt);
    expect(snap).toEqual([{ slotKey: "eaves", itemKey: "cardboard_box" }]);

    // lazy 结算读起点快照，而非查询时现状
    const s1 = await ensureWindowSettled(yardId, w.dayKey, w.windowIndex);
    expect(s1).not.toBeNull();
    expect(s1!.placementSnapshot).toEqual([{ slotKey: "eaves", itemKey: "cardboard_box" }]);
    expect(s1!.rulesVersion).toBeTruthy();

    // 重复结算：收敛到同一事实（不重 roll）
    const s2 = await ensureWindowSettled(yardId, w.dayKey, w.windowIndex);
    expect(s2!.id).toBe(s1!.id);
    expect(s2!.visits.length).toBe(s1!.visits.length);
  });

  it("未开始的窗拒绝结算", async () => {
    const { ensureWindowSettled } = await import("../lib/yard/settle");
    const { windowAt } = await import("../lib/yard/time");
    const future = new Date(Date.now() + 6 * 3600_000);
    const w = windowAt(future);
    expect(await ensureWindowSettled("yard-nonexistent", w.dayKey, w.windowIndex)).toBeNull();
  });
});

afterAll(async () => {
  if (!TEST_DB_READY) return;
  const { prisma } = await import("../lib/db");
  const homes = await prisma.home.findMany({ where: { userId: { in: users } }, include: { yard: true } });
  const yardIds = homes.map((h) => h.yard?.id).filter((x): x is string => Boolean(x));
  const homeIds = homes.map((h) => h.id);
  await prisma.observation.deleteMany({ where: { visit: { yardId: { in: yardIds } } } });
  await prisma.catVisit.deleteMany({ where: { yardId: { in: yardIds } } });
  await prisma.windowSettlement.deleteMany({ where: { yardId: { in: yardIds } } });
  await prisma.placement.deleteMany({ where: { yardId: { in: yardIds } } });
  await prisma.yardSlot.deleteMany({ where: { yardId: { in: yardIds } } });
  await prisma.yard.deleteMany({ where: { id: { in: yardIds } } });
  await prisma.ownedItem.deleteMany({ where: { homeId: { in: homeIds } } });
  await prisma.homeGrant.deleteMany({ where: { homeId: { in: homeIds } } });
  await prisma.home.deleteMany({ where: { id: { in: homeIds } } });
  await prisma.inviteCode.deleteMany({ where: { issuedTo: { in: users } } }); // claimYard 发放的转赠票
  await prisma.inviteCode.deleteMany({ where: { code: { startsWith: fx("") } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});
