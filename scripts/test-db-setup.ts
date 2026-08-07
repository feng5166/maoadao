import { config } from "dotenv";
config({ path: [".env.local", ".env"] }); // 注意:**不 override** —— 命令行传的 TEST_DATABASE_URL 必须说了算

// 测试库初始化(2026-08-07 review P1 配套):建表 + 播种,只对 TEST_DATABASE_URL 生效。
//
// 为什么不能直接 `DATABASE_URL=… npx tsx scripts/seed.ts`:
// scripts/_env.ts 用的是 `override: true`,会把命令行传进来的库地址**覆盖回 .env.local
// 里的生产串** —— 想给测试库播种,结果连的是生产库。这个脚本因此自己加载 env(不 override),
// 并且给 PrismaClient 显式指定 datasource,绕开一切环境变量的干扰。
//
// 用法:
//   TEST_DATABASE_URL="postgresql://…/maoadao_test" npx tsx scripts/test-db-setup.ts
//   TEST_DATABASE_URL="…" npm test
import { execFileSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";
import { NPC_CATS } from "../lib/sim/npcs";

const URL_ = process.env.TEST_DATABASE_URL ?? "";

function dbName(u: string): string {
  try {
    return new globalThis.URL(u).pathname.replace(/^\//, "").split("?")[0];
  } catch {
    return "";
  }
}

async function main() {
  if (!URL_) throw new Error("要先给 TEST_DATABASE_URL(指向测试库,不是生产库)");
  const name = dbName(URL_);
  if (!name.toLowerCase().includes("test") && process.env.ALLOW_UNSAFE_TEST_DB !== "1") {
    throw new Error(`库名「${name}」不像测试库,拒绝初始化。确认无误再加 ALLOW_UNSAFE_TEST_DB=1`);
  }
  console.log(`目标测试库:${name}`);

  // 建表:prisma CLI 认 DATABASE_URL,这里只给这一条子进程设,不污染当前进程
  execFileSync("npx", ["prisma", "db", "push", "--skip-generate", "--accept-data-loss"], {
    env: { ...process.env, DATABASE_URL: URL_, DATABASE_URL_UNPOOLED: URL_ },
    stdio: "inherit",
  });

  // 播种:显式 datasource,不受任何 env 覆盖影响
  const prisma = new PrismaClient({ datasources: { db: { url: URL_ } } });
  try {
    const existing = new Set((await prisma.cat.findMany({ select: { id: true } })).map((c) => c.id));
    let inserted = 0;
    for (const npc of NPC_CATS) {
      if (existing.has(npc.id)) continue;
      await prisma.cat.create({
        data: {
          id: npc.id, name: npc.name, isNpc: true, role: npc.role,
          boldness: npc.boldness, sociability: npc.sociability, diligence: npc.diligence,
          personaTags: npc.personaTags, appearance: npc.appearance, bio: npc.bio,
          createdAt: new Date(), state: { create: {} },
        },
      });
      inserted++;
    }
    // 世界状态:测试要读 worldState(id:1),空库上会直接 null 崩掉
    await prisma.worldState.upsert({ where: { id: 1 }, update: {}, create: { id: 1, day: 1 } });
    console.log(`NPC 新增 ${inserted} 只(共 ${NPC_CATS.length});worldState 就位`);
  } finally {
    await prisma.$disconnect();
  }
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
