import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

// MVP 身份：匿名 httpOnly cookie（每浏览器一个岛民 ID）。
// 阶段三接微信登录时，把这里换成真实会话即可，所有权模型不变。

const COOKIE = "maoadao_uid";
const ONE_YEAR = 60 * 60 * 24 * 365;

/** 只读：当前访客 ID（没有则返回 null，不种 cookie） */
export async function getViewerId(): Promise<string | null> {
  const jar = await cookies();
  return jar.get(COOKIE)?.value ?? null;
}

/** 取当前访客 ID，没有则生成并种下 cookie。只能在 Server Action 里调用。 */
export async function ensureViewerId(): Promise<string> {
  const jar = await cookies();
  const existing = jar.get(COOKIE)?.value;
  if (existing) return existing;
  const uid = `u-${randomUUID()}`;
  jar.set(COOKIE, uid, { httpOnly: true, sameSite: "lax", secure: true, maxAge: ONE_YEAR, path: "/" });
  return uid;
}
