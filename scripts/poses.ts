import "./_env";
// L1 姿势集手动批产(doc/15):核心逻辑在 lib/visual/poses.ts(领养链路和 tick 安全网同源)。
// 新猫不需要跑这个——领养时自动生成;这个脚本用于存量补产/强制重绘。
// 用法:npx tsx scripts/poses.ts --cat=<catId>[,<catId>] | --all-users [--force]
import { PrismaClient } from "@prisma/client";
import { generateCatPoses } from "../lib/visual/poses";
import { POSES } from "../lib/visual/assets";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const prisma = new PrismaClient();

  let catIds = args.find((a) => a.startsWith("--cat="))?.slice(6).split(",") ?? [];
  if (args.includes("--all-users")) {
    const cats = await prisma.cat.findMany({ where: { isNpc: false, ownerId: { not: null } }, select: { id: true } });
    catIds = cats.map((c) => c.id);
  }
  if (catIds.length === 0) {
    console.log("用法: --cat=<catId> 或 --all-users");
    process.exit(1);
  }

  for (const catId of catIds) {
    const cat = await prisma.cat.findUnique({ where: { id: catId }, select: { name: true } });
    process.stdout.write(`${cat?.name ?? catId} ... `);
    const done = await generateCatPoses(catId, force);
    console.log(`${done}/${POSES.length}`);
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
