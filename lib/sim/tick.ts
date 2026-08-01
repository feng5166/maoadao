import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { runDay } from "./engine";
import { reflect } from "../narrative/narrator";
import { narrateCommittedDay } from "./renarrate";
import { firstWeekPlan, type FirstWeekPlan } from "./firstweek";
import { dailyEmailHtml, emailEnabled, sendEmail } from "../email";
import { weatherFor, type SimCat, type SimCatState, type WorldSnapshot } from "./types";

// 单一岛屿的推进锁 key（pg advisory lock 命名空间）
const TICK_LOCK_KEY = 8801;

export class TickInProgressError extends Error {
  constructor(reason = "另一次每日推进正在进行") {
    super(reason);
  }
}

// 每日幂等：距上次成功推进不足该间隔则拒绝（防 Cron 重放/误触连推两天）。本地调试可设 0。
const MIN_TICK_INTERVAL_MIN = Number(process.env.MIN_TICK_INTERVAL_MIN ?? 360);

/**
 * 推进世界一天。
 * 阶段一（短事务）：advisory 事务锁取得推进权 → 装配快照 → 纯函数模拟 →
 *   事件/状态/关系/事件线/记忆/世界日期一次性提交（任一失败整体回滚）。
 * 阶段二（事务外）：LLM 叙事，日记 upsert、日报先删后写——失败可安全重试，不破坏世界一致性。
 */
