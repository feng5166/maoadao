// 院子视图（竖切第二格）。分层铁律（14 §九 后续实现约束①）：
//   GET Yard View → resolveCurrentWindow → ensurePastWindowsSettled()
//   → 读事实 → build Disclosure/Observation 视图 → render
// 页面只是触发"补算已经应该发生的世界"——**页面访问不创造结果**：
// ensurePastWindowsSettled 是幂等事实补全器（确定性种子，晚补结果不变），
// 绝无"刷新→settle→新猫"的语义。
//
// 浮现纪律（16）：已结算窗的事实按现实时间浮现——arriveAt > now 的来访对观察者
// 尚未发生，不进视图、不建 Observation；此刻在场（arrive<=now<leave）= LIVE 撞见。
//
// 认知层脱敏（18 红线）：TRACE_ONLY 的来访给认知层的数据**不携带 catId/猫名/行为**——
// 认知层不得用隐藏 catId 替用户完成归因；visitId 为不透明主键，仅供 collect 指认。

import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { ITEMS, MATERIALS, MEMENTOS, SETTLEMENT, SLOTS } from "./config";
import { ensureWindowSettled, weatherOf, type LeftBehind } from "./settle";
import { startedWindowsBetween, windowAt } from "./time";

export interface YardSlotView {
  slotKey: string;
  slotName: string;
  itemKey: string | null;
  itemName: string | null;
  placedThisWindow: boolean; // 环境语言"刚摆好"用；永不做倒计时（约束②）
}
export interface PresentCatView {
  visitId: string;
  catId: string;
  catName: string;
  behavior: string;
  slotKey: string | null;
}
/** 留物的呈现（世界语言）：null = 没留东西；collect 按钮以 leftText 为准 */
export interface LeftView {
  fish: number;
  leftText: string | null; // "3条小鱼干" / "一块好木料" / "一份卷起来的旧日报"
}
export interface VisitRecordView {
  visitId: string;
  catId: string;
  catName: string;
  dayKey: string;
  windowIndex: number;
  behaviors: string[];
  traces: string[];
  left: LeftView;
  collected: boolean;
}
/** TRACE_ONLY 视图：结构上就没有 catId/catName 字段（脱敏在类型层锁死） */
export interface TraceMarkView {
  visitId: string;
  dayKey: string;
  windowIndex: number;
  traces: string[];
  left: LeftView;
  collected: boolean;
}
export interface YardView {
  yardId: string;
  fish: number;
  materials: Array<{ key: string; name: string; qty: number }>; // 岛材钱包（19 三类之二）
  weather: string;
  dayKey: string;
  windowIndex: number;
  slots: YardSlotView[];
  ownedIdle: Array<{ itemKey: string; itemName: string; count: number }>;
  shop: Array<{ itemKey: string; itemName: string; price: number }>; // 第一个 Sink：小鱼干→新物件
  present: PresentCatView[];
  records: VisitRecordView[];
  traceMarks: TraceMarkView[];
}

const itemName = (key: string | null) => (key ? (ITEMS.find((i) => i.key === key)?.name ?? key) : null);

/** 幂等事实补全器：把"已经应该发生"的窗补齐（最旧优先，单次上限防长离线爆量） */
export async function ensurePastWindowsSettled(yardId: string, createdAt: Date, now = new Date()): Promise<void> {
  const windows = startedWindowsBetween(createdAt, now);
  if (windows.length === 0) return;
  const existing = await prisma.windowSettlement.findMany({
    where: { yardId, OR: windows.map((w) => ({ dayKey: w.dayKey, windowIndex: w.windowIndex })) },
    select: { dayKey: true, windowIndex: true },
  });
  const done = new Set(existing.map((s) => `${s.dayKey}:${s.windowIndex}`));
  const pending = windows.filter((w) => !done.has(`${w.dayKey}:${w.windowIndex}`)).slice(0, SETTLEMENT.maxBackfillWindowsPerLoad);
  for (const w of pending) {
    await ensureWindowSettled(yardId, w.dayKey, w.windowIndex, now);
  }
}

