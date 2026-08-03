import fs from "node:fs";
import sharp from "sharp";
import { SCENE_CAT_ANCHOR, SCENE_CAT_SCALE, sceneFile, TIME_TINTS, type SceneTime } from "./assets";
import type { CompositionSpec } from "./director";

// 合成器(doc/15):组合谱 → 图。纯 sharp 拼贴,零生成调用。
// 猫走"抠图入画"路线(2026-08-04 拍板:白框贴纸出戏):泛洪去底 + 场景比例
// + 前景锚点 + 时段光照匹配 + 接地影——猫要真的坐在场景里。

const W = 1200;
const H = 686;

function tintLayer(time: SceneTime): Buffer | null {
  if (time === "day") return null;
  const grad = TIME_TINTS[time];
  return Buffer.from(
    `<svg width="${W}" height="${H}"><defs>${grad}</defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`,
  );
}

/** 姿势图去底(2026-08-04 拍板:猫要坐进场景,不要白框贴纸):
 *  立绘是纯米白平涂背景+粗描边——从四边泛洪填充清掉背景,深色描边天然拦住
 *  猫身上的浅色毛;蒙版轻羽化防浅色毛边。
 *  白猫(毛色≈米白)靠双保险:泛洪不许穿过"梯度屏障"(描边/明暗变化处),
 *  抠完做漏检(保留面积过小=泛洪漏进猫身)——漏了收紧参数重来,再漏就抛错,
 *  上层回落纯场景(宁可没有猫,不要幽灵猫)。 */
async function makeCutout(pose: Buffer, size = 400): Promise<Buffer> {
  const { data, info } = await sharp(pose)
    .resize(size, size, { fit: "cover" })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const px = (x: number, y: number) => (y * width + x) * channels;

  // 背景参考色 = 四角均值(米白,但生成会有漂移,别写死)
  const corners = [px(2, 2), px(width - 3, 2), px(2, height - 3), px(width - 3, height - 3)];
  const bg = [0, 1, 2].map((c) => corners.reduce((s, o) => s + data[o + c], 0) / 4);
  const bgDist = (o: number) =>
    Math.abs(data[o] - bg[0]) + Math.abs(data[o + 1] - bg[1]) + Math.abs(data[o + 2] - bg[2]);

  // 梯度图:与右/下邻居的三通道差之和的较大者——描边和明暗交界处梯度高
  const grad = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const o = px(x, y);
      let g = 0;
      if (x < width - 1) {
        const r = o + channels;
        g = Math.abs(data[o] - data[r]) + Math.abs(data[o + 1] - data[r + 1]) + Math.abs(data[o + 2] - data[r + 2]);
      }
      if (y < height - 1) {
        const d = o + width * channels;
        const gd = Math.abs(data[o] - data[d]) + Math.abs(data[o + 1] - data[d + 1]) + Math.abs(data[o + 2] - data[d + 2]);
        if (gd > g) g = gd;
      }
      grad[y * width + x] = Math.min(255, g);
    }
  }

  // 泛洪(参数化):bgTol=判背景的颜色距离;gradCap=屏障(梯度高于此不许进)
  const flood = (bgTol: number, gradCap: number): Uint8Array => {
    const isBg = (i: number) => bgDist(i * channels) < bgTol && grad[i] < gradCap;
    const mask = new Uint8Array(width * height).fill(255); // 255=保留
    const queue: number[] = [];
    for (let x = 0; x < width; x++) queue.push(x, x + (height - 1) * width);
    for (let y = 0; y < height; y++) queue.push(y * width, y * width + width - 1);
    for (const i of queue) if (isBg(i)) mask[i] = 0;
    while (queue.length > 0) {
      const i = queue.pop()!;
      if (mask[i] !== 0) continue;
      const x = i % width;
      const y = (i / width) | 0;
      for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as const) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const ni = ny * width + nx;
        if (mask[ni] === 255 && isBg(ni)) {
          mask[ni] = 0;
          queue.push(ni);
        }
      }
    }
    return mask;
  };

  // 参数阶梯:先宽松(普通猫最干净),漏了逐级收紧;保留面积 <18% 判漏(幽灵猫≈只剩描边)
  let mask: Uint8Array | null = null;
  for (const [bgTol, gradCap] of [[90, 46], [55, 28], [36, 18]] as const) {
    const m = flood(bgTol, gradCap);
    let kept = 0;
    for (let i = 0; i < m.length; i++) if (m[i] === 255) kept++;
    if (kept / m.length >= 0.18) {
      mask = m;
      break;
    }
  }
  if (!mask) throw new Error("抠图漏进猫身(白猫轮廓缺口),放弃该姿势");

  // 先 1px 收缩(紧贴 bg 的保留像素多半是混了米白的过渡边,吃掉它)再羽化——消浅色毛边
  const eroded = new Uint8Array(mask);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (mask[i] !== 255) continue;
      if (
        (x > 0 && mask[i - 1] === 0) || (x < width - 1 && mask[i + 1] === 0) ||
        (y > 0 && mask[i - width] === 0) || (y < height - 1 && mask[i + width] === 0)
      ) {
        eroded[i] = 90;
      }
    }
  }
  mask.set(eroded);

  // 蒙版轻羽化(1px 高斯)消浅色毛边——注意 blur 输出可能升通道,按实际步长取
  const { data: fdata, info: finfo } = await sharp(Buffer.from(mask), { raw: { width, height, channels: 1 } })
    .blur(0.8)
    .raw()
    .toBuffer({ resolveWithObject: true });
  const stride = finfo.channels;

  // 装回 alpha,同时手算内容包围盒(不用 sharp.trim,它按角像素判底,对透明图不可靠)
  const rgba = Buffer.alloc(width * height * 4);
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let i = 0; i < width * height; i++) {
    const a = fdata[i * stride];
    rgba[i * 4] = data[i * channels];
    rgba[i * 4 + 1] = data[i * channels + 1];
    rgba[i * 4 + 2] = data[i * channels + 2];
    rgba[i * 4 + 3] = a;
    if (a > 8) {
      const x = i % width;
      const y = (i / width) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) throw new Error("抠图后没有内容(泛洪把整张吃掉了?)");
  return sharp(rgba, { raw: { width, height, channels: 4 } })
    .extract({ left: minX, top: minY, width: maxX - minX + 1, height: maxY - minY + 1 })
    .png()
    .toBuffer();
}

