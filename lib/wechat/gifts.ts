import sharp from "sharp";
import { prisma } from "../db";
import { synthCatVoice } from "../tts";
import { sendWechatImage, sendWechatVoice } from "./bridge";
import { voiceFor } from "../narrative/voice";

// 绑定激活的见面礼(里程碑寄送,doc/11 生命连接层的延伸):
// 握手文字之后,猫寄来第一天在码头的合影 + 一句它自己的声音。
// 只寄一次(Channel.giftSentAt 守门);每一环失败都静默——见面礼寄丢了不该打断绑定。

const WECHAT_KIND = "wechat_openclaw";

export async function sendWelcomeGifts(userId: string, openId: string): Promise<void> {
  const channel = await prisma.channel.findUnique({ where: { kind_externalId: { kind: WECHAT_KIND, externalId: openId } } });
  if (!channel || channel.userId !== userId || channel.giftSentAt) return;
  const cat = await prisma.cat.findFirst({ where: { ownerId: userId } });
  if (!cat) return;

  // 先占坑再寄:两条消息耗时较长,防并发激活重复寄
  await prisma.channel.update({ where: { id: channel.id }, data: { giftSentAt: new Date() } });

  // 1. 照片:相遇照片(第一天码头的拍立得)优先,没有就用定稿立绘
  const arrival = await prisma.arrivalPhoto.findUnique({ where: { catId: cat.id } });
  const photo = arrival ?? (await prisma.portrait.findUnique({ where: { catId: cat.id } }));
  if (photo) {
    const jpg = await sharp(Buffer.from(photo.data))
      .resize({ width: 1080, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toBuffer()
      .catch(() => null);
    if (jpg) {
      const caption = arrival
        ? "这张给你。第一天在码头拍的，我一直收着。"
        : "给你一张我的画像——想我的时候看看。";
      const r = await sendWechatImage(openId, jpg.toString("base64"), caption);
      if (!r.ok) console.error("[wechat-gift] 寄照片失败:", r.detail);
    }
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
