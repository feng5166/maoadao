import { prisma } from "@/lib/db";
import { beijingHour, currentSegment } from "@/lib/moments";
import { direct } from "@/lib/visual/director";
import { composeMoment } from "@/lib/visual/compose";
import { SCENE_CAT_SCALE } from "@/lib/visual/assets";

// 首屏主体性(我的猫 P0):世界是背景,我的猫是主体——远景场景(灯塔/码头 0.14-0.17)
// 在这里抬到画高 20%,手机上不用找猫。只影响此路由,资产表的景别比例不动。
const HERO_MIN_SCALE = 0.2;

// 此刻的画面(doc/15 图片导演系统):导演定谱 + 素材拼贴,零生成调用。
// 谱是确定性的(同猫同天同时段同谱),?v= 由页面按 天-时段桶 拼——CDN 按桶缓存。

export async function GET(_req: Request, ctx: { params: Promise<{ catId: string }> }) {
  const { catId } = await ctx.params;
  const hour = beijingHour();
  const [world, state] = await Promise.all([
    prisma.worldState.findUnique({ where: { id: 1 } }),
    prisma.catState.findUnique({ where: { catId } }),
  ]);
  if (!state) return new Response("还不认识这只猫", { status: 404 });

  // 地点与页面"此刻"同源:当前时段的主事件在哪,画面就在哪(状态地点只作退路)——
  // 否则正文说"蹲在礁石边"、图却画灯塔坡,穿帮
  const seg = currentSegment(hour);
  const nowEvent = seg
    ? await prisma.event.findFirst({
        where: { catId, day: world?.day ?? 0, segment: seg },
        orderBy: { isMain: "desc" },
        select: { data: true },
      })
    : null;
  const location = String((nowEvent?.data as Record<string, unknown> | null)?.location ?? state.location ?? "");

  const spec = direct({
    catId,
    day: world?.day ?? 0,
    location: location || undefined,
    hour,
    mood: state.mood ?? undefined,
  });
  const poseRow = await prisma.catPose.findUnique({ where: { catId_pose: { catId, pose: spec.pose } } });

  try {
    const img = await composeMoment(spec, poseRow ? Buffer.from(poseRow.data) : null, {
      scaleOverride: Math.max(SCENE_CAT_SCALE[spec.scene] ?? 0.34, HERO_MIN_SCALE),
    });
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
