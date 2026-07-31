import "./_env";
// 为还没有立绘的猫批量生成（串行防限流）。用法：npx tsx scripts/portraits.ts
import { prisma } from "../lib/db";
import { generatePortrait } from "../lib/portrait";

async function main() {
  const force = process.argv.includes("--force");
  const cats = await prisma.cat.findMany({ where: force ? {} : { portraitUrl: null } });
  console.log(`${cats.length} 只猫待生成立绘${force ? "（统一画风强制重绘）" : ""}`);
  let ok = 0;
  for (const cat of cats) {
    process.stdout.write(`${cat.name} ... `);
    const success = await generatePortrait(cat.id, { force });
    console.log(success ? "✓" : "✗");
    if (success) ok++;
  }
  console.log(`完成：${ok}/${cats.length}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
