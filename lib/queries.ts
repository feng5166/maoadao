import { desc, eq, or } from "drizzle-orm";
import { db, schema } from "./db";

export function getWorld() {
  return db.select().from(schema.worldState).get() ?? { id: 1, day: 0, season: "夏", weather: "晴" };
}

export function getFeed(limit = 50) {
  return db
    .select({
      id: schema.diaryEntries.id,
      day: schema.diaryEntries.day,
      content: schema.diaryEntries.content,
      mood: schema.diaryEntries.mood,
      catId: schema.cats.id,
      catName: schema.cats.name,
      isNpc: schema.cats.isNpc,
    })
    .from(schema.diaryEntries)
    .innerJoin(schema.cats, eq(schema.diaryEntries.catId, schema.cats.id))
    .orderBy(desc(schema.diaryEntries.day), desc(schema.diaryEntries.createdAt))
    .limit(limit)
    .all();
}

export function getCat(id: string) {
  return db.select().from(schema.cats).where(eq(schema.cats.id, id)).get();
}

export function getCatState(id: string) {
  return db.select().from(schema.catStates).where(eq(schema.catStates.catId, id)).get();
}

export function getCatDiaries(id: string, limit = 30) {
  return db
    .select()
    .from(schema.diaryEntries)
    .where(eq(schema.diaryEntries.catId, id))
    .orderBy(desc(schema.diaryEntries.day))
    .limit(limit)
    .all();
}

export function getDiary(catId: string, day: number) {
  return db
    .select()
    .from(schema.diaryEntries)
    .where(eq(schema.diaryEntries.catId, catId))
    .all()
    .find((d) => d.day === day);
}

export function getFriends(id: string, limit = 6) {
  const rels = db
    .select()
    .from(schema.relationships)
    .where(or(eq(schema.relationships.catAId, id), eq(schema.relationships.catBId, id)))
    .orderBy(desc(schema.relationships.affinity))
    .limit(limit)
    .all();
  return rels.map((r) => {
    const otherId = r.catAId === id ? r.catBId : r.catAId;
    const other = getCat(otherId);
    return { ...r, otherId, otherName: other?.name ?? "神秘猫" };
  });
}

export function getActiveStorylines(catId: string) {
  return db
    .select()
    .from(schema.storylines)
    .where(eq(schema.storylines.catId, catId))
    .all()
    .filter((s) => s.status === "active");
}
