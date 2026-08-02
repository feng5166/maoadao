import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { prisma } from "@/lib/db";
import { safeTrack } from "@/lib/wechat/service";

export const dynamic = "force-dynamic";

// 短链跳转:只跳站内相对路径(建链时已校验,这里再守一道);过期/未知回首页。
// 点击计数喂"点击回流率"指标(doc/11 §九)。
export async function GET(_req: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const link = await prisma.shortLink.findUnique({ where: { code } });
  if (!link || !link.target.startsWith("/") || (link.expiresAt && link.expiresAt < new Date())) {
    redirect("/");
  }
  after(async () => {
    await prisma.shortLink.update({ where: { code }, data: { hits: { increment: 1 } } }).catch(() => {});
    await safeTrack("wechat_msg_click", {});
  });
  redirect(link.target);
}
