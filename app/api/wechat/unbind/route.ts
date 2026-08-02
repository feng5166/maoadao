import { unbindChannel } from "@/lib/wechat/service";
import { verifyBridgeSecret, wechatEnabled } from "@/lib/wechat/bridge";

export const dynamic = "force-dynamic";

// 桥失效回调:连续硬失败判定用户不可达(doc/13 T8 用户级失效治理)
export async function POST(req: Request) {
  if (!wechatEnabled()) return new Response("channel disabled", { status: 503 });
  if (!verifyBridgeSecret(req)) return new Response("Unauthorized", { status: 401 });

  let body: { openId?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("bad json", { status: 400 });
  }
  const openId = String(body.openId ?? "").trim();
  if (!openId) return new Response("missing openId", { status: 400 });
  await unbindChannel(openId);
  return Response.json({ ok: true });
}
