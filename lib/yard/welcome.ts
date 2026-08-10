// 欢迎结算（doc2.0/16 D1 首次加速;14 §九② 冻结:首摆触发,3-5 分钟内第一位
// 客人到——首个 session 内走完 摆→等→发现）。
//
// 边界(20 §四 隔离审计的唯一白名单):本机制消费的是「首次摆放」这一个**事件**,
// 不是任何阶段/Signal——除此之外世界永不因用户学习进度改变行为。
// 幂等:HomeGrant(homeId,"welcome") 唯一约束做一次性闩;并发/重放只会有一位欢迎客。
// 选猫:当前窗 Eligible、非独占、非特殊留物猫中,偏好与刚摆下物件重合度最高者
// (确定性种子)——欢迎客要读作"被你摆的东西引来",不是系统发的礼物。

import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { eligibilityAt } from "../sim/itinerary";
import { hashSeed, mulberry32, pick } from "../sim/rng";
import { ITEMS, ITEM_TRACES, DEFAULT_TRACE, RULES_VERSION, SPECIAL_LEAVES, WELCOME } from "./config";
import { VISIT_POOL, type VisitPoolCat } from "./pool";
import { ensureWindowSettled } from "./settle";
import { windowAt, windowLenMin } from "./time";

/** 首摆欢迎客（幂等;非首摆/已有来访/已发过欢迎 → 静默返回） */
export async function ensureWelcomeVisit(homeId: string, yardId: string, placedItemKey: string, now = new Date()): Promise<void> {
  // 已经有来访事实的院子不需要欢迎(比如老院子换摆放)——欢迎只属于"还没见过任何猫"的第一次
  const hasVisit = await prisma.catVisit.count({ where: { yardId }, take: 1 });
  if (hasVisit > 0) return;

  const cur = windowAt(now);
  const lenMin = windowLenMin(cur.windowIndex);
  const rng = mulberry32(hashSeed("welcome", yardId));

  const itemTags = ITEMS.find((i) => i.key === placedItemKey)?.tags ?? {};
  const candidates = VISIT_POOL.filter(
    (c) =>
      !c.solitary &&
      !SPECIAL_LEAVES[c.catId] &&
      !c.requiresItemTag &&
      eligibilityAt(c.catId, cur.dayKey, RULES_VERSION, cur.windowIndex, lenMin).eligible,
  );
  if (candidates.length === 0) return; // 深夜等极端窗:没有合适的欢迎客就不硬造(空窗合法)
  const overlap = (c: VisitPoolCat) => Object.keys(c.favor).reduce((s, t) => s + (itemTags[t] ?? 0), 0);
  const best = Math.max(...candidates.map(overlap));
  const pool = candidates.filter((c) => overlap(c) === best);
  const cat = pick(rng, pool);

  // 当前窗结算先就位(确定性核照常;欢迎客只是"加了一位",不改既有 roll)
  const settlement = await ensureWindowSettled(yardId, cur.dayKey, cur.windowIndex, now);
  if (!settlement) return;

  const delayMin = WELCOME.delayMinMin + rng() * (WELCOME.delayMaxMin - WELCOME.delayMinMin);
  const arriveAt = new Date(now.getTime() + delayMin * 60_000);
  const stayMin = WELCOME.stayMinMin + rng() * (WELCOME.stayMaxMin - WELCOME.stayMinMin);
  const leaveAt = new Date(arriveAt.getTime() + stayMin * 60_000);
  const fish = WELCOME.fishMin + Math.floor(rng() * (WELCOME.fishMax - WELCOME.fishMin + 1));

  try {
    await prisma.$transaction(async (tx) => {
      // 一次性闩:唯一约束收敛,并发/重放只发一位
      await tx.homeGrant.create({ data: { homeId, batchKey: "welcome", grantedAt: now } });
      await tx.catVisit.create({
        data: {
          id: `cv-${randomUUID().slice(0, 12)}`,
          settlementId: settlement.id,
          yardId,
          catId: cat.catId,
          dayKey: cur.dayKey,
          windowIndex: cur.windowIndex,
          slotKey: null,
          itemKey: placedItemKey,
          arriveAt,
          leaveAt,
          behaviors: [pick(rng, cat.behaviors)] as unknown as Prisma.InputJsonValue,
          leftBehind: { fish } as unknown as Prisma.InputJsonValue,
          traces: [ITEM_TRACES[placedItemKey] ?? DEFAULT_TRACE] as unknown as Prisma.InputJsonValue,
          visibility: "FULL_RECORD",
          rulesVersion: RULES_VERSION,
        },
      });
    }, { timeout: 15000, maxWait: 10000 });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return; // 已发过
    throw err;
  }
}
