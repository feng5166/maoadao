import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db";
import { runDailyTick } from "./engine";
import { narrateDiary } from "../narrative/narrator";
import type { SimCat, SimCatState, SimEvent } from "./types";

/** 推进世界一天：跑模拟 → 落库事实 → 为每只猫生成日记。 */
export async function advanceOneDay(options: { narrate?: boolean } = {}) {
  const { narrate = true } = options;

  let world = await prisma.worldState.findUnique({ where: { id: 1 } });
  if (!world) {
    world = await prisma.worldState.create({ data: { id: 1, day: 0 } });
  }
  const day = world.day + 1;
  const weather = ["晴", "晴", "多云", "雨"][day % 4];

  const catRows = await prisma.cat.findMany();
  const stateRows = await prisma.catState.findMany();
  const relRows = await prisma.relationship.findMany();
  const storyRows = await prisma.storyline.findMany({ where: { status: "active" } });

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
  const eventRows = result.events.map((ev) => {
    const id = randomUUID();
    eventIdsByCat.set(ev.catId, [...(eventIdsByCat.get(ev.catId) ?? []), id]);
    return {
      id,
      day,
      catId: ev.catId,
      type: ev.type,
      data: ev.data as Prisma.InputJsonValue,
      deltas: ev.deltas as Prisma.InputJsonValue,
    };
  });
  await prisma.event.createMany({ data: eventRows });

  for (const [catId, change] of result.stateChanges) {
    await prisma.catState.update({ where: { catId }, data: { ...change, updatedDay: day } });
  }

  for (const ac of result.affinityChanges) {
    const existing = await prisma.relationship.findFirst({
      where: {
        OR: [
          { catAId: ac.catAId, catBId: ac.catBId },
          { catAId: ac.catBId, catBId: ac.catAId },
        ],
      },
    });
    if (existing) {
      const affinity = Math.max(-100, Math.min(100, existing.affinity + ac.delta));
      await prisma.relationship.update({
        where: { id: existing.id },
        data: {
          affinity,
          lastInteractionDay: day,
          kind: affinity > 40 ? "friend" : affinity < -40 ? "rival" : "acquaintance",
        },
      });
    } else {
      await prisma.relationship.create({
        data: { id: randomUUID(), catAId: ac.catAId, catBId: ac.catBId, affinity: ac.delta, lastInteractionDay: day },
      });
    }
  }

  for (const s of result.newStorylines) {
    await prisma.storyline.create({
      data: { id: randomUUID(), ...s, data: s.data as Prisma.InputJsonValue },
    });
  }
  if (result.resolvedStorylineIds.length > 0) {
    await prisma.storyline.updateMany({
      where: { id: { in: result.resolvedStorylineIds } },
      data: { status: "resolved", endDay: day },
    });
  }
  await prisma.worldState.update({ where: { id: 1 }, data: { day, weather } });

  // 叙事层：并行为每只猫写日记（串行会超出 serverless 函数时限）
  let diaries = 0;
  if (narrate) {
    const eventsByCat = new Map<string, SimEvent[]>();
    for (const ev of result.events) {
      eventsByCat.set(ev.catId, [...(eventsByCat.get(ev.catId) ?? []), ev]);
    }
    const jobs = cats
      .filter((cat) => (eventsByCat.get(cat.id)?.length ?? 0) > 0)
      .map(async (cat) => {
        const mood = result.stateChanges.get(cat.id)?.mood ?? "平静";
        const { content, generatedBy } = await narrateDiary({
          cat,
          day,
          season: world.season,
          weather,
          mood,
          events: eventsByCat.get(cat.id)!,
        });
        await prisma.diaryEntry.create({
          data: {
            id: randomUUID(),
            catId: cat.id,
            day,
            content,
            mood,
            eventIds: eventIdsByCat.get(cat.id) ?? [],
            generatedBy,
            createdAt: new Date(),
          },
        });
        return generatedBy;
      });
    diaries = (await Promise.all(jobs)).length;
  }

  return { day, weather, eventCount: result.events.length, diaryCount: diaries };
}
