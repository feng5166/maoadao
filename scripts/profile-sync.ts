// Birth Canon 落库（Gate C 已过，2026-08-08）：deriveAllCandidates() → CatProfile upsert。
// approvedAt = 终审拍板时间；PROFILE_VERSION 变更后重跑本脚本即换代（历史由 git + 表内版本可溯）。
// 用法：node --env-file=.env.local node_modules/.bin/tsx scripts/profile-sync.ts
import { Prisma } from "@prisma/client";
import { prisma } from "../lib/db";
import { deriveAllCandidates, PROFILE_VERSION } from "../lib/sim/profile";

const APPROVED_AT = new Date("2026-08-08T00:00:00+08:00"); // Gate C 终审（09a）

async function main() {
  const profiles = deriveAllCandidates();
  for (const p of profiles) {
    const blocks = {
      profileVersion: p.profileVersion,
      rarity: p.rarity,
      corePreference: p.corePreference as unknown as Prisma.InputJsonValue,
      lifePatternSeed: { ...p.lifePatternSeed, solitary: p.solitary, requiresItemTag: p.requiresItemTag ?? null } as unknown as Prisma.InputJsonValue,
      discoveryTrait: p.discoveryTrait as unknown as Prisma.InputJsonValue,
      behaviorSignature: p.behaviorSignature as unknown as Prisma.InputJsonValue,
      socialSeed: p.socialSeed as unknown as Prisma.InputJsonValue,
      leaveStyle: p.leaveStyle as unknown as Prisma.InputJsonValue,
      overrides: p.overrides as unknown as Prisma.InputJsonValue,
      approvedAt: APPROVED_AT,
    };
    await prisma.catProfile.upsert({
      where: { catId: p.catId },
      update: blocks,
      create: { catId: p.catId, createdAt: new Date(), ...blocks },
    });
  }
  console.log(`synced ${profiles.length} profiles @ ${PROFILE_VERSION}, approvedAt=${APPROVED_AT.toISOString()}`);
}

main().finally(() => prisma.$disconnect());
