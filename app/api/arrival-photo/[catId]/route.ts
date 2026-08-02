import { prisma } from "@/lib/db";

// 相遇照片一经合成不再变化 → 长缓存（与立绘同策略）

export async function GET(_req: Request, ctx: { params: Promise<{ catId: string }> }) {
  const { catId } = await ctx.params;
  const photo = await prisma.arrivalPhoto.findUnique({ where: { catId } });
  if (!photo) return new Response("还没有相遇照片", { status: 404 });

  return new Response(new Uint8Array(photo.data), {
    headers: {
      "Content-Type": photo.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
