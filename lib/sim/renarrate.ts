import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { factSummary } from "./engine";
import { THREAD_LABELS } from "./threads";
import { narrateDiary, narrateOwnerDay } from "../narrative/narrator";
import type { Fact, Segment, SimCat } from "./types";

// 叙事补写：从已落库的事实重新生成某一天的日记与摘要。
// 这是"Event 是唯一事实来源、日记可重新生成"承诺的兑现，
// 也是 tick 叙事阶段失败后的恢复通道（模拟事务已提交，叙事随时可重来）。

const SUGGESTION_LABELS: Record<string, string> = { earn: "去赚钱", explore: "去探险", social: "找朋友", rest: "好好休息" };

export async function renarrateDay(day: number, options: { onlyMissing?: boolean } = {}) {
  const { onlyMissing = true } = options;
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  const weather = ["晴", "晴", "多云", "雨"][day % 4];
  const season = world?.season ?? "夏";

  const events = await prisma.event.findMany({ where: { day }, orderBy: [{ segment: "asc" }] });
  if (events.length === 0) return { day, regenerated: 0 };

  const catRows = await prisma.cat.findMany();
  const catById = new Map(catRows.map((c) => [c.id, { name: c.name }]));
  const nudges = await prisma.ownerNudge.findMany({ where: { consumedDay: day } });

  const byCat = new Map<string, typeof events>();
  for (const e of events) byCat.set(e.catId, [...(byCat.get(e.catId) ?? []), e]);

  let regenerated = 0;
  for (const [catId, rows] of byCat) {
    if (onlyMissing) {
      const exists = await prisma.diaryEntry.findUnique({ where: { catId_day: { catId, day } } });
      if (exists) continue;
    }
    const catRow = catRows.find((c) => c.id === catId);
    if (!catRow) continue;

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
    const bad = facts.filter((f) => f.outcome === "fail").length;
    const mood = bad >= 2 ? "郁闷" : facts.some((f) => f.outcome === "complication") ? "五味杂陈" : "平静";

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
    const eventIds = rows.map((e) => e.id);

    let content: string;
    let generatedBy: "llm" | "fallback";
    if (!catRow.isNpc) {
      const nudge = nudges.find((n) => n.catId === catId);
      const followed = facts.some((f) => f.data.nudged === true);
      const threads = await prisma.storyline.findMany({ where: { catId, status: "active" } });
      const activeThreads = threads.map((t) => ({
        label: THREAD_LABELS[t.kind] ?? t.kind,
        step: t.step,
        total: t.kind === "lighthouse" ? 7 : undefined,
      }));
      const { summary, generatedBy: gb } = await narrateOwnerDay({
        cat,
        day,
        season,
        weather,
        mood,
        facts,
        mainFact,
        memories,
        relationHints: [],
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
      const stateChanges = coinDelta !== 0 ? [{ label: "鱼币", delta: coinDelta > 0 ? `+${coinDelta}` : `${coinDelta}` }] : [];
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
      const r = await narrateDiary({ cat, day, season, weather, mood, facts, mainFact, memories, relationHints: [], catById });
      content = r.content;
      generatedBy = r.generatedBy;
    }

    await prisma.diaryEntry.upsert({
      where: { catId_day: { catId, day } },
      update: { content, mood, eventIds, generatedBy },
      create: { id: randomUUID(), catId, day, content, mood, eventIds, generatedBy, createdAt: new Date() },
    });
    regenerated++;
  }

  // 岛屿日报缺失也补上（用事实转写，不再花 LLM）
  const newsCount = await prisma.islandNews.count({ where: { day } });
  if (newsCount === 0) {
    const top = events
      .filter((e) => e.contentValue >= 6)
      .sort((a, b) => b.contentValue - a.contentValue)
      .slice(0, 2);
    for (const e of top) {
      const f: Fact = {
        catId: e.catId, day, segment: e.segment as Segment, type: e.type, outcome: e.outcome as Fact["outcome"],
        data: e.data as Record<string, unknown>, deltas: {}, contentValue: e.contentValue,
      };
      await prisma.islandNews.create({
        data: { id: randomUUID(), day, content: `${catById.get(e.catId)?.name ?? ""}${factSummary(f, catById)}`, catId: e.catId, createdAt: new Date() },
      });
    }
  }

  return { day, regenerated };
}
