import { prisma } from "../lib/db";
import { advanceOneDay } from "../lib/sim/tick";

// 用法：npm run tick            推进一天并生成日记
//       npm run tick -- --dry   只跑模拟不叫 LLM（省钱调试用）
const narrate = !process.argv.includes("--dry");

async function main() {
  const result = await advanceOneDay({ narrate });
  console.log(`第 ${result.day} 天（${result.weather}）：${result.eventCount} 条事实，${result.diaryCount} 篇日记。\n`);

  const diaries = await prisma.diaryEntry.findMany({ where: { day: result.day } });
  for (const d of diaries) {
    const cat = await prisma.cat.findUnique({ where: { id: d.catId } });
    console.log(`【${cat?.name}】(${d.mood}${d.generatedBy === "fallback" ? "，兜底" : ""})\n${d.content}\n`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
