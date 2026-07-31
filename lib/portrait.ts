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
