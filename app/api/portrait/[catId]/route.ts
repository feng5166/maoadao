import sharp from "sharp";
import { prisma } from "@/lib/db";

// 立绘一经定稿不再变化 → 长缓存。
// ?s=96|128|256 输出缩略图（webp 保透明底）：小头像别下 768px 全图，
// 每个尺寸是独立 URL，CDN 各自缓存。
// ?c=head 额外把画面聚焦到猫脸：全身立绘直接缩到 24px 会变成看不清的小点。
const THUMB_SIZES = new Set([96, 128, 256]);

/** 找猫脸所在的方形区域。立绘是"全身站姿、纯米白背景"，但朝向和构图每张不同，
 *  前端写死裁切位置会裁到背景或尾巴。脸的判据用列边缘密度：眼睛、胡须、耳廓的
 *  高频细节都集中在头部，光滑的尾巴和身体只有轮廓线，密度差一个量级。
 *  条带取上部 52%——站姿立绘的头必在上半幅。17 只 NPC 立绘实测全部裁到脸。 */
async function headRegion(img: Buffer): Promise<{ left: number; size: number }> {
  const meta = await sharp(img).metadata();
  const w = meta.width ?? 0;
  const h = meta.height ?? 0;
  const stripH = Math.round(h * 0.52);
  const { data, info } = await sharp(img)
    .extract({ left: 0, top: 0, width: w, height: stripH })
    .resize(200, null)
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const W = info.width;
  const H = info.height;
  const colEdge = new Array(W).fill(0);
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const gx = Math.abs(data[y * W + x + 1] - data[y * W + x - 1]);
      const gy = Math.abs(data[(y + 1) * W + x] - data[(y - 1) * W + x]);
      if (gx + gy > 40) colEdge[x]++;
    }
  // 平滑半径 ±10 列（≈图宽 10%），峰值列即脸的水平中心
  const R = 10;
  let peak = 0;
  let peakV = -1;
  for (let x = 0; x < W; x++) {
    let sum = 0;
    let n = 0;
    for (let d = -R; d <= R; d++) {
      const xx = x + d;
      if (xx >= 0 && xx < W) {
        sum += colEdge[xx];
        n++;
      }
    }
    if (sum / n > peakV) {
      peakV = sum / n;
      peak = x;
    }
  }
  const centerX = (peak / W) * w;
  return { left: Math.max(0, Math.min(w - stripH, Math.round(centerX - stripH / 2))), size: stripH };
}

export async function GET(req: Request, ctx: { params: Promise<{ catId: string }> }) {
  const { catId } = await ctx.params;
  const portrait = await prisma.portrait.findUnique({ where: { catId } });
  if (!portrait) return new Response("没有立绘", { status: 404 });

  const url = new URL(req.url);
  const s = Number(url.searchParams.get("s") ?? 0);
  let body: Uint8Array<ArrayBuffer> = new Uint8Array(portrait.data);
  let mime = portrait.mime;
  if (THUMB_SIZES.has(s)) {
    const buf = Buffer.from(portrait.data);
    let img = sharp(buf);
    if (url.searchParams.get("c") === "head") {
      const region = await headRegion(buf);
      img = img.extract({ left: region.left, top: 0, width: region.size, height: region.size });
    }
    body = new Uint8Array(await img.resize(s, s, { fit: "inside" }).webp({ quality: 84 }).toBuffer());
    mime = "image/webp";
  }
  return new Response(body, {
    headers: {
      "Content-Type": mime,
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
