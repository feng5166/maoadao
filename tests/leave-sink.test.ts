import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DB_READY, fx } from "./db-guard";
import { ITEMS, MATERIALS, MEMENTOS, RULES_VERSION, SPECIAL_LEAVES, WINDOWS } from "../lib/yard/config";
import { settleWindowPure } from "../lib/yard/settle";
import { VISIT_POOL } from "../lib/yard/pool";

// Leave Behind → Sink 验收（19 三类资源，2026-08-08 拍板）：
// 小鱼干=通用软货币 / 岛材=可消耗特殊材料 / 纪念物=不可消费只进历史。
// 红线：纪念物无价格、无消耗路径（19 P0：不可逆生活记忆不得进入经济 Sink）。

describe("三类资源结构（纯逻辑）", () => {
  it("特殊留物映射合法：都指向登记过的岛材/纪念物，且都是 canon 里 material 的猫", () => {
    const materialKeys = new Set(MATERIALS.map((m) => m.key));
    const mementoKeys = new Set(MEMENTOS.map((m) => m.key));
    for (const [catId, sp] of Object.entries(SPECIAL_LEAVES)) {
      const cat = VISIT_POOL.find((c) => c.catId === catId);
      expect(cat, catId).toBeTruthy();
      if (sp.type === "material") expect(materialKeys.has(sp.key), sp.key).toBe(true);
      else expect(mementoKeys.has(sp.key), sp.key).toBe(true);
    }
  });

  it("纪念物退出经济（19 P0）：不在货架、没有价格、命令层没有消耗它的路径", () => {
    const mementoKeys = new Set(MEMENTOS.map((m) => m.key));
    for (const item of ITEMS) expect(mementoKeys.has(item.key)).toBe(false);
    const src = readFileSync("lib/yard/commands.ts", "utf8");
    // 只允许 create（收下入账）——update/delete/decrement 任何一种出现都是把纪念物拉回经济
    expect(src).not.toMatch(/memento\.(update|updateMany|delete|deleteMany|upsert)/);
    const buySection = src.slice(src.indexOf("buyItem"));
    expect(buySection).not.toContain("memento");
    expect(buySection).not.toContain("Material"); // 第一个 Sink 只收小鱼干,岛材 Sink 后续格另议
  });

  it("结算扫描：material 猫只留材料 qty=1、memento 猫只留纪念物、普通猫只留鱼干", () => {
    // 满院物件(含 old,让老怪可入),扫多天×全窗,把每类猫的留物形态全查一遍
    const snapshot = [
      { slotKey: "eaves", itemKey: "old_crate" },
      { slotKey: "tree", itemKey: "hay_nest" },
      { slotKey: "clearing", itemKey: "long_bench" },
    ];
    let materialSeen = 0, mementoSeen = 0, fishSeen = 0;
    for (let d = 1; d <= 28; d++) {
      const dayKey = `202609${String(d).padStart(2, "0")}`;
      for (const w of WINDOWS) {
        const { visits } = settleWindowPure({
          yardId: "yard-sweep", dayKey, windowIndex: w.index, rulesVersion: RULES_VERSION, snapshot, weather: "晴",
        });
        for (const v of visits) {
          const sp = SPECIAL_LEAVES[v.catId];
          const lb = v.leftBehind;
          if (sp?.type === "material") {
            expect(lb.fish).toBe(0);
            expect(lb.memento).toBeUndefined();
            if (lb.material) {
              expect(lb.material.key).toBe(sp.key);
              expect(lb.material.qty).toBe(1);
              materialSeen++;
            }
          } else if (sp?.type === "memento") {
            expect(lb.fish).toBe(0);
            expect(lb.material).toBeUndefined();
            if (lb.memento) {
              expect(lb.memento.key).toBe(sp.key);
              mementoSeen++;
            }
          } else {
            expect(lb.material).toBeUndefined();
            expect(lb.memento).toBeUndefined();
            if (lb.fish > 0) fishSeen++;
          }
        }
      }
    }
    // 扫描要真的见过三类,否则这条测试没证明任何事
    expect(materialSeen).toBeGreaterThan(0);
    expect(mementoSeen).toBeGreaterThan(0);
    expect(fishSeen).toBeGreaterThan(0);
  });
});

// ---------- 连库：钱包入账 / 买物件 Sink / 幂等与并发 ----------

const users: string[] = [];

async function setupIslander(tag: string) {
  const { prisma } = await import("../lib/db");
  const { claimYard } = await import("../lib/yard/claim");
  const uid = fx(`u-${tag}`);
  users.push(uid);
  await prisma.inviteCode.create({ data: { code: fx(`TK-${tag}`), batch: "team", maxUses: 1, usedCount: 0, createdAt: new Date() } });
  const { yardId } = await claimYard(uid, fx(`TK-${tag}`));
  return { uid, yardId };
}

