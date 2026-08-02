// 微信通道服务层(doc/13 T2/T5,iLink 版):绑定回调、入站分流(留言/退订)、24h 窗口刷新。
// iLink 模型:每用户扫专属码,首条消息激活(context_token 到手)——口令配对已退役。
// 红线:入站永不进 LLM;所有回复都是确定性文案(messages.ts)。

import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { moderateTexts } from "../moderation";
import { track } from "@vercel/analytics/server";
import { beijingHour } from "../moments";
import { ackLine, handshakeMessage, UNSUBSCRIBE_WORDS, unsubscribeAck } from "./messages";

export const WECHAT_KIND = "wechat_openclaw"; // 历史命名保留(通道 kind 标识,与协议实现解耦)
const WINDOW_HOURS = 24;

/** 埋点失败不影响通道主流程(本地/测试环境无 Vercel 运行时) */
export async function safeTrack(name: string, props?: Record<string, string | number | boolean>): Promise<void> {
  try {
    await track(name, props);
  } catch {
    // 忽略
  }
}

export function windowDeadline(from = new Date()): Date {
  return new Date(from.getTime() + WINDOW_HOURS * 3600_000);
}

export async function getBoundChannel(userId: string) {
  return prisma.channel.findFirst({ where: { userId, kind: WECHAT_KIND } });
}

/** 落一条微信侧留言(与 Web 留言同规:未消费的合并为最新一条) */
async function saveWechatNudge(catId: string, text: string): Promise<{ ok: boolean; hadPending: boolean }> {
  const clipped = text.slice(0, 60);
  const mod = await moderateTexts([clipped]);
  if (!mod.ok) return { ok: false, hadPending: false };
  const hadPending = (await prisma.ownerNudge.count({ where: { catId, consumedDay: null } })) > 0;
  await prisma.ownerNudge.deleteMany({ where: { catId, consumedDay: null } });
  await prisma.ownerNudge.create({
    data: {
      id: randomUUID(),
      catId,
      message: clipped,
      suggestion: null,
      isPublic: true, // 微信里对猫说的话,预期被猫回应
      createdAt: new Date(),
    },
  });
  return { ok: true, hadPending };
}

/** 激活绑定(桥回调,首条消息到达时):建通道 + 开窗 + 首句入留言 → 返回人格化握手文案。
 *  换绑规则:一人一微信、一微信一人——新绑定顶掉双方的旧关系(与 stocktell 同款语义)。 */
export async function bindChannel(userId: string, openId: string, firstText: string): Promise<{ replyText: string | null }> {
  const cat = await prisma.cat.findFirst({ where: { ownerId: userId } });
  if (!cat) return { replyText: null };

  await prisma.$transaction([
    prisma.channel.deleteMany({ where: { OR: [{ userId, kind: WECHAT_KIND }, { kind: WECHAT_KIND, externalId: openId }] } }),
    prisma.channel.create({
      data: { id: randomUUID(), userId, kind: WECHAT_KIND, externalId: openId, windowOpenUntil: windowDeadline(), boundAt: new Date() },
    }),
  ]);
  await safeTrack("wechat_pair_success", {});

  // 激活的那句话就是"对它说的第一句"——同时落为留言,明早日记回应
  const text = firstText?.trim() ?? "";
  if (text && !UNSUBSCRIBE_WORDS.includes(text)) await saveWechatNudge(cat.id, text);

  // 握手:唯一的即时消息,豁免静默(doc/12 §八;动作回执非推送)。桥零台词,文案全在这里。
  return { replyText: handshakeMessage(cat, cat.firstWords, beijingHour()) };
}

/** 解绑(桥回调:连续硬失败判失效 / 会话不可恢复) */
export async function unbindChannel(openId: string): Promise<void> {
  await prisma.channel.deleteMany({ where: { kind: WECHAT_KIND, externalId: openId } });
  await safeTrack("wechat_unbind", {});
}

export interface InboundResult {
  replyText: string | null;
  matched: "nudge" | "unsubscribed" | "unknown" | "ignored";
}

/** 入站总入口(激活后的每条消息):留言 / 退订。返回文案由桥送达(带 typing)。 */
export async function handleInbound(externalId: string, rawText: string): Promise<InboundResult> {
  const text = rawText.trim().slice(0, 500);
  if (!text) return { replyText: null, matched: "ignored" };

  const channel = await prisma.channel.findUnique({ where: { kind_externalId: { kind: WECHAT_KIND, externalId } } });
  if (!channel) {
    // 正常不会发生(iLink 会话只在扫码后存在);兜底指回绑定入口
    return { replyText: "咦,我们还不认识——去猫啊岛的页面上点「让它找到我」,扫个码就好。", matched: "unknown" };
  }

  // 任何入站都刷新 24h 窗口(doc/11 §六:通道要的和产品要的在同一个动作上)
  await prisma.channel.update({ where: { id: channel.id }, data: { windowOpenUntil: windowDeadline() } });

  const cat = await prisma.cat.findFirst({ where: { ownerId: channel.userId } });
  if (!cat) return { replyText: null, matched: "ignored" };

  // 退订
  if (UNSUBSCRIBE_WORDS.some((w) => text === w || text === `「${w}」`)) {
    await prisma.channel.update({ where: { id: channel.id }, data: { mutedAt: new Date() } });
    return { replyText: unsubscribeAck(cat.name), matched: "unsubscribed" };
  }
  // 说话即续订:退订后又主动来说话,视为想恢复联系
  if (channel.mutedAt) await prisma.channel.update({ where: { id: channel.id }, data: { mutedAt: null } });

  // 回信即留言(doc/11 §七):落 nudge,确定性 ACK,绝不接续聊天
  const saved = await saveWechatNudge(cat.id, text);
  if (!saved.ok) return { replyText: `🐱 ${cat.name}：这句话我听不太懂……换个说法?`, matched: "ignored" };

  const priorInbound = await prisma.ownerNudge.count({ where: { catId: cat.id, consumedDay: { not: null } } });
  await safeTrack("intervention_submit", { hasMessage: true, suggestion: "none", first: priorInbound === 0, via: "wechat" });
  if (!saved.hadPending) await safeTrack("wechat_first_reply", {});

  const state = await prisma.catState.findUnique({ where: { catId: cat.id } });
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  return { replyText: ackLine(cat, world?.day ?? 0, state?.mood, saved.hadPending), matched: "nudge" };
}
