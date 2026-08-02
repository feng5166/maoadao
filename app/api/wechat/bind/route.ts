import { bindChannel } from "@/lib/wechat/service";
import { verifyBridgeSecret, wechatEnabled } from "@/lib/wechat/bridge";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// 桥激活回调(iLink:用户扫码后发出第一条消息 = 激活):
// body { userId, openId, text }——text 就是"对它说的第一句话",同时落为留言。
// 返回 replyText = 人格化握手(桥零台词,doc/11 哑管道)。
export async function POST(req: Request) {
  if (!wechatEnabled()) return new Response("channel disabled", { status: 503 });
  if (!verifyBridgeSecret(req)) return new Response("Unauthorized", { status: 401 });

  let body: { userId?: string; openId?: string; text?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const userId = String(body.userId ?? "").trim();
  const openId = String(body.openId ?? "").trim();
  if (!userId || !openId) return new Response("missing params", { status: 400 });

  const { replyText } = await bindChannel(userId, openId, String(body.text ?? ""));
  return Response.json({ ok: true, replyText });
}
