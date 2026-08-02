import { dispatchOutbound } from "@/lib/wechat/daily";
import { wechatEnabled } from "@/lib/wechat/openclaw";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 出站信箱投递 cron(doc/13 T6):每 5 分钟发一批到期消息,天然错峰。
// Vercel Cron 以 GET 调用,自动带 Authorization: Bearer ${CRON_SECRET}
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!wechatEnabled()) return Response.json({ skipped: true, reason: "channel disabled" });
  const result = await dispatchOutbound();
  return Response.json(result);
}
