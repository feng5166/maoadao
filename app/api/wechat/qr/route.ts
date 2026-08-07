import { NextRequest } from "next/server";
import QRCode from "qrcode";
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
  // 二维码在服务端渲成 data URI 再下发(2026-08-07 review P1)。
  // 原先把载荷交给 api.qrserver.com 画 —— 那串东西就是这个用户的绑定凭据,
  // 谁先拿到谁先扫谁就绑上了,不该出我们这台机器。qrcode 依赖本来就在(分享卡在用)。
  const qrDataUrl = await QRCode.toDataURL(r.qrImg, { width: 440, margin: 1, color: { dark: "#4a4237", light: "#fffdf6" } }).catch(
    () => null,
  );
  if (!qrDataUrl) return Response.json({ ok: false, error: "qr_render_failed" }, { status: 500 });
  // since:换海螺时轮询要能分辨"新通道建好了"与"旧通道本来就在"(见 qr-status 兜底)
  // qrImg 原文不再下发给前端:前端只需要那张图
  return Response.json({ ok: true, bound: false, qrcode: r.qrcode, qrDataUrl, since: new Date().toISOString() });
}
