import { NextRequest } from "next/server";
import { getViewerId } from "@/lib/identity";
import { getBoundChannel } from "@/lib/wechat/service";
import { pollBind, wechatEnabled } from "@/lib/wechat/bridge";

export const dynamic = "force-dynamic";

// 前端轮询绑定状态:pending(待扫码)→ scanned(扫到了,等它收到你的第一句话)→ activated(它找到你了)
export async function GET(req: NextRequest) {
  if (!wechatEnabled()) return Response.json({ ok: false, error: "channel_disabled" }, { status: 503 });
  const viewerId = await getViewerId();
  if (!viewerId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const qrcode = req.nextUrl.searchParams.get("qrcode");
  if (!qrcode) return Response.json({ ok: false, error: "missing_qrcode" }, { status: 400 });

  const r = await pollBind(qrcode);
  // 激活兜底:桥回调若没打通,这里发现通道已建也算 activated
  if (r.state !== "activated" && (await getBoundChannel(viewerId))) {
    return Response.json({ ok: true, state: "activated" });
  }
  return Response.json({ ok: true, state: r.state });
}
