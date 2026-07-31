import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { factSummary } from "./engine";
import { THREAD_LABELS } from "./threads";
import { narrateDiary, narrateOwnerDay } from "../narrative/narrator";
import type { Fact, Segment, SimCat } from "./types";

// 统一叙事通道：tick 的正常路径与故障恢复路径都走这里，从已落库事实生成。
// 这是"Event 是唯一事实来源、日记可重新生成"承诺的兑现——
// 模拟事务提交后，叙事在任何时刻都可以安全（重新）执行。
// 状态机由数据推导：有事件无日记 = 待叙事；用户猫无摘要 = 待摘要。

const SUGGESTION_LABELS: Record<string, string> = { earn: "去赚钱", explore: "去探险", social: "找朋友", rest: "好好休息" };

export interface NarrateOptions {
  mode?: "missing" | "force"; // missing：只补缺；force：全部重写
  catIds?: string[]; // 只处理指定猫
}

export async function narrateCommittedDay(day: number, options: NarrateOptions = {}) {
  const { mode = "missing", catIds } = options;
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  const isCurrentDay = (world?.day ?? 0) === day;
  const weather = ["晴", "晴", "多云", "雨"][day % 4];
  const season = world?.season ?? "夏";

  const events = await prisma.event.findMany({
    where: { day, ...(catIds ? { catId: { in: catIds } } : {}) },
    orderBy: [{ segment: "asc" }],
  });
  if (events.length === 0) return { day, regenerated: 0, failed: 0 };

  const catRows = await prisma.cat.findMany();
  const catById = new Map(catRows.map((c) => [c.id, { name: c.name }]));
  const nudges = await prisma.ownerNudge.findMany({ where: { consumedDay: day } });

  const byCat = new Map<string, typeof events>();
  for (const e of events) byCat.set(e.catId, [...(byCat.get(e.catId) ?? []), e]);

  let regenerated = 0;
  let failed = 0;
  const jobs = [...byCat.entries()].map(([catId, rows]) => async () => {
    const catRow = catRows.find((c) => c.id === catId);
    if (!catRow) return;
    const existingDiary = await prisma.diaryEntry.findUnique({ where: { catId_day: { catId, day } } });
    const existingSummary = !catRow.isNpc
      ? await prisma.catDailySummary.findUnique({ where: { catId_day: { catId, day } } })
      : null;
    if (mode === "missing" && existingDiary && (catRow.isNpc || existingSummary)) return;

    const facts: Fact[] = rows.map((e) => ({
      catId: e.catId,
      day,
      segment: e.segment as Segment,
      type: e.type,
      outcome: e.outcome as Fact["outcome"],
      data: e.data as Record<string, unknown>,
      deltas: e.deltas as { coins?: number; energy?: number },
      targetId: e.targetId ?? undefined,
      threadKey: e.threadKey ?? undefined,
      threadStep: e.threadStep ?? undefined,
      contentValue: e.contentValue,
    }));
    const mainFact = facts[rows.findIndex((e) => e.isMain)] ?? facts[0];

    // 心情：优先已有日记（忠实历史），其次当日状态表，最后由事实启发
    const state = await prisma.catState.findUnique({ where: { catId } });
    const bad = facts.filter((f) => f.outcome === "fail").length;
    const mood =
      existingDiary?.mood ??
      (isCurrentDay && state?.updatedDay === day ? state.mood : bad >= 2 ? "郁闷" : facts.some((f) => f.outcome === "complication") ? "五味杂陈" : "平静");

    const cat: SimCat = {
      id: catRow.id,
      name: catRow.name,
      isNpc: catRow.isNpc,
      boldness: catRow.boldness,
      sociability: catRow.sociability,
      diligence: catRow.diligence,
      personaTags: catRow.personaTags,
    };
    const memRows = await prisma.memoryEntry.findMany({
      where: { catId, day: { lt: day }, visibility: "public" },
      orderBy: [{ importance: "desc" }, { day: "desc" }],
      take: 4,
    });
    const memories = memRows.map((m) => `（第${m.day}天）${m.content}`);
    const rels = await prisma.relationship.findMany({
      where: { OR: [{ catAId: catId }, { catBId: catId }] },
      orderBy: { affinity: "desc" },
    });
    const relationHints: string[] = [];
    if (rels.length > 0 && rels[0].affinity > 30) {
      const other = rels[0].catAId === catId ? rels[0].catBId : rels[0].catAId;
      relationHints.push(`和${catById.get(other)?.name}是好朋友`);
    }
    const worst = rels[rels.length - 1];
    if (worst && worst.affinity < -20) {
      const other = worst.catAId === catId ? worst.catBId : worst.catAId;
      relationHints.push(`和${catById.get(other)?.name}有过节`);
    }
    const eventIds = rows.map((e) => e.id);

    let content: string;
    let generatedBy: "llm" | "fallback";
    if (!catRow.isNpc) {
      const nudge = nudges.find((n) => n.catId === catId);
      const followed = facts.some((f) => f.data.nudged === true);
      // 事件线快照：当日叙事用实时状态；补写历史日优先用当天留下的摘要快照，避免把未来剧情写进过去
      let activeThreads: { label: string; step: number; total?: number }[];
      if (isCurrentDay) {
        const threads = await prisma.storyline.findMany({ where: { catId, status: "active" } });
        activeThreads = threads.map((t) => ({
          label: THREAD_LABELS[t.kind] ?? t.kind,
          step: t.step,
          total: t.kind === "lighthouse" ? 7 : undefined,
        }));
      } else {
        activeThreads = ((existingSummary?.threadProgress ?? []) as { label: string; step: number; total?: number }[]) ?? [];
      }
      const { summary, generatedBy: gb } = await narrateOwnerDay({
        cat,
        day,
        season,
        weather,
        mood,
        facts,
        mainFact,
        memories,
        relationHints,
        ownerMessage: nudge?.isPublic ? nudge.message ?? undefined : undefined,
        ownerVisited: Boolean(nudge?.message && !nudge.isPublic),
        ownerNick: catRow.ownerNick ?? undefined,
        suggestion: nudge?.suggestion ? { label: SUGGESTION_LABELS[nudge.suggestion] ?? nudge.suggestion, followed } : null,
        activeThreads,
        catById,
      });
      content = summary.narrative;
      generatedBy = gb;
      const coinDelta = facts.reduce((a, f) => a + (f.deltas.coins ?? 0), 0);
      const stateChanges: { label: string; delta: string }[] = [];
      if (coinDelta !== 0) stateChanges.push({ label: "鱼币", delta: coinDelta > 0 ? `+${coinDelta}` : `${coinDelta}` });
      for (const f of facts) {
        for (const a of f.deltas.affinity ?? []) {
          const otherName = catById.get(a.targetId)?.name ?? "某只猫";
          stateChanges.push({ label: `与${otherName}`, delta: `${a.delta > 0 ? "+" : ""}${a.delta} ${a.reason}` });
        }
      }
      await prisma.catDailySummary.upsert({
        where: { catId_day: { catId, day } },
        update: {
          headline: summary.headline,
          narrative: summary.narrative,
          interventionResponse: summary.interventionResponse,
          tomorrowHook: summary.tomorrowHook,
          stateChanges,
          threadProgress: activeThreads,
        },
        create: {
          id: randomUUID(),
          catId,
          day,
          headline: summary.headline,
          narrative: summary.narrative,
          interventionResponse: summary.interventionResponse,
          tomorrowHook: summary.tomorrowHook,
          stateChanges,
          threadProgress: activeThreads,
          createdAt: new Date(),
        },
      });
    } else {
      const r = await narrateDiary({ cat, day, season, weather, mood, facts, mainFact, memories, relationHints, catById });
      content = r.content;
      generatedBy = r.generatedBy;
    }

    await prisma.diaryEntry.upsert({
      where: { catId_day: { catId, day } },
      update: { content, mood, eventIds, generatedBy },
      create: { id: randomUUID(), catId, day, content, mood, eventIds, generatedBy, createdAt: new Date() },
    });
    regenerated++;
  });

  // 分批执行：连接池友好；单猫失败不拖垮全天，留待下次恢复
  const BATCH = 6;
  for (let i = 0; i < jobs.length; i += BATCH) {
    const settled = await Promise.allSettled(jobs.slice(i, i + BATCH).map((j) => j()));
    for (const r of settled) {
      if (r.status === "rejected") {
        failed++;
        console.error("[narrate] 单猫叙事失败:", r.reason instanceof Error ? r.reason.message.slice(0, 150) : r.reason);
      }
    }
  }

  // 岛屿日报：稳定 id upsert（重试不重复、不闪断）
  const newsExisting = await prisma.islandNews.count({ where: { day } });
  if (newsExisting === 0 || mode === "force") {
    const top = events
      .filter((e) => e.contentValue >= 6)
      .filter((e) => !(e.type === "shop_day" && !(e.data as Record<string, unknown>).closed && !(e.data as Record<string, unknown>).milestone))
      .sort((a, b) => b.contentValue - a.contentValue);
    const picked: typeof top = [];
    const seenCats = new Set<string>();
    for (const e of top) {
      if (seenCats.has(e.catId)) continue;
      picked.push(e);
      seenCats.add(e.catId);
      if (picked.length >= 2) break;
    }
    for (let slot = 0; slot < picked.length; slot++) {
      const e = picked[slot];
      const f: Fact = {
        catId: e.catId, day, segment: e.segment as Segment, type: e.type, outcome: e.outcome as Fact["outcome"],
        data: e.data as Record<string, unknown>, deltas: {}, contentValue: e.contentValue,
      };
      await prisma.islandNews.upsert({
        where: { id: `news-${day}-${slot}` },
        update: {},
        create: { id: `news-${day}-${slot}`, day, content: `${catById.get(e.catId)?.name ?? ""}${factSummary(f, catById)}`, catId: e.catId, createdAt: new Date() },
      });
    }
  }

  return { day, regenerated, failed };
}

