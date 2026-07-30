import { db, schema } from "../lib/db";
import { NPC_CATS } from "../lib/sim/npcs";

async function main() {
  const now = new Date();
  let inserted = 0;

  const existing = new Set((await db.select().from(schema.cats).all()).map((c) => c.id));
  for (const npc of NPC_CATS) {
    if (existing.has(npc.id)) continue;
    await db
      .insert(schema.cats)
      .values({
        id: npc.id,
        name: npc.name,
        isNpc: true,
        boldness: npc.boldness,
        sociability: npc.sociability,
        diligence: npc.diligence,
        personaTags: npc.personaTags,
        appearance: npc.appearance,
        bio: npc.bio,
        createdAt: now,
      })
      .run();
    await db.insert(schema.catStates).values({ catId: npc.id }).run();
    inserted++;
  }

  const world = await db.select().from(schema.worldState).get();
  if (!world) {
    await db.insert(schema.worldState).values({ id: 1, day: 0 }).run();
  }

  console.log(`已入驻 ${inserted} 只 NPC 猫（共 ${NPC_CATS.length} 只）。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
