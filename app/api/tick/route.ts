import { revalidatePath } from "next/cache";
import { advanceOneDay, TickInProgressError } from "@/lib/sim/tick";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 叙事并行调用 LLM，给足余量

// Vercel Cron 以 GET 调用，并自动带上 Authorization: Bearer ${CRON_SECRET}
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const result = await advanceOneDay({ narrate: true });
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
