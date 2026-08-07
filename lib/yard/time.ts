// 院子窗口时间轴（doc2.0/16 §三；数值在 lib/yard/config.ts）。
// 北京时固定 UTC+8；v0 独立于 WorldState.day（tick 管世界的一天，
// Visit Window 管院子的实验节拍——16 合回 Simulation 节），映射可替换。

import { WINDOWS } from "./config";

const BJ_OFFSET_MS = 8 * 3600_000;

function bjParts(d: Date): { y: number; m: number; day: number; minutes: number } {
  const t = new Date(d.getTime() + BJ_OFFSET_MS);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, day: t.getUTCDate(), minutes: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

export function dayKeyOf(d: Date): string {
  const p = bjParts(d);
  return `${p.y}${String(p.m).padStart(2, "0")}${String(p.day).padStart(2, "0")}`;
}

/** 此刻属于哪个窗 */
export function windowAt(d: Date): { dayKey: string; windowIndex: number } {
  const p = bjParts(d);
  const w = WINDOWS.find((w) => p.minutes >= w.startMin && p.minutes < w.endMin) ?? WINDOWS[WINDOWS.length - 1];
  return { dayKey: dayKeyOf(d), windowIndex: w.index };
}

/** 窗口起点（绝对时间）——快照与结算的锚点：晚算不晚取（16 快照红线） */
export function windowStart(dayKey: string, windowIndex: number): Date {
  const y = Number(dayKey.slice(0, 4));
  const m = Number(dayKey.slice(4, 6));
  const day = Number(dayKey.slice(6, 8));
  const w = WINDOWS[windowIndex];
  return new Date(Date.UTC(y, m - 1, day, 0, w.startMin, 0) - BJ_OFFSET_MS);
}

export function windowLenMin(windowIndex: number): number {
  const w = WINDOWS[windowIndex];
  return w.endMin - w.startMin;
}

/** [from, to] 内已开始的窗，按起点时间升序（lazy settlement 的补算清单） */
export function startedWindowsBetween(from: Date, to: Date): Array<{ dayKey: string; windowIndex: number; startAt: Date }> {
  const seen = new Map<string, { dayKey: string; windowIndex: number; startAt: Date }>();
  // 逐日枚举（前后各多看一天，覆盖深夜长窗跨界）
  for (let t = from.getTime() - 86400_000; t <= to.getTime() + 86400_000; t += 86400_000) {
    const dk = dayKeyOf(new Date(t));
    for (const w of WINDOWS) {
      const startAt = windowStart(dk, w.index);
      if (startAt.getTime() >= from.getTime() && startAt.getTime() <= to.getTime()) {
        seen.set(`${dk}:${w.index}`, { dayKey: dk, windowIndex: w.index, startAt });
      }
    }
  }
  return [...seen.values()].sort((a, b) => a.startAt.getTime() - b.startAt.getTime());
}
