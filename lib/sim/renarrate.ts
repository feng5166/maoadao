import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { newsLine } from "./engine";
import { THREAD_LABELS, THREAD_TOTALS } from "./threads";
import { narrateDiary, narrateOwnerDay, narrateWeekBook } from "../narrative/narrator";
import { bondStage, firstWeekPlan } from "./firstweek";
import { hashSeed, mulberry32 } from "./rng";
import { randomUUID as uuid } from "node:crypto";
import { weatherFor, type Fact, type Segment, type SimCat } from "./types";

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
  const weather = weatherFor(day);
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
    // first_meeting（第一句话）不进日常记忆池：importance 10 会天天霸榜，感动会变复读。
    // 引用时机由下面 !isNpc 分支的规则单独控制（doc/10 修订 2）。
    const memRows = await prisma.memoryEntry.findMany({
      where: { catId, day: { lt: day }, visibility: "public", kind: { not: "first_meeting" } },
      orderBy: [{ importance: "desc" }, { day: "desc" }],
      take: 4,
    });
    const memories = memRows.map((m) => `（第${m.day}天）${m.content}`);
    // 猫记得你（doc/09 §4）：隔些日子让它自然想起主人很早以前说过的话——
    // "今天本来想去灯塔，但想到你第一次来的时候让我别逞强"。只用允许公开的留言；约四分之一的天数出现。
    if (!catRow.isNpc) {
      const echoRng = mulberry32(hashSeed(day, "owner-echo", catId));
      if (echoRng() < 0.25) {
        const oldNudge = await prisma.ownerNudge.findFirst({
          where: { catId, isPublic: true, message: { not: null }, consumedDay: { not: null, lte: day - 7 } },
          orderBy: { consumedDay: "asc" },
        });
        if (oldNudge?.message) {
          memories.push(`（第${oldNudge.consumedDay}天）主人对你说过：「${oldNudge.message}」——这句话你一直记着`);
        }
      }
    }
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
    let form = "diary";
    if (!catRow.isNpc) {
      const nudge = nudges.find((n) => n.catId === catId);
      const followed = facts.some((f) => f.data.nudged === true);
      // 首周节奏：来岛第几天 → 主题与形态
      const firstEvent = await prisma.event.findFirst({ where: { catId }, orderBy: { day: "asc" }, select: { day: true } });
      const catDay = day - (firstEvent?.day ?? day) + 1;
      const plan = firstWeekPlan(catDay);
      form = plan?.form === "weekbook" ? "diary" : (plan?.form ?? "diary");
      // 第一句话的引用时机（doc/10 修订 2）：首周天天记得；之后只在低谷日（当日 fail≥2）
      // 和每逢七天想起——低谷日想起第一句话，是最打动人的时刻
      if (catDay > 1 && (catDay <= 7 || bad >= 2 || catDay % 7 === 0)) {
        const firstMeeting = await prisma.memoryEntry.findFirst({ where: { catId, kind: "first_meeting" } });
        if (firstMeeting) memories.unshift(`（第${firstMeeting.day}天·一直记着）${firstMeeting.content}`);
      }
      const owner = catRow.ownerId ? await prisma.user.findUnique({ where: { id: catRow.ownerId }, select: { visitDays: true } }) : null;
      const nudgeTotal = await prisma.ownerNudge.count({ where: { catId } });
      const bond = bondStage(catDay, nudgeTotal, owner?.visitDays ?? 0);
      // 剧情选择的标签：从昨天摘要的 choices 里找
      let suggestionLabel = nudge?.suggestion ? SUGGESTION_LABELS[nudge.suggestion] ?? nudge.suggestion : null;
      if (nudge?.suggestion?.startsWith("story:")) {
        const prev = await prisma.catDailySummary.findUnique({ where: { catId_day: { catId, day: day - 1 } } });
        const opts = (prev?.choices ?? []) as { value: string; label: string }[];
        suggestionLabel = opts.find((o) => o.value === nudge.suggestion)?.label ?? "你的选择";
      }
      // 事件线快照：当日叙事用实时状态；补写历史日优先用当天留下的摘要快照，避免把未来剧情写进过去
      // 今天落幕的线（endDay = 今天）也带上并标 done：页面据此展示"办成了"的收束时刻，
      // 叙事层据此知道这件事今天有了结局——事件线的完成本该是最明显的一天
      let activeThreads: { label: string; step: number; total?: number; done?: boolean; failed?: boolean }[];
      if (isCurrentDay) {
        const threads = await prisma.storyline.findMany({ where: { catId, status: "active" } });
        const finishedToday = await prisma.storyline.findMany({
          where: { catId, status: { in: ["resolved", "failed"] }, endDay: day },
        });
        const threadLabel = (t: (typeof threads)[number]) =>
          t.kind === "commission" && (t.data as Record<string, unknown>).npcName
            ? `${(t.data as Record<string, unknown>).npcName}托付的事`
            : THREAD_LABELS[t.kind] ?? t.kind;
        activeThreads = [
          ...threads.map((t) => ({ label: threadLabel(t), step: t.step, total: THREAD_TOTALS[t.kind] })),
          ...finishedToday.map((t) => ({
            label: threadLabel(t),
            step: t.step,
            total: THREAD_TOTALS[t.kind],
            done: true,
            failed: t.status === "failed",
          })),
        ];
      } else {
        activeThreads = ((existingSummary?.threadProgress ?? []) as { label: string; step: number; total?: number; done?: boolean; failed?: boolean }[]) ?? [];
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
        suggestion: nudge?.suggestion && suggestionLabel ? { label: suggestionLabel, followed } : null,
        activeThreads,
        weekTheme: plan?.theme,
        form: form as "diary" | "dialogue" | "note",
        bondLine: bond.line,
        catById,
      });
      content = summary.narrative;
      generatedBy = gb;
      const dayChoices = facts.flatMap((f) => (f.data.choices as { value: string; label: string }[] | undefined) ?? []);
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
          choices: dayChoices.length > 0 ? dayChoices : undefined,
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
          choices: dayChoices.length > 0 ? dayChoices : undefined,
          createdAt: new Date(),
        },
      });
      // D7：生成第一周纪念册（幂等）
      if (catDay === 7) {
        await generateWeekBook(catId, catRow.ownerId, catRow.ownerNick, cat).catch((e) =>
          console.error("[weekbook]", e instanceof Error ? e.message.slice(0, 120) : e),
        );
      }
    } else {
      const r = await narrateDiary({ cat, day, season, weather, mood, facts, mainFact, memories, relationHints, catById });
      content = r.content;
      generatedBy = r.generatedBy;
    }

    await prisma.diaryEntry.upsert({
      where: { catId_day: { catId, day } },
      update: { content, mood, eventIds, generatedBy, form },
      create: { id: randomUUID(), catId, day, content, mood, eventIds, generatedBy, form, createdAt: new Date() },
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
        create: { id: `news-${day}-${slot}`, day, content: newsLine(f, catById), catId: e.catId, createdAt: new Date() },
      });
    }
  }

  // 只往当期报纸登：补写/重写历史日不该把今天待发的线索登到旧报上
  if (isCurrentDay) await publishNewsTips(day, catById);

  return { day, regenerated, failed };
}

