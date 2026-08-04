// 晚间档(习惯环 V2,doc/19):每日至多一个主触点——早晨没发过,晚上才可能轮到这里。
// 选稿:二选一问题(约每周3次,基于当天真实小物) > 图片观察题 > 图片瞬间分享(约1/3天)
//      > D1-3 保底晚安 > 静默。问题必须三段兑现:今晚提问 → 用户回复(走既有留话链路)
//      → 明早"关于你昨天说的——"兑现消息 + 日记回应。没有兑现的题目禁止用于保活。

import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { prisma } from "../db";
import { factSummary } from "../sim/engine";
import type { Fact } from "../sim/types";
import { leftBehindFor, sceneFor } from "../handbook";
import { SITE_URL } from "../site";
import { sendWechat, sendWechatImage } from "./bridge";
import { choiceQuestionMessage, goodnightMessage, namingQuestionMessage, photoQuestionMessage } from "./messages";
import { safeTrack, WECHAT_KIND } from "./service";
import { shortEntryLink } from "./entry";
import { pickMoment } from "./postcard";
import { catDayOf } from "../sim/lifecycle";
import { hashSeed } from "../sim/rng";
import { beijingHour } from "../moments";

/** 偏好时段(V2 P1,被动学习):用户近 14 天在哪个钟点说话最多,晚间档就挪到那附近。
 *  只认 9-21 点(静默时段外),样本不足 3 条回退 21 点;D1-3 固定 21 点(先建立仪式)。 */
