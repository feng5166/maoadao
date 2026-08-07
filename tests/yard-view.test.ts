import { TEST_DB_READY, fx } from "./db-guard";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { nextWindowAfter } from "../lib/yard/commands";
import { windowStart } from "../lib/yard/time";

// 竖切验收（14 §九 后续实现约束）：
// Case A：FULL_RECORD → 看到完整来访；Case B：TRACE_ONLY → 只看到痕迹，
// **认知层数据不得出现可反推 catId 的字段**（18 归因红线的 API 面）。
// 另测：collect 只确认既有 entitlement（并发/重放不重复入账）、
// 页面访问不创造结果、浮现纪律（arriveAt 未到的事实不可见）。

const users: string[] = [];

describe("摆放生效点（纯逻辑）", () => {
  it("effectiveFrom 永远是下一个尚未开始的窗", () => {
    for (const iso of ["2026-08-07T02:00:00Z", "2026-08-07T10:14:00Z", "2026-08-07T15:59:00Z", "2026-08-07T23:30:00Z"]) {
      const now = new Date(iso);
      const next = nextWindowAfter(now);
      expect(next.startAt.getTime()).toBeGreaterThan(now.getTime());
      expect(windowStart(next.dayKey, next.windowIndex).getTime()).toBe(next.startAt.getTime());
    }
  });
});

async function setupYard(tag: string) {
  const { prisma } = await import("../lib/db");
  const { claimYard } = await import("../lib/yard/claim");
  const uid = fx(`u-${tag}`);
  users.push(uid);
  await prisma.inviteCode.create({ data: { code: fx(`TK-${tag}`), batch: "team", maxUses: 1, usedCount: 0, createdAt: new Date() } });
  const claim = await claimYard(uid, fx(`TK-${tag}`));
  return { uid, yardId: claim.yardId };
}

/** 直接注入结算+来访事实（测视图/脱敏/收取层；引擎确定性另有 CI） */
async function injectVisits(yardId: string, now: Date) {
  const { prisma } = await import("../lib/db");
  const { windowAt } = await import("../lib/yard/time");
  const past = new Date(now.getTime() - 5 * 3600_000);
  const w = windowAt(past);
  const startAt = (await import("../lib/yard/time")).windowStart(w.dayKey, w.windowIndex);
  const settlement = await prisma.windowSettlement.create({
    data: {
      id: `ws-${randomUUID().slice(0, 12)}`, yardId, dayKey: w.dayKey, windowIndex: w.windowIndex,
      rulesVersion: "test-fixture", placementSnapshot: [], weather: "晴", settledAt: now,
    },
  });
  const mk = (catId: string, over: Record<string, unknown> = {}) => ({
    id: `cv-${randomUUID().slice(0, 12)}`, settlementId: settlement.id, yardId, catId,
    dayKey: w.dayKey, windowIndex: w.windowIndex, slotKey: null, itemKey: null,
    arriveAt: new Date(startAt.getTime() + 5 * 60000), leaveAt: new Date(startAt.getTime() + 40 * 60000),
    behaviors: ["在垫子上睡着了"], leftBehind: { fish: 0 }, traces: ["垫子上多了一个浅浅的窝"],
    visibility: "FULL_RECORD", rulesVersion: "test-fixture", ...over,
  });
  const full = await prisma.catVisit.create({ data: mk("npc-mianhua", { leftBehind: { fish: 5 } }) });
  const traceOnly = await prisma.catVisit.create({ data: mk("npc-wuya", { visibility: "TRACE_ONLY", leftBehind: { fish: 3 }, traces: ["地上有一撮深色的毛"] }) });
  // 当前窗里"还没发生"的来访（arriveAt 在未来）：对观察者不可见
  const cw = windowAt(now);
  const cwStart = (await import("../lib/yard/time")).windowStart(cw.dayKey, cw.windowIndex);
  const futureSettlement = await prisma.windowSettlement.upsert({
    where: { yardId_dayKey_windowIndex: { yardId, dayKey: cw.dayKey, windowIndex: cw.windowIndex } },
    update: {},
    create: {
      id: `ws-${randomUUID().slice(0, 12)}`, yardId, dayKey: cw.dayKey, windowIndex: cw.windowIndex,
      rulesVersion: "test-fixture", placementSnapshot: [], weather: "晴", settledAt: now,
    },
  });
  const future = await prisma.catVisit.create({
    data: mk("npc-jiangjun", {
      settlementId: futureSettlement.id, dayKey: cw.dayKey, windowIndex: cw.windowIndex,
      arriveAt: new Date(now.getTime() + 30 * 60000), leaveAt: new Date(now.getTime() + 60 * 60000),
    }),
  });
  return { full, traceOnly, future };
}

