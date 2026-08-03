import sharp from "sharp";
import { prisma } from "../db";
import { synthCatVoice } from "../tts";
import { sendWechatImage, sendWechatVoice } from "./bridge";
import { voiceFor } from "../narrative/voice";

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

  // 2. 一句它的声音(按性格口吻;TTS 失败就当它今天不想说话)
  const v = voiceFor(cat);
  const line = `${v.selfRef === "我" ? "是我" : `是${v.selfRef}`}。以后想我了，就对着海螺说话——我听得见。`;
  const audio = await synthCatVoice(line);
  if (audio) {
    const r = await sendWechatVoice(openId, audio.silk.toString("base64"), audio.durationMs, audio.sampleRate);
    if (!r.ok) console.error("[wechat-gift] 寄语音失败:", r.detail);
  }
}
