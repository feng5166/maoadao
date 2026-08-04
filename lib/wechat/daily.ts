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
import { absenceMessage, d2Message, echoMessage, eventMessage, firstTimeMessage, morningMessage, namingEchoMessage } from "./messages";
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

    // ============ 习惯环 V2(doc/19)早晨选稿:兑现 > 剧情 > 第一次 > 缺席 > D1-3 保底 > 静默 ============
    // 每日至多一个主触点;没有值得说的事就不发——粘性来自"回一句明天有痕迹",不来自频率
    const summary = await prisma.catDailySummary.findUnique({ where: { catId_day: { catId: cat.id, day } } });
    if (catDay === 2) {
      // D2 兑现:必发(doc/11 消息日历,一次性关系契约)。回执摘句取第一句。
      const respFirst = summary?.interventionResponse?.split(/[。！？\n]/)[0];
      kind = "d2_promise";
      content = d2Message(cat, morningLine, respFirst ? `${respFirst}。` : null, LINK);
    } else if (catDay > 2) {
      const finished = await prisma.storyline.findFirst({
        where: { catId: cat.id, status: { in: ["resolved", "failed"] }, endDay: day },
      });
      const shopOpen = await prisma.event.findFirst({ where: { catId: cat.id, day, type: "shop_open" } });
      const weekBook = catDay === 7 ? await prisma.weekBook.findUnique({ where: { catId_weekIndex: { catId: cat.id, weekIndex: 1 } } }) : null;
      // 第一次侦测:今天出现了此前从未有过的事件类型(值得郑重告诉主人的小纪念)
      const NOTABLE_FIRSTS = new Set(["fish", "stargaze", "explore", "visit", "market", "odd_job"]);
      const todayTypes = [...new Set((await prisma.event.findMany({ where: { catId: cat.id, day }, select: { type: true } })).map((e) => e.type))].filter((t) => NOTABLE_FIRSTS.has(t));
      const priorTypes = todayTypes.length
        ? new Set((await prisma.event.groupBy({ by: ["type"], where: { catId: cat.id, day: { lt: day }, type: { in: todayTypes } } })).map((g) => g.type))
        : new Set<string>();
      const firstType = todayTypes.find((t) => !priorTypes.has(t));

      // 命名兑现(V2 P2,优先于普通 echo):昨晚问了名字且主人回了 → 名字进记忆,长期复用
      const namingQ = await prisma.outboundMessage.findFirst({
        where: { userId: ch.userId, kind: "question_name", day: day - 1, status: "sent" },
      });
      const nameReply = namingQ?.sentAt
        ? await prisma.wechatMessageLog.findFirst({
            where: { userId: ch.userId, matched: "nudge", createdAt: { gt: namingQ.sentAt } },
            orderBy: { createdAt: "asc" },
          })
        : null;
      if (namingQ && nameReply) {
        const obj = namingQ.content.match(/捡到(.+?),/)?.[1] ?? "那件小东西";
        const objName = nameReply.text.trim().slice(0, 12);
        await prisma.memoryEntry.create({
          data: {
            id: randomUUID(), catId: cat.id, day, kind: "semantic", importance: 7,
            content: `它把那天捡的${obj}起名叫「${objName}」——名字是主人取的,它一直用着。`,
          },
        }).catch(() => {});
        kind = "echo";
        content = namingEchoMessage(cat, obj, objName, LINK);
      } else if (summary?.interventionResponse) {
        // 兑现(最高优先):昨天主人说了话,今天猫的回应必须送到手机上——习惯环的核心一扣
        const respFirst = summary.interventionResponse.split(/\n/)[0];
        kind = "echo";
        content = echoMessage(cat, respFirst, LINK);
      } else if (finished) {
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
      } else if (firstType) {
        kind = "first_time";
        content = firstTimeMessage(cat, morningLine, LINK);
      } else {
        // 缺席 3 天关怀(冷却 5 天)
        const owner = await prisma.user.findUnique({ where: { id: ch.userId }, select: { lastSeenDay: true } });
        const recentAbsence = await prisma.outboundMessage.count({
          where: { userId: ch.userId, kind: "absence", day: { gt: day - ABSENCE_COOLDOWN_DAYS } },
        });
        if (owner?.lastSeenDay != null && day - owner.lastSeenDay >= ABSENCE_GAP_DAYS && recentAbsence === 0) {
          kind = "absence";
          content = absenceMessage(cat, morningLine, LINK);
        } else if (catDay === 3) {
          // D1-3 关系建立期保底(D3 唯一还发普通早安的日子);D4+ 无高价值内容就静默,
          // 晚间档(goodnight cron)还有问题/图片的机会
          const lastInbound = ch.windowOpenUntil ? new Date(ch.windowOpenUntil.getTime() - 24 * 3600_000) : null;
          const yesterdayEve = new Date();
          yesterdayEve.setHours(yesterdayEve.getHours() - 14);
          const repliedLastNight = Boolean(lastInbound && lastInbound >= yesterdayEve);
          kind = "morning";
          content = morningMessage(cat, morningLine, world?.weather ?? "晴", LINK, day, repliedLastNight);
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
