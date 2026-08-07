import { createHash, randomBytes, randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { prisma } from "./db";

// 设备会话(doc/20 §八):登录态 = 一枚可远程作废的会话令牌。
// cookie 里只有令牌明文,库里存 sha256——库被读也不能直接冒充。
// 匿名设备身份继续用 maoadao_uid(没有凭证就没有"踢出"的意义)。

export const SID_COOKIE = "maoadao_sid";
export const UID_COOKIE = "maoadao_uid";
const ONE_YEAR = 60 * 60 * 24 * 365;
const TOUCH_INTERVAL_MS = 6 * 3600_000; // lastSeenAt 最多 6 小时写一次,别每次翻页都写库

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** 从 UA 粗略认出是哪台设备——只为让用户在列表里分得清,不做指纹 */
function deviceLabel(ua: string): string {
  const os = /iPhone|iPad/i.test(ua) ? "iPhone/iPad" : /Android/i.test(ua) ? "Android" : /Mac OS X/i.test(ua) ? "Mac" : /Windows/i.test(ua) ? "Windows" : "别的设备";
  const app = /MicroMessenger/i.test(ua) ? "微信里" : /Edg\//i.test(ua) ? "Edge" : /Chrome\//i.test(ua) ? "Chrome" : /Safari\//i.test(ua) ? "Safari" : "浏览器";
  return `${os} · ${app}`;
}

/** 建会话并把令牌种进 cookie(登录/设置凭证时调用) */
export async function startSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const ua = (await headers()).get("user-agent") ?? "";
  const id = randomUUID();
  await prisma.session.create({
    data: { id, userId, tokenHash: hashToken(token), label: deviceLabel(ua), createdAt: new Date(), lastSeenAt: new Date() },
  });
  const jar = await cookies();
  jar.set(SID_COOKIE, token, { httpOnly: true, sameSite: "lax", secure: true, maxAge: ONE_YEAR, path: "/" });
  // 同一台设备上的旧匿名身份 cookie 让位给会话
  jar.set(UID_COOKIE, userId, { httpOnly: true, sameSite: "lax", secure: true, maxAge: ONE_YEAR, path: "/" });
  return id;
}

/** 解析当前会话:返回账户 id 与会话 id;无效/已作废返回 null */
export async function resolveSession(): Promise<{ userId: string; sessionId: string } | null> {
  const jar = await cookies();
  const token = jar.get(SID_COOKIE)?.value;
  if (!token) return null;
  const row = await prisma.session.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.revokedAt) return null;
  if (Date.now() - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await prisma.session.update({ where: { id: row.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return { userId: row.userId, sessionId: row.id };
}

/** 作废这个账户的全部会话(可留一个)。
 *  密码变更/重置后必须调用:凭证换了,旧令牌就不该还能用——
 *  否则被盗会话在改密码之后依然畅通(2026-08-06 review P1)。 */
export async function revokeAllSessions(userId: string, exceptSessionId?: string): Promise<number> {
  const r = await prisma.session.updateMany({
    where: { userId, revokedAt: null, ...(exceptSessionId ? { id: { not: exceptSessionId } } : {}) },
    data: { revokedAt: new Date() },
  });
  return r.count;
}

/** 作废当前设备的会话(退出登录) */
export async function endCurrentSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SID_COOKIE)?.value;
  if (token) {
    await prisma.session.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } }).catch(() => {});
  }
  jar.delete(SID_COOKIE);
}

/** 列出账户的活跃会话(账户页展示) */
export async function listSessions(userId: string, currentSessionId: string | null) {
  const rows = await prisma.session.findMany({
    where: { userId, revokedAt: null },
    orderBy: { lastSeenAt: "desc" },
    take: 20,
  });
  return rows.map((r) => ({ id: r.id, label: r.label ?? "别的设备", lastSeenAt: r.lastSeenAt, createdAt: r.createdAt, current: r.id === currentSessionId }));
}
