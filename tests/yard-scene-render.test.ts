import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ZONES, spotFor, zoneOfSlot, furTintOf, type ZoneKey } from "../lib/yard/scene-render";

// Renderer 第一刀 CI（11 §12.9 C Gate 附带规则）：
// Trace 合法落位——绘制位置必须在其事实区域 footprint 内，允许区内可读性偏移，
// 禁止跨区；可读性门——不发光、不描边、不跳动。

describe("合法落位规则（C Gate）", () => {
  it("所有候选点都在本 zone 的 footprint 内（合法偏移由构造保证）", () => {
    for (const [name, z] of Object.entries(ZONES)) {
      for (const s of [...z.catSpots, ...z.traceSpots]) {
        expect(s.x, `${name} spot.x`).toBeGreaterThanOrEqual(z.footprint.x);
        expect(s.x, `${name} spot.x`).toBeLessThanOrEqual(z.footprint.x + z.footprint.w);
        expect(s.y, `${name} spot.y`).toBeGreaterThanOrEqual(z.footprint.y);
        expect(s.y, `${name} spot.y`).toBeLessThanOrEqual(z.footprint.y + z.footprint.h);
      }
    }
  });

  it("选点确定性 + 永不跨区：同事实同落点，且落点 ∈ 本 zone 候选", () => {
    for (const zone of Object.keys(ZONES) as ZoneKey[]) {
      for (const kind of ["cat", "trace"] as const) {
        const a = spotFor(zone, kind, "visit:x1");
        const b = spotFor(zone, kind, "visit:x1");
        expect(b).toEqual(a); // 语义确定性
        const pool = kind === "cat" ? ZONES[zone].catSpots : ZONES[zone].traceSpots;
        expect(pool).toContainEqual(a); // 树下的爪印挪不去屋檐下
      }
    }
  });

  it("zone 由事实槽位决定：eaves/tree 各归各，其余归 clearing", () => {
    expect(zoneOfSlot("eaves")).toBe("eaves");
    expect(zoneOfSlot("tree")).toBe("tree");
    expect(zoneOfSlot("clearing")).toBe("clearing");
    expect(zoneOfSlot(null)).toBe("clearing");
    expect(zoneOfSlot(undefined)).toBe("clearing");
  });
});

describe("可读性门与纪律（静态看守）", () => {
  const SRC = readFileSync("lib/yard/scene-render.ts", "utf8");

  it("Trace 不发光不描边不跳动：SVG 无 filter/animate/stroke-dash 闪烁类", () => {
    expect(SRC).not.toContain("<filter");
    expect(SRC).not.toContain("feGaussianBlur");
    expect(SRC).not.toContain("<animate");
    expect(SRC).not.toContain("animation");
  });

  it("Renderer 不连库、不写世界（资产装配由调用方注入）", () => {
    expect(SRC).not.toContain("prisma");
    expect(SRC).not.toContain("./commands");
    expect(SRC).not.toContain("./settle");
    expect(SRC).not.toContain("./clues");
  });

  it("毛色痕 → 绒毛色映射齐全（世界语言同源）", () => {
    expect(furTintOf("落了一撮深黑色的毛")).toContain("58");
    expect(furTintOf("落了一撮橘色的毛")).not.toBe(furTintOf("落了一撮银灰色的毛"));
    expect(furTintOf("落了一撮说不上颜色的毛")).toBeTruthy();
  });
});
