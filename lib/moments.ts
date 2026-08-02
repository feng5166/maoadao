// "它现在怎么样"（doc/09 §5）：把当日事实按现实时段解锁成"此刻"。
// tick 早上八点照旧一次生成整天；这里只做展示层的时间门——
// 上午的事 8 点起可见，下午的事 13 点起浮现，晚上的事 18 点起；日记仍是一天的收束。
// 此刻状态行 = 当前时段事件的现在时改写（纯模板，不调 LLM，全部基于事实）。

import type { Segment } from "./sim/types";

/** 北京时间小时数（服务器可能不在东八区，展示一律按用户的一天走） */
export function beijingHour(now = new Date()): number {
  return Number(
    new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Shanghai", hour: "numeric", hour12: false }).format(now),
  ) % 24;
}

/** 当前现实时刻已经"过完"的时段（时间门） */
export function unlockedSegments(hour: number): Segment[] {
  if (hour < 8) return ["morning", "afternoon", "evening"]; // 凌晨：昨天已完整过完
  if (hour < 13) return ["morning"];
  if (hour < 18) return ["morning", "afternoon"];
  return ["morning", "afternoon", "evening"];
}

/** 现在时刻对应的时段（此刻它"正在"哪个时段里）；夜里返回 null = 睡了 */
export function currentSegment(hour: number): Segment | null {
  if (hour >= 8 && hour < 13) return "morning";
  if (hour >= 13 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return null;
}

export interface NowEvent {
  type: string;
  data: Record<string, unknown>;
  targetName?: string | null;
}

/** 此刻状态行：当前时段的事实 → 一句现在时。绝不引入事实之外的细节。 */
export function nowLine(catName: string, ev: NowEvent | null, hour: number, location?: string | null): string {
  const seg = currentSegment(hour);
  if (seg === null) {
    if (hour >= 22 || hour < 6) return `这个点，${catName}已经睡下了。`;
    return `天刚亮，${catName}还没起。`;
  }
  if (!ev) return `${catName}现在在${location ?? "自家小屋"}待着。`;
  const d = ev.data;
  const at = (fallback: string) => String(d.location ?? location ?? fallback);
  switch (ev.type) {
    case "fish":
      return `${catName}现在在${at("海边礁石")}钓鱼。`;
    case "explore":
      return `${catName}现在在${at("岛上")}附近晃悠。`;
    case "odd_job":
      return `${catName}现在在给${d.boss}帮工——${d.what}。`;
    case "market":
      return `${catName}现在在集市广场逛摊。`;
    case "rest":
      return `${catName}现在在${at("自家小屋")}，${d.pose ?? "蜷着"}，睡得正香。`;
    case "stargaze":
      return `${catName}现在在${at("灯塔坡")}看星星，${d.sky ?? "夜色很好"}。`;
    case "visit":
      return ev.targetName ? `${catName}现在在${ev.targetName}家串门。` : `${catName}现在出门串门去了。`;
    case "gossip":
      return ev.targetName ? `${catName}现在正缠着${ev.targetName}打听新鲜事。` : `${catName}现在在外面打听新鲜事。`;
    case "borrow_money":
      return ev.targetName ? `${catName}现在在${ev.targetName}那儿，磨一件不太好开口的事。` : `${catName}现在在办一件不太好开口的事。`;
    case "quarrel":
      return ev.targetName ? `${catName}现在和${ev.targetName}呛上了，谁也不让谁。` : `${catName}现在正跟谁呛着呢。`;
    case "shop_open":
    case "shop_day":
      return d.shopName ? `${catName}现在守在「${d.shopName}」里。` : `${catName}现在在自己店里忙活。`;
    case "debt_collect":
      return `${catName}现在被${d.creditorName ?? "债主"}堵在门口，正在想辙。`;
    case "debt_repay":
      return `${catName}现在揣着鱼币出门了，去办一件郑重的事。`;
    default:
      // 事件线/委托等：不细说，留悬念
      return `${catName}现在在${location ?? "岛上"}，心里揣着一件事。`;
  }
}
