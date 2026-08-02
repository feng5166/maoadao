// 每日出站(doc/13 T6/T7/T8):tick 叙事完成后排队,dispatch cron 错峰发送。
// 频控:每人每天全类型合计 ≤1 条;静默 22-8 不发(握手除外,不走这里);
// 出站前一律过 24h 窗口——窗口关了落 window_closed = "未寄出的信",绝不硬发。

import { randomUUID } from "node:crypto";
import { prisma } from "../db";
import { factSummary } from "../sim/engine";
import type { Fact, Segment } from "../sim/types";
import { THREAD_LABELS } from "../sim/threads";
import { catDayOf } from "../sim/lifecycle";
import { sendWechat } from "./bridge";
import { absenceMessage, d2Message, eventMessage } from "./messages";
import { safeTrack, WECHAT_KIND } from "./service";
import { hashSeed, mulberry32 } from "../sim/rng";

import { shortEntryLink } from "./entry";
const ABSENCE_GAP_DAYS = 4; // lastSeenDay 落后 ≥4 = 缺席 3 天
const ABSENCE_COOLDOWN_DAYS = 5;

/** tick 叙事完成后调用:为绑定用户排今天的一条消息(至多一条,8:00-8:40 打散) */
export async function enqueueDailyWechat(day: number): Promise<{ queued: number }> {
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  if (world?.wechatPaused) return { queued: 0 };

  const channels = await prisma.channel.findMany({ where: { kind: WECHAT_KIND, mutedAt: null } });
  let queued = 0;

  for (const ch of channels) {
    const cat = await prisma.cat.findFirst({ where: { ownerId: ch.userId } });
    if (!cat) continue;
    // 频控:今天已排过就不排
    const dup = await prisma.outboundMessage.count({ where: { userId: ch.userId, day } });
    if (dup > 0) continue;

    // 猫龄改读 firstTickDay（doc/14 §一）；0 = 未回填历史数据，回退首事件倒推
    let catDay: number;
    if (cat.firstTickDay > 0) {
      catDay = catDayOf(day, cat.firstTickDay);
    } else {
      const firstEvent = await prisma.event.findFirst({ where: { catId: cat.id }, orderBy: { day: "asc" }, select: { day: true } });
      catDay = day - (firstEvent?.day ?? day) + 1;
    }

    // 今晨主事件(事实素材,所有消息共用)
    const morningMain = await prisma.event.findFirst({
      where: { catId: cat.id, day, segment: "morning" },
      orderBy: { isMain: "desc" },
    });
    const targetName = morningMain?.targetId
      ? (await prisma.cat.findUnique({ where: { id: morningMain.targetId }, select: { name: true } }))?.name
      : undefined;
    const catById = new Map(morningMain?.targetId && targetName ? [[morningMain.targetId, { name: targetName }]] : []);
    const morningLine = morningMain
      ? factSummary(
          {
            type: morningMain.type,
            outcome: morningMain.outcome,
            data: morningMain.data as Record<string, unknown>,
            targetId: morningMain.targetId ?? undefined,
            segment: morningMain.segment as Segment,
          } as Fact,
          catById,
        )
      : "在小屋里睡了个懒觉";

    const LINK = await shortEntryLink(ch.userId); // 短链→免登录深链,直达"它现在怎么样"
    let kind: string | null = null;
    let content: string | null = null;

    if (catDay === 2) {
      // D2 兑现:必发(doc/11 消息日历)。回执摘句取第一句。
      const summary = await prisma.catDailySummary.findUnique({ where: { catId_day: { catId: cat.id, day } } });
      const respFirst = summary?.interventionResponse?.split(/[。！？\n]/)[0];
      kind = "d2_promise";
      content = d2Message(cat, morningLine, respFirst ? `${respFirst}。` : null, LINK);
    } else if (catDay > 2) {
      // 事件白名单:今天落幕的事件线 / 开店 / D7 纪念册
      const finished = await prisma.storyline.findFirst({
        where: { catId: cat.id, status: { in: ["resolved", "failed"] }, endDay: day },
      });
      const shopOpen = await prisma.event.findFirst({ where: { catId: cat.id, day, type: "shop_open" } });
      const weekBook = catDay === 7 ? await prisma.weekBook.findUnique({ where: { catId_weekIndex: { catId: cat.id, weekIndex: 1 } } }) : null;
      if (finished) {
        const label = THREAD_LABELS[finished.kind] ?? finished.kind;
        kind = "event";
        content = eventMessage(cat, `「${label}」这件事，今天有了结局。`, LINK);
      } else if (shopOpen) {
        const name = String((shopOpen.data as Record<string, unknown>).shopName ?? "小店");
        kind = "event";
        content = eventMessage(cat, `我把店开起来了——「${name}」。`, LINK);
      } else if (weekBook) {
        kind = "event";
        content = eventMessage(cat, "我们已经认识一整周了。这一周的事,我记成了一小册。", LINK);
      } else {
        // 缺席 3 天关怀(冷却 5 天)
        const owner = await prisma.user.findUnique({ where: { id: ch.userId }, select: { lastSeenDay: true } });
        const recentAbsence = await prisma.outboundMessage.count({
          where: { userId: ch.userId, kind: "absence", day: { gt: day - ABSENCE_COOLDOWN_DAYS } },
        });
        if (owner?.lastSeenDay != null && day - owner.lastSeenDay >= ABSENCE_GAP_DAYS && recentAbsence === 0) {
          kind = "absence";
          content = absenceMessage(cat, morningLine, LINK);
        }
      }
    }
    if (!kind || !content) continue;

    // 8:00-8:40 确定性打散(防群发特征)
    const rng = mulberry32(hashSeed(day, "wx-stagger", ch.userId));
    const sendAfter = new Date(Date.now() + Math.floor(rng() * 35) * 60_000);
    await prisma.outboundMessage.create({
      data: { id: randomUUID(), userId: ch.userId, catId: cat.id, day, kind, content, link: LINK, sendAfter, createdAt: new Date() },
    });
    queued++;
  }
  return { queued };
}

