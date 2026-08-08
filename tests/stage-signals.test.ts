import { readFileSync } from "node:fs";
import { afterAll, describe, expect, it } from "vitest";
import { TEST_DB_READY, fx } from "./db-guard";
import { STAGE_SIGNALS, deriveReached, deriveSignalsPure, type FactBundle } from "../lib/yard/signals";

// 20 心流阶段 CI：双层一致性 / 重放一致性 / 乱序不跳级 / 造目标审计 / 隔离审计。
// 零新增行为埋点:推导只吃领域事实束(FactBundle 字段即可读边界)。

const T = (h: number) => new Date(Date.UTC(2026, 8, 1, h)); // 同一北京日内的时刻序列
const day = (d: number, h = 6) => new Date(Date.UTC(2026, 8, d, h));

const empty: FactBundle = {
  placements: [], settlements: [], observations: [], rumors: [],
  collectedVisits: [], purchases: [], surfaceViews: [],
};

/** 一份走完 D1–D4 的事实束（D5 未达） */
function richBundle(): FactBundle {
  return {
    placements: [
      { id: "p1", itemKey: "cardboard_box", placedAt: T(1), removedAt: null },
      { id: "p2", itemKey: "yarn_ball", placedAt: T(8), removedAt: null }, // 买后摆上 + 证据后的布置变更
    ],
    settlements: [{ id: "s1", settledAt: T(2), snapshotCount: 1 }],
    observations: [
      { id: "o1", observedAt: T(3), type: "RECORD", catId: "npc-mianhua", visibility: "FULL_RECORD" },
      { id: "o2", observedAt: T(4), type: "TRACE", catId: "npc-wuya", visibility: "TRACE_ONLY" }, // 第 2 种结果 + 未知动静
    ],
    rumors: [{ id: "r1", heardAt: T(5) }],
    collectedVisits: [{ id: "v1", collectedAt: T(6) }],
    purchases: [{ id: "b1", itemKey: "yarn_ball", acquiredAt: T(7) }],
    surfaceViews: [{ surface: "cat_book", dayKey: "20260901", firstAt: T(5) }],
  };
}

