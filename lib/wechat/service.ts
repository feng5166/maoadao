// 微信通道服务层(doc/13 T2/T5,iLink 版):绑定回调、入站分流(留言/退订)、24h 窗口刷新。
// iLink 模型:每用户扫专属码,首条消息激活(context_token 到手)——口令配对已退役。
// 红线:入站永不进 LLM;所有回复都是确定性文案(messages.ts)。

import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { moderateTexts } from "../moderation";
import { sendFeishu } from "../feishu";
import { track } from "@vercel/analytics/server";
import { beijingHour, currentSegment, nowLine, sameBeijingDay } from "../moments";
import { shortEntryLink } from "./entry";
import { closeReply, handshakeMessage, islandGlanceReply, isHeaderLine, mediaReply, presenceReply, receiptReply, returnGreeting, statusReply, UNSUBSCRIBE_WORDS, unsubscribeAck } from "./messages";
import { rankHeadlines } from "../headline";
import { factSummary as factSummaryFn } from "../sim/engine";
import type { Fact as FactType } from "../sim/types";

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

/** 微信留言全量记录 + 飞书同步(门铃审计面):失败都不影响主流程 */
async function logWechatMessage(
  openId: string,
  userId: string | null,
  catName: string | null,
  text: string,
  matched: string,
): Promise<void> {
  if (!text) return;
  await prisma.wechatMessageLog
    .create({ data: { id: randomUUID(), openId, userId, catName, text: text.slice(0, 500), matched, createdAt: new Date() } })
    .catch((e) => console.error("[wechat-log]", e instanceof Error ? e.message.slice(0, 120) : e));
  await sendFeishu(
    `🐱 猫啊岛·微信留言\n${catName ? `猫:${catName}` : "未绑定用户"}${userId ? `(主人 ${userId.slice(0, 10)}…)` : ""}\n分类:${matched}\n「${text.slice(0, 200)}」`,
  ).catch(() => {});
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
  await logWechatMessage(openId, userId, cat.name, text, "activation");

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
  matched: "nudge" | "status" | "closed" | "presence" | "media" | "unsubscribed" | "unknown" | "ignored";
}

/** 桥侧标注的媒体类型(iLink item type 2-5) */
const MEDIA_KINDS = new Set(["image", "voice", "video", "file"]);
const MEDIA_LABELS: Record<string, string> = { image: "图片", voice: "语音", video: "视频", file: "文件" };

// 找猫意图(doc/11 修订·门铃规则):判断不清一律按留话处理——宁可错存,不可错聊
const FIND_CAT_PATTERNS = [/在哪/, /在干嘛/, /在干什么/, /干嘛呢/, /忙什么/, /怎么样了?[?？]?$/, /^在吗/, /^你在/, /找你/, /看看你/, /想看看/, /^找猫$/];

// 看岛意图(V2 三动作之三):岛上今天怎么样——回当日岛闻一句 + 公告栏短链
const ISLAND_PATTERNS = [/^看岛$/, /岛上.{0,6}(怎么样|如何|啥事|什么事|发生)/, /岛上今天/, /今天岛上/];

/** 当日岛闻一句(与今日页/晚间图分享同一套选稿) */
async function islandHeadlineLine(day: number): Promise<string | null> {
  const mains = await prisma.event.findMany({
    where: { day, isMain: true },
    select: { catId: true, segment: true, type: true, outcome: true, data: true, targetId: true, contentValue: true, threadKey: true },
  });
  const top = rankHeadlines(mains)[0];
  if (!top) return null;
  const [actor, target] = await Promise.all([
    prisma.cat.findUnique({ where: { id: top.catId }, select: { name: true } }),
    top.targetId ? prisma.cat.findUnique({ where: { id: top.targetId }, select: { name: true } }) : null,
  ]);
  const nameOf = new Map(target && top.targetId ? [[top.targetId, { name: target.name }]] : []);
  return `${actor?.name ?? "有猫"}${factSummaryFn({ type: top.type, outcome: top.outcome, data: top.data as Record<string, unknown>, targetId: top.targetId ?? undefined } as FactType, nameOf)}`;
}

function beijingDateInt(now = new Date()): number {
  return Number(new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(now).replaceAll("-", ""));
}

