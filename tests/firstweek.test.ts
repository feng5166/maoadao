import { describe, expect, it } from "vitest";
import { FORM_RULES, THEME_NARRATION_RULES, bondStage, firstWeekPlan } from "../lib/sim/firstweek";

describe("首周导演计划", () => {
  it("只覆盖来岛第 1-7 天", () => {
    expect(firstWeekPlan(0)).toBeNull();
    expect(firstWeekPlan(8)).toBeNull();
    for (let d = 1; d <= 7; d++) expect(firstWeekPlan(d)).not.toBeNull();
  });

  it("七天主题曲线：相遇→记住→意外→关系→冲突→选择→回顾", () => {
    const themes = Array.from({ length: 7 }, (_, i) => firstWeekPlan(i + 1)!.theme);
    expect(themes).toEqual(["相遇", "记住", "意外", "关系", "冲突", "选择", "回顾"]);
  });

  it("D3 压低建议权重（能影响不能控制），其余天加成", () => {
    expect(firstWeekPlan(3)!.suggestionMultiplier).toBeLessThan(1);
    expect(firstWeekPlan(2)!.suggestionMultiplier).toBeGreaterThan(1);
  });

  it("D4 聚焦头号朋友，D5 冲突加成", () => {
    expect(firstWeekPlan(4)!.focusTopNpc).toBe(true);
    expect(firstWeekPlan(5)!.focusTopNpc).toBe(false);
    expect(firstWeekPlan(5)!.conflictBoost).toBeGreaterThan(1);
    expect(firstWeekPlan(6)!.conflictBoost).toBe(1);
  });

  it("每个主题和形态都有叙事规则文本", () => {
    for (let d = 1; d <= 7; d++) {
      const p = firstWeekPlan(d)!;
      expect(THEME_NARRATION_RULES[p.theme]).toBeTruthy();
      expect(FORM_RULES[p.form]).toBeDefined();
    }
  });
});

describe("主人关系四阶段（自然语言，不因缺席惩罚）", () => {
  it("阶段只升不看缺席：第一天没留言也是阶段 1，有温度的话", () => {
    const b = bondStage(1, 0, 0);
    expect(b.stage).toBe(1);
    expect(b.line.length).toBeGreaterThan(0);
  });

  it("留过话就进阶段 2", () => {
    expect(bondStage(2, 1, 1).stage).toBe(2);
  });

  it("持续互动到阶段 3、4", () => {
    expect(bondStage(4, 3, 2).stage).toBe(3);
    expect(bondStage(7, 4, 4).stage).toBe(4);
  });

  it("缺席多天不降级：第 7 天只留过 1 句话仍是阶段 2，不是阶段 1", () => {
    expect(bondStage(7, 1, 1).stage).toBe(2);
  });

  it("阶段文案不含系统词", () => {
    for (const args of [[1, 0, 0], [2, 1, 1], [4, 3, 2], [7, 4, 4]] as const) {
      const { line } = bondStage(...args);
      expect(line).not.toMatch(/AI|系统|数值|等级|好感度/);
    }
  });
});
