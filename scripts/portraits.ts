import "./_env";
// 为还没有立绘的猫批量生成（串行防限流）。
// 用法：npx tsx scripts/portraits.ts [--force] [--npc] [--id=<catId>]
//   --force  已有立绘也重绘（换脸操作：用户领养的猫动之前先拍板，NPC 随便）
//   --npc    只处理 NPC（去水印/统一画风的安全批量入口）
//   --id     只处理这一只（可多次出现）
// API 原图归档到 assets/portraits-raw/（gitignore，母版备份在本机）。
import { prisma } from "../lib/db";
import { generatePortrait } from "../lib/portrait";

const ARCHIVE_DIR = "assets/portraits-raw";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const npcOnly = args.includes("--npc");
  const onlyIds = args.filter((a) => a.startsWith("--id=")).map((a) => a.slice(5));

  const cats = await prisma.cat.findMany({
    where: {
      ...(force ? {} : { portraitUrl: null }),
      ...(npcOnly ? { isNpc: true } : {}),
      ...(onlyIds.length > 0 ? { id: { in: onlyIds } } : {}),
    },
    orderBy: { id: "asc" },
  });
  console.log(`${cats.length} 只猫待生成立绘${force ? "（强制重绘）" : ""}${npcOnly ? "（仅 NPC）" : ""}`);
  let ok = 0;
  for (const cat of cats) {
    process.stdout.write(`${cat.name}（${cat.id}） ... `);
    const success = await generatePortrait(cat.id, { force, archiveDir: ARCHIVE_DIR });
    console.log(success ? "✓" : "✗");
    if (success) ok++;
  }
  console.log(`完成：${ok}/${cats.length}，原图在 ${ARCHIVE_DIR}/`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
