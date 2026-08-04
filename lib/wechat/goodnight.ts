// 晚安(2026-08-04 拍板:每日仪式,21:00):猫睡前跟主人道一声晚安。
// 早安+晚安是每天的两次心跳,不占事件信的频控位;窗口关了安静跳过,绝不硬发。
// 每隔几天,晚安随一张"今天岛上的一幕"(明信片并入晚安,不再单独占一条)。

import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { factSummary } from "../sim/engine";
import type { Fact } from "../sim/types";
import { sendWechat, sendWechatImage } from "./bridge";
import { goodnightMessage } from "./messages";
import { safeTrack, WECHAT_KIND } from "./service";
import { shortEntryLink } from "./entry";
import { pickMoment } from "./postcard";
import { hashSeed } from "../sim/rng";

export interface GoodnightResult {
  day: number;
  sent: number;
  withImage: number;
  windowClosed: number;
  failed: number;
  dryRun: boolean;
  preview: string[];
}

export async function sendGoodnight(opts: { dryRun?: boolean } = {}): Promise<GoodnightResult> {
  const dryRun = Boolean(opts.dryRun);
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  const day = world?.day ?? 0;
  const out: GoodnightResult = { day, sent: 0, withImage: 0, windowClosed: 0, failed: 0, dryRun, preview: [] };
  if (!world || world.wechatPaused) return out;

  const channels = await prisma.channel.findMany({ where: { kind: WECHAT_KIND, mutedAt: null } });
  // 三天左右带一次图:全体同一天带,素材是当天头条(和今日页同源)
  const withMoment = hashSeed(day, "goodnight-img") % 3 === 0;
  const moment = withMoment ? await pickMoment(day) : null;

  for (const ch of channels) {
    const cat = await prisma.cat.findFirst({ where: { ownerId: ch.userId } });
    if (!cat) continue;
    // 幂等:今晚已道过晚安就不再发(cron 重试安全)
    const dup = await prisma.outboundMessage.count({ where: { userId: ch.userId, day, kind: "goodnight" } });
    if (dup > 0) continue;
    const windowOpen = ch.windowOpenUntil && ch.windowOpenUntil >= new Date();

    // 素材:今晚的事 > 明日盼头 > 安静的一天
    const eveningMain = await prisma.event.findFirst({
      where: { catId: cat.id, day, segment: "evening" },
      orderBy: { isMain: "desc" },
    });
    const targetName = eveningMain?.targetId
      ? (await prisma.cat.findUnique({ where: { id: eveningMain.targetId }, select: { name: true } }))?.name
      : undefined;
    const eveningLine = eveningMain
      ? factSummary(
          {
            type: eveningMain.type,
            outcome: eveningMain.outcome,
            data: eveningMain.data as Record<string, unknown>,
            targetId: eveningMain.targetId ?? undefined,
          } as Fact,
          new Map(eveningMain.targetId && targetName ? [[eveningMain.targetId, { name: targetName }]] : []),
        )
      : null;
    const summary = await prisma.catDailySummary.findUnique({ where: { catId_day: { catId: cat.id, day } } });

    const LINK = await shortEntryLink(ch.userId);
    const content = goodnightMessage(cat, { eveningLine, hook: summary?.tomorrowHook ?? null }, LINK, day);
    out.preview.push(content.slice(0, 60));
    if (dryRun) continue;

    // 窗口关了:不硬发,但把晚安落成"未寄出的信"(doc/17 断链召回)——
    // 主人回到网页会看到猫昨晚没送出去的话,说一句就能叫醒海螺
    if (!windowOpen) {
      out.windowClosed++;
      await prisma.outboundMessage.create({
        data: {
          id: randomUUID(), userId: ch.userId, catId: cat.id, day, kind: "goodnight",
          content, link: LINK, status: "window_closed", sendAfter: new Date(), createdAt: new Date(),
        },
      });
      await safeTrack("wechat_window_closed_drop", { kind: "goodnight" });
      continue;
    }

    const r = moment
      ? await sendWechatImage(ch.externalId, moment.imgB64, content)
      : await sendWechat(ch.externalId, content);
    await prisma.outboundMessage.create({
      data: {
        id: randomUUID(),
        userId: ch.userId,
        catId: cat.id,
        day,
        kind: "goodnight",
        content,
        link: LINK,
        status: r.ok ? "sent" : "failed",
        sendAfter: new Date(),
        sentAt: r.ok ? new Date() : null,
        createdAt: new Date(),
      },
    });
    if (r.ok) {
      out.sent++;
      if (moment) out.withImage++;
      await prisma.channel.update({ where: { id: ch.id }, data: { repliesInDay: 0 } }).catch(() => {});
      await safeTrack("wechat_msg_sent", { kind: "goodnight" });
    } else {
      out.failed++;
      console.error("[goodnight] 发送失败:", ch.userId, r.detail);
    }
  }
  return out;
}