/** 猫此刻的第一人称状态(与 /my-cat 时段门同一套事实,绝不编造) */
async function firstPersonNow(catId: string): Promise<string> {
  const hour = beijingHour();
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  const day = world?.day ?? 0;
  const cat = await prisma.cat.findUnique({ where: { id: catId }, select: { firstTickDay: true } });
  const state = await prisma.catState.findUnique({ where: { catId } });
  const events = await prisma.event.findMany({ where: { catId, day } });
  const firstEvent = events.length === 0 ? await prisma.event.findFirst({ where: { catId }, orderBy: { day: "asc" }, select: { day: true } }) : null;
  const catDay = cat?.firstTickDay && cat.firstTickDay > 0 ? day - cat.firstTickDay + 1 : day - (firstEvent?.day ?? day) + 1;
  const arrivalDay = catDay <= 1;
  const gating = !arrivalDay && (hour < 8 || (world?.lastTickAt != null && sameBeijingDay(world.lastTickAt, new Date())));
  const seg = gating ? currentSegment(hour) : null;
  const ev = arrivalDay
    ? (events.find((e) => e.type === "arrival_home") ?? events.find((e) => e.type === "arrival") ?? null)
    : seg
      ? (events.find((e) => e.segment === seg && e.isMain) ?? events.find((e) => e.segment === seg) ?? null)
      : null;
  const targetName = ev?.targetId ? (await prisma.cat.findUnique({ where: { id: ev.targetId }, select: { name: true } }))?.name : null;
  return nowLine("我", ev ? { type: ev.type, data: ev.data as Record<string, unknown>, targetName } : null, hour, state?.location);
}

/** 入站总入口:分流 + 全量记录(每条都记,不论是否回复)+ 飞书同步 */
export async function handleInbound(externalId: string, rawText: string, media?: string | null): Promise<InboundResult> {
  const kind = media && MEDIA_KINDS.has(media) ? media : null;
  const result = await handleInboundCore(externalId, rawText, kind);
  const text = rawText.trim().slice(0, 500);
  const logText = text || (kind ? `【${MEDIA_LABELS[kind]}】` : "");
  if (logText) {
    const ch = await prisma.channel.findUnique({ where: { kind_externalId: { kind: WECHAT_KIND, externalId } } });
    const cat = ch ? await prisma.cat.findFirst({ where: { ownerId: ch.userId }, select: { name: true } }) : null;
    await logWechatMessage(externalId, ch?.userId ?? null, cat?.name ?? null, logText, result.matched);
  }
  return result;
}

/** 分流核心:找猫 / 留话 / 退订。
 *  一来一回(doc/11 修订):同一北京日,第 1 条实质回复 + 第 2 条收束,之后静默(消息照收)。 */