describe("Signal 推导（纯函数）", () => {
  it("D1–D4 全链成立;Reached 时刻=所需证据的最晚首次时刻", () => {
    const hits = deriveSignalsPure(richBundle());
    const keys = hits.map((h) => h.signal);
    for (const s of [...STAGE_SIGNALS.D1, ...STAGE_SIGNALS.D2, ...STAGE_SIGNALS.D3, ...STAGE_SIGNALS.D4]) {
      expect(keys).toContain(s);
    }
    const reached = deriveReached(hits);
    expect(reached.D1).toEqual(T(3));
    expect(reached.D2).toEqual(T(4));
    expect(reached.D3).toEqual(T(8)); // 证据(未知+翻册)之后的布置变更
    expect(reached.D4).toEqual(T(8)); // 新物件摆上
    expect(reached.D5).toBeUndefined();
    // 单调:链上时刻不回头
    expect(reached.D2!.getTime()).toBeGreaterThanOrEqual(reached.D1!.getTime());
    expect(reached.D4!.getTime()).toBeGreaterThanOrEqual(reached.D3!.getTime());
  });

  it("重放一致性：同一事实束两次推导逐字节一致", () => {
    const a = deriveSignalsPure(richBundle());
    const b = deriveSignalsPure(richBundle());
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("乱序不跳级：只有 D4 证据、缺 D2/D3 时，Reached 停在 D1", () => {
    const f = richBundle();
    f.observations = [f.observations[0]]; // 只剩一种结果 → 无 D2
    f.rumors = [];
    const hits = deriveSignalsPure(f);
    expect(hits.map((h) => h.signal)).toContain("first_autonomous_sink"); // D4 证据在场(乱序合法)
    const reached = deriveReached(hits);
    expect(reached.D1).toBeTruthy();
    expect(reached.D2).toBeUndefined();
    expect(reached.D3).toBeUndefined();
    expect(reached.D4).toBeUndefined(); // 证据在场≠阶段成立
  });

  it("造目标审计：布置变更发生在证据之前 → subsequent_placement_change 不成立", () => {
    const f = richBundle();
    f.placements = [{ id: "p1", itemKey: "cardboard_box", placedAt: T(1), removedAt: null }]; // 只剩证据前的摆放
    const hits = deriveSignalsPure(f);
    expect(hits.map((h) => h.signal)).not.toContain("subsequent_placement_change");
    expect(deriveReached(hits).D3).toBeUndefined(); // 系统里存在传闻页 ≠ D3
  });

  it("D2 需要可区分的结果：两次同猫同档观察不算", () => {
    const f = richBundle();
    f.observations = [
      { id: "o1", observedAt: T(3), type: "RECORD", catId: "npc-mianhua", visibility: "FULL_RECORD" },
      { id: "o2", observedAt: T(4), type: "RECORD", catId: "npc-mianhua", visibility: "FULL_RECORD" },
    ];
    const hits = deriveSignalsPure(f);
    expect(hits.map((h) => h.signal)).not.toContain("observed_multiple_outcomes");
  });

  it("D5 v0 代理：翻册后当日调整,满 3 天才成立;每条 Signal 挂事实引用", () => {
    const f: FactBundle = {
      ...empty,
      placements: [1, 2, 3].map((d) => ({ id: `p${d}`, itemKey: "cardboard_box", placedAt: day(d, 8), removedAt: null })),
      surfaceViews: [1, 2, 3].map((d) => ({ surface: "cat_book", dayKey: `2026090${d}`, firstAt: day(d, 6) })),
    };
    const two = deriveSignalsPure({ ...f, placements: f.placements.slice(0, 2), surfaceViews: f.surfaceViews.slice(0, 2) });
    expect(two.map((h) => h.signal)).not.toContain("targeted_adjustment");
    const three = deriveSignalsPure(f);
    const hit = three.find((h) => h.signal === "targeted_adjustment");
    expect(hit).toBeTruthy();
    expect(hit!.firstAt).toEqual(day(3, 8));
    for (const h of three) expect(h.sourceRef.length).toBeGreaterThan(0); // 触发事件引用(20 合回)
  });

  it("空事实束：零 Signal 零 Reached（不为分析造事实）", () => {
    const hits = deriveSignalsPure(empty);
    expect(hits).toEqual([]);
    expect(deriveReached(hits)).toEqual({});
  });
});

describe("隔离审计（20 §四：旗标永不反写世界）", () => {
  it("世界侧模块不引用 signals；signals 不写世界表", () => {
    for (const file of ["lib/yard/settle.ts", "lib/sim/itinerary.ts", "lib/yard/clues.ts", "lib/yard/view.ts", "lib/yard/commands.ts"]) {
      expect(readFileSync(file, "utf8"), file).not.toContain("signals");
    }
    const src = readFileSync("lib/yard/signals.ts", "utf8");
    const models = [...src.matchAll(/prisma\.(\w+)\./g)].map((m) => m[1]);
    expect(models.length).toBeGreaterThan(0);
    const readonlyOk = new Set(["home", "placement", "windowSettlement", "observation", "rumorSighting", "catVisit", "ownedItem", "surfaceView", "stageSignal"]);
    for (const m of models) expect(readonlyOk.has(m), m).toBe(true);
    // 写路径只允许观测层两张表
    for (const wm of [...src.matchAll(/prisma\.(\w+)\.(create|createMany|update|updateMany|upsert|delete|deleteMany)/g)]) {
      expect(["surfaceView", "stageSignal"], wm[1]).toContain(wm[1]);
    }
  });

  it("用户侧页面不引用 signals 的判定（无阶段露出）——只允许 recordSurfaceView 事实记录", () => {
    const book = readFileSync("app/yard/book/page.tsx", "utf8");
    expect(book).not.toMatch(/deriveReached|deriveUserStages|StageSignal/);
    const yard = readFileSync("app/yard/page.tsx", "utf8");
    expect(yard).not.toContain("signals");
  });
});

const users: string[] = [];

describe.skipIf(!TEST_DB_READY)("观测层持久化（快照可重算）", () => {
  it("日见幂等一行；快照 delete+create 幂等且带 logicVersion", { timeout: 120_000 }, async () => {
    const { prisma } = await import("../lib/db");
    const { persistStageSignals, recordSurfaceView, SIGNALS_VERSION } = await import("../lib/yard/signals");
    const uid = fx("u-sig");
    users.push(uid);
    await prisma.user.create({ data: { id: uid, name: "岛民", createdAt: new Date() } });

    const now = new Date("2026-09-01T04:00:00Z"); // 固定北京时正午,避免跨日闪断
    await recordSurfaceView(uid, "cat_book", now);
    await recordSurfaceView(uid, "cat_book", new Date(now.getTime() + 60_000)); // 同日重复
    expect(await prisma.surfaceView.count({ where: { userId: uid } })).toBe(1);

    // 只有翻册面一个事实 → 恰好一个 Signal(证据可乱序在场),Reached 仍为空(不跳级)
    const signals = await persistStageSignals(uid);
    expect(signals.map((s) => s.signal)).toEqual(["collection_surface_seen"]);
    const { deriveReached } = await import("../lib/yard/signals");
    expect(deriveReached(signals)).toEqual({});
    await persistStageSignals(uid); // 重放幂等
    const rows = await prisma.stageSignal.findMany({ where: { userId: uid } });
    expect(rows.length).toBe(1);
    expect(rows[0].logicVersion).toBe(SIGNALS_VERSION);
    expect(rows[0].sourceRef).toBe("surface:cat_book:20260901");
  });
});

afterAll(async () => {
  if (!TEST_DB_READY) return;
  const { prisma } = await import("../lib/db");
  await prisma.stageSignal.deleteMany({ where: { userId: { in: users } } });
  await prisma.surfaceView.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.$disconnect();
});
