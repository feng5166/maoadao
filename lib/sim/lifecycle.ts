// 入场准入与个体猫龄（doc/14 §一二）：
// 全岛只有一个世界日；每只猫用 firstTickDay 接入它。
// D1 完整性的度量是"用户清醒着走完相遇流程"，不是钟点数——
// 深夜领养的 D1 在睡眠中自然结束，恰好兑现"明早八点"的承诺；
// 真正要防的是清醒着被截断（早八前最后两小时领养）。

/** 最短 D1 生命周期：距下一个早八不足该小时数则跳过最近一次 tick（内测可调） */
export const MIN_ARRIVAL_HOURS = Number(process.env.MIN_ARRIVAL_HOURS ?? 2);

/** 距下一个北京时间早八还有几小时 */
export function hoursUntilNextTick(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const m = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  // 恰好 08:00 时距"下一个"早八是 24h（今天这班刚开走），不是 0
  const minutesUntil = ((8 * 60 - (h * 60 + m) + 24 * 60 - 1) % (24 * 60)) + 1;
  return minutesUntil / 60;
}

/** 领养时刻 → 第一次参与 tick 的世界日（准入门，doc/14 §二） */
export function firstTickDayFor(currentWorldDay: number, now = new Date()): number {
  return hoursUntilNextTick(now) >= MIN_ARRIVAL_HOURS ? currentWorldDay + 1 : currentWorldDay + 2;
}

/**
 * 来岛第几天（锚定 firstTickDay，不是 arrivalWorldDay）：
 * ARRIVAL 阶段（含被跳过的那天）恒为 1；第一次被 tick 的那天是 D2。
 */
export function catDayOf(worldDay: number, firstTickDay: number): number {
  return Math.max(1, worldDay - firstTickDay + 2);
}

/** 是否仍在入场阶段（D1 微型时间）：展示豁免时段门、tick 跳过它 */
export function inArrival(worldDay: number, firstTickDay: number): boolean {
  return worldDay < firstTickDay;
}
