import fs from "node:fs";
import sharp from "sharp";
import { sceneFile, TIME_TINTS, type SceneTime } from "./assets";
import type { CompositionSpec } from "./director";

// 合成器(doc/15):组合谱 → 图。纯 sharp 拼贴,零生成调用。
// 猫走"手账贴纸"路线(白边+微旋转)——绘本手账本来就是拼贴的,回避抠图/alpha 一整类问题。

const W = 1200;
const H = 686;

function tintLayer(time: SceneTime): Buffer | null {
  if (time === "day") return null;
  const grad = TIME_TINTS[time];
  return Buffer.from(
    `<svg width="${W}" height="${H}"><defs>${grad}</defs><rect width="${W}" height="${H}" fill="url(#g)"/></svg>`,
  );
}

/** 姿势图 → 手账贴纸:白边、圆角、微旋转、软阴影(nearly flat,不违反"无阴影"——纸片本身的厚度) */
async function makeSticker(pose: Buffer, rotateDeg: number, size = 340): Promise<Buffer> {
  const inner = await sharp(pose)
    .resize(size - 28, size - 28, { fit: "cover" })
    .toBuffer();
  const bordered = await sharp({
    create: { width: size, height: size, channels: 4, background: "#fffdf6" },
  })
    .composite([{ input: inner, left: 14, top: 14 }])
    .png()
    .toBuffer();
  return sharp(bordered)
    .rotate(rotateDeg, { background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
}

/** 组合谱 + 姿势图字节 → 成图(jpg)。姿势缺失时可传 null,输出纯场景(时段) */
export async function composeMoment(spec: CompositionSpec, poseImage: Buffer | null): Promise<Buffer> {
  const { file, needsTint } = sceneFile(spec.scene, spec.time);
  if (!fs.existsSync(file)) throw new Error(`场景资产缺失: ${spec.scene}`);

  const layers: sharp.OverlayOptions[] = [];
  const tint = needsTint ? tintLayer(spec.time) : null;
  if (tint) layers.push({ input: tint });

  if (poseImage) {
    const sticker = await makeSticker(poseImage, spec.rotateDeg);
    const meta = await sharp(sticker).metadata();
    const sw = meta.width ?? 340;
    const sh = meta.height ?? 340;
    layers.push({
      input: sticker,
      left: spec.stickerSide === "left" ? 48 : W - sw - 48,
      top: H - sh - 36,
    });
  }

  return sharp(file).resize(W, H, { fit: "cover" }).composite(layers).jpeg({ quality: 84 }).toBuffer();
}
