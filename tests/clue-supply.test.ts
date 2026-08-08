import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TEST_DB_READY, fx } from "./db-guard";
import { randomUUID } from "node:crypto";
import { Clue, allCanonClues, buildPublicCandidates, buildTraceCandidates, makeClue } from "../lib/yard/clues";
import { itineraryBlockAt } from "../lib/sim/itinerary";
import { NPC_CATS } from "../lib/sim/npcs";
import { RULES_VERSION } from "../lib/yard/config";
import { passesLanguageFirewall } from "../lib/narrative/lexicon";

// 线索投放器验收（2026-08-08 拍板五条）：
// ① 没有事实源的 Clue 无法创建；② SealedCanon 绝不进入 Clue；
// ③ 同一条 Clue 重复投放不重复造传闻页；④ A 收到线索 ≠ B 自动知道；
// ⑤ Clue 被看见零副作用（不改 Placement、不标记"目标猫"、不产生新世界事实）。

const CAT_NAMES = NPC_CATS.map((n) => n.name);
const DK = "20260807";

function expectLegal(c: Clue) {
  expect(c.sourceRefs.length).toBeGreaterThan(0); // 红线①
  for (const name of CAT_NAMES) expect(c.text).not.toContain(name); // 红线③：点名即攻略
  expect(passesLanguageFirewall(c.text).ok).toBe(true); // 04 语言防火墙
}

describe("红线①：线索必须有事实源", () => {
  it("空 sourceRefs 直接抛——临时编一条新目标是不存在的路径", () => {
    expect(() => makeClue("k", "CANON", [], "随便一句")).toThrow(/无事实源/);
  });

  it("点名即攻略：文本出现猫名直接抛", () => {
    expect(() => makeClue("k", "CANON", ["canon:x"], "老怪喜欢旧东西")).toThrow(/点名/);
  });
});

describe("红线②：Director 只拥有时机，不拥有内容（静态看守）", () => {
  const SRC = readFileSync("lib/yard/clues.ts", "utf8");
  // 只审代码路径，注释里声明红线是允许的
  const CODE = SRC.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

  it("SealedCanon 绝不进入线索管线（验收②）", () => {
    expect(CODE.toLowerCase()).not.toContain("sealedcatcanon");
  });

  it("没有任何写世界事实的路径：prisma 只碰 rumorSighting / observation", () => {
    const models = [...SRC.matchAll(/prisma\.(\w+)\./g)].map((m) => m[1]);
    expect(models.length).toBeGreaterThan(0);
    for (const m of models) expect(["rumorSighting", "observation"]).toContain(m);
  });

  it("不 import 命令层（验收⑤：看线索永不引发布置变更）", () => {
    expect(SRC).not.toContain("./commands");
    expect(SRC).not.toContain("./settle");
  });
});

describe("三来源候选全量合法（事实源 + 不点名 + 语言防火墙）", () => {
  it("CanonClue：逐条挂 public-facing canon 出处", () => {
    const clues = allCanonClues();
    expect(clues.length).toBeGreaterThan(0);
    for (const c of clues) {
      expectLegal(c);
      for (const ref of c.sourceRefs) expect(ref).toMatch(/^canon:npc-[a-z]+:\w+$/);
    }
  });

  it("PublicClue：目击引用真实行程块（唯一事实源），且该块确实可离开", () => {
    const clues = buildPublicCandidates(DK, new Set());
    expect(clues.length).toBeGreaterThan(0);
    for (const c of clues) {
      expectLegal(c);
      const [, catId, dk, wi] = c.sourceRefs[0].match(/^itinerary:(npc-\w+):(\d{8}):(\d+)$/)!;
      const block = itineraryBlockAt(catId, dk, RULES_VERSION, Number(wi));
      expect(block.canLeave).toBe(true); // 说"有人见过"的那一窗，它真的在外面
      expect(c.text).toContain(block.area); // 线索说的地带 = 行程事实的地带
    }
  });

  it("TraceClue：接住证据簇，佐证挂本人 visit + 真实行程；无公共露面则无传闻", () => {
    const obs = [
      { visitId: "v1", catId: "npc-wuya", windowIndex: 12, traces: ["落了一撮深黑色的毛"] },
      { visitId: "v2", catId: "npc-wuya", windowIndex: 11, traces: ["地上留了一串浅浅的爪印", "落了一撮深黑色的毛"] },
    ];
    const clues = buildTraceCandidates(obs, DK);
    expect(clues.length).toBe(1);
    expectLegal(clues[0]);
    expect(clues[0].key).toBe("trace:夜里|落了一撮深黑色的毛");
    expect(clues[0].sourceRefs).toContain("visit:v1");
    expect(clues[0].sourceRefs).toContain("visit:v2");
    expect(clues[0].sourceRefs.some((r) => r.startsWith("itinerary:npc-wuya:"))).toBe(true);
    expect(clues[0].text).toContain("夜里");

    // 没留毛的动静没有可指认特征——不造传闻
    expect(buildTraceCandidates([{ visitId: "v3", catId: "npc-wuya", windowIndex: 12, traces: ["地上留了一串浅浅的爪印"] }], DK)).toEqual([]);
  });
});

