import { sendGoodnight } from "@/lib/wechat/goodnight";
import { wechatEnabled } from "@/lib/wechat/bridge";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

// 晚安 cron(21:00 北京时间):猫睡前跟主人道一声晚安,每隔几天随一张"今天岛上的一幕"。
// ?dry=1 只报告文案不真发(人工验收用)。
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!wechatEnabled()) return Response.json({ skipped: true, reason: "channel disabled" });
  const dryRun = new URL(req.url).searchParams.get("dry") === "1";
  const result = await sendGoodnight({ dryRun });
  return Response.json(result);
}