/** 读者来信：把岛民递的线索登上当期日报（原话照登，署名它的猫） */
async function publishNewsTips(day: number, catById: Map<string, { name: string }>): Promise<void> {
  const tips = await prisma.newsTip.findMany({ where: { publishedAt: null }, orderBy: { createdAt: "asc" }, take: 3 });
  for (const tip of tips) {
    const name = catById.get(tip.catId)?.name ?? "一位岛民";
    await prisma.islandNews.upsert({
      where: { id: `tip-${tip.id}` },
      update: {},
      create: {
        id: `tip-${tip.id}`,
        day,
        content: `读者来信：「${tip.content}」——${name}提供`,
        catId: tip.catId,
        createdAt: new Date(),
      },
    });
    await prisma.newsTip.update({ where: { id: tip.id }, data: { publishedAt: new Date(), publishDay: day } });
  }
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

async function generateWeekBook(
  catId: string,
  ownerId: string | null,
  ownerNick: string | null,
  cat: SimCat,
): Promise<void> {
  const exists = await prisma.weekBook.findUnique({ where: { catId_weekIndex: { catId, weekIndex: 1 } } });
  if (exists) return;
  const summaries = await prisma.catDailySummary.findMany({ where: { catId }, orderBy: { day: "asc" }, take: 7 });
  const owner = ownerId ? await prisma.user.findUnique({ where: { id: ownerId }, select: { visitDays: true } }) : null;
  const messages = await prisma.ownerNudge.count({ where: { catId, message: { not: null } } });
  const rels = await prisma.relationship.findMany({
    where: { OR: [{ catAId: catId }, { catBId: catId }] },
    orderBy: { affinity: "desc" },
    take: 1,
  });
  const bestFriendId = rels[0] ? (rels[0].catAId === catId ? rels[0].catBId : rels[0].catAId) : null;
  const bestFriend = bestFriendId ? await prisma.cat.findUnique({ where: { id: bestFriendId }, select: { name: true } }) : null;
  const keepsakes = await prisma.memoryEntry.findMany({
    where: { catId, importance: { gte: 7 } },
    orderBy: { importance: "desc" },
    take: 3,
  });
  const receipt = summaries.map((s2) => s2.interventionResponse).filter(Boolean).slice(-1)[0] ?? null;

  const { content } = await narrateWeekBook({
    cat,
    ownerNick: ownerNick ?? undefined,
    visitDays: owner?.visitDays ?? 0,
    messageCount: messages,
    weekSummaries: summaries.map((s2) => ({ day: s2.day, headline: s2.headline, narrative: s2.narrative })),
    bestFriendName: bestFriend?.name ?? null,
    keepsakes: keepsakes.map((k) => k.content),
    suggestionStory: receipt,
  });
  await prisma.weekBook.create({
    data: {
      id: uuid(),
      catId,
      weekIndex: 1,
      content: {
        ...content,
        visitDays: owner?.visitDays ?? 0,
        messageCount: messages,
        bestFriend: bestFriend?.name ?? null,
        keepsakes: keepsakes.map((k) => k.content),
        arrivalHeadline: summaries[0]?.headline ?? "",
      },
      createdAt: new Date(),
    },
  });
}