// ---------- 连库验收（③④⑤ + pacing） ----------

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

describe.skipIf(!TEST_DB_READY)("投放：幂等 / 隔离 / 零副作用 / pacing", () => {
  // 跨境段首连偶发被掐（P1001 只出现在文件第一次连库处）——暖连接带重试
  beforeAll(async () => {
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
  it("同日重复投放收敛到一条；次日才有下一条（验收③）", { timeout: 120_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { ensureRumorSupply } = await import("../lib/yard/clues");
    const { uid } = await setupIslander("clue-a");
    const now = new Date();

    await ensureRumorSupply(uid, now);
    await ensureRumorSupply(uid, now);
    await ensureRumorSupply(uid, now);
    const rows = await prisma.rumorSighting.findMany({ where: { userId: uid } });
    expect(rows.length).toBe(1);
    expect((rows[0].sourceRefs as string[]).length).toBeGreaterThan(0);

    await ensureRumorSupply(uid, new Date(now.getTime() + 86400_000));
    const rows2 = await prisma.rumorSighting.findMany({ where: { userId: uid } });
    expect(rows2.length).toBe(2);
    expect(new Set(rows2.map((r) => r.clueKey)).size).toBe(2); // 不同的线索，不是同一条重投
  });

  it("认知隔离：A 听说过 ≠ B 知道（验收④）；册子回显无身份泄漏", { timeout: 120_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { ensureRumorSupply } = await import("../lib/yard/clues");
    const { buildCatBook } = await import("../lib/yard/book");
    const { uid: a } = await setupIslander("clue-iso-a");
    const { uid: b } = await setupIslander("clue-iso-b");

    await ensureRumorSupply(a);
    expect(await prisma.rumorSighting.count({ where: { userId: b } })).toBe(0);
    expect((await buildCatBook(b)).rumors.length).toBe(0);

    const bookA = await buildCatBook(a);
    expect(bookA.rumors.length).toBe(1);
    const serialized = JSON.stringify(bookA.rumors);
    expect(serialized).not.toContain("npc-"); // 认知层无内部身份
    expect(serialized).not.toContain("sourceRefs"); // 世界层溯源不进认知视图
    for (const name of CAT_NAMES) expect(serialized).not.toContain(name);
  });

  it("被看见零副作用：投放前后 Placement / CatVisit / 世界表零变化（验收⑤）", { timeout: 120_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { ensureRumorSupply } = await import("../lib/yard/clues");
    const { placeItem } = await import("../lib/yard/commands");
    const { uid, yardId } = await setupIslander("clue-fx");
    await placeItem(uid, "eaves", "cardboard_box");

    const before = await Promise.all([
      prisma.placement.count({ where: { yardId } }),
      prisma.catVisit.count({ where: { yardId } }),
      prisma.windowSettlement.count({ where: { yardId } }),
    ]);
    await ensureRumorSupply(uid);
    const after = await Promise.all([
      prisma.placement.count({ where: { yardId } }),
      prisma.catVisit.count({ where: { yardId } }),
      prisma.windowSettlement.count({ where: { yardId } }),
    ]);
    expect(after).toEqual(before);
  });

  it("证据簇优先：有 TRACE 观察时，投的是佐证传闻（TRACE 源）", { timeout: 120_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { ensureRumorSupply } = await import("../lib/yard/clues");
    const { windowAt, windowStart } = await import("../lib/yard/time");
    const { uid, yardId } = await setupIslander("clue-trace");

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
    const visit = await prisma.catVisit.create({
      data: {
        id: `cv-${randomUUID().slice(0, 12)}`, settlementId: settlement.id, yardId, catId: "npc-wuya",
        dayKey: w.dayKey, windowIndex: w.windowIndex, slotKey: null, itemKey: null,
        arriveAt: new Date(startAt.getTime() + 5 * 60000), leaveAt: new Date(startAt.getTime() + 20 * 60000),
        behaviors: ["只在墙头停一停"], leftBehind: { fish: 0 }, traces: ["落了一撮深黑色的毛"],
        visibility: "TRACE_ONLY", rulesVersion: "test-fixture",
      },
    });
    await prisma.observation.create({
      data: { id: randomUUID(), viewerId: uid, visitId: visit.id, type: "TRACE", observedAt: now },
    });

    await ensureRumorSupply(uid, now);
    const rows = await prisma.rumorSighting.findMany({ where: { userId: uid } });
    expect(rows.length).toBe(1);
    expect(rows[0].sourceType).toBe("TRACE");
    expect((rows[0].sourceRefs as string[])).toContain(`visit:${visit.id}`);
    for (const name of CAT_NAMES) expect(rows[0].text).not.toContain(name);
  });
});

afterAll(async () => {
  if (!TEST_DB_READY) return;
  const { prisma } = await import("../lib/db");
  const homes = await prisma.home.findMany({ where: { userId: { in: users } }, include: { yard: true } });
  const yardIds = homes.map((h) => h.yard?.id).filter((x): x is string => Boolean(x));
  const homeIds = homes.map((h) => h.id);
  await prisma.rumorSighting.deleteMany({ where: { userId: { in: users } } });
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
