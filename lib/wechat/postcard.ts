// 海螺每日精选(P2):每天晚上,把"今天岛上的一幕"寄进微信——图 + 一句话 + 回岛短链。
// 与今日页头版同一套选稿(lib/headline),用户在网页看到的头条就是海螺寄来的那一幕。
//
// 频控设计:严守"每人每天全类型合计 ≤1 条"(doc/13)——明信片只发给今天还没收到
// 任何消息的用户,是晚间补位触点,不是加发。窗口关了照旧落 window_closed,绝不硬发。

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "../db";
import { factSummary } from "../sim/engine";
import type { Fact } from "../sim/types";
import { rankHeadlines } from "../headline";
import { LIFE_PHOTO_IDS } from "../cats-life";
import { sceneFor } from "../handbook";
import { SITE_URL } from "../site";
import { sendWechatImage } from "./bridge";
import { safeTrack, WECHAT_KIND } from "./service";
import { shortEntryLink } from "./entry";

/** 挑今晚的一幕 + 备好图(1080 宽 JPEG);headline 为空 = 今天没得寄 */
async function pickMoment(day: number) {
  const mains = await prisma.event.findMany({
    where: { day, isMain: true },
    select: { catId: true, segment: true, type: true, outcome: true, data: true, targetId: true, contentValue: true, threadKey: true },
  });
  const headline = rankHeadlines(mains)[0];
  if (!headline) return null;
  const cat = await prisma.cat.findUnique({ where: { id: headline.catId }, select: { id: true, name: true } });
  if (!cat) return null;
  const target = headline.targetId
    ? await prisma.cat.findUnique({ where: { id: headline.targetId }, select: { id: true, name: true } })
    : null;
  const catById = new Map(target ? [[target.id, { name: target.name }]] : []);
  const summary = factSummary(
    { type: headline.type, outcome: headline.outcome, data: headline.data as Record<string, unknown>, targetId: headline.targetId ?? undefined } as Fact,
    catById,
  );

  // 图:主角的生活照优先;运行时新猫退回当天事发地的场景图
  const loc = (headline.data as Record<string, unknown>)?.location;
  const imgPath = LIFE_PHOTO_IDS.has(cat.id) ? `/cats-life/${cat.id}.jpg` : sceneFor(typeof loc === "string" ? loc : undefined);
  const res = await fetch(`${SITE_URL}${imgPath}`);
  if (!res.ok) return null;
  const jpg = await sharp(Buffer.from(await res.arrayBuffer()))
    .resize({ width: 1080, withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();

  return { cat, summary, hasMore: Boolean(headline.threadKey), imgB64: jpg.toString("base64") };
}

export interface PostcardResult {
  day: number;
  moment: string | null;
  sent: number;
  skippedQuota: number;
  windowClosed: number;
  failed: number;
  dryRun: boolean;
  recipients: string[];
}

/** 晚间明信片:cron 20:00 调用。dryRun 只报告会寄给谁、寄什么,不真发。 */
export async function sendDailyPostcard(opts: { dryRun?: boolean } = {}): Promise<PostcardResult> {
  const dryRun = Boolean(opts.dryRun);
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  const day = world?.day ?? 0;
  const empty: PostcardResult = { day, moment: null, sent: 0, skippedQuota: 0, windowClosed: 0, failed: 0, dryRun, recipients: [] };
  if (!world || world.wechatPaused) return empty;

  const moment = await pickMoment(day);
  if (!moment) return empty;
  empty.moment = `${moment.cat.name}${moment.summary}`;

  const channels = await prisma.channel.findMany({ where: { kind: WECHAT_KIND, mutedAt: null } });
  for (const ch of channels) {
    // 频控:今天已经收到过消息(任何类型、任何状态)就不再打扰
    const dup = await prisma.outboundMessage.count({ where: { userId: ch.userId, day } });
    if (dup > 0) {
      empty.skippedQuota++;
      continue;
    }
    // 24h 硬窗口:关了就算了,明信片不值得变成"未寄出的信"打扰用户
    if (!ch.windowOpenUntil || ch.windowOpenUntil < new Date()) {
      empty.windowClosed++;
      continue;
    }
    const LINK = await shortEntryLink(ch.userId);
    const caption = `海螺里传来今晚的岛——\n${moment.cat.name}${moment.summary}。${moment.hasMore ? "\n这件事,好像还没完。" : ""}\n回岛看看:${LINK}`;
    empty.recipients.push(ch.userId);
    if (dryRun) continue;

    const r = await sendWechatImage(ch.externalId, moment.imgB64, caption);
    await prisma.outboundMessage.create({
      data: {
        id: randomUUID(),
        userId: ch.userId,
        catId: moment.cat.id,
        day,
        kind: "postcard",
        content: caption,
        link: LINK,
        status: r.ok ? "sent" : "failed",
        sendAfter: new Date(),
        sentAt: r.ok ? new Date() : null,
        createdAt: new Date(),
      },
    });
    if (r.ok) {
      empty.sent++;
      await prisma.channel.update({ where: { id: ch.id }, data: { repliesInDay: 0 } }).catch(() => {});
      await safeTrack("wechat_msg_sent", { kind: "postcard" });
    } else {
      empty.failed++;
      console.error("[postcard] 发送失败:", ch.userId, r.detail);
    }
  }
  return empty;
}
