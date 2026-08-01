import { cache } from "react";
import { prisma } from "./db";

// React.cache：同一次请求里 layout 和 page 重复调用只打一次数据库
export const getWorld = cache(async () => {
  return (await prisma.worldState.findUnique({ where: { id: 1 } })) ?? { id: 1, day: 0, season: "夏", weather: "晴" };
});

export async function getFeed(limit = 50) {
  const entries = await prisma.diaryEntry.findMany({
    orderBy: [{ day: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: { cat: { select: { id: true, name: true, isNpc: true, portraitUrl: true } } },
  });
  return entries.map((e) => ({
    id: e.id,
    day: e.day,
    content: e.content,
    mood: e.mood,
    catId: e.cat.id,
    catName: e.cat.name,
    isNpc: e.cat.isNpc,
    portraitUrl: e.cat.portraitUrl,
  }));
}

export async function getCat(id: string) {
  return prisma.cat.findUnique({ where: { id } });
}

export async function getCatState(id: string) {
  return prisma.catState.findUnique({ where: { catId: id } });
}

export async function getCatDiaries(id: string, limit = 30) {
  return prisma.diaryEntry.findMany({
    where: { catId: id },
    orderBy: { day: "desc" },
    take: limit,
  });
}

export async function getDiary(catId: string, day: number) {
  return prisma.diaryEntry.findUnique({ where: { catId_day: { catId, day } } });
}

export async function getFriends(id: string, limit = 6) {
  const rels = await prisma.relationship.findMany({
    where: { OR: [{ catAId: id }, { catBId: id }] },
    orderBy: { affinity: "desc" },
    take: limit,
  });
  return Promise.all(
    rels.map(async (r) => {
      const otherId = r.catAId === id ? r.catBId : r.catAId;
      const other = await getCat(otherId);
      return { ...r, otherId, otherName: other?.name ?? "神秘猫" };
    }),
  );
}

export async function getActiveStorylines(catId: string) {
  return prisma.storyline.findMany({ where: { catId, status: "active" } });
}

export async function getIslandNews(limit = 6) {
  return prisma.islandNews.findMany({ orderBy: [{ day: "desc" }, { createdAt: "desc" }], take: limit });
}

/** 日报带脸：新闻行附上当事猫（IslandNews 没建外键，手动补一次查询） */
export async function getIslandNewsWithCats(limit = 6) {
  const rows = await getIslandNews(limit);
  const catIds = [...new Set(rows.map((r) => r.catId).filter((id): id is string => Boolean(id)))];
  const cats = catIds.length
    ? await prisma.cat.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true, portraitUrl: true } })
    : [];
  const byId = new Map(cats.map((c) => [c.id, c]));
  return rows.map((r) => ({ ...r, cat: r.catId ? (byId.get(r.catId) ?? null) : null }));
}

/** 首页橱窗：世界状态 + 岛民名册 + 今日样张日记（优先当天的 LLM 手笔，缺则回退最近一篇） */
export async function getHomeShowcase() {
  const [world, npcs, totalCats] = await Promise.all([
    getWorld(),
    prisma.cat.findMany({
      where: { isNpc: true },
      select: { id: true, name: true, portraitUrl: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.cat.count(),
  ]);
  const diaryQuery = (where: object) =>
    prisma.diaryEntry.findFirst({
      where: { generatedBy: "llm", form: "diary", cat: { isNpc: true }, ...where },
      orderBy: [{ day: "desc" }, { createdAt: "desc" }],
      include: { cat: { select: { id: true, name: true, portraitUrl: true } } },
    });
  const sampleDiary = (await diaryQuery({ day: world.day })) ?? (await diaryQuery({}));
  return { world, npcs, totalCats, sampleDiary };
}

export const getViewerCat = cache(async (viewerId: string | null) => {
  if (!viewerId) return null;
  return prisma.cat.findFirst({ where: { ownerId: viewerId } });
});

export async function getLatestSummary(catId: string) {
  return prisma.catDailySummary.findFirst({ where: { catId }, orderBy: { day: "desc" } });
}

export async function getSummaries(catId: string, limit = 30) {
  return prisma.catDailySummary.findMany({ where: { catId }, orderBy: { day: "desc" }, take: limit });
}

export async function getPendingNudge(catId: string) {
  return prisma.ownerNudge.findFirst({ where: { catId, consumedDay: null }, orderBy: { createdAt: "desc" } });
}

/** 关系数值翻译成人话（定义：不要只显示数值） */
export function describeAffinity(affinity: number): string {
  if (affinity > 60) return "形影不离的挚友";
  if (affinity > 30) return "好朋友";
  if (affinity > 10) return "渐渐熟络起来";
  if (affinity > -10) return "点头之交";
  if (affinity > -40) return "有点别扭";
  return "水火不容";
}
