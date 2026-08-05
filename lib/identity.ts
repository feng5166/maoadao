import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "./db";
import { resolveSession, SID_COOKIE, UID_COOKIE } from "./session";

// 身份两层(doc/20 §八):
//   匿名设备身份 = 长效 uid cookie(还没设凭证的访客,退出即失联,没有"踢出"的意义);
//   已设登录凭证的账户 = 必须持有效会话令牌——否则 uid cookie 单独不算登录,
//   这样"踢出其他设备"才真的踢得动。

const ONE_YEAR = 60 * 60 * 24 * 365;

async function resolveViewer(): Promise<{ userId: string | null; sessionId: string | null }> {
  const session = await resolveSession();
  if (session) return { userId: session.userId, sessionId: session.sessionId };

  const jar = await cookies();
  const uid = jar.get(UID_COOKIE)?.value;
  if (!uid) return { userId: null, sessionId: null };

  // 有 uid 但没会话:只有"还没设过凭证"的匿名身份才认——
  // 设过密码的账户必须走会话,否则踢出设备形同虚设
  const user = await prisma.user.findUnique({ where: { id: uid }, select: { passwordHash: true } }).catch(() => null);
  if (user?.passwordHash) return { userId: null, sessionId: null };
  return { userId: uid, sessionId: null };
}

/** 只读:当前访客 ID(没有则返回 null,不种 cookie)。同一请求内只解析一次。 */
export const getViewerId = cache(async (): Promise<string | null> => {
  return (await resolveViewer()).userId;
});

/** 当前会话 id(账户页用来标出"就是这台设备");匿名身份没有会话 */
export const getSessionId = cache(async (): Promise<string | null> => {
  return (await resolveViewer()).sessionId;
});

/** 取当前访客 ID，没有则生成并种下 cookie。只能在 Server Action 里调用。 */
export async function ensureViewerId(): Promise<string> {
  const existing = await getViewerId();
  if (existing) return existing;
  const jar = await cookies();
  const uid = `u-${randomUUID()}`;
  jar.set(UID_COOKIE, uid, { httpOnly: true, sameSite: "lax", secure: true, maxAge: ONE_YEAR, path: "/" });
  jar.delete(SID_COOKIE); // 旧会话已失效,别留着干扰下次解析
  return uid;
}