/** 当前世界日是否存在"事件已提交但叙事缺失"的猫（Cron 恢复入口的判据） */
export async function narrationGap(day: number): Promise<number> {
  if (day <= 0) return 0;
  const eventCats = await prisma.event.findMany({ where: { day }, select: { catId: true }, distinct: ["catId"] });
  if (eventCats.length === 0) return 0;
  const diaryCats = await prisma.diaryEntry.findMany({ where: { day }, select: { catId: true } });
  const diarySet = new Set(diaryCats.map((d) => d.catId));
  const userCats = await prisma.cat.findMany({ where: { isNpc: false }, select: { id: true } });
  const userSet = new Set(userCats.map((c) => c.id));
  const summaryCats = await prisma.catDailySummary.findMany({ where: { day }, select: { catId: true } });
  const summarySet = new Set(summaryCats.map((s) => s.catId));
  let gap = 0;
  for (const { catId } of eventCats) {
    if (!diarySet.has(catId)) gap++;
    else if (userSet.has(catId) && !summarySet.has(catId)) gap++;
  }
  return gap;
}

/** 兼容旧 CLI 的别名 */
export const renarrateDay = (day: number, opts: { onlyMissing?: boolean } = {}) =>
  narrateCommittedDay(day, { mode: opts.onlyMissing === false ? "force" : "missing" });
