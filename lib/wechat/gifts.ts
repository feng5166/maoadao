import sharp from "sharp";
import { prisma } from "../db";
import { synthCatSound } from "../tts";
import { sendWechat, sendWechatImage } from "./bridge";
import { shortEntryLink } from "./entry";

// 绑定激活的见面礼(里程碑寄送,doc/11 生命连接层的延伸):
// 握手文字之后,猫寄来第一天在码头的合影 + 一句它自己的声音。
// 只寄一次(Channel.giftSentAt 守门);每一环失败都静默——见面礼寄丢了不该打断绑定。

const WECHAT_KIND = "wechat_openclaw";

/** 立绘 → 圆形小相:整猫缩进圆环(徽章式)。不裁头——各猫构图不一,固定裁切会切歪;
 *  立绘本身是米白纯背景,缩进奶油纸底圆环里天然融合 */
export async function roundHeadAvatar(portrait: Buffer, size = 640): Promise<Buffer> {
  const r = size / 2 - 12;
  // 立绘整幅圆形蒙版(立绘是米白纯底、猫居中留边,圆裁不会切到猫),再落奶油纸底加砖红环
  const mask = Buffer.from(`<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="#fff"/></svg>`);
  const circled = await sharp(portrait)
    .resize(size, size, { fit: "cover" })
    .composite([{ input: mask, blend: "dest-in" }])
    .png()
    .toBuffer();
  const bg = Buffer.from(`<svg width="${size}" height="${size}"><rect width="${size}" height="${size}" fill="#faf6ee"/></svg>`);
  const ring = Buffer.from(
    `<svg width="${size}" height="${size}"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="#b5543b" stroke-width="7"/></svg>`,
  );
  return sharp(bg)
    .composite([{ input: circled }, { input: ring }])
    .jpeg({ quality: 88 })
    .toBuffer();
}

export async function sendWelcomeGifts(userId: string, openId: string): Promise<void> {
  const channel = await prisma.channel.findUnique({ where: { kind_externalId: { kind: WECHAT_KIND, externalId: openId } } });
  if (!channel || channel.userId !== userId || channel.giftSentAt) return;
  const cat = await prisma.cat.findFirst({ where: { ownerId: userId } });
  if (!cat) return;

  // 先占坑再寄:两条消息耗时较长,防并发激活重复寄
  await prisma.channel.update({ where: { id: channel.id }, data: { giftSentAt: new Date() } });

  // 1. 圆形头像小相:立绘裁猫头 + 圆形裁切 + 奶油纸底砖红环(和站内头像同一张脸)
  const portrait = await prisma.portrait.findUnique({ where: { catId: cat.id } });
  const arrival = portrait ? null : await prisma.arrivalPhoto.findUnique({ where: { catId: cat.id } });
  const jpg = portrait
    ? await roundHeadAvatar(Buffer.from(portrait.data)).catch(() => null)
    : arrival
      ? await sharp(Buffer.from(arrival.data)).resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer().catch(() => null)
      : null;
  if (jpg) {
    const caption = portrait
      ? "给你一张我的小相——想我的时候看看。"
      : "这张给你。第一天在码头拍的，我一直收着。";
    const r = await sendWechatImage(openId, jpg.toString("base64"), caption);
    if (!r.ok) console.error("[wechat-gift] 寄照片失败:", r.detail);
  }

  // 2. 它的声音——海螺留声。声音约束(AGENTS.md):不用人声,猫用喵叫配岛上的环境声。
  // iLink 不给 Bot 下发语音消息(2026-08-03 实测),声音存站内,微信寄一句带门的话
  const audio = await synthCatSound(meowPrompt(cat.boldness), 6);
  if (audio) {
    const now = new Date();
    const bytes = new Uint8Array(audio.mp3);
    const desc = "它对着海螺喵了两声，背后有海浪的声音。";
    await prisma.catVoiceNote.upsert({
      where: { catId: cat.id },
      update: { data: bytes, mime: "audio/mpeg", text: desc, durationMs: audio.durationMs, createdAt: now },
      create: { catId: cat.id, data: bytes, mime: "audio/mpeg", text: desc, durationMs: audio.durationMs, createdAt: now },
    });
    const link = await shortEntryLink(userId);
    const r = await sendWechat(openId, `${cat.name}对着海螺喵了两声，声音存在岛上了。贴耳朵听：\n${link}`);
    if (!r.ok) console.error("[wechat-gift] 留声通知失败:", r.detail);
  }
}

/** 按胆量定喵法(参数不露出,只影响声音气质);环境声固定海边清晨 */
function meowPrompt(boldness: number): string {
  const meow =
    boldness >= 70
      ? "a confident young cat meows twice, bright and clear"
      : boldness <= 35
        ? "a shy small kitten gives one soft, tentative meow, then a tiny quiet one"
        : "a small cat meows softly twice, gentle and curious";
  return `${meow}, with faint ocean waves and distant seagulls in the background, calm seaside morning, no human voice`;
}
