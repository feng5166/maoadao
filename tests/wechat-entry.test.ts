import { config } from "dotenv";
config({ path: [".env.local", ".env"], override: true });

import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";

// 2026-08-06 review P1 的回归:注册用户(已设密码)从微信深链回岛必须真的登进来。
//
// 原实现只写 maoadao_uid cookie,而 lib/identity.ts 明确拒绝"已设密码 + 无有效会话"
// 的 uid —— 于是注册用户在微信内置浏览器点开链接,会被当成未登录、一路跳去领养页。
// 修法是把签名令牌兑换成一行可撤销的 Session(startSession)。
//
// 入口是 Route Handler,依赖 cookies()/redirect() 请求上下文,单测里跑不起来;
// 这里锁住两件能静态判定、且正是当初出错的地方:
//   ① 入口确实建会话,而不是只种 uid;
//   ② identity 的"有密码必须走会话"这条规则还在(它是本 bug 的另一半前提)。
describe("微信深链回岛(review P1)", () => {
  it("入口兑换的是会话,不是裸 uid cookie", async () => {
    const src = await readFile("app/api/wechat/entry/route.ts", "utf8");
    expect(src.includes("startSession"), "入口没建会话:已设密码的用户会被当成未登录").toBe(true);
    expect(/jar\.set\(\s*COOKIE/.test(src), "还在手写 uid cookie —— 那正是修掉的写法").toBe(false);
  });

  it("身份解析仍坚持:有密码就必须有会话", async () => {
    const src = await readFile("lib/identity.ts", "utf8");
    expect(src.includes("passwordHash")).toBe(true);
    // 这条规则本身是对的(否则"踢出其他设备"形同虚设),不能为了让深链能用而放宽
    expect(/if \(user\?\.passwordHash\) return \{ userId: null/.test(src)).toBe(true);
  });

  it("令牌过期即失效(72h),过期令牌换不到身份", async () => {
    const { signEntryToken, verifyEntryToken } = await import("../lib/wechat/entry");
    const now = Date.now();
    const token = signEntryToken("u-test", now);
    expect(verifyEntryToken(token, now + 3600_000)).toBe("u-test");
    expect(verifyEntryToken(token, now + 73 * 3600_000)).toBeNull();
  });

  it("篡改的令牌换不到身份", async () => {
    const { signEntryToken, verifyEntryToken } = await import("../lib/wechat/entry");
    const token = signEntryToken("u-test");
    const dot = token.lastIndexOf(".");
    const forged = `${Buffer.from(`u-victim.${Date.now() + 3600_000}`).toString("base64url")}${token.slice(dot)}`;
    expect(verifyEntryToken(forged)).toBeNull();
  });
});

// P3 视觉规范:微信与邮件也是用户触点,同样禁 emoji(AGENTS.md §1)
describe("岛外触点不出 emoji(review P3)", () => {
  const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

  /** 只看会送到用户眼前的字符串字面量——注释里写"原先是 🐱"是交代历史,不是违规 */
  function emojiInLiterals(src: string): string[] {
    const hits: string[] = [];
    for (const line of src.split("\n")) {
      const code = line.replace(/^\s*\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
      for (const m of code.matchAll(/(["'`])((?:\\.|(?!\1)[^\\])*)\1/g)) {
        if (EMOJI.test(m[2])) hits.push(m[2].slice(0, 40));
      }
    }
    return hits;
  }

  it("微信消息文案层零 emoji", async () => {
    const src = await readFile("lib/wechat/messages.ts", "utf8");
    expect(emojiInLiterals(src)).toEqual([]);
  });

  it("邮件模板零 emoji", async () => {
    const src = await readFile("lib/email.ts", "utf8");
    expect(emojiInLiterals(src)).toEqual([]);
  });
});
