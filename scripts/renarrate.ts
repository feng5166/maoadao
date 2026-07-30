import "./_env";
// 叙事补写：npx tsx scripts/renarrate.ts <day> [--force]
import { prisma } from "../lib/db";
import { renarrateDay } from "../lib/sim/renarrate";

async function main() {
  const day = Number(process.argv[2]);
  if (!Number.isInteger(day)) {
    console.error("用法：npx tsx scripts/renarrate.ts <day> [--force]");
    process.exit(1);
  }
  const result = await renarrateDay(day, { onlyMissing: !process.argv.includes("--force") });
  console.log(`第 ${result.day} 天：补写 ${result.regenerated} 篇`);
  await prisma.$disconnect();
}
main().catch((err) => {
  console.error(err);
  process.exit(1);
});
