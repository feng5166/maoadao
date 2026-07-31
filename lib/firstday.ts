import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { narrateOwnerDay } from "./narrative/narrator";
import type { Fact } from "./sim/types";

// 首日体验：领养后不能面对空白页（定义·八 Step5）。
// LLM 先行生成叙事（失败用兜底文案），事件/日记/摘要/旧钥匙事件线在单事务写入——
// 中途失败整体回滚，重试不产生重复（幂等以摘要存在性为准，在事务内判定）。

export async function generateArrivalDay(catId: string): Promise<void> {
  const cat = await prisma.cat.findUnique({ where: { id: catId } });
  if (!cat || cat.isNpc) return;
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  const day = world?.day ?? 0;

  // 快速幂等检查（事务内还会再查一次防竞态）
  if (await prisma.catDailySummary.findUnique({ where: { catId_day: { catId, day } } })) return;

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

  // LLM 叙事在事务外先算好（耗时且可失败）；失败走兜底，写库始终原子
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
  const tomorrowHook = summary.tomorrowHook ?? "那把旧钥匙能打开什么？明天它大概会去问问岛上的老猫。";

  await prisma.$transaction(async (tx) => {
    // 事务内二次幂等判定：并发重试只允许一份首日数据
    const exists = await tx.catDailySummary.findUnique({ where: { catId_day: { catId, day } } });
    if (exists) return;

    const eventIds: string[] = [];
    for (const f of facts) {
      const id = randomUUID();
      eventIds.push(id);
      await tx.event.create({
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
    await tx.diaryEntry.create({
      data: {
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
    await tx.catDailySummary.create({
      data: {
        id: randomUUID(),
        catId,
        day,
        headline: summary.headline,
        narrative: summary.narrative,
        interventionResponse: null,
        tomorrowHook,
        stateChanges: [],
        threadProgress: [{ label: "旧钥匙的来历", step: 1 }],
        createdAt: new Date(),
      },
    });
    // 旧钥匙不是文案钩子，是真事件线：模拟器后续会推进它（问来历 → 打开隔层）
    await tx.storyline.create({
      data: {
        id: randomUUID(),
        catId,
        kind: "arrival_key",
        status: "active",
        step: 1,
        lastAdvanceDay: day,
        data: { key: "拴着褪色红绳的旧钥匙" },
        startDay: day,
      },
    });
  });
}
