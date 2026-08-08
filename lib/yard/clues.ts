// 线索投放器（Clue Supply）——doc2.0/06 §九 供给面、18「已知未知」的闭环格。
// 严格定义：这不是 Director 造目标，是把**已经存在的世界事实**按时机露出来：
//
//   World fact / Cat canon / public island event
//           ↓ ClueCandidate（事实合法性 + observability，01 §九 可知性裁决）
//   Clue → RumorSighting（个人认知事实落库）→ 岛猫册"有传闻的猫"
//
// 四条红线（2026-08-08 拍板，CI 看守 tests/clue-supply.test.ts）：
// ① 线索必须有事实源——每条 Clue 挂非空 sourceRefs（canon.* / itinerary 事实 /
//    本人 TRACE 观察）；为"现在需要一个新目标"临时编一条 = makeClue 直接抛；
// ② Director 只拥有时机（今天投不投/投哪条），不拥有内容——本文件没有任何
//    写世界事实的路径（只写 RumorSighting、只读 Observation；静态看守）；
// ③ 线索只透露"足够形成实验"的一两个维度，不给答案——文本永不出现猫名
//    （点名 = 替用户完成归因，18 红线）。好线索造假设："雨停后的傍晚，旧伞下
//    有影子"；坏线索是攻略："X 喜欢雨后傍晚和旧雨伞"；
// ④ 线索只负责 rumor_seen 这个事实本身；D3 判定归 20 的组合旗标
//    （unknown_or_rumor_seen + 翻册 + 随后布置变更），本文件不做 Signal 推导，
//    也不改布置、不标记"目标猫"（被看见零副作用）。
//
// 认知是个人的（18 认知镜像）：RumorSighting 按 userId 隔离，A 听说过 ≠ B 知道。
// SealedCatCanon 永不进入本管线（09 §四 物理隔离；静态看守）。

import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { itineraryFor } from "../sim/itinerary";
import { NPC_CATS } from "../sim/npcs";
import { hashSeed, mulberry32 } from "../sim/rng";
import { bandOf, furKeyOf } from "./book";
import { CLUE_SUPPLY, RULES_VERSION, WINDOWS } from "./config";
import { VISIT_POOL, furDescOf } from "./pool";
import { dayKeyOf } from "./time";

export type ClueSourceType = "PUBLIC" | "TRACE" | "CANON";
export interface Clue {
  key: string;
  sourceType: ClueSourceType;
  sourceRefs: string[]; // 非空（红线①）；世界层溯源，永不序列化给用户
  text: string;
}

const POOL_NAMES = NPC_CATS.map((n) => n.name);

/** 唯一的 Clue 构造出口：无事实源 / 点名，都在这里被拒（红线①③） */
export function makeClue(key: string, sourceType: ClueSourceType, sourceRefs: string[], text: string): Clue {
  if (sourceRefs.length === 0) throw new Error(`无事实源的线索不得存在：${key}`);
  const named = POOL_NAMES.find((n) => text.includes(n));
  if (named) throw new Error(`线索点名即攻略：${key} 提到了「${named}」`);
  return { key, sourceType, sourceRefs, text };
}

/** 窗口 → 口语时段（与 Yard 首页的叙事时段口径一致，16） */
function segmentOf(windowIndex: number): string {
  const w = WINDOWS[windowIndex];
  if (!w || w.index === 12) return "夜里";
  if (w.startMin < 720) return "上午";
  if (w.startMin < 1080) return "下午";
  return "晚上";
}

