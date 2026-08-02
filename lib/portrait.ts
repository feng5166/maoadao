import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "./db";

// 定稿立绘：创建时生成一次，之后所有页面和分享卡复用——绝不每天重生成（定义·十三）。

// 统一画风（v0.7 去 AI 化）：目标不是每张惊艳，而是 17 只放一起像同一本绘本。
// 固定构图/视角/光线/描边/色数/背景，去掉摄影感与环境渲染，保留手绘瑕疵。
const STYLE =
  "手绘绘本风格角色设计。严格遵守：全身站姿，正面微侧45度，平视视角；" +
  "均匀柔和的平光，无投影无高光渲染；粗细一致的深棕色手绘轮廓线；" +
  "整只猫最多使用6种颜色，色彩中低饱和；纯米白色背景（#FAF6EE），无任何环境和道具；" +
  "扁平上色带轻微水彩纸纹理和铅笔瑕疵感；不要写实毛发细节，不要摄影感，不要3D渲染，无文字无水印";

function buildPrompt(cat: { name: string; appearance: string; personaTags: string[] }): string {
  const persona = cat.personaTags.slice(0, 3).join("、");
  return `一只猫的角色立绘：${cat.appearance}。性格${persona}，用站姿和表情体现性格。${STYLE}`;
}

/** 生成立绘并入库；幂等（已有立绘直接返回）。耗时 10~30 秒。 */
export async function generatePortrait(catId: string, options: { force?: boolean } = {}): Promise<boolean> {
  const cat = await prisma.cat.findUnique({ where: { id: catId } });
  if (!cat) return false;
  if (cat.portraitUrl && !options.force) return true;

  const base = process.env.IMAGE_API_BASE ?? "https://api.modelverse.cn";
  const key = process.env.IMAGE_API_KEY;
  const model = process.env.PORTRAIT_MODEL ?? "doubao-seedream-4.5";
  if (!key) {
    console.error("[portrait] 缺少 IMAGE_API_KEY，跳过生成");
    return false;
  }

  try {
    const res = await fetch(`${base}/v1/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model, prompt: buildPrompt(cat), size: "2048x2048", n: 1 }),
    });
    if (!res.ok) {
      console.error(`[portrait] 生成失败 ${res.status}:`, (await res.text()).slice(0, 200));
      return false;
    }
    const json = (await res.json()) as { data?: { url?: string; b64_json?: string }[] };
    const item = json.data?.[0];
    let raw: Buffer;
    if (item?.b64_json) {
      raw = Buffer.from(item.b64_json, "base64");
    } else if (item?.url) {
      const imgRes = await fetch(item.url);
      if (!imgRes.ok) return false;
      raw = Buffer.from(await imgRes.arrayBuffer());
    } else {
      console.error("[portrait] 响应里没有图片:", JSON.stringify(json).slice(0, 200));
      return false;
    }

    // 压到 768：页面和分享卡都够用，DB 体积可控（~100KB/张）
    const jpegBuf = await sharp(raw).resize(768, 768, { fit: "cover" }).jpeg({ quality: 82 }).toBuffer();
    const jpeg = new Uint8Array(jpegBuf); // Prisma Bytes 需要 Uint8Array<ArrayBuffer>

    await prisma.portrait.upsert({
      where: { catId },
      update: { data: jpeg, mime: "image/jpeg", createdAt: new Date() },
      create: { catId, data: jpeg, mime: "image/jpeg", createdAt: new Date() },
    });
    await prisma.cat.update({ where: { id: catId }, data: { portraitUrl: `/api/portrait/${catId}` } });
    return true;
  } catch (err) {
    console.error("[portrait] 生成异常:", err instanceof Error ? err.message.slice(0, 200) : err);
    return false;
  }
}

/** 码头场景图：本地文件优先（dev/构建含 public），兜底走线上（serverless 未打包时） */
async function loadDockScene(): Promise<Buffer> {
  try {
    return await readFile(path.join(process.cwd(), "public", "scenes", "dock.jpg"));
  } catch {
    const host = process.env.VERCEL_URL || "maoadao.com";
    const res = await fetch(`https://${host}/scenes/dock.jpg`);
    if (!res.ok) throw new Error(`拉取码头场景失败 ${res.status}`);
    return Buffer.from(await res.arrayBuffer());
  }
}

// 相遇照片（doc/10 §3 Asset 1，合成路线）：码头场景 + 定稿立绘贴纸 → 拍立得。
// 不烙文字进图（serverless 中文字体不可控），说明文字由页面 HTML 承担。
// 一致性 100%：照片里的猫就是立绘那只猫——必须在立绘定稿之后调用。
export async function generateArrivalPhoto(catId: string): Promise<boolean> {
  const cat = await prisma.cat.findUnique({ where: { id: catId } });
  if (!cat || cat.isNpc) return false;
  if (cat.arrivalPhotoUrl) return true;
  const portrait = await prisma.portrait.findUnique({ where: { catId } });
  if (!portrait) {
    console.error("[arrival-photo] 立绘还没定稿，跳过（下次领养流程重试或手动补）");
    return false;
  }

  try {
    // 拍立得画布：1000 宽，上面是照片区（场景 940x537），下面留白边（手写说明的位置感）
    const FRAME_W = 1000;
    const SCENE_W = 940;
    const SCENE_H = 537; // 1200x686 等比
    const MARGIN = 30;
    const FRAME_H = MARGIN + SCENE_H + 120; // 底部 120 留白 = 拍立得下缘

    const scene = await sharp(await loadDockScene()).resize(SCENE_W, SCENE_H, { fit: "cover" }).toBuffer();
    // 立绘贴纸：圆角 + 白描边，像一张贴在照片上的即时贴（米白底立绘直接当"照片中的它"）
    const STICKER = 264;
    const rounded = Buffer.from(
      `<svg width="${STICKER}" height="${STICKER}"><rect x="0" y="0" width="${STICKER}" height="${STICKER}" rx="18" ry="18"/></svg>`,
    );
    const sticker = await sharp(portrait.data)
      .resize(STICKER, STICKER, { fit: "cover" })
      .composite([{ input: rounded, blend: "dest-in" }])
      .png()
      .toBuffer();
    const stickerBorder = Buffer.from(
      `<svg width="${STICKER + 12}" height="${STICKER + 12}"><rect x="0" y="0" width="${STICKER + 12}" height="${STICKER + 12}" rx="22" ry="22" fill="#fffdf6"/></svg>`,
    );

    const photo = await sharp({
      create: { width: FRAME_W, height: FRAME_H, channels: 3, background: "#fffdf6" },
    })
      .composite([
        { input: scene, left: MARGIN, top: MARGIN },
        // 贴纸放场景左下：像它蹲在码头行李堆旁
        { input: stickerBorder, left: MARGIN + 34, top: MARGIN + SCENE_H - STICKER - 40 },
        { input: sticker, left: MARGIN + 40, top: MARGIN + SCENE_H - STICKER - 34 },
      ])
      .jpeg({ quality: 86 })
      .toBuffer();
    const bytes = new Uint8Array(photo);

    await prisma.arrivalPhoto.upsert({
      where: { catId },
      update: { data: bytes, mime: "image/jpeg", createdAt: new Date() },
      create: { catId, data: bytes, mime: "image/jpeg", createdAt: new Date() },
    });
    await prisma.cat.update({ where: { id: catId }, data: { arrivalPhotoUrl: `/api/arrival-photo/${catId}` } });
    return true;
  } catch (err) {
    console.error("[arrival-photo] 合成异常:", err instanceof Error ? err.message.slice(0, 200) : err);
    return false;
  }
}
