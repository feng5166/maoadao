import { revalidatePath } from "next/cache";
import { advanceOneDay, TickInProgressError } from "@/lib/sim/tick";
import { narrateCommittedDay, narrationGap } from "@/lib/sim/renarrate";
import { enqueueDailyWechat } from "@/lib/wechat/daily";
import { wechatEnabled } from "@/lib/wechat/openclaw";
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
    // 状态由数据推导（有事件无日记/摘要 = 待叙事），Cron 天然成为恢复入口
    const world = await prisma.worldState.findUnique({ where: { id: 1 } });
    const currentDay = world?.day ?? 0;
    const gap = await narrationGap(currentDay);
    if (gap > 0) {
      const r = await narrateCommittedDay(currentDay, { mode: "missing" });
      // 恢复路径同样补排微信消息(enqueue 自带每人每天一条的幂等)
      if (wechatEnabled()) await enqueueDailyWechat(currentDay).catch((e) => console.error("[wechat-enqueue]", e));
      revalidatePath("/");
      return Response.json({ recovered: true, gapBefore: gap, ...r });
    }

    const result = await advanceOneDay({ narrate: true });
    // 叙事完成后排今日微信消息(D2 兑现/事件/缺席),dispatch cron 错峰投递
    if (wechatEnabled()) await enqueueDailyWechat(result.day).catch((e) => console.error("[wechat-enqueue]", e));
    revalidatePath("/");
    return Response.json(result);
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