async function handleInboundCore(externalId: string, rawText: string, media: string | null = null): Promise<InboundResult> {
  const text = rawText.trim().slice(0, 500);
  if (!text && !media) return { replyText: null, matched: "ignored" };

  const channel = await prisma.channel.findUnique({ where: { kind_externalId: { kind: WECHAT_KIND, externalId } } });
  if (!channel) {
    // 正常不会发生(iLink 会话只在扫码后存在);兜底指回绑定入口
    return { replyText: "咦,我们还不认识——去猫啊岛的页面上点「让它找到我」,扫个码就好。", matched: "unknown" };
  }

  // 断联检测要在刷新窗口之前:到达时窗口已关 = 用户断联后回来了(V2 doc/19 回归摘要)
  const wasDisconnected = !channel.windowOpenUntil || channel.windowOpenUntil < new Date();

  // 任何入站都刷新 24h 窗口(doc/11 §六:通道要的和产品要的在同一个动作上)
  const today = beijingDateInt();
  const replies = channel.replyDay === today ? channel.repliesInDay : 0;
  await prisma.channel.update({ where: { id: channel.id }, data: { windowOpenUntil: windowDeadline(), replyDay: today, repliesInDay: replies } });

  const cat = await prisma.cat.findFirst({ where: { ownerId: channel.userId } });
  if (!cat) return { replyText: null, matched: "ignored" };

  // 断联回归:不倾倒不责怪,只说最重要的一件,其余引回生活册。
  // 留话仍照常落库(在下方分流里),这里只接管"第一句回应"。
  if (wasDisconnected && text) {
    const unsent = await prisma.outboundMessage.findMany({
      where: { userId: channel.userId, status: "window_closed", createdAt: { gte: new Date(Date.now() - 7 * 86400_000) } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
    if (unsent.length > 0) {
      const latestLine = unsent[0].content.split("\n").filter((l) => l && !l.includes("http") && !isHeaderLine(l, cat.name))[0] ?? null;
      if (!FIND_CAT_PATTERNS.some((p) => p.test(text))) await saveWechatNudge(cat.id, text);
      await prisma.channel.update({ where: { id: channel.id }, data: { replyDay: today, repliesInDay: replies + 1 } });
      await safeTrack("wechat_return_after_gap", { unsent: unsent.length });
      return { replyText: returnGreeting(cat, unsent.length, latestLine, await shortEntryLink(channel.userId)), matched: "nudge" };
    }
  }

  // 退订(不受节流限制:退订确认永远要回,带回岛链接)
  if (UNSUBSCRIBE_WORDS.some((w) => text === w || text === `「${w}」`)) {
    await prisma.channel.update({ where: { id: channel.id }, data: { mutedAt: new Date() } });
    return { replyText: unsubscribeAck(cat.name, await shortEntryLink(channel.userId)), matched: "unsubscribed" };
  }
  // 说话即续订:退订后又主动来说话,视为想恢复联系
  if (channel.mutedAt) await prisma.channel.update({ where: { id: channel.id }, data: { mutedAt: null } });

  const bumpReplies = () =>
    prisma.channel.update({ where: { id: channel.id }, data: { replyDay: today, repliesInDay: replies + 1 } });
  const link = await shortEntryLink(channel.userId);

  // ---- 媒体消息(图片/语音/视频/文件):它只看得懂字——旁白体轻响应,不占一来一回、不落留言 ----
  if (!text && media) {
    await safeTrack("wechat_inbound", { kind: "media" });
    return { replyText: mediaReply(cat, media, today, link), matched: "media" };
  }

  // ---- 看岛(V2 三动作):当日岛闻一句 + 公告栏短链,不落留言,占一来一回额度 ----
  const isIslandGlance = ISLAND_PATTERNS.some((p) => p.test(text)) && text.length <= 20;
  if (isIslandGlance) {
    if (replies >= 2) {
      await bumpReplies();
      return { replyText: presenceReply(cat, beijingHour(), replies - 2, today, link), matched: "presence" };
    }
    const world = await prisma.worldState.findUnique({ where: { id: 1 } });
    const headline = world ? await islandHeadlineLine(world.day) : null;
    const { createShortLink } = await import("../shortlink");
    const islandLink = await createShortLink("/island", 72 * 3600_000);
    await bumpReplies();
    await safeTrack("wechat_inbound", { kind: "island" });
    return { replyText: islandGlanceReply(cat.name, world?.day ?? 0, headline, islandLink), matched: "status" };
  }

  // ---- 找猫:报当前已解锁的真实状态,不落留言 ----
  const isFinding = FIND_CAT_PATTERNS.some((p) => p.test(text)) && text.length <= 20;
  if (isFinding) {
    if (replies >= 2) {
      await bumpReplies();
      return { replyText: presenceReply(cat, beijingHour(), replies - 2, today, link), matched: "presence" };
    }
    if (replies >= 1) {
      await bumpReplies();
      return { replyText: closeReply(cat, link), matched: "closed" };
    }
    const now = await firstPersonNow(cat.id);
    await bumpReplies();
    await safeTrack("wechat_inbound", { kind: "find" });
    return { replyText: statusReply(cat, now, link, beijingHour()), matched: "status" };
  }

  // ---- 留话:永远落库(合并为最新);回复按节流 ----
  const saved = await saveWechatNudge(cat.id, text);
  if (saved.ok) {
    const priorInbound = await prisma.ownerNudge.count({ where: { catId: cat.id, consumedDay: { not: null } } });
    await safeTrack("intervention_submit", { hasMessage: true, suggestion: "none", first: priorInbound === 0, via: "wechat" });
    if (!saved.hadPending) await safeTrack("wechat_first_reply", {});
  }
  if (replies >= 2) {
    await bumpReplies();
    // 微响应(doc/11 修订):不静默也不接话——留言照收,回一点岛上的动静
    return { replyText: presenceReply(cat, beijingHour(), replies - 2, today, link), matched: "presence" };
  }
  if (replies >= 1) {
    await bumpReplies();
    return { replyText: closeReply(cat, link), matched: "closed" };
  }
  await bumpReplies();
  return { replyText: receiptReply(cat, link), matched: "nudge" };
}
