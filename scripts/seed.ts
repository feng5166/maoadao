import { db, schema } from "../lib/db";
import { NPC_CATS } from "../lib/sim/npcs";

const now = new Date();
let inserted = 0;

for (const npc of NPC_CATS) {
  const exists = db.select().from(schema.cats).all().some((c) => c.id === npc.id);
  if (exists) continue;
  db.insert(schema.cats)
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
  db.insert(schema.catStates).values({ catId: npc.id }).run();
  inserted++;
}

const world = db.select().from(schema.worldState).get();
if (!world) {
  db.insert(schema.worldState).values({ id: 1, day: 0 }).run();
}

console.log(`已入驻 ${inserted} 只 NPC 猫（共 ${NPC_CATS.length} 只）。`);
