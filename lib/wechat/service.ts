// 微信通道服务层(doc/13 T2/T5):暗号配对、入站分流(配对/留言/退订)、24h 窗口刷新。
// 红线:入站永不进 LLM;所有回复都是确定性文案(messages.ts)。

import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { moderateTexts } from "../moderation";
import { track } from "@vercel/analytics/server";
import { beijingHour } from "../moments";

/** 埋点失败不影响通道主流程(本地/测试环境无 Vercel 运行时) */
export async function safeTrack(name: string, props?: Record<string, string | number | boolean>): Promise<void> {
  try {
    await track(name, props);
  } catch {
    // 忽略
  }
}
import { ackLine, handshakeMessage, pairFailReply, UNSUBSCRIBE_WORDS, unsubscribeAck } from "./messages";
import { hashSeed, mulberry32, pick } from "../sim/rng";

export const WECHAT_KIND = "wechat_openclaw";
const WINDOW_HOURS = 24;

// 口令词池:纪念物系(doc/11 §四),可爱、好念、不撞正式词
const CODE_WORDS = ["红绳", "贝壳", "灯塔", "鱼干", "松果", "星星", "船票", "海苔"];

export function windowDeadline(from = new Date()): Date {
  return new Date(from.getTime() + WINDOW_HOURS * 3600_000);
}

/** 每用户一个待用口令,幂等;用过才换新 */
export async function getOrCreatePairingCode(userId: string, catId: string): Promise<string> {
  const existing = await prisma.pairingCode.findFirst({ where: { userId, usedAt: null } });
  if (existing) return existing.code;
  const rng = mulberry32(hashSeed("pair", userId, Date.now()));
  for (let i = 0; i < 8; i++) {
    const code = `${pick(rng, CODE_WORDS)}-${100 + Math.floor(rng() * 900)}`;
    try {
      await prisma.pairingCode.create({ data: { code, userId, catId, createdAt: new Date() } });
      return code;
    } catch {
      // 撞码重试
    }
  }
  const fallback = `红绳-${Date.now() % 1000}`;
  await prisma.pairingCode.create({ data: { code: fallback, userId, catId, createdAt: new Date() } });
  return fallback;
}

export async function getBoundChannel(userId: string) {
  return prisma.channel.findFirst({ where: { userId, kind: WECHAT_KIND } });
}

/** 口令归一化:去空格、全角横线、大小写无关 */
function normalizeCode(text: string): string {
  return text.replace(/\s+/g, "").replace(/[－—–]/g, "-").trim();
}

export interface InboundResult {
  reply: string | null;
  matched: "paired" | "nudge" | "unsubscribed" | "pair_fail" | "ignored";
}

/** 入站总入口:配对 / 留言 / 退订。返回要回给用户的文案(由调用方发送)。 */
export async function handleInbound(externalId: string, rawText: string): Promise<InboundResult> {
  const text = rawText.trim().slice(0, 500);
  if (!text) return { reply: null, matched: "ignored" };

  const channel = await prisma.channel.findUnique({ where: { kind_externalId: { kind: WECHAT_KIND, externalId } } });

  // ---- 未绑定:只认口令 ----
  if (!channel) {
    const norm = normalizeCode(text);
    const codes = await prisma.pairingCode.findMany({ where: { usedAt: null } });
    const hit = codes.find((c) => norm.includes(normalizeCode(c.code)));
    if (!hit) return { reply: pairFailReply(), matched: "pair_fail" };

    const cat = await prisma.cat.findUnique({ where: { id: hit.catId } });
    if (!cat) return { reply: pairFailReply(), matched: "pair_fail" };
    await prisma.$transaction([
      prisma.channel.create({
        data: { id: randomUUID(), userId: hit.userId, kind: WECHAT_KIND, externalId, windowOpenUntil: windowDeadline(), boundAt: new Date() },
      }),
      prisma.pairingCode.update({ where: { code: hit.code }, data: { usedAt: new Date() } }),
    ]);
    await safeTrack("wechat_pair_success", {});
    // 握手消息:唯一的即时消息,豁免静默(doc/12 §八;动作回执非推送)
    const reply = handshakeMessage(cat, cat.firstWords, beijingHour());
    return { reply, matched: "paired" };
  }

  // ---- 已绑定:任何入站都刷新 24h 窗口 ----
  await prisma.channel.update({ where: { id: channel.id }, data: { windowOpenUntil: windowDeadline() } });

  const cat = await prisma.cat.findFirst({ where: { ownerId: channel.userId } });
  if (!cat) return { reply: null, matched: "ignored" };

  // 退订
  if (UNSUBSCRIBE_WORDS.some((w) => text === w || text === `「${w}」`)) {
    await prisma.channel.update({ where: { id: channel.id }, data: { mutedAt: new Date() } });
    return { reply: unsubscribeAck(cat.name), matched: "unsubscribed" };
  }
  // 说话即续订:退订后又主动来说话,视为想恢复联系
  if (channel.mutedAt) await prisma.channel.update({ where: { id: channel.id }, data: { mutedAt: null } });

  // ---- 回信即留言(doc/11 §七):落 nudge,确定性 ACK,绝不接续聊天 ----
  const mod = await moderateTexts([text.slice(0, 60)]);
  if (!mod.ok) return { reply: `🐱 ${cat.name}：这句话我听不太懂……换个说法?`, matched: "ignored" };

  const hadPending = await prisma.ownerNudge.count({ where: { catId: cat.id, consumedDay: null } });
  await prisma.ownerNudge.deleteMany({ where: { catId: cat.id, consumedDay: null } });
  await prisma.ownerNudge.create({
    data: {
      id: randomUUID(),
      catId: cat.id,
      message: text.slice(0, 60),
      suggestion: null,
      isPublic: true, // 微信里对猫说的话,预期被猫回应
      createdAt: new Date(),
    },
  });
  const priorInbound = await prisma.ownerNudge.count({ where: { catId: cat.id, consumedDay: { not: null } } });
  await safeTrack("intervention_submit", { hasMessage: true, suggestion: "none", first: priorInbound === 0, via: "wechat" });
  if (hadPending === 0) await safeTrack("wechat_first_reply", {});

  const state = await prisma.catState.findUnique({ where: { catId: cat.id } });
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  return { reply: ackLine(cat, world?.day ?? 0, state?.mood, hadPending > 0), matched: "nudge" };
}