async function preferredEveningHour(userId: string): Promise<number> {
  const logs = await prisma.wechatMessageLog.findMany({
    where: { userId, createdAt: { gte: new Date(Date.now() - 14 * 86400_000) } },
    select: { createdAt: true },
    take: 200,
  });
  const counts = new Map<number, number>();
  for (const l of logs) {
    const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", hour: "numeric", hour12: false }).format(l.createdAt)) % 24;
    if (h >= 9 && h <= 21) counts.set(h, (counts.get(h) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((a, b) => a + b, 0);
  if (total < 3) return 21;
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
}

/** 自适应频率(V2 P2):近 14 天主动说话的天数 → 每周主动触达目标(高活跃多说,不回的少打扰) */
async function weeklyTarget(userId: string): Promise<number> {
  const logs = await prisma.wechatMessageLog.findMany({
    where: { userId, createdAt: { gte: new Date(Date.now() - 14 * 86400_000) } },
    select: { createdAt: true },
    take: 300,
  });
  const days = new Set(logs.map((l) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(l.createdAt)));
  if (days.size >= 8) return 6;
  if (days.size >= 4) return 4;
  if (days.size >= 1) return 3;
  return 2;
}

export interface EveningResult {
  day: number;
  sent: number;
  kinds: Record<string, number>;
  skippedHadTouch: number;
  windowClosed: number;
  silent: number;
  failed: number;
  dryRun: boolean;
  preview: string[];
}

export async function sendGoodnight(opts: { dryRun?: boolean } = {}): Promise<EveningResult> {
  const dryRun = Boolean(opts.dryRun);
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  const day = world?.day ?? 0;
  const out: EveningResult = { day, sent: 0, kinds: {}, skippedHadTouch: 0, windowClosed: 0, silent: 0, failed: 0, dryRun, preview: [] };
  if (!world || world.wechatPaused) return out;

  const channels = await prisma.channel.findMany({ where: { kind: WECHAT_KIND, mutedAt: null } });
  const nowHour = beijingHour();
  let moment: Awaited<ReturnType<typeof pickMoment>> | null = null; // 懒取:本小时有到点用户才备图

  for (const ch of channels) {
    const cat = await prisma.cat.findFirst({ where: { ownerId: ch.userId } });
    if (!cat) continue;
    const catDay = cat.firstTickDay > 0 ? catDayOf(day, cat.firstTickDay) : 99;
    // 偏好时段(cron 每小时跑一次,9-21 点):只在用户最容易被找到的那个钟点发
    const prefHour = catDay <= 3 ? 21 : await preferredEveningHour(ch.userId);
    if (nowHour !== prefHour) continue;
    // 每日一个主触点:今天已经收到过任何消息(早晨档)就不再发
    const touched = await prisma.outboundMessage.count({ where: { userId: ch.userId, day, status: { in: ["sent", "queued"] } } });
    if (touched > 0) {
      out.skippedHadTouch++;
      continue;
    }
    const dup = await prisma.outboundMessage.count({ where: { userId: ch.userId, day, kind: { in: ["goodnight", "question", "question_name", "photo_moment"] } } });
    if (dup > 0) continue;

    const windowOpen = ch.windowOpenUntil && ch.windowOpenUntil >= new Date();

    // 当天场景素材(和生活册同源同物)
    const todayMain = await prisma.event.findFirst({ where: { catId: cat.id, day, isMain: true }, orderBy: { segment: "desc" } });
    const loc = (todayMain?.data as Record<string, unknown> | undefined)?.location;
    const sceneImg = typeof loc === "string" ? sceneFor(loc) : null;
    const sceneKey = sceneImg?.match(/\/scenes\/(\w+)\.jpg/)?.[1] ?? null;
    const choiceObj = leftBehindFor(cat.id, day, sceneImg);

    // 频次门:问题约每周 3 次;图片分享约 1/3 天;D4-7 过 2/3 门;
    // D8+ 按回应习惯自适应(高活跃 ~6/周,不回的 ~2/周)——连续不回自动降频,不追问
    const qGate = hashSeed(day, "q-gate", ch.userId) % 7 < 3;
    const photoGate = hashSeed(day, "p-gate", ch.userId) % 3 === 0;
    // 命名题(P2):每月至多 2-3 次,优先级最高——名字会进它的记忆长期复用
    const nameGate = hashSeed(day, "name-gate", ch.userId) % 12 === 0 && catDay >= 5;
    const paceGate =
      catDay <= 3
        ? true
        : catDay <= 7
          ? hashSeed(day, "pace", ch.userId) % 3 !== 0
          : hashSeed(day, "pace", ch.userId) % 7 < (await weeklyTarget(ch.userId));

    const LINK = await shortEntryLink(ch.userId);
    let kind: string | null = null;
    let content: string | null = null;
    let imageB64: string | null = null;

    if (paceGate && nameGate && choiceObj) {
      // 物件命名:回复的名字次日进记忆(daily.ts 兑现),长期复用
      kind = "question_name";
      content = namingQuestionMessage(cat, choiceObj, LINK);
    } else if (paceGate && qGate && choiceObj) {
      // 二选一:基于当天真实捡到的小物——回复走留话链路,明早兑现
      kind = "question";
      content = choiceQuestionMessage(cat, choiceObj, LINK);
    } else if (paceGate && qGate && sceneKey) {
      // 图片观察题:它今天待的地方
      const q = photoQuestionMessage(cat, sceneKey, LINK);
      if (q && sceneImg) {
        const res = await fetch(`${SITE_URL}${sceneImg}`);
        if (res.ok) {
          imageB64 = (await sharp(Buffer.from(await res.arrayBuffer())).resize({ width: 1080, withoutEnlargement: true }).jpeg({ quality: 82 }).toBuffer()).toString("base64");
          kind = "question";
          content = q;
        }
      }
    }
    if (!kind && paceGate && photoGate) {
      // 图片瞬间分享(不提问):今天岛上的一幕(懒取,本小时第一个用到的人触发)
      moment ??= await pickMoment(day);
      if (moment) {
        kind = "photo_moment";
        imageB64 = moment.imgB64;
        content = goodnightMessage(cat, { eveningLine: null, hook: `今天岛上,${moment.cat.name}${moment.summary}。` }, LINK, day);
      }
    }
    if (!kind && catDay <= 3) {
      // 关系建立期保底晚安
      const summary = await prisma.catDailySummary.findUnique({ where: { catId_day: { catId: cat.id, day } } });
      kind = "goodnight";
      content = goodnightMessage(cat, { eveningLine: null, hook: summary?.tomorrowHook ?? null }, LINK, day);
    }
    if (!kind || !content) {
      out.silent++;
      continue;
    }

    out.preview.push(`[${kind}] ${content.slice(0, 50)}`);
    if (dryRun) continue;

    // 窗口关了:不硬发。问题类不留信(没法兑现);晚安/分享落"未寄出的信"(doc/17 断链召回)
    if (!windowOpen) {
      out.windowClosed++;
      if (kind !== "question" && kind !== "question_name") {
        await prisma.outboundMessage.create({
          data: {
            id: randomUUID(), userId: ch.userId, catId: cat.id, day, kind,
            content, link: LINK, status: "window_closed", sendAfter: new Date(), createdAt: new Date(),
          },
        });
      }
      await safeTrack("wechat_window_closed_drop", { kind });
      continue;
    }

    const r = imageB64 ? await sendWechatImage(ch.externalId, imageB64, content) : await sendWechat(ch.externalId, content);
    await prisma.outboundMessage.create({
      data: {
        id: randomUUID(), userId: ch.userId, catId: cat.id, day, kind,
        content, link: LINK, status: r.ok ? "sent" : "failed",
        sendAfter: new Date(), sentAt: r.ok ? new Date() : null, createdAt: new Date(),
      },
    });
    if (r.ok) {
      out.sent++;
      out.kinds[kind] = (out.kinds[kind] ?? 0) + 1;
      await prisma.channel.update({ where: { id: ch.id }, data: { repliesInDay: 0 } }).catch(() => {});
      await safeTrack("wechat_msg_sent", { kind });
    } else {
      out.failed++;
      console.error("[evening] 发送失败:", ch.userId, r.detail);
    }
  }
  return out;
}