export async function advanceOneDay(options: { narrate?: boolean } = {}) {
  const { narrate = true } = options;

  // ============ 阶段一：原子推进 ============
  const sim = await prisma.$transaction(
    async (tx) => {
      // 事务级 advisory 锁：兼容连接池（transaction pooling），事务结束自动释放
      const lockRows = await tx.$queryRaw<{ locked: boolean }[]>`SELECT pg_try_advisory_xact_lock(${TICK_LOCK_KEY}) AS locked`;
      if (!lockRows[0]?.locked) throw new TickInProgressError();

      let world = await tx.worldState.findUnique({ where: { id: 1 } });
      if (!world) world = await tx.worldState.create({ data: { id: 1, day: 0 } });
      if (world.lastTickAt && Date.now() - world.lastTickAt.getTime() < MIN_TICK_INTERVAL_MIN * 60_000) {
        throw new TickInProgressError(`今天已经推进过（第 ${world.day} 天）`);
      }
      const day = world.day + 1;
      const weather = weatherFor(day);

      // ---- 装配世界快照 ----
      const catRows = await tx.cat.findMany();
      const stateRows = await tx.catState.findMany();
      const relRows = await tx.relationship.findMany();
      const threadRows = await tx.storyline.findMany({ where: { status: "active" } });
      const recentEvents = await tx.event.findMany({
        where: { day: { gte: day - 8 } },
        select: { catId: true, type: true, day: true, outcome: true },
      });
      const nudges = await tx.ownerNudge.findMany({ where: { consumedDay: null } });

      const cats: SimCat[] = catRows.map((c) => ({
        id: c.id,
        name: c.name,
        isNpc: c.isNpc,
        role: (c.role as SimCat["role"]) ?? undefined,
        goal: c.goal ?? undefined,
        boldness: c.boldness,
        sociability: c.sociability,
        diligence: c.diligence,
        personaTags: c.personaTags,
      }));
      const states = new Map<string, SimCatState>(
        stateRows.map((s) => [s.catId, { coins: s.coins, energy: s.energy, mood: s.mood, location: s.location }]),
      );
      const lastUsedDay = new Map<string, number>();
      const recentBadOutcomes = new Map<string, number>();
      for (const e of recentEvents) {
        const key = `${e.catId}:${e.type}`;
        if ((lastUsedDay.get(key) ?? -1) < e.day) lastUsedDay.set(key, e.day);
        if (e.day === day - 1 && (e.outcome === "fail" || e.outcome === "complication")) {
          recentBadOutcomes.set(e.catId, (recentBadOutcomes.get(e.catId) ?? 0) + 1);
        }
      }

      const snapshot: WorldSnapshot = {
        day,
        season: world.season,
        weather,
        cats,
        states,
        relationships: relRows,
        threads: threadRows.map((t) => ({
          id: t.id,
          key: t.kind,
          catId: t.catId,
          step: t.step,
          status: t.status as "active",
          data: t.data as Record<string, unknown>,
          startDay: t.startDay,
          lastAdvanceDay: t.lastAdvanceDay,
        })),
        lastUsedDay,
        recentBadOutcomes,
        suggestions: new Map(nudges.filter((n) => n.suggestion).map((n) => [n.catId, n.suggestion!])),
        firstWeek: await (async () => {
          const m = new Map<string, FirstWeekPlan>();
          for (const c of cats.filter((x) => !x.isNpc)) {
            const first = await tx.event.findFirst({ where: { catId: c.id }, orderBy: { day: "asc" }, select: { day: true } });
            const plan = firstWeekPlan(day - (first?.day ?? day) + 1);
            if (plan) m.set(c.id, plan);
          }
          return m;
        })(),
      };

      const result = runDay(snapshot);

      // ---- 持久化：事实（含主事件标记与追溯 ID） ----
      const mainIdx = new Set(result.mainFactIndexByCat.values());
      const eventIdsByCat = new Map<string, string[]>();
      const eventRows = result.facts.map((f, i) => {
        const id = randomUUID();
        eventIdsByCat.set(f.catId, [...(eventIdsByCat.get(f.catId) ?? []), id]);
        return {
          id,
          day,
          segment: f.segment,
          catId: f.catId,
          type: f.type,
          outcome: f.outcome,
          data: f.data as Prisma.InputJsonValue,
          deltas: f.deltas as Prisma.InputJsonValue,
          targetId: f.targetId ?? null,
          threadKey: f.threadKey ?? null,
          threadStep: f.threadStep ?? null,
          contentValue: f.contentValue,
          isMain: mainIdx.has(i),
        };
      });
      await tx.event.createMany({ data: eventRows });

      for (const [catId, st] of result.stateChanges) {
        await tx.catState.update({ where: { catId }, data: { ...st, updatedDay: day } });
      }

      for (const ac of result.affinityChanges) {
        const existing = await tx.relationship.findFirst({
          where: {
            OR: [
              { catAId: ac.catAId, catBId: ac.catBId },
              { catAId: ac.catBId, catBId: ac.catAId },
            ],
          },
        });
        if (existing) {
          const affinity = Math.max(-100, Math.min(100, existing.affinity + ac.delta));
          await tx.relationship.update({
            where: { id: existing.id },
            data: { affinity, lastInteractionDay: day, kind: affinity > 40 ? "friend" : affinity < -40 ? "rival" : "acquaintance" },
          });
        } else {
          await tx.relationship.create({
            data: { id: randomUUID(), catAId: ac.catAId, catBId: ac.catBId, affinity: ac.delta, lastInteractionDay: day },
          });
        }
      }

      const pendingIdMap = new Map<string, string>();
      for (const nt of result.newThreads) {
        const id = randomUUID();
        pendingIdMap.set(`pending:${nt.key}:${nt.catId}`, id);
        await tx.storyline.create({
          data: {
            id,
            catId: nt.catId,
            kind: nt.key,
            status: "active",
            step: nt.step,
            lastAdvanceDay: nt.startDay,
            data: nt.data as Prisma.InputJsonValue,
            startDay: nt.startDay,
          },
        });
      }
      for (const tu of result.threadUpdates) {
        const id = pendingIdMap.get(tu.threadId) ?? tu.threadId;
        await tx.storyline.update({
          where: { id },
          data: {
            ...(tu.step !== undefined ? { step: tu.step } : {}),
            ...(tu.status ? { status: tu.status, ...(tu.status !== "active" ? { endDay: day } : {}) } : {}),
            ...(tu.data ? { data: tu.data as Prisma.InputJsonValue } : {}),
            ...(tu.lastAdvanceDay !== undefined ? { lastAdvanceDay: tu.lastAdvanceDay } : {}),
          },
        });
      }

      if (result.memories.length > 0) {
        await tx.memoryEntry.createMany({
          data: result.memories.map((m) => ({
            id: randomUUID(),
            catId: m.catId,
            day: m.day,
            kind: m.kind,
            content: m.content,
            refId: m.refId ?? null,
            importance: m.importance,
          })),
        });
      }

      // 主人留言 → 主人记忆；干预标记消费
      for (const n of nudges) {
        if (n.message) {
          await tx.memoryEntry.create({
            data: {
              id: randomUUID(),
              catId: n.catId,
              day,
              kind: "owner",
              content: `主人对我说：「${n.message}」`,
              importance: 8,
              visibility: n.isPublic ? "public" : "private",
            },
          });
        }
      }
      if (nudges.length > 0) {
        await tx.ownerNudge.updateMany({ where: { id: { in: nudges.map((n) => n.id) } }, data: { consumedDay: day } });
      }

      // 版本条件推进：与锁双保险，读取后世界被并发推进则整体回滚
      const advanced = await tx.worldState.updateMany({ where: { id: 1, day: world.day }, data: { day, weather, lastTickAt: new Date() } });
      if (advanced.count === 0) throw new TickInProgressError();

      return { day, weather, season: world.season, result, cats, nudges, eventIdsByCat };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );

  const { day, weather, result, cats } = sim;

  // ============ 阶段二：叙事（事务外）============
  // 统一走 narrateCommittedDay：与故障恢复同一条通道，任何时刻可安全重跑
  let diaries = 0;
  let newsCount = 0;
  let narrationFailed = 0;
  if (narrate) {
    const r = await narrateCommittedDay(day, { mode: "missing" });
    diaries = r.regenerated;
    narrationFailed = r.failed;
    newsCount = await prisma.islandNews.count({ where: { day } });

    // 关键节点反思：每 7 天，或当天有事件线落幕的猫
    const resolvedCatIds = new Set(
      result.facts
        .filter((f) => f.threadKey && result.threadUpdates.some((tu) => tu.status === "resolved" || tu.status === "failed"))
        .map((f) => f.catId),
    );
    const reflectCats = cats.filter((c) => day % 7 === 0 || resolvedCatIds.has(c.id));
    await Promise.all(
      reflectCats.map(async (cat) => {
        const mems = await prisma.memoryEntry.findMany({
          where: { catId: cat.id, day: { gte: day - 7 }, kind: { not: "semantic" } },
          orderBy: { importance: "desc" },
          take: 6,
        });
        const insight = await reflect(cat, mems.map((m) => m.content));
        if (insight) {
          await prisma.memoryEntry.create({
            data: { id: randomUUID(), catId: cat.id, day, kind: "semantic", content: insight, importance: 8 },
          });
        }
      }),
    );
  }

  // 每日召回邮件：内容钩子而非系统通知（绑定邮箱 + 开通知的主人）
  if (narrate && emailEnabled()) {
    const owners = await prisma.user.findMany({
      where: { emailVerifiedAt: { not: null }, notifyDaily: true, cats: { some: {} } },
      include: { cats: { take: 1 } },
    });
    for (const owner of owners) {
      const ownerCat = owner.cats[0];
      if (!ownerCat) continue;
      const s = await prisma.catDailySummary.findUnique({ where: { catId_day: { catId: ownerCat.id, day } } });
      if (!s) continue;
      const hook = s.tomorrowHook ?? s.headline;
      await sendEmail(owner.email!, `${ownerCat.name}：${s.headline}`, dailyEmailHtml(ownerCat.name, hook)).catch(() => {});
    }
  }

  return { day, weather, eventCount: result.facts.length, diaryCount: diaries, newsCount, narrationFailed, directorNotes: result.directorNotes };
}
