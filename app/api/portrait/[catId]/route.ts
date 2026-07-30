import { prisma } from "@/lib/db";

// 立绘一经定稿不再变化 → 长缓存
export async function GET(_req: Request, ctx: { params: Promise<{ catId: string }> }) {
  const { catId } = await ctx.params;
  const portrait = await prisma.portrait.findUnique({ where: { catId } });
  if (!portrait) return new Response("没有立绘", { status: 404 });
  return new Response(new Uint8Array(portrait.data), {
    headers: {
      "Content-Type": portrait.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
