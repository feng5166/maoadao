import sharp from "sharp";
import { prisma } from "./db";

// 定稿立绘：创建时生成一次，之后所有页面和分享卡复用——绝不每天重生成（定义·十三）。

const STYLE =
  "儿童绘本风格，扁平可爱插画，柔和的奶油色纯色背景，单只猫的全身角色立绘，居中构图，高质量角色设计，无文字无水印";

function buildPrompt(cat: { name: string; appearance: string; personaTags: string[] }): string {
  const persona = cat.personaTags.slice(0, 3).join("、");
  return `${cat.appearance}。这只猫的性格是${persona}，表情和姿态要体现这种性格。${STYLE}`;
}

/** 生成立绘并入库；幂等（已有立绘直接返回）。耗时 10~30 秒。 */
export async function generatePortrait(catId: string): Promise<boolean> {
  const cat = await prisma.cat.findUnique({ where: { id: catId } });
  if (!cat) return false;
  if (cat.portraitUrl) return true;

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
