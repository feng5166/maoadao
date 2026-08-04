import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { advanceOneDay, TickInProgressError } from "@/lib/sim/tick";
import { sweepMissingPoses } from "@/lib/visual/poses";
import { narrateCommittedDay, narrationGap } from "@/lib/sim/renarrate";
import { enqueueDailyWechat } from "@/lib/wechat/daily";
import { wechatEnabled } from "@/lib/wechat/bridge";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 叙事并行调用 LLM，给足余量

// Vercel Cron 以 GET 调用，并自动带上 Authorization: Bearer ${CRON_SECRET}
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    // 自愈优先：当前天存在"事件已提交但叙事缺失"时，本次只补写、不推进——
    // 状态由数据推导（有事件无日记/摘要 = 待叙事），Cron 天然成为恢复入口。
    // 熔断（doc/14 §四）：第 1 次补叙事(LLM) → 第 2 次直落兜底模板 → 第 3 次记 dead letter 照常推进。
    // 原则：可以暂时没有优质日记，不能因为一篇日记让世界停转。计数挂 TickRun。
    const world = await prisma.worldState.findUnique({ where: { id: 1 } });
    const currentDay = world?.day ?? 0;
    const gap = await narrationGap(currentDay);
    let deadLetter: string | null = null;
    if (gap > 0) {
      const run = await prisma.tickRun.upsert({
        where: { targetDay: currentDay },
        update: { status: "recovering", narrationAttempts: { increment: 1 } },
        create: { targetDay: currentDay, status: "recovering", startedAt: new Date(), narrationAttempts: 1 },
      });
      if (run.narrationAttempts <= 2) {
        const r = await narrateCommittedDay(currentDay, { mode: "missing", fallbackOnly: run.narrationAttempts >= 2 });
        const gapAfter = await narrationGap(currentDay);
        await prisma.tickRun.update({
          where: { targetDay: currentDay },
          data: gapAfter === 0 ? { status: "completed", narrationCompletedAt: new Date() } : {},
        });
        // 恢复路径同样补排微信消息(enqueue 自带每人每天一条的幂等)
        if (wechatEnabled()) await enqueueDailyWechat(currentDay).catch((e) => console.error("[wechat-enqueue]", e));
        revalidatePath("/");
        return Response.json({ recovered: true, gapBefore: gap, fallbackUsed: run.narrationAttempts >= 2, ...r });
      }
      // 第 3 次仍有缺口：dead letter，世界照常推进（缺的日记事后可由 renarrate 补写）
      deadLetter = `第 ${currentDay} 天仍有 ${gap} 只猫叙事缺失，已放行推进`;
      await prisma.tickRun.update({
        where: { targetDay: currentDay },
        data: { status: "dead_letter_advanced", errorSummary: deadLetter },
      });
      console.error("[tick] dead letter:", deadLetter);
    }

    const startedAt = new Date();
    const result = await advanceOneDay({ narrate: true });
    await prisma.tickRun
      .upsert({
        where: { targetDay: result.day },
        update: { status: "completed", simulationCompletedAt: startedAt, narrationCompletedAt: new Date() },
        create: {
          targetDay: result.day,
          status: "completed",
          startedAt,
          simulationCompletedAt: startedAt,
          narrationCompletedAt: new Date(),
          errorSummary: result.narrationFailed > 0 ? `${result.narrationFailed} 只猫叙事失败待自愈` : null,
        },
      })
      .catch(() => {});
    // 叙事完成后排今日微信消息(D2 兑现/事件/缺席),dispatch cron 错峰投递
    if (wechatEnabled()) await enqueueDailyWechat(result.day).catch((e) => console.error("[wechat-enqueue]", e));
    // 姿势集安全网(doc/15):领养链路生成失败/中断的猫,每天补一只(响应后执行,不占推进时间)
    after(() => sweepMissingPoses(1).catch((e) => console.error("[poses-sweep]", e)));
    revalidatePath("/");
    return Response.json({ ...result, ...(deadLetter ? { deadLetter } : {}) });
  } catch (err) {
    if (err instanceof TickInProgressError) {
      return Response.json({ skipped: true, reason: err.message }, { status: 409 });
    }
    // P2028：事务等不到连接——大概率另一次推进的叙事阶段占着池子
    if (typeof err === "object" && err !== null && "code" in err && (err as { code: string }).code === "P2028") {
      return Response.json({ skipped: true, reason: "数据库繁忙（可能有推进正在进行），请稍后重试" }, { status: 409 });
    }
    throw err;
  }
}
