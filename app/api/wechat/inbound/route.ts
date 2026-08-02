import { handleInbound } from "@/lib/wechat/service";
import { sendWechat, verifyWebhookSecret, wechatEnabled } from "@/lib/wechat/openclaw";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// openclaw 入站 webhook(doc/13 T2):body { from: wxid, text: 消息文本 }。
// 哑管道:这里只做配对/留言/退订分流,回复全部是确定性文案——入站永不进 LLM。
export async function POST(req: Request) {
  if (!wechatEnabled()) return new Response("channel disabled", { status: 503 });
  if (!verifyWebhookSecret(req)) return new Response("Unauthorized", { status: 401 });

  let body: { from?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const from = String(body.from ?? "").trim();
  const text = String(body.text ?? "");
  if (!from) return new Response("missing from", { status: 400 });

  const result = await handleInbound(from, text);
  if (result.reply) await sendWechat(from, result.reply);
  return Response.json({ ok: true, matched: result.matched });
}
