import { prisma } from "./db";

export async function getWorld() {
  return (await prisma.worldState.findUnique({ where: { id: 1 } })) ?? { id: 1, day: 0, season: "夏", weather: "晴" };
}

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

export async function getViewerCat(viewerId: string | null) {
  if (!viewerId) return null;
  return prisma.cat.findFirst({ where: { ownerId: viewerId } });
}

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
