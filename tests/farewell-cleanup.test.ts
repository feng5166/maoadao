import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 2026-08-06 review P1 的回归:「送它离开」的数据口径是**彻底删除**。
// 实际漏了三张表——CatPose / CatVoiceNote / OutboundMessage:
// 留声还挂在公开接口 /api/voice/[catId] 上放得出来,已排队的旧猫消息还会继续发到微信。
//
// 测法故意不是"建一只猫再跑一遍事务":那要跨境往返二十几次(慢且脆),
// 而且等于把实现抄一遍,以后加表照样漏。
// 改成**从 schema 反推**:凡是带 catId 的模型,releaseCat 必须清理它。
// 这才防得住真正的失败模式——将来谁加一张猫维度的表,忘了清,这里当场红。

const SCHEMA = readFileSync("prisma/schema.prisma", "utf8");
const SRC = readFileSync("lib/account-actions.ts", "utf8");
const RELEASE = SRC.slice(SRC.indexOf("export async function releaseCat"));

/** schema 里所有"以 catId 关联到猫"的模型 */
function catScopedModels(): string[] {
  const out: string[] = [];
  for (const m of SCHEMA.matchAll(/model\s+(\w+)\s*\{([\s\S]*?)\n\}/g)) {
    const [, name, body] = m;
    if (name === "Cat") continue; // 猫自己由 tx.cat.delete 收尾
    if (/^\s*catId\s+/m.test(body) || /^\s*catAId\s+/m.test(body)) out.push(name);
  }
  return out;
}

/** Prisma 客户端里的属性名:首字母小写 */
const client = (model: string) => model[0].toLowerCase() + model.slice(1);

describe("送它离开:关联数据彻底清除(review P1)", () => {
  it("schema 里每一张猫维度的表,releaseCat 都清理了", () => {
    const missing = catScopedModels().filter((m) => !new RegExp(`tx\\.${client(m)}\\.delete`).test(RELEASE));
    expect(missing, `这些表带 catId 却没在 releaseCat 里清理:${missing.join("、")}`).toEqual([]);
  });

  it("三张曾漏掉的表明确在册(回归锚点)", () => {
    for (const t of ["catPose", "catVoiceNote", "outboundMessage"]) {
      expect(RELEASE.includes(`tx.${t}.deleteMany`), `releaseCat 里缺 ${t} 的清理`).toBe(true);
    }
  });

  it("最后删的是猫本体,且回访计数归零", () => {
    expect(RELEASE.includes("tx.cat.delete(")).toBe(true);
    expect(/lastSeenDay:\s*null/.test(RELEASE)).toBe(true);
  });

  it("整段清理在一个事务里(中途失败不留半删状态)", () => {
    const txStart = RELEASE.indexOf("prisma.$transaction");
    expect(txStart).toBeGreaterThan(-1);
    expect(RELEASE.indexOf("tx.cat.delete(")).toBeGreaterThan(txStart);
  });
});
