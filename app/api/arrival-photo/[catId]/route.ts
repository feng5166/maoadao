import sharp from "sharp";
import { prisma } from "@/lib/db";

// 相遇照片一经合成不再变化 → 长缓存（与立绘同策略）。
// ?s=480|720 输出等比缩略（webp）：移动端别拉 1000px 全图，每尺寸独立 URL 各自吃 CDN 缓存。
const THUMB_WIDTHS = new Set([480, 720]);

export async function GET(req: Request, ctx: { params: Promise<{ catId: string }> }) {
  const { catId } = await ctx.params;
  const photo = await prisma.arrivalPhoto.findUnique({ where: { catId } });
  if (!photo) return new Response("还没有相遇照片", { status: 404 });

  const s = Number(new URL(req.url).searchParams.get("s") ?? 0);
  let body: Uint8Array<ArrayBuffer> = new Uint8Array(photo.data);
  let mime = photo.mime;
  if (THUMB_WIDTHS.has(s)) {
    body = new Uint8Array(
      await sharp(Buffer.from(photo.data)).resize(s, null, { fit: "inside" }).webp({ quality: 84 }).toBuffer(),
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