// ---------- CanonClue：public-facing 正典事实的手写谜面 ----------
// 文本手写、逐条挂 canon 出处（09 覆写审计同族）；field 限白名单——
// 只引用职务/时段/常去地带/硬条件这类可被岛民合法知道的事实，绝不读 SealedCatCanon。
const CANON_FIELDS = ["requiresItemTag", "windows", "role", "traceBias"] as const;
interface CanonClueDef {
  catId: string;
  field: (typeof CANON_FIELDS)[number];
  text: string;
}
const CANON_CLUE_DEFS: CanonClueDef[] = [
  { catId: "npc-laoguai", field: "requiresItemTag", text: "松林深处住着一位，说法不一——只有院里摆着上了年头的旧东西的人家，才说见过他。" },
  { catId: "npc-wuya", field: "windows", text: "夜里屋顶上常有条影子巡来巡去，谁也没看清过脸。" },
  { catId: "npc-yantai", field: "windows", text: "灯塔坡那位，天黑透了才肯下坡走动。" },
  { catId: "npc-lingdang", field: "windows", text: "黄昏灯塔坡上有歌声——唱歌的那位，偶尔也进村里来。" },
  { catId: "npc-xiaomei", field: "role", text: "报社那位几乎整天不出门；傍晚偶尔有人见她叼着一卷纸走过。" },
  { catId: "npc-qiuqiu", field: "role", text: "杂货铺打烊以后，老板娘爱出来遛一圈——谁家院里摆了什么，她都记着。" },
  { catId: "npc-nuomi", field: "traceBias", text: "溪边写生的那位胆子小，来过也多半不叫你看见。" },
  { catId: "npc-jiangjun", field: "role", text: "码头下了班，有一位会绕着村子巡一圈，时辰出奇地准。" },
];

/** 全部 CanonClue（未过滤，供 CI 逐条审计） */
export function allCanonClues(): Clue[] {
  return CANON_CLUE_DEFS.map((d) => {
    if (!VISIT_POOL.some((c) => c.catId === d.catId)) throw new Error(`CanonClue 指向不在池内的猫：${d.catId}`);
    if (!CANON_FIELDS.includes(d.field)) throw new Error(`CanonClue 字段不在 public-facing 白名单：${d.field}`);
    return makeClue(`canon:${d.catId}:${d.field}`, "CANON", [`canon:${d.catId}:${d.field}`], d.text);
  });
}

// ---------- TraceClue：接住用户自己看到的证据簇 ----------
export interface TraceObsLite {
  visitId: string;
  catId: string; // 世界层输入（TraceFact 可以知道自己从哪里来，06 §九）；文本永不点名
  windowIndex: number;
  traces: string[];
}

/**
 * 证据簇（与岛猫册同键：band|毛色痕）→ 佐证传闻：那只猫（世界层已知）在
 * corroborationDayKey 真实去过的公共地带，成为"别处也有人见过"的合法事实。
 */