/** dispatch cron:发到期的队列消息。窗口关闭 → window_closed;连续全败 → 熔断。 */
export async function dispatchOutbound(): Promise<{ sent: number; windowClosed: number; failed: number; halted: boolean }> {
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  if (world?.wechatPaused) return { sent: 0, windowClosed: 0, failed: 0, halted: true };

  const due = await prisma.outboundMessage.findMany({
    where: { status: "queued", sendAfter: { lte: new Date() } },
    orderBy: { sendAfter: "asc" },
    take: 50,
  });
  let sent = 0, windowClosed = 0, failed = 0;

  for (const msg of due) {
    const ch = await prisma.channel.findFirst({ where: { userId: msg.userId, kind: WECHAT_KIND } });
    if (!ch || ch.mutedAt) {
      await prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: "window_closed" } });
      continue;
    }
    // 24h 硬窗口(doc/11 §六):关了就是未寄出的信,绝不硬发
    if (!ch.windowOpenUntil || ch.windowOpenUntil < new Date()) {
      await prisma.outboundMessage.update({ where: { id: msg.id }, data: { status: "window_closed" } });
      await safeTrack("wechat_window_closed_drop", { kind: msg.kind });
      windowClosed++;
      continue;
    }
    const r = await sendWechat(ch.externalId, msg.content);
    await prisma.outboundMessage.update({
      where: { id: msg.id },
      data: { status: r.ok ? "sent" : "failed", sentAt: r.ok ? new Date() : null },
    });
    if (r.ok) {
      sent++;
      // 猫主动开口 = 新一轮对话:清零当日回复计数,用户回应推送必得实质回复(一来一回语义)
      await prisma.channel.update({ where: { id: ch.id }, data: { repliesInDay: 0 } }).catch(() => {});
      await safeTrack("wechat_msg_sent", { kind: msg.kind });
    } else {
      failed++;
      console.error("[wechat] 发送失败:", msg.id, r.detail);
    }
  }

  // 熔断(doc/13 T8):本批全败且 ≥3 → 自动停发,防止对着坏通道持续输出
  let halted = false;
  if (failed >= 3 && sent === 0) {
    await prisma.worldState.update({ where: { id: 1 }, data: { wechatPaused: true } });
    console.error("[wechat] 连续发送失败,通道已自动熔断——检查 openclaw 网关后在后台恢复");
    halted = true;
  }
  return { sent, windowClosed, failed, halted };
}
