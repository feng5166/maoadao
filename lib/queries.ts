import { prisma } from "./db";

export async function getWorld() {
  return (await prisma.worldState.findUnique({ where: { id: 1 } })) ?? { id: 1, day: 0, season: "夏", weather: "晴" };
}

export async function getFeed(limit = 50) {
  const entries = await prisma.diaryEntry.findMany({
    orderBy: [{ day: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: { cat: { select: { id: true, name: true, isNpc: true } } },
  });
  return entries.map((e) => ({
    id: e.id,
    day: e.day,
    content: e.content,
    mood: e.mood,
    catId: e.cat.id,
    catName: e.cat.name,
    isNpc: e.cat.isNpc,
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
