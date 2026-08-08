import { prisma } from "@/lib/db";
import { getViewerId } from "@/lib/identity";
import { yardGameplayEnabled } from "@/lib/yard/flags";
import { getYardView } from "@/lib/yard/view";
import { renderYardScene } from "@/lib/yard/scene-render";

// Yard 场景图（Renderer 第一刀，11 §12.9 范围：Base+锚点+Cat+Trace）。
// 画什么 = PresentationModel 语义节点（事实回溯 CI）；本路由只做资产装配。
// ?v= 由页面按 dayKey-windowIndex 拼——同窗语义稳定，浏览器按桶缓存。

export const dynamic = "force-dynamic";

/** 行为词面 → 姿势（表现映射，VisualConfig 域；缺姿势回落 sit，再缺回落无猫） */
const poseFor = (behavior: string): string => (/睡|盹|趴|窝|蜷/.test(behavior) ? "sleep" : "sit");

export async function GET() {
  const uid = await getViewerId();
  const user = uid ? await prisma.user.findUnique({ where: { id: uid }, select: { yardAccess: true } }) : null;
  if (!uid || !yardGameplayEnabled(user)) return new Response("这条小路还没有开放", { status: 404 });
  const view = await getYardView(uid);
  if (!view) return new Response("还没有院子", { status: 404 });

  try {
    const img = await renderYardScene(view, {
      poseOf: async (catId, behavior) => {
        const want = poseFor(behavior);
        let row = await prisma.catPose.findUnique({ where: { catId_pose: { catId, pose: want } } });
        if (!row && want !== "sit") row = await prisma.catPose.findUnique({ where: { catId_pose: { catId, pose: "sit" } } });
        return row ? Buffer.from(row.data) : null;
      },
    });
    return new Response(new Uint8Array(img), {
      headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=120" },
    });
  } catch (err) {
    console.error("[yard-scene] 合成失败:", err instanceof Error ? err.message : err);
    return new Response("合成失败", { status: 500 });
  }
}
