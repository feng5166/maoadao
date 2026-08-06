import { NextRequest } from "next/server";
import { getViewerId } from "@/lib/identity";
import { getBoundChannel } from "@/lib/wechat/service";
import { startBind, wechatEnabled } from "@/lib/wechat/bridge";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 登录岛民点「让它找到我」:已连上返回 bound;否则向桥申请专属绑定二维码(归属本用户)。
// ?again=1 换海螺:已连上也照发新码——不先断旧的,bindChannel 落新通道时自会顶掉
// (一人一微信、一微信一人)。中途放弃 = 旧海螺原样还在,不会把人晾成失联。
export async function GET(req: NextRequest) {
  if (!wechatEnabled()) return Response.json({ ok: false, error: "channel_disabled" }, { status: 503 });
  const viewerId = await getViewerId();
  if (!viewerId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const cat = await prisma.cat.findFirst({ where: { ownerId: viewerId }, select: { id: true } });
  if (!cat) return Response.json({ ok: false, error: "no_cat" }, { status: 400 });

  const again = req.nextUrl.searchParams.get("again") === "1";
  if (!again && (await getBoundChannel(viewerId))) return Response.json({ ok: true, bound: true });

  const r = await startBind(viewerId);
  if (!r) return Response.json({ ok: false, error: "bridge_unavailable" }, { status: 502 });
  // since:换海螺时轮询要能分辨"新通道建好了"与"旧通道本来就在"(见 qr-status 兜底)
  return Response.json({ ok: true, bound: false, qrcode: r.qrcode, qrImg: r.qrImg, since: new Date().toISOString() });
}
