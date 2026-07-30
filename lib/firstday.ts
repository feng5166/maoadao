import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { narrateOwnerDay } from "./narrative/narrator";
import type { Fact } from "./sim/types";

// 首日体验：领养后不能面对空白页（定义·八 Step5）。
// 立刻生成"到岛第一天"的事实 + 日记 + 今日摘要（含明日悬念），当天即有内容可看。

export async function generateArrivalDay(catId: string): Promise<void> {
  const cat = await prisma.cat.findUnique({ where: { id: catId } });
  if (!cat || cat.isNpc) return;
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  const day = world?.day ?? 0;

  // 已有当日摘要则跳过（幂等）
  const existing = await prisma.catDailySummary.findUnique({ where: { catId_day: { catId, day } } });
  if (existing) return;

  const greeterRel = await prisma.relationship.findFirst({
    where: { catAId: catId, catBId: { not: "npc-mianhua" } },
  });
  const secondNpc = greeterRel ? await prisma.cat.findUnique({ where: { id: greeterRel.catBId } }) : null;

  // 脚本化的到岛事实（确定性，不靠 LLM 编世界）
  const facts: Fact[] = [
    {
      catId,
      day,
      segment: "afternoon",
      type: "arrival",
      outcome: "success",
      data: {
        scene: `坐着快递船靠岸，棉花第一个迎上来打招呼${secondNpc ? `，${secondNpc.name}也凑过来看新邻居` : ""}`,
        location: "码头",
      },
      deltas: {},
      contentValue: 6,
    },
    {
      catId,
      day,
      segment: "evening",
      type: "arrival_home",
      outcome: "complication",
      data: {
        scene: "小屋的门口放着一把不知是谁留下的旧钥匙，上面拴着褪色的红绳",
        location: "自家小屋",
      },
      deltas: {},
      contentValue: 5,
    },
  ];

  const eventIds: string[] = [];
  for (const f of facts) {
    const id = randomUUID();
    eventIds.push(id);
    await prisma.event.create({
      data: {
        id,
        day,
        segment: f.segment,
        catId,
        type: f.type,
        outcome: f.outcome,
        data: f.data as object,
        deltas: {},
        contentValue: f.contentValue,
        isMain: f.type === "arrival",
      },
    });
  }

  const { summary, generatedBy } = await narrateOwnerDay({
    cat: {
      id: cat.id,
      name: cat.name,
      isNpc: false,
      boldness: cat.boldness,
      sociability: cat.sociability,
      diligence: cat.diligence,
      personaTags: cat.personaTags,
    },
    day,
    season: world?.season ?? "夏",
    weather: world?.weather ?? "晴",
    mood: "既紧张又兴奋",
    facts,
    mainFact: facts[0],
    memories: [],
    relationHints: [],
    ownerNick: cat.ownerNick ?? undefined,
    suggestion: null,
    activeThreads: [],
    catById: new Map([[cat.id, { name: cat.name }], ...(secondNpc ? [[secondNpc.id, { name: secondNpc.name }] as const] : [])]),
  });

  await prisma.diaryEntry.upsert({
    where: { catId_day: { catId, day } },
    update: {},
    create: {
      id: randomUUID(),
      catId,
      day,
      content: summary.narrative,
      mood: "既紧张又兴奋",
      eventIds,
      generatedBy,
      createdAt: new Date(),
    },
  });
  await prisma.catDailySummary.create({
    data: {
      id: randomUUID(),
      catId,
      day,
      headline: summary.headline,
      narrative: summary.narrative,
      interventionResponse: null,
      tomorrowHook: summary.tomorrowHook ?? "那把旧钥匙能打开什么？明天它大概会去问问岛上的老猫。",
      stateChanges: [],
      threadProgress: [],
      createdAt: new Date(),
    },
  });
}