async function injectVisit(yardId: string, leftBehind: object, now: Date) {
  const { prisma } = await import("../lib/db");
  const { windowAt, windowStart } = await import("../lib/yard/time");
  const past = new Date(now.getTime() - 5 * 3600_000);
  const w = windowAt(past);
  const startAt = windowStart(w.dayKey, w.windowIndex);
  const settlement = await prisma.windowSettlement.upsert({
    where: { yardId_dayKey_windowIndex: { yardId, dayKey: w.dayKey, windowIndex: w.windowIndex } },
    update: {},
    create: {
      id: `ws-${randomUUID().slice(0, 12)}`, yardId, dayKey: w.dayKey, windowIndex: w.windowIndex,
      rulesVersion: "test-fixture", placementSnapshot: [], weather: "晴", settledAt: now,
    },
  });
  return prisma.catVisit.create({
    data: {
      id: `cv-${randomUUID().slice(0, 12)}`, settlementId: settlement.id, yardId, catId: "npc-tudou",
      dayKey: w.dayKey, windowIndex: w.windowIndex, slotKey: null, itemKey: null,
      arriveAt: new Date(startAt.getTime() + 5 * 60000), leaveAt: new Date(startAt.getTime() + 30 * 60000),
      behaviors: ["把院里最重的东西搬正"], leftBehind, traces: ["地上留了一串浅浅的爪印"],
      visibility: "FULL_RECORD", rulesVersion: "test-fixture",
    },
  });
}

describe.skipIf(!TEST_DB_READY)("Leave Behind 入账与 Sink", () => {
  beforeAll(async () => {
    // 跨境段首连偶发被掐——暖连接带重试（同 clue-supply）
    const { prisma } = await import("../lib/db");
    for (let i = 0; i < 5; i++) {
      try {
        await prisma.$queryRaw`SELECT 1`;
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
  }, 30_000);

  it("岛材收下入账一次：钱包 +1，重复收敛", { timeout: 120_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { collectVisit } = await import("../lib/yard/commands");
    const now = new Date();
    const { uid, yardId } = await setupIslander("mat");
    const visit = await injectVisit(yardId, { fish: 0, material: { key: "good_timber", qty: 1 } }, now);

    const rs = await Promise.all([1, 2, 3].map(() => collectVisit(uid, visit.id, now)));
    expect(rs.filter((r) => r.ok).length).toBe(1);
    const home = await prisma.home.findUnique({ where: { userId: uid } });
    const wallet = await prisma.homeMaterial.findUnique({
      where: { homeId_materialKey: { homeId: home!.id, materialKey: "good_timber" } },
    });
    expect(wallet?.qty).toBe(1);
    expect(home!.fish).toBe(0); // 材料不是鱼干皮肤
  });

  it("纪念物收下：入收藏挂来访溯源，幂等；不进任何钱包", { timeout: 120_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { collectVisit } = await import("../lib/yard/commands");
    const { buildCatBook } = await import("../lib/yard/book");
    const now = new Date();
    const { uid, yardId } = await setupIslander("mem");
    const visit = await injectVisit(yardId, { fish: 0, memento: { key: "old_newspaper" } }, now);

    await collectVisit(uid, visit.id, now);
    await collectVisit(uid, visit.id, now); // already
    const home = await prisma.home.findUnique({ where: { userId: uid } });
    const rows = await prisma.memento.findMany({ where: { homeId: home!.id } });
    expect(rows.length).toBe(1);
    expect(rows[0].mementoKey).toBe("old_newspaper");
    expect(rows[0].sourceVisitId).toBe(visit.id); // 溯源（指不出出处=数据造假）
    expect(home!.fish).toBe(0);
    expect(await prisma.homeMaterial.count({ where: { homeId: home!.id } })).toBe(0);

    const book = await buildCatBook(uid);
    expect(book.mementos.length).toBe(1);
    expect(book.mementos[0].text).toBe("一份卷起来的旧日报");
  });

  it("买物件：条件扣款，余额不够不成交；并发抢同一笔钱只成一单", { timeout: 120_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { buyItem } = await import("../lib/yard/commands");
    const { placeItem } = await import("../lib/yard/commands");
    const now = new Date();
    const { uid } = await setupIslander("buy");
    const home = await prisma.home.findUnique({ where: { userId: uid } });

    // 没钱：不成交、不产生物件
    const broke = await buyItem(uid, "yarn_ball", now);
    expect(broke).toEqual({ ok: false, reason: "not_enough" });
    expect(await prisma.ownedItem.count({ where: { homeId: home!.id, itemKey: "yarn_ball" } })).toBe(0);

    // 恰好一件的钱,并发买两次:只成一单,鱼干不变负
    await prisma.home.update({ where: { id: home!.id }, data: { fish: 25 } });
    const [a, b] = await Promise.all([buyItem(uid, "yarn_ball", now), buyItem(uid, "yarn_ball", now)]);
    expect([a.ok, b.ok].filter(Boolean).length).toBe(1);
    const after = await prisma.home.findUnique({ where: { id: home!.id } });
    expect(after!.fish).toBe(0);
    expect(await prisma.ownedItem.count({ where: { homeId: home!.id, itemKey: "yarn_ball" } })).toBe(1);

    // 买到的东西能摆(闭环回 Placement)
    await placeItem(uid, "clearing", "yarn_ball", now);
    const placed = await prisma.placement.findFirst({ where: { itemKey: "yarn_ball", removedAt: null } });
    expect(placed).toBeTruthy();
  });
});

afterAll(async () => {
  if (!TEST_DB_READY) return;
  const { prisma } = await import("../lib/db");
  const homes = await prisma.home.findMany({ where: { userId: { in: users } }, include: { yard: true } });
  const yardIds = homes.map((h) => h.yard?.id).filter((x): x is string => Boolean(x));
  const homeIds = homes.map((h) => h.id);
  await prisma.memento.deleteMany({ where: { homeId: { in: homeIds } } });
  await prisma.homeMaterial.deleteMany({ where: { homeId: { in: homeIds } } });
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