/** 接地影:猫脚下一枚很淡的椭圆,让它"站在地上"而不是浮着(画面内的绘画语言,不是 UI 阴影)。
 *  径向渐变自带软边,不依赖 SVG filter(librsvg 的 filter 支持不稳) */
function groundShadow(w: number): Buffer {
  const h = Math.max(24, Math.round(w * 0.16));
  return Buffer.from(
    `<svg width="${w}" height="${h}"><defs><radialGradient id="g"><stop offset="0" stop-color="rgba(50,42,34,0.26)"/><stop offset="0.7" stop-color="rgba(50,42,34,0.12)"/><stop offset="1" stop-color="rgba(50,42,34,0)"/></radialGradient></defs><ellipse cx="${w / 2}" cy="${h / 2}" rx="${w * 0.46}" ry="${h * 0.42}" fill="url(#g)"/></svg>`,
  );
}

/** 时段对猫的光照校正:场景变体的光已经变了,猫也得跟着变,否则夜里一只"发亮"的猫 */
async function lightMatch(cutout: Buffer, time: SceneTime): Promise<Buffer> {
  if (time === "night") return sharp(cutout).modulate({ brightness: 0.72, saturation: 0.8 }).png().toBuffer();
  if (time === "dusk") return sharp(cutout).modulate({ brightness: 0.94, saturation: 1.05 }).png().toBuffer();
  if (time === "morning") return sharp(cutout).modulate({ brightness: 0.98, saturation: 0.92 }).png().toBuffer();
  return cutout;
}

/** 组合谱 + 姿势图字节 → 成图(jpg)。姿势缺失时可传 null,输出纯场景(时段)。
 *  opts.scaleOverride:比例调试/特殊镜头用,常规路径走 SCENE_CAT_SCALE 表 */
export async function composeMoment(
  spec: CompositionSpec,
  poseImage: Buffer | null,
  opts?: { scaleOverride?: number },
): Promise<Buffer> {
  const { file, needsTint } = sceneFile(spec.scene, spec.time);
  if (!fs.existsSync(file)) throw new Error(`场景资产缺失: ${spec.scene}`);

  const layers: sharp.OverlayOptions[] = [];

  if (poseImage) {
    // 比例关系:按场景景别缩放(远景猫小、室内猫大),再做时段光照匹配。
    // 抠图放弃(白猫漏检三连败)→ 回落纯场景:宁可这一张没有猫,不要幽灵猫
    let raw: Buffer | null = null;
    try {
      raw = await makeCutout(poseImage);
    } catch (err) {
      console.error("[compose] 抠图回落纯场景:", err instanceof Error ? err.message : err);
    }
    if (!raw) {
      const tintOnly = needsTint ? tintLayer(spec.time) : null;
      return sharp(file).resize(W, H, { fit: "cover" }).composite(tintOnly ? [{ input: tintOnly }] : []).jpeg({ quality: 84 }).toBuffer();
    }
    const targetH = Math.round(H * (opts?.scaleOverride ?? SCENE_CAT_SCALE[spec.scene] ?? 0.34));
    const scaled = await sharp(raw).resize({ height: targetH }).png().toBuffer();
    const cutout = await lightMatch(scaled, spec.time);
    const meta = await sharp(cutout).metadata();
    const cw = meta.width ?? targetH;
    const ch = meta.height ?? targetH;
    const side = SCENE_CAT_ANCHOR[spec.scene] ?? spec.stickerSide;
    const left =
      side === "center" ? Math.round((W - cw) / 2) : side === "left" ? Math.round(W * 0.12) : W - cw - Math.round(W * 0.12);
    const top = H - ch - Math.round(H * 0.06);
    // 接地影在猫下面
    layers.push({ input: groundShadow(cw), left, top: top + ch - Math.round(cw * 0.08) });
    layers.push({ input: cutout, left, top });
  }

  // 色调层最后盖(仅无时段变体时):同时罩住场景和猫,光照自然一致
  const tint = needsTint ? tintLayer(spec.time) : null;
  if (tint) layers.push({ input: tint });

  return sharp(file).resize(W, H, { fit: "cover" }).composite(layers).jpeg({ quality: 84 }).toBuffer();
}
