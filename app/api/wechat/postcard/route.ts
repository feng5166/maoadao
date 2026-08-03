import { sendDailyPostcard } from "@/lib/wechat/postcard";
import { wechatEnabled } from "@/lib/wechat/bridge";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 海螺每日精选 cron(20:00 北京时间):把"今天岛上的一幕"寄进微信。
// Vercel Cron 以 GET 调用,自动带 Authorization: Bearer ${CRON_SECRET};
// ?dry=1 只报告选稿与收件人,不真发(人工验收用)。
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!wechatEnabled()) return Response.json({ skipped: true, reason: "channel disabled" });
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  const result = await sendDailyPostcard({ dryRun });
  return Response.json(result);
}
