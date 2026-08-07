// 微信深链免登录(doc/11 修订·门铃规则 §五):消息里的链接要"单击找到猫",
// 而微信内置浏览器没有岛民 cookie——用短期 HMAC 令牌换 cookie,落到"它现在怎么样"。
// 令牌只认 userId + 过期时间,72h 有效;密钥复用 AUTH_SECRET。

import { createHmac, timingSafeEqual } from "node:crypto";
import { SITE_URL } from "../site";

const TTL_MS = 72 * 3600_000;

// 生产上密钥缺失必须硬失败(2026-08-07 review P2):原先回退空串——
// 签名密钥是空的,等于任何人都能自己造一个"以某某身份回岛"的令牌,配置一时疏忽
// 就演变成账号接管。开发环境允许弱回退,方便本地跑通链路。
function secret(): string {
  const s = process.env.AUTH_SECRET ?? process.env.WECHAT_BRIDGE_SECRET ?? "";
  if (s.length >= 16) return s;
  if (process.env.NODE_ENV === "production") {
    throw new Error("[wechat/entry] AUTH_SECRET 缺失或过短:拒绝签发/校验深链令牌");
  }
  return s || "dev-only-entry-secret";
}

function sign(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function signEntryToken(userId: string, now = Date.now()): string {
  const payload = `${userId}.${now + TTL_MS}`;
  return `${Buffer.from(payload).toString("base64url")}.${sign(payload)}`;
}

export function verifyEntryToken(token: string, now = Date.now()): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  let payload: string;
  try {
    payload = Buffer.from(token.slice(0, dot), "base64url").toString("utf-8");
  } catch {
    return null;
  }
  const expect = sign(payload);
  const got = token.slice(dot + 1);
  const a = Buffer.from(expect);
  const b = Buffer.from(got);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const sep = payload.lastIndexOf(".");
  const userId = payload.slice(0, sep);
  const exp = Number(payload.slice(sep + 1));
  if (!userId || !Number.isFinite(exp) || exp < now) return null;
  return userId;
}

/** 微信消息里统一使用的回岛深链 */
export function entryLink(userId: string): string {
  return `${SITE_URL}/api/wechat/entry?wt=${signEntryToken(userId)}`;
}

/** 短链版深链(微信消息一律用这个):/s/{code} → /api/wechat/entry?wt=…,与令牌同寿命 72h */
export async function shortEntryLink(userId: string): Promise<string> {
  const { createShortLink } = await import("../shortlink");
  return createShortLink(`/api/wechat/entry?wt=${signEntryToken(userId)}`, 72 * 3600_000);
}
