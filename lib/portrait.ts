import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { prisma } from "./db";
import { generateImage } from "./imagegen";

// 定稿立绘：创建时生成一次，之后所有页面和分享卡复用——绝不每天重生成（定义·十三）。

// 统一画风（v0.7 去 AI 化）：目标不是每张惊艳，而是 17 只放一起像同一本绘本。
// 固定构图/视角/光线/描边/色数/背景，去掉摄影感与环境渲染，保留手绘瑕疵。
const STYLE =
  "手绘绘本风格角色设计。严格遵守：全身站姿，正面微侧45度，平视视角；" +
  "均匀柔和的平光，无投影无高光渲染；粗细一致的深棕色手绘轮廓线；" +
  "整只猫最多使用6种颜色，色彩中低饱和；纯米白色背景（#FAF6EE），无任何环境和道具；" +
  "扁平上色带轻微水彩纸纹理和铅笔瑕疵感；不要写实毛发细节，不要摄影感，不要3D渲染，无文字无水印";

// 风格锚点：拿几张已定稿立绘当画风参考，比纯文字 STYLE 稳得多。
// 三只花色跨度大的 NPC（白长毛/黑短毛/三花）——花色差距大，模型才学"画风"而不是"这只猫长什么样"。
const ANCHOR_IDS = ["npc-mianhua", "npc-heidou", "npc-xiaomei"];
const ANCHOR_NOTE =
  "参考图只规定画风（线条、上色、纸纹、光线、轮廓处理），必须与参考图画风完全一致；" +
  "但不要模仿参考图里猫的花色、品种、体型和姿势——这是另一只完全不同的猫。";

function buildPrompt(cat: { name: string; appearance: string; personaTags: string[] }, withAnchors: boolean): string {
  const persona = cat.personaTags.slice(0, 3).join("、");
  return `一只猫的角色立绘：${cat.appearance}。性格${persona}，用站姿和表情体现性格。${STYLE}${withAnchors ? `。${ANCHOR_NOTE}` : ""}`;
}

/** 取风格锚点立绘（排除自己——force 重绘锚点猫时不能拿旧图当参考）。库里还没有就退回纯文字约束。 */
async function styleAnchors(excludeCatId: string): Promise<{ data: Buffer; mime: string }[]> {
  if (process.env.PORTRAIT_STYLE_ANCHORS === "off") return [];
  const rows = await prisma.portrait.findMany({
    where: { catId: { in: ANCHOR_IDS.filter((id) => id !== excludeCatId) } },
  });
  // 保持 ANCHOR_IDS 的既定顺序，输出稳定可复现
  return ANCHOR_IDS.map((id) => rows.find((r) => r.catId === id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((r) => ({ data: Buffer.from(r.data), mime: r.mime }));
}

/** 生成立绘并入库；幂等（已有立绘直接返回）。耗时 10~30 秒。
 *  archiveDir：脚本环境下把 API 原图落盘归档（serverless 无持久盘，线上调用不传）。 */
export async function generatePortrait(
  catId: string,
  options: { force?: boolean; archiveDir?: string } = {},
): Promise<boolean> {
  const cat = await prisma.cat.findUnique({ where: { id: catId } });
  if (!cat) return false;
  if (cat.portraitUrl && !options.force) return true;

  try {
    const anchors = await styleAnchors(catId);
    const raw = await generateImage({
      prompt: buildPrompt(cat, anchors.length > 0),
      size: "2048x2048",
      referenceImages: anchors,
    });
    if (!raw) return false;

    if (options.archiveDir) {
      await mkdir(options.archiveDir, { recursive: true });
      const ext = raw[0] === 0x89 ? "png" : "jpg";
      await writeFile(path.join(options.archiveDir, `${catId}.${ext}`), raw);
    }

    // 入库主图 1600：展示全走 ?s= 缩略图路由，页面重量不受影响；
    // 主图同时是分享卡/相遇照片/未来周边的母版，768 太小（原图只在归档盘里有）。
    const jpegBuf = await sharp(raw).resize(1600, 1600, { fit: "cover" }).jpeg({ quality: 85 }).toBuffer();
    const jpeg = new Uint8Array(jpegBuf); // Prisma Bytes 需要 Uint8Array<ArrayBuffer>

    await prisma.portrait.upsert({
      where: { catId },
      update: { data: jpeg, mime: "image/jpeg", createdAt: new Date() },
      create: { catId, data: jpeg, mime: "image/jpeg", createdAt: new Date() },
    });
    // ?v= 版本参数:路由是 immutable 长缓存,重绘后必须换 URL 才能把 CDN/浏览器的旧图顶掉
    await prisma.cat.update({
      where: { id: catId },
      data: { portraitUrl: `/api/portrait/${catId}?v=${Date.now().toString(36)}` },
    });
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
export async function generateArrivalPhoto(catId: string, options: { force?: boolean } = {}): Promise<boolean> {
  const cat = await prisma.cat.findUnique({ where: { id: catId } });
  if (!cat || cat.isNpc) return false;
  if (cat.arrivalPhotoUrl && !options.force) return true;
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
    await prisma.cat.update({
      where: { id: catId },
      data: { arrivalPhotoUrl: `/api/arrival-photo/${catId}?v=${Date.now().toString(36)}` },
    });
    return true;
  } catch (err) {
    console.error("[arrival-photo] 合成异常:", err instanceof Error ? err.message.slice(0, 200) : err);
    return false;
  }
}
