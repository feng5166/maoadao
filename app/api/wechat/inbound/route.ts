import { handleInbound } from "@/lib/wechat/service";
import { verifyBridgeSecret, wechatEnabled } from "@/lib/wechat/bridge";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 桥入站回调(doc/13 T2,iLink 版):body { from: openId, text }。
// 桥全量转发、零台词;这里只做留言/退订分流,回复文案(replyText)由桥带 typing 送达。
// 红线:入站永不进 LLM。
export async function POST(req: Request) {
  if (!wechatEnabled()) return new Response("channel disabled", { status: 503 });
  if (!verifyBridgeSecret(req)) return new Response("Unauthorized", { status: 401 });

  let body: { from?: string; text?: string; media?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const from = String(body.from ?? "").trim();
  if (!from) return new Response("missing from", { status: 400 });

  // media:桥侧标注的媒体类型(image|voice|video|file)——猫只看得懂字,回旁白体轻响应
  const media = typeof body.media === "string" && /^(image|voice|video|file)$/.test(body.media) ? body.media : null;
  const result = await handleInbound(from, String(body.text ?? ""), media);
  return Response.json({ ok: true, matched: result.matched, replyText: result.replyText });
}
