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
import { choiceQuestionMessage, goodnightMessage, photoQuestionMessage } from "./messages";
import { safeTrack, WECHAT_KIND } from "./service";
import { shortEntryLink } from "./entry";
import { pickMoment } from "./postcard";
import { catDayOf } from "../sim/lifecycle";
import { hashSeed } from "../sim/rng";

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
  const moment = await pickMoment(day); // 岛闻头条图(分享用),一次备好全体复用

  for (const ch of channels) {
    const cat = await prisma.cat.findFirst({ where: { ownerId: ch.userId } });
    if (!cat) continue;
    // 每日一个主触点:今天已经收到过任何消息(早晨档/即时除外的推送)就不再发
    const touched = await prisma.outboundMessage.count({ where: { userId: ch.userId, day, status: { in: ["sent", "queued"] } } });
    if (touched > 0) {
      out.skippedHadTouch++;
      continue;
    }
    const dup = await prisma.outboundMessage.count({ where: { userId: ch.userId, day, kind: { in: ["goodnight", "question", "photo_moment"] } } });
    if (dup > 0) continue;

    const catDay = cat.firstTickDay > 0 ? catDayOf(day, cat.firstTickDay) : 99;
    const windowOpen = ch.windowOpenUntil && ch.windowOpenUntil >= new Date();

    // 当天场景素材(和生活册同源同物)
    const todayMain = await prisma.event.findFirst({ where: { catId: cat.id, day, isMain: true }, orderBy: { segment: "desc" } });
    const loc = (todayMain?.data as Record<string, unknown> | undefined)?.location;
    const sceneImg = typeof loc === "string" ? sceneFor(loc) : null;
    const sceneKey = sceneImg?.match(/\/scenes\/(\w+)\.jpg/)?.[1] ?? null;
    const choiceObj = leftBehindFor(cat.id, day, sceneImg);

    // 频次门:问题约每周 3 次;图片分享约 1/3 天;D4-7 再过 2/3 门(0-1条/天);D8+ 靠内容自然稀疏
    const qGate = hashSeed(day, "q-gate", ch.userId) % 7 < 3;
    const photoGate = hashSeed(day, "p-gate", ch.userId) % 3 === 0;
    const paceGate = catDay <= 3 ? true : catDay <= 7 ? hashSeed(day, "pace", ch.userId) % 3 !== 0 : true;

    const LINK = await shortEntryLink(ch.userId);
    let kind: string | null = null;
    let content: string | null = null;
    let imageB64: string | null = null;

    if (paceGate && qGate && choiceObj) {
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
    if (!kind && paceGate && photoGate && moment) {
      // 图片瞬间分享(不提问):今天岛上的一幕
      kind = "photo_moment";
      imageB64 = moment.imgB64;
      content = goodnightMessage(cat, { eveningLine: null, hook: `今天岛上,${moment.cat.name}${moment.summary}。` }, LINK, day);
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
      if (kind !== "question") {
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
