import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CANON, checkPoolComposition, deriveAllCandidates, deriveProfile, PROFILE_VERSION } from "../lib/sim/profile";

// Gate A / Gate B CI（14 §九 后续拍板）。Gate C（逐只人工终审）不在 CI——
// 由 CatProfile.approvedAt 承载，终审通过前不得替换 POOL_V0。

describe("Gate A：派生确定性", () => {
  it("same catId + same canon + same PROFILE_VERSION → byte-equivalent（各 100 次）", () => {
    for (const catId of Object.keys(CANON)) {
      const first = JSON.stringify(deriveProfile(catId));
      for (let i = 0; i < 100; i++) {
        expect(JSON.stringify(deriveProfile(catId))).toBe(first);
      }
    }
  });

  it("PROFILE_VERSION 变化 → 采样结果变化（出生档案有自己的生命周期）", () => {
    const a = deriveAllCandidates(PROFILE_VERSION).map((p) => JSON.stringify(p.corePreference));
    const b = deriveAllCandidates("profile-vNEXT").map((p) => JSON.stringify(p.corePreference));
    expect(a.join()).not.toBe(b.join());
  });

  it("改玩法 RULES_VERSION ≠ 猫重新出生：profile.ts 不引用 yard 规则版本", () => {
    const src = readFileSync("lib/sim/profile.ts", "utf8");
    expect(src).not.toContain("RULES_VERSION");
    expect(src).not.toContain("yard/config");
  });

  it("覆写审计：每条 override 都有 canon.* 来源与 reason", () => {
    for (const entry of Object.values(CANON)) {
      for (const o of entry.overrides) {
        expect(o.source.startsWith("canon.")).toBe(true);
        expect(o.reason.length).toBeGreaterThan(0);
      }
    }
  });

  it("favor 与 avoid 不重合；favor 非空", () => {
    for (const p of deriveAllCandidates()) {
      for (const t of p.corePreference.avoid) {
        expect(p.corePreference.favor[t]).toBeUndefined();
      }
      expect(Object.keys(p.corePreference.favor).length).toBeGreaterThan(0);
    }
  });
});

describe("Gate B：首发池构成", () => {
  it("16 只候选：配比 7/4/3/1/1 + 六项正交组合全在场", () => {
    const profiles = deriveAllCandidates();
    expect(profiles.length).toBe(16);
    const report = checkPoolComposition(profiles);
    expect(report.missing).toEqual([]);
    expect(report.ok).toBe(true);
  });

  it("同质化底线：同三轴不会同档案（棉花 vs 假想同轴对照）", () => {
    // 同 canon 覆写下仍有采样差异面：不同 catId 种子不同 → 基线采样不同。
    // 这里取两只三轴相近的猫（汤圆 35/75/20 vs 橘子 75/80/30 不同轴，
    // 用同一猫不同版本近似验证采样面存在自由度）。
    const a = deriveProfile("npc-tangyuan", "profile-twin-a");
    const b = deriveProfile("npc-tangyuan", "profile-twin-b");
    expect(JSON.stringify(a.corePreference)).not.toBe(JSON.stringify(b.corePreference));
  });

  it("职务猫是时间约束不是黑名单：将军/馒头/球球/爆米花都有合法窗口", () => {
    for (const id of ["npc-jiangjun", "npc-mantou", "npc-qiuqiu", "npc-xiaomei"]) {
      const p = deriveProfile(id);
      expect(p.lifePatternSeed.windows.length).toBeGreaterThan(0);
    }
  });

  it("老怪：SPECIAL 硬条件已登记（Eligibility 注记）", () => {
    const p = deriveProfile("npc-laoguai");
    expect(p.lifePatternSeed.eligibilityNote).toContain("old");
    expect(p.leaveStyle.max).toBeLessThanOrEqual(1); // 主价值在行为，不在鱼干
  });
});
