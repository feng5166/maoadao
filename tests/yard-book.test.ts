import { TEST_DB_READY, fx } from "./db-guard";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { clusterEvidence } from "../lib/yard/book";
import { furTraceOf } from "../lib/yard/pool";

// 岛猫册最小条目验收（18 认知镜像第一次落码）：
// - 三态就位：已确认 / 传闻（结构）/ 尚未归因证据；
// - 证据簇按可见特征聚合，聚合逻辑与输出类型都无 catId（归因红线）；
// - 册子只由本用户 Observation 派生（同一世界，两个用户两本册子）。

const users: string[] = [];

describe("证据聚簇（纯逻辑：只读可见特征，不读 catId）", () => {
  it("同毛色同时段归一簇；不同毛色/时段分簇；次数进档不计数", () => {
    const clusters = clusterEvidence([
      { visitId: "v1", windowIndex: 11, dayKey: "20260810", traces: ["落了一撮深黑色的毛", "地上留了一串浅浅的爪印"] },
      { visitId: "v2", windowIndex: 12, dayKey: "20260811", traces: ["落了一撮深黑色的毛", "纸箱边角被压出了新的褶子"] },
      { visitId: "v3", windowIndex: 3, dayKey: "20260811", traces: ["落了一撮橘白相间的毛"] },
    ]);
    expect(clusters.length).toBe(2);
    const night = clusters.find((c) => c.band === "夜里")!;
    expect(night.countBand).toBe("不止一次");
    expect(night.traits).toContain("落了一撮深黑色的毛");
    expect(night.firstDayKey).toBe("20260810");
    const day = clusters.find((c) => c.band === "白天")!;
    expect(day.countBand).toBe("一次");
  });

  it("毛色痕派生：组合色优先于单色（appearance 正典）", () => {
    expect(furTraceOf("黑白奶牛猫，圆脸")).toBe("落了一撮黑白相间的毛");
    expect(furTraceOf("纯黑猫，眼睛一金一蓝")).toBe("落了一撮深黑色的毛");
    expect(furTraceOf("橘白相间，额头有个M形花纹")).toBe("落了一撮橘白相间的毛");
    expect(furTraceOf("圆滚滚的橘猫，肚子上有白毛")).toBe("落了一撮橘色的毛");
  });
});

async function setupYardWithVisits(tag: string) {
  const { prisma } = await import("../lib/db");
  const { claimYard } = await import("../lib/yard/claim");
  const { windowAt, windowStart } = await import("../lib/yard/time");
  const uid = fx(`u-${tag}`);
  users.push(uid);
  await prisma.inviteCode.create({ data: { code: fx(`TK-${tag}`), batch: "team", maxUses: 1, usedCount: 0, createdAt: new Date() } });
  const { yardId } = await claimYard(uid, fx(`TK-${tag}`));

  const now = new Date();
  const past = new Date(now.getTime() - 5 * 3600_000);
  const w = windowAt(past);
  const startAt = windowStart(w.dayKey, w.windowIndex);
  const settlement = await prisma.windowSettlement.create({
    data: {
      id: `ws-${randomUUID().slice(0, 12)}`, yardId, dayKey: w.dayKey, windowIndex: w.windowIndex,
      rulesVersion: "test-fixture", placementSnapshot: [], weather: "晴", settledAt: now,
    },
  });
  const mkVisit = (catId: string, over: Record<string, unknown> = {}) =>
    prisma.catVisit.create({
      data: {
        id: `cv-${randomUUID().slice(0, 12)}`, settlementId: settlement.id, yardId, catId,
        dayKey: w.dayKey, windowIndex: w.windowIndex, slotKey: null, itemKey: null,
        arriveAt: new Date(startAt.getTime() + 5 * 60000), leaveAt: new Date(startAt.getTime() + 40 * 60000),
        behaviors: ["把下巴搁在别的猫背上打盹"], leftBehind: { fish: 2 }, traces: ["垫子上多了一个浅浅的窝"],
        visibility: "FULL_RECORD", rulesVersion: "test-fixture", ...over,
      },
    });
  // 棉花两次完整来访（→ 已确认·来过几次）；乌鸦两次 TRACE_ONLY（→ 证据簇·不止一次）
  await mkVisit("npc-mianhua");
  await mkVisit("npc-mianhua", { id: `cv-${randomUUID().slice(0, 12)}`, arriveAt: new Date(startAt.getTime() + 50 * 60000), leaveAt: new Date(startAt.getTime() + 80 * 60000) });
  const fur = ["落了一撮深黑色的毛"];
  await mkVisit("npc-wuya", { visibility: "TRACE_ONLY", traces: ["地上留了一串浅浅的爪印", ...fur], leftBehind: { fish: 0 } });
  await mkVisit("npc-wuya", { visibility: "TRACE_ONLY", traces: fur, leftBehind: { fish: 0 } });
  return { uid, yardId, now };
}

describe.skipIf(!TEST_DB_READY)("岛猫册三态（认知镜像）", () => {
  it("已确认带名字与所见行为；证据簇聚合且零 catId 泄漏；传闻结构就位", { timeout: 120_000 }, async () => {
    const { getYardView } = await import("../lib/yard/view");
    const { buildCatBook } = await import("../lib/yard/book");
    const { uid, now } = await setupYardWithVisits("book");

    await getYardView(uid, now); // 开门 → 产生 Observation（册子的唯一来源）
    const book = await buildCatBook(uid);

    expect(book.confirmedCount).toBe(1);
    const mianhua = book.confirmed[0];
    expect(mianhua.name).toBe("棉花");
    expect(mianhua.seenBand).toBe("来过几次");
    expect(mianhua.behaviorsSeen).toContain("把下巴搁在别的猫背上打盹");

    expect(book.evidence.length).toBe(1);
    expect(book.evidence[0].countBand).toBe("不止一次");
    expect(book.evidence[0].traits).toContain("落了一撮深黑色的毛");
    const serialized = JSON.stringify(book.evidence);
    expect(serialized).not.toContain("catId");
    expect(serialized).not.toContain("npc-");
    expect(serialized).not.toContain("乌鸦");

    expect(Array.isArray(book.rumors)).toBe(true); // 三态结构就位（供给=线索投放器，后续格）
  });

  it("认知镜像：同一世界，别的用户的册子是空的", { timeout: 120_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { claimYard } = await import("../lib/yard/claim");
    const { buildCatBook } = await import("../lib/yard/book");
    const other = fx("u-other-book");
    users.push(other);
    await prisma.inviteCode.create({ data: { code: fx("TK-other-book"), batch: "team", maxUses: 1, usedCount: 0, createdAt: new Date() } });
    await claimYard(other, fx("TK-other-book"));
    const book = await buildCatBook(other);
    expect(book.confirmedCount).toBe(0);
    expect(book.evidence.length).toBe(0);
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