describe.skipIf(!TEST_DB_READY)("视图：暴露与脱敏（Case A / Case B）", () => {
  it("FULL_RECORD 看到完整来访；TRACE_ONLY 只有痕迹且零 catId 泄漏；未浮现的不可见", { timeout: 120_000 }, async () => {
    const { getYardView } = await import("../lib/yard/view");
    const now = new Date();
    const { uid, yardId } = await setupYard("view");
    const { full, traceOnly, future } = await injectVisits(yardId, now);

    const view = await getYardView(uid, now);
    expect(view).not.toBeNull();

    // Case A：完整来访带猫名
    const rec = view!.records.find((r) => r.visitId === full.id);
    expect(rec).toBeTruthy();
    expect(rec!.catName).toBe("棉花");
    expect(rec!.fish).toBe(5);

    // Case B：只有痕迹——序列化整块认知层数据，不得出现 catId 字段或真实 id
    const mark = view!.traceMarks.find((t) => t.visitId === traceOnly.id);
    expect(mark).toBeTruthy();
    expect(mark!.traces).toEqual(["地上有一撮深色的毛"]);
    const serialized = JSON.stringify(view!.traceMarks);
    expect(serialized).not.toContain("catId");
    expect(serialized).not.toContain("catName");
    expect(serialized).not.toContain("npc-");

    // 浮现纪律：arriveAt 在未来的来访整块不可见
    const everywhere = JSON.stringify(view);
    expect(everywhere).not.toContain(future.id);
  });

  it("页面访问不创造结果：两次取视图，事实集与观察集不增长", { timeout: 120_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { getYardView } = await import("../lib/yard/view");
    const now = new Date();
    const { uid, yardId } = await setupYard("idem");
    await injectVisits(yardId, now);

    await getYardView(uid, now);
    const visits1 = await prisma.catVisit.count({ where: { yardId } });
    const settle1 = await prisma.windowSettlement.count({ where: { yardId } });
    const obs1 = await prisma.observation.count({ where: { viewerId: uid } });

    await getYardView(uid, now);
    expect(await prisma.catVisit.count({ where: { yardId } })).toBe(visits1);
    expect(await prisma.windowSettlement.count({ where: { yardId } })).toBe(settle1);
    expect(await prisma.observation.count({ where: { viewerId: uid } })).toBe(obs1); // skipDuplicates 幂等
  });
});

describe.skipIf(!TEST_DB_READY)("collect：只确认既有 entitlement（约束③）", () => {
  it("收下入账一次；重复/并发不重复入账；它还在时收不了", { timeout: 120_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { collectVisit } = await import("../lib/yard/commands");
    const now = new Date();
    const { uid, yardId } = await setupYard("collect");
    const { full, traceOnly, future } = await injectVisits(yardId, now);

    const r1 = await collectVisit(uid, full.id, now);
    expect(r1).toEqual({ ok: true, fish: 5 });
    const r2 = await collectVisit(uid, full.id, now);
    expect(r2).toEqual({ ok: false, reason: "already" });

    // 并发收 TRACE_ONLY 那份：只入账一次
    const rs = await Promise.all([1, 2, 3].map(() => collectVisit(uid, traceOnly.id, now)));
    expect(rs.filter((r) => r.ok).length).toBe(1);

    const home = await prisma.home.findUnique({ where: { userId: uid } });
    expect(home!.fish).toBe(8); // 5 + 3，恰好一次

    // 还没走的猫：东西还没留下
    const r3 = await collectVisit(uid, future.id, now);
    expect(r3).toEqual({ ok: false, reason: "not_yet" });

    // 别人的院子收不了
    const { uid: other } = await setupYard("other");
    await expect(collectVisit(other, full.id, now)).rejects.toThrow();
  });
});

describe.skipIf(!TEST_DB_READY)("摆放两层（约束②）：命令只写历史，不碰已结算窗", () => {
  it("摆放后已结算窗的事实与快照不变；effectiveFrom 是下一窗", { timeout: 120_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { placeItem } = await import("../lib/yard/commands");
    const { getYardView } = await import("../lib/yard/view");
    const now = new Date();
    const { uid, yardId } = await setupYard("place");
    await injectVisits(yardId, now);
    await getYardView(uid, now); // 触发补算

    const before = await prisma.windowSettlement.findMany({ where: { yardId }, include: { visits: true }, orderBy: { id: "asc" } });
    const r = await placeItem(uid, "eaves", "cardboard_box", now);
    expect(r.effectiveFrom.startAt.getTime()).toBeGreaterThan(now.getTime());

    const after = await prisma.windowSettlement.findMany({ where: { yardId }, include: { visits: true }, orderBy: { id: "asc" } });
    expect(JSON.stringify(after.map((s) => ({ id: s.id, snap: s.placementSnapshot, n: s.visits.length }))))
      .toBe(JSON.stringify(before.map((s) => ({ id: s.id, snap: s.placementSnapshot, n: s.visits.length }))));

    // 同槽换物：旧摆放收束、新摆放生效
    await placeItem(uid, "eaves", "old_cushion", new Date(now.getTime() + 1000));
    const active = await prisma.placement.findMany({ where: { yardId, slotKey: "eaves", removedAt: null } });
    expect(active.length).toBe(1);
    expect(active[0].itemKey).toBe("old_cushion");
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
  await prisma.inviteCode.deleteMany({ where: { issuedTo: { in: users } } });
  await prisma.inviteCode.deleteMany({ where: { code: { startsWith: fx("") } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});
