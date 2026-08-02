import { describe, expect, it } from "vitest";
import { catDayOf, firstTickDayFor, hoursUntilNextTick, inArrival } from "../lib/sim/lifecycle";

// 北京时间某时刻的 Date（北京 = UTC+8）
function beijing(h: number, m = 0): Date {
  return new Date(Date.UTC(2026, 7, 2, (h - 8 + 24) % 24, m));
}

describe("入场准入门（doc/14 §二）", () => {
  it("距早八的小时数", () => {
    expect(hoursUntilNextTick(beijing(6, 0))).toBe(2);
    expect(hoursUntilNextTick(beijing(7, 55))).toBeCloseTo(5 / 60, 5);
    expect(hoursUntilNextTick(beijing(8, 0))).toBe(24);
    expect(hoursUntilNextTick(beijing(23, 30))).toBe(8.5);
  });

  it("14:30 领养 → 参加次日早八 tick", () => {
    expect(firstTickDayFor(19, beijing(14, 30))).toBe(20);
  });
  it("23:30 领养 → 参加次日早八 tick", () => {
    expect(firstTickDayFor(19, beijing(23, 30))).toBe(20);
  });
  it("03:00 领养 → 参加当日早八 tick（用户在睡觉，醒来正好 D2，兑现'明早八点'）", () => {
    expect(firstTickDayFor(19, beijing(3, 0))).toBe(20);
  });
  it("07:55 领养 → 跳过最近一次 tick，保持 D1（清醒着被截断是唯一病例）", () => {
    expect(firstTickDayFor(19, beijing(7, 55))).toBe(21);
  });
});

describe("个体猫龄锚定 firstTickDay（doc/14 §一）", () => {
  it("正常入场：到岸日 D1，首个 tick 日 D2", () => {
    // arrivalWorldDay=19, firstTickDay=20
    expect(catDayOf(19, 20)).toBe(1);
    expect(catDayOf(20, 20)).toBe(2);
    expect(catDayOf(26, 20)).toBe(8);
  });
  it("被跳过一天的入场：中间那天仍是 D1，被首次 tick 的那天才是 D2", () => {
    // arrivalWorldDay=19, firstTickDay=21（07:55 领养）
    expect(catDayOf(19, 21)).toBe(1);
    expect(catDayOf(20, 21)).toBe(1); // 被跳过的那天：无事件、保持 D1
    expect(catDayOf(21, 21)).toBe(2);
  });
  it("ARRIVAL 阶段判定", () => {
    expect(inArrival(19, 20)).toBe(true);
    expect(inArrival(20, 20)).toBe(false);
    expect(inArrival(20, 21)).toBe(true);
  });
});