export function buildTraceCandidates(obs: TraceObsLite[], corroborationDayKey: string): Clue[] {
  const groups = new Map<string, { band: string; fur: string; visitIds: string[]; catCounts: Map<string, number> }>();
  for (const o of obs) {
    const fur = furKeyOf(o.traces);
    if (fur === "没留下毛") continue; // 没有可指认特征的动静，先不添传闻
    const band = bandOf(o.windowIndex);
    const key = `${band}|${fur}`;
    const g = groups.get(key) ?? { band, fur, visitIds: [], catCounts: new Map() };
    g.visitIds.push(o.visitId);
    g.catCounts.set(o.catId, (g.catCounts.get(o.catId) ?? 0) + 1);
    groups.set(key, g);
  }
  const out: Clue[] = [];
  for (const [key, g] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const catId = [...g.catCounts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const block = itineraryFor(catId, corroborationDayKey, RULES_VERSION).find((b) => b.canLeave && b.area !== "自家");
    if (!block) continue; // 那天它没在公共地带露过面——没有可佐证的事实，就没有传闻
    out.push(makeClue(
      `trace:${key}`,
      "TRACE",
      [...g.visitIds.map((v) => `visit:${v}`), `itinerary:${catId}:${corroborationDayKey}:${block.windowIndex}`],
      `${g.band}来过你院里、${g.fur}的那位——听说${block.area}一带，也有人见过这么个毛色的影子。`,
    ));
  }
  return out;
}

// ---------- PublicClue：岛上公开目击（行程唯一事实源派生，验收④同源） ----------
export function buildPublicCandidates(dayKey: string, excludeCatIds: Set<string>): Clue[] {
  const out: Clue[] = [];
  for (const cat of VISIT_POOL) {
    if (excludeCatIds.has(cat.catId)) continue;
    const block = itineraryFor(cat.catId, dayKey, RULES_VERSION).find((b) => b.canLeave && b.area !== "自家");
    if (!block) continue;
    const appearance = NPC_CATS.find((n) => n.id === cat.catId)?.appearance ?? "";
    out.push(makeClue(
      `public:${cat.catId}:${dayKey}`,
      "PUBLIC",
      [`itinerary:${cat.catId}:${dayKey}:${block.windowIndex}`],
      `听说昨天${segmentOf(block.windowIndex)}，${block.area}那边见过一只${furDescOf(appearance)}猫。`,
    ));
  }
  return out;
}

// ---------- Director：只拥有时机 ----------

async function confirmedCatIds(userId: string): Promise<Set<string>> {
  const obs = await prisma.observation.findMany({
    where: { viewerId: userId, type: { in: ["LIVE", "RECORD"] } },
    select: { visit: { select: { catId: true } } },
  });
  return new Set(obs.map((o) => o.visit.catId));
}

/**
 * 投放（幂等）：每人每个北京日至多一条；同一 clueKey 对同一用户永不重复落库
 * （unique 收敛）。候选分两梯：证据簇佐证优先（线索去接用户已经在追的未知），
 * 其次 canon 谜面与公开目击。梯内确定性选取（userId × dayKey 种子）。
 */
export async function ensureRumorSupply(userId: string, now = new Date()): Promise<void> {
  const dayKey = dayKeyOf(now);
  const todayCount = await prisma.rumorSighting.count({ where: { userId, dayKey } });
  if (todayCount >= CLUE_SUPPLY.maxPerDay) return;

  const heard = new Set(
    (await prisma.rumorSighting.findMany({ where: { userId }, select: { clueKey: true } })).map((r) => r.clueKey),
  );
  const confirmed = await confirmedCatIds(userId);
  const prevDayKey = dayKeyOf(new Date(now.getTime() - 86400_000)); // 佐证/目击取昨天：已发生的事实才谈"有人见过"

  const traceObs = await prisma.observation.findMany({
    where: { viewerId: userId, type: "TRACE" },
    select: { visit: { select: { id: true, catId: true, windowIndex: true, traces: true } } },
  });
  const tier1 = buildTraceCandidates(
    traceObs.map((o) => ({
      visitId: o.visit.id,
      catId: o.visit.catId,
      windowIndex: o.visit.windowIndex,
      traces: Array.isArray(o.visit.traces) ? (o.visit.traces as string[]) : [],
    })),
    prevDayKey,
  ).filter((c) => !heard.has(c.key));

  const pool = tier1.length > 0
    ? tier1
    : [
        ...allCanonClues().filter((c) => !heard.has(c.key) && !confirmed.has(c.key.split(":")[1])),
        ...buildPublicCandidates(prevDayKey, confirmed).filter((c) => !heard.has(c.key)),
      ];
  if (pool.length === 0) return;

  const rng = mulberry32(hashSeed("clue", userId, dayKey));
  const clue = pool[Math.floor(rng() * pool.length)];
  await prisma.rumorSighting.createMany({
    data: [{
      id: `rs-${randomUUID().slice(0, 12)}`,
      userId,
      clueKey: clue.key,
      sourceType: clue.sourceType,
      sourceRefs: clue.sourceRefs as unknown as Prisma.InputJsonValue,
      text: clue.text,
      dayKey,
      heardAt: now,
    }],
    skipDuplicates: true, // 并发/重放：unique(userId, clueKey) 收敛，绝不重复造传闻页
  });
}
