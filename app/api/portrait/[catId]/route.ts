import sharp from "sharp";
import { prisma } from "@/lib/db";

// 立绘一经定稿不再变化 → 长缓存。
// ?s=96|128|256 输出缩略图（webp 保透明底）：小头像别下 768px 全图，
// 每个尺寸是独立 URL，CDN 各自缓存。
const THUMB_SIZES = new Set([96, 128, 256]);

export async function GET(req: Request, ctx: { params: Promise<{ catId: string }> }) {
  const { catId } = await ctx.params;
  const portrait = await prisma.portrait.findUnique({ where: { catId } });
  if (!portrait) return new Response("没有立绘", { status: 404 });

  const s = Number(new URL(req.url).searchParams.get("s") ?? 0);
  let body: Uint8Array<ArrayBuffer> = new Uint8Array(portrait.data);
  let mime = portrait.mime;
  if (THUMB_SIZES.has(s)) {
    body = new Uint8Array(
      await sharp(Buffer.from(portrait.data)).resize(s, s, { fit: "inside" }).webp({ quality: 84 }).toBuffer(),
    );
    mime = "image/webp";
  }
  return new Response(body, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