export async function getYardView(userId: string, now = new Date()): Promise<YardView | null> {
  const home = await prisma.home.findUnique({ where: { userId }, include: { yard: true } });
  if (!home?.yard) return null;
  const yard = home.yard;

  await ensurePastWindowsSettled(yard.id, yard.createdAt, now);

  const current = windowAt(now);
  const [placements, owned, materials, settlements] = await Promise.all([
    prisma.placement.findMany({ where: { yardId: yard.id, removedAt: null }, orderBy: { placedAt: "asc" } }),
    prisma.ownedItem.findMany({ where: { homeId: home.id } }),
    prisma.homeMaterial.findMany({ where: { homeId: home.id } }),
    prisma.windowSettlement.findMany({
      where: { yardId: yard.id },
      include: { visits: true },
      orderBy: [{ dayKey: "desc" }, { windowIndex: "desc" }],
      take: 30, // 近 30 窗（约两天）的事实面；更久的翻旧账归岛猫册（18，下一格）
    }),
  ]);

  // 浮现纪律：只看 arriveAt <= now 的来访
  const surfaced = settlements.flatMap((s) => s.visits).filter((v) => v.arriveAt.getTime() <= now.getTime());
  const present = surfaced.filter((v) => v.leaveAt.getTime() > now.getTime());
  const past = surfaced.filter((v) => v.leaveAt.getTime() <= now.getTime());

  // 猫名只为非 TRACE_ONLY 的来访取（脱敏面收窄查询本身）
  const namedIds = [...new Set([...present, ...past.filter((v) => v.visibility === "FULL_RECORD")].map((v) => v.catId))];
  const cats = namedIds.length > 0 ? await prisma.cat.findMany({ where: { id: { in: namedIds } }, select: { id: true, name: true } }) : [];
  const nameOf = new Map(cats.map((c) => [c.id, c.name]));

  // 观察事实：开门产生 Observation（唯一约束 + skipDuplicates = 幂等；观察永不改写世界）
  const obs = [
    ...present.map((v) => ({ id: randomUUID(), viewerId: userId, visitId: v.id, type: "LIVE", observedAt: now })),
    ...past.filter((v) => v.visibility === "FULL_RECORD").map((v) => ({ id: randomUUID(), viewerId: userId, visitId: v.id, type: "RECORD", observedAt: now })),
    ...past.filter((v) => v.visibility === "TRACE_ONLY").map((v) => ({ id: randomUUID(), viewerId: userId, visitId: v.id, type: "TRACE", observedAt: now })),
  ];
  if (obs.length > 0) await prisma.observation.createMany({ data: obs, skipDuplicates: true });

  const bySlot = new Map(placements.map((p) => [p.slotKey, p]));
  const placedCount = new Map<string, number>();
  for (const p of placements) placedCount.set(p.itemKey, (placedCount.get(p.itemKey) ?? 0) + 1);
  const ownedCount = new Map<string, number>();
  for (const o of owned) ownedCount.set(o.itemKey, (ownedCount.get(o.itemKey) ?? 0) + 1);

  // 留物 → 世界语言（三类：鱼干/岛材/纪念物）
  const materialDef = new Map(MATERIALS.map((m) => [m.key, m]));
  const mementoDef = new Map(MEMENTOS.map((m) => [m.key, m]));
  const leftOf = (v: { leftBehind: unknown }): LeftView => {
    const raw = (v.leftBehind ?? {}) as Partial<LeftBehind>;
    const fish = Number(raw.fish ?? 0);
    if (fish > 0) return { fish, leftText: `${fish}条小鱼干` };
    if (raw.material) {
      const d = materialDef.get(raw.material.key);
      return { fish: 0, leftText: d ? `${d.article}${d.name}` : "一样岛上的材料" };
    }
    if (raw.memento) {
      const d = mementoDef.get(raw.memento.key);
      return { fish: 0, leftText: d ? `${d.article}${d.name}` : "一样留下的东西" };
    }
    return { fish: 0, leftText: null };
  };
  const arr = (x: unknown): string[] => (Array.isArray(x) ? (x as string[]) : []);

  return {
    yardId: yard.id,
    fish: home.fish,
    materials: materials
      .filter((m) => m.qty > 0)
      .map((m) => ({ key: m.materialKey, name: materialDef.get(m.materialKey)?.name ?? m.materialKey, qty: m.qty }))
      .sort((a, b) => a.key.localeCompare(b.key)),
    weather: weatherOf(current.dayKey),
    dayKey: current.dayKey,
    windowIndex: current.windowIndex,
    slots: SLOTS.map((s) => {
      const p = bySlot.get(s.key);
      return {
        slotKey: s.key,
        slotName: s.name,
        itemKey: p?.itemKey ?? null,
        itemName: itemName(p?.itemKey ?? null),
        placedThisWindow: Boolean(p && windowAt(p.placedAt).dayKey === current.dayKey && windowAt(p.placedAt).windowIndex === current.windowIndex),
      };
    }),
    ownedIdle: [...ownedCount.entries()]
      .map(([itemKey, count]) => ({ itemKey, itemName: itemName(itemKey) ?? itemKey, count: count - (placedCount.get(itemKey) ?? 0) }))
      .filter((o) => o.count > 0),
    // 货架 = 22 账本里有价的物件（价格是世界事实,不因用户状态变化）
    shop: ITEMS.filter((i) => i.price != null).map((i) => ({ itemKey: i.key, itemName: i.name, price: i.price as number })),
    present: present.map((v) => ({
      visitId: v.id,
      catId: v.catId,
      catName: nameOf.get(v.catId) ?? "一只猫",
      behavior: arr(v.behaviors)[0] ?? "待在那里",
      slotKey: v.slotKey,
    })),
    records: past
      .filter((v) => v.visibility === "FULL_RECORD")
      .map((v) => ({
        visitId: v.id,
        catId: v.catId,
        catName: nameOf.get(v.catId) ?? "一只猫",
        dayKey: v.dayKey,
        windowIndex: v.windowIndex,
        behaviors: arr(v.behaviors),
        traces: arr(v.traces),
        left: leftOf(v),
        collected: v.collectedAt != null,
      })),
    // 脱敏：字段级排除——这里绝不携带 catId/catName/behaviors
    traceMarks: past
      .filter((v) => v.visibility === "TRACE_ONLY")
      .map((v) => ({
        visitId: v.id,
        dayKey: v.dayKey,
        windowIndex: v.windowIndex,
        traces: arr(v.traces),
        left: leftOf(v),
        collected: v.collectedAt != null,
      })),
  };
}
