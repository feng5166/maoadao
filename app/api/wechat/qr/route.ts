import { getViewerId } from "@/lib/identity";
import { getBoundChannel } from "@/lib/wechat/service";
import { startBind, wechatEnabled } from "@/lib/wechat/bridge";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 登录岛民点「让它找到我」:已连上返回 bound;否则向桥申请专属绑定二维码(归属本用户)
export async function GET() {
  if (!wechatEnabled()) return Response.json({ ok: false, error: "channel_disabled" }, { status: 503 });
  const viewerId = await getViewerId();
  if (!viewerId) return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  const cat = await prisma.cat.findFirst({ where: { ownerId: viewerId }, select: { id: true } });
  if (!cat) return Response.json({ ok: false, error: "no_cat" }, { status: 400 });

  if (await getBoundChannel(viewerId)) return Response.json({ ok: true, bound: true });

  const r = await startBind(viewerId);
  if (!r) return Response.json({ ok: false, error: "bridge_unavailable" }, { status: 502 });
  return Response.json({ ok: true, bound: false, qrcode: r.qrcode, qrImg: r.qrImg });
}
