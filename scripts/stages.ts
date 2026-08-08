import "./_env";
import { prisma } from "../lib/db";
import { SIGNALS_VERSION, deriveReached, persistStageSignals } from "../lib/yard/signals";

// 观测台 v0（doc2.0/20 §五 漏斗用法）：全量重算 StageSignal 快照并打分层漏斗。
// 用法：npx tsx scripts/stages.ts
// 定义修订（SIGNALS_VERSION bump）后重跑本脚本 = 全量回溯重算（离线可重放）。

async function main() {
  const homes = await prisma.home.findMany({ select: { userId: true } });
  console.log(`岛民 ${homes.length} 人 · 组合逻辑 ${SIGNALS_VERSION}`);

  const funnel: Record<string, number> = { D1: 0, D2: 0, D3: 0, D4: 0, D5: 0 };
  const orderNotes: string[] = [];
  for (const { userId } of homes) {
    const signals = await persistStageSignals(userId);
    const reached = deriveReached(signals);
    for (const stage of Object.keys(funnel)) if (reached[stage as keyof typeof reached]) funnel[stage]++;
    // 乱序诊断（20 §五：不入判决,只看路径）
    const has = new Set(signals.map((s) => s.signal));
    if (has.has("first_autonomous_sink") && !has.has("observed_multiple_outcomes")) {
      orderNotes.push(`${userId}: D4 证据先于 D2`);
    }
  }

  console.log("Reached 漏斗:", funnel);
  if (orderNotes.length > 0) console.log("乱序样本:", orderNotes.slice(0, 20));
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
