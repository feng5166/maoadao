import { prisma } from "../lib/db";
import { NPC_CATS } from "../lib/sim/npcs";

async function main() {
  const now = new Date();
  let inserted = 0;

  const existing = new Set((await prisma.cat.findMany({ select: { id: true } })).map((c) => c.id));
  for (const npc of NPC_CATS) {
    if (existing.has(npc.id)) continue;
    await prisma.cat.create({
      data: {
        id: npc.id,
        name: npc.name,
        isNpc: true,
        role: npc.role,
        boldness: npc.boldness,
        sociability: npc.sociability,
        diligence: npc.diligence,
        personaTags: npc.personaTags,
        appearance: npc.appearance,
        bio: npc.bio,
        createdAt: now,
        state: { create: {} },
      },
    });
    inserted++;
  }

  await prisma.worldState.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1, day: 0 },
  });

  console.log(`已入驻 ${inserted} 只 NPC 猫（共 ${NPC_CATS.length} 只）。`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
