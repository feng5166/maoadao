import { randomUUID } from "node:crypto";
import { eq, and, or, inArray } from "drizzle-orm";
import { db, schema } from "../db";
import { runDailyTick } from "./engine";
import { narrateDiary } from "../narrative/narrator";
import type { SimCat, SimCatState, SimEvent } from "./types";

/** 推进世界一天：跑模拟 → 落库事实 → 为每只猫生成日记。 */
export async function advanceOneDay(options: { narrate?: boolean } = {}) {
  const { narrate = true } = options;

  let world = db.select().from(schema.worldState).get();
  if (!world) {
    db.insert(schema.worldState).values({ id: 1, day: 0 }).run();
    world = db.select().from(schema.worldState).get()!;
  }
  const day = world.day + 1;
  const weather = ["晴", "晴", "多云", "雨"][day % 4];

  const catRows = db.select().from(schema.cats).all();
  const stateRows = db.select().from(schema.catStates).all();
  const relRows = db.select().from(schema.relationships).all();
  const storyRows = db.select().from(schema.storylines).where(eq(schema.storylines.status, "active")).all();

  const cats: SimCat[] = catRows.map((c) => ({
    id: c.id,
    name: c.name,
    isNpc: c.isNpc,
    boldness: c.boldness,
    sociability: c.sociability,
    diligence: c.diligence,
    personaTags: c.personaTags,
  }));
  const states = new Map<string, SimCatState>(
    stateRows.map((s) => [s.catId, { coins: s.coins, energy: s.energy, mood: s.mood, location: s.location }]),
  );

  const result = runDailyTick(
    { day, season: world.season, weather },
    cats,
    states,
    relRows,
    storyRows.map((s) => ({ ...s, data: s.data as Record<string, unknown> })),
  );

  // 落库：事实、状态、关系、事件线
  const eventIdsByCat = new Map<string, string[]>();
  for (const ev of result.events) {
    const id = randomUUID();
    db.insert(schema.events).values({ id, day, catId: ev.catId, type: ev.type, data: ev.data, deltas: ev.deltas }).run();
    eventIdsByCat.set(ev.catId, [...(eventIdsByCat.get(ev.catId) ?? []), id]);
  }
  for (const [catId, change] of result.stateChanges) {
    db.update(schema.catStates).set({ ...change, updatedDay: day }).where(eq(schema.catStates.catId, catId)).run();
  }
  for (const ac of result.affinityChanges) {
    const existing = db
      .select()
      .from(schema.relationships)
      .where(
        or(
          and(eq(schema.relationships.catAId, ac.catAId), eq(schema.relationships.catBId, ac.catBId)),
          and(eq(schema.relationships.catAId, ac.catBId), eq(schema.relationships.catBId, ac.catAId)),
        ),
      )
      .get();
    if (existing) {
      const affinity = Math.max(-100, Math.min(100, existing.affinity + ac.delta));
      db.update(schema.relationships)
        .set({ affinity, lastInteractionDay: day, kind: affinity > 40 ? "friend" : affinity < -40 ? "rival" : "acquaintance" })
        .where(eq(schema.relationships.id, existing.id))
        .run();
    } else {
      db.insert(schema.relationships)
        .values({ id: randomUUID(), catAId: ac.catAId, catBId: ac.catBId, affinity: ac.delta, lastInteractionDay: day })
        .run();
    }
  }
  for (const s of result.newStorylines) {
    db.insert(schema.storylines).values({ id: randomUUID(), ...s }).run();
  }
  if (result.resolvedStorylineIds.length > 0) {
    db.update(schema.storylines)
      .set({ status: "resolved", endDay: day })
      .where(inArray(schema.storylines.id, result.resolvedStorylineIds))
      .run();
  }
  db.update(schema.worldState).set({ day, weather }).where(eq(schema.worldState.id, 1)).run();

  // 叙事层：把每只猫当日的事实交给 LLM 写日记
  let diaries = 0;
  if (narrate) {
    const eventsByCat = new Map<string, SimEvent[]>();
    for (const ev of result.events) {
      eventsByCat.set(ev.catId, [...(eventsByCat.get(ev.catId) ?? []), ev]);
    }
    for (const cat of cats) {
      const catEvents = eventsByCat.get(cat.id);
      if (!catEvents || catEvents.length === 0) continue;
      const mood = result.stateChanges.get(cat.id)?.mood ?? "平静";
      const { content, generatedBy } = await narrateDiary({
        cat,
        day,
        season: world.season,
        weather,
        mood,
        events: catEvents,
      });
      db.insert(schema.diaryEntries)
        .values({
          id: randomUUID(),
          catId: cat.id,
          day,
          content,
          mood,
          eventIds: eventIdsByCat.get(cat.id) ?? [],
          generatedBy,
          createdAt: new Date(),
        })
        .run();
      diaries++;
    }
  }

  return { day, weather, eventCount: result.events.length, diaryCount: diaries };
}
