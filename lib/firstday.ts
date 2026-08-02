import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { narrateOwnerDay } from "./narrative/narrator";
import { firstImpression, firstSecret } from "./narrative/firstimpression";
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
    // 首日小秘密(doc/12 §八.7):结构化事实,日记的"小秘密"槽位取自这里——不给钥匙
    {
      catId,
      day,
      segment: "evening",
      type: "first_secret",
      outcome: "success",
      data: {
        scene: firstSecret(catId, cat.firstWords, cat.ownerNick || "主人"),
        location: "自家小屋",
      },
      deltas: {},
      contentValue: 3,
    },
  ];

  // 猫对主人的第一印象(doc/12 §三.4):确定性生成的关系事实,双向关系的起点
  const impression = firstImpression(cat, cat.firstWords, cat.ownerNick || "主人");

  // LLM 叙事在事务外先算好（耗时且可失败）；失败走兜底，写库始终原子。
  // 第一句话（firstWords）作为主人留言进叙事：首日日记必须回应它（doc/10 §3 Asset 2）
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
    // 第一印象作为素材进首日日记("对你的第一印象"段与亮相屏同源,doc/12 §三.4)
    memories: [impression],
    relationHints: [],
    ownerNick: cat.ownerNick ?? undefined,
    ownerMessage: cat.firstWords ?? undefined,
    suggestion: null,
    activeThreads: [],
    weekTheme: "相遇",
    catById: new Map([[cat.id, { name: cat.name }], ...(secondNpc ? [[secondNpc.id, { name: secondNpc.name }] as const] : [])]),
  });
  const tomorrowHook = summary.tomorrowHook ?? "那把旧钥匙能打开什么？明天它大概会去问问岛上的老猫。";

  await prisma.$transaction(async (tx) => {
    // 事务内二次幂等判定：并发重试只允许一份首日数据
    const exists = await tx.catDailySummary.findUnique({ where: { catId_day: { catId, day } } });
    if (exists) return;

    // 批量写事件：跨洋链路下逐条 create 会顶爆事务时限
    const eventIds = facts.map(() => randomUUID());
    await tx.event.createMany({
      data: facts.map((f, i) => ({
        id: eventIds[i],
        day,
        segment: f.segment,
        catId,
        type: f.type,
        outcome: f.outcome,
        data: f.data as object,
        deltas: {},
        contentValue: f.contentValue,
        isMain: f.type === "arrival",
      })),
    });
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
        // 钥匙降调（doc/10 §3 Asset 3）：D1 不挂进度条——今天它只是门口的一个小发现，
        // 事件线照常从明天推进，未来才发现它重要
        threadProgress: [],
        createdAt: new Date(),
      },
    });
    // 第一句话 = 永久记忆（doc/10 §3 Asset 2）：importance 10 保证进 D7 纪念册；
    // 进日常叙事的时机由 renarrate 的引用规则控制（首周/低谷日/每逢七天），防复读
    // 第一句话 + 第一印象(doc/12 §三.4)一次批量落库——亮相屏与日记引用同一条事实
    await tx.memoryEntry.createMany({
      data: [
        ...(cat.firstWords
          ? [{
              id: randomUUID(),
              catId,
              day,
              kind: "first_meeting",
              content: `第一次见面，${cat.ownerNick || "主人"}对你说：「${cat.firstWords}」`,
              importance: 10,
              visibility: "public",
            }]
          : []),
        {
          id: randomUUID(),
          catId,
          day,
          kind: "first_impression",
          content: impression,
          importance: 8,
          visibility: "public",
        },
      ],
    });
    // 首屏"这会儿的心情"对齐首日叙事（默认建态是"平静"，第一天不该平静）
    await tx.catState.updateMany({ where: { catId }, data: { mood: "既紧张又兴奋" } });
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
    // 跨洋链路 + 六段写入:默认 5s 事务时限不够(可靠性测试曾在 5.3s 处翻车)
  }, { timeout: 15_000 });
}
