import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 鱼币守恒(2026-08-07 review P2)。
// 原先 applyResult 只作用于行动猫:借方到手 20 币而债主分文未少,还钱时借方扣了钱、
// 债主也没收到 —— 岛上的鱼币总量凭空生灭。转账类事件必须两侧都记。
//
// 引擎跑一天要真库 + 一整套快照,单测里不划算;这里钉住的是**账要两边记**这条不变量:
// 凡是把币从一只猫转到另一只猫的 resolve,都得带 otherDeltas。

const TEMPLATES = readFileSync("lib/sim/templates.ts", "utf8");
const THREADS = readFileSync("lib/sim/threads.ts", "utf8");
const ENGINE = readFileSync("lib/sim/engine.ts", "utf8");

describe("鱼币守恒:转账两侧都要记账", () => {
  it("引擎会应用 otherDeltas(不然写了也白写)", () => {
    expect(ENGINE.includes("res.otherDeltas")).toBe(true);
    // 对方不在本次模拟范围内要跳过,不凭空建状态
    expect(/const other = states\.get\([\s\S]{0,40}if \(!other\) continue/.test(ENGINE)).toBe(true);
  });

  it("借钱:借方拿到多少,债主就少多少", () => {
    // 全借档
    const full = TEMPLATES.slice(TEMPLATES.indexOf("asked: ask, got: ask"), TEMPLATES.indexOf("asked: ask, got: ask") + 400);
    expect(/deltas: \{ coins: ask/.test(full)).toBe(true);
    expect(/otherDeltas:.*coins: -ask/.test(full), "债主那侧没扣钱 = 鱼币凭空多出来").toBe(true);
    // 借一半档
    const half = TEMPLATES.slice(TEMPLATES.indexOf("asked: ask, got },"), TEMPLATES.indexOf("asked: ask, got },") + 400);
    expect(/deltas: \{ coins: got/.test(half)).toBe(true);
    expect(/otherDeltas:.*coins: -got/.test(half), "借一半时债主那侧没扣钱").toBe(true);
  });

  it("还钱:借方扣多少,债主就收多少", () => {
    const repay = THREADS.slice(THREADS.indexOf('stepTemplate("debt_repay"'), THREADS.indexOf('stepTemplate("debt_repay"') + 600);
    expect(/deltas: \{ coins: -amount/.test(repay)).toBe(true);
    expect(/otherDeltas:.*coins: amount/.test(repay), "债主没收到钱 = 还的钱凭空消失").toBe(true);
  });

  it("转账金额左右相等(不是随手写个数)", () => {
    // 借:+ask / -ask、+got / -got;还:-amount / +amount —— 成对出现,量相同
    for (const [give, take] of [["coins: ask", "coins: -ask"], ["coins: got", "coins: -got"]]) {
      expect(TEMPLATES.includes(give) && TEMPLATES.includes(take)).toBe(true);
    }
    expect(THREADS.includes("coins: -amount") && THREADS.includes("coins: amount")).toBe(true);
  });
});
