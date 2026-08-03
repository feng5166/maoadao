import { prisma } from "@/lib/db";
import { beijingHour } from "@/lib/moments";
import { direct } from "@/lib/visual/director";
import { composeMoment } from "@/lib/visual/compose";

// 此刻的画面(doc/15 图片导演系统):导演定谱 + 素材拼贴,零生成调用。
// 谱是确定性的(同猫同天同时段同谱),?v= 由页面按 天-时段桶 拼——CDN 按桶缓存。

export async function GET(_req: Request, ctx: { params: Promise<{ catId: string }> }) {
  const { catId } = await ctx.params;
  const [world, state] = await Promise.all([
    prisma.worldState.findUnique({ where: { id: 1 } }),
    prisma.catState.findUnique({ where: { catId } }),
  ]);
  if (!state) return new Response("还不认识这只猫", { status: 404 });

  const spec = direct({
    catId,
    day: world?.day ?? 0,
    location: state.location ?? undefined,
    hour: beijingHour(),
    mood: state.mood ?? undefined,
  });
  const poseRow = await prisma.catPose.findUnique({ where: { catId_pose: { catId, pose: spec.pose } } });

  try {
    const img = await composeMoment(spec, poseRow ? Buffer.from(poseRow.data) : null);
    return new Response(new Uint8Array(img), {
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600",
      },
    });
  } catch (err) {
    console.error("[moment] 合成失败:", err instanceof Error ? err.message : err);
    return new Response("合成失败", { status: 500 });
  }
}
