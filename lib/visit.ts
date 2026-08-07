import { cookies } from "next/headers";

// 首页身份分流的三个信号必须拆开(2026-08-06 拍板):来过 / 看完 / 拥有。
// 这里只管前两个,而且**只决定体验分流**——不能用来认领猫、恢复账户、
// 证明船票归属或绑海螺。它们回答的是"这台浏览器经历过什么",不是"这个人是谁"。
// 清了 cookie 重新看到新人态是可接受的;跨设备身份仍归邮箱密码/回岛钥匙/海螺。

export const VISIT_COOKIE = "island_visited";
export const D0_COOKIE = "d0_disposition";

/** 走完 D0 还是主动跳过:两者都不必重播,但数据上要分得开 */
export type D0Disposition = "completed" | "skipped" | null;

const YEAR = 60 * 60 * 24 * 365;

export const visitCookieOptions = {
  httpOnly: true,
  sameSite: "lax",
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: YEAR,
} as const;

/** 只存"来过没有",不存首访时间——真实首访时间归埋点,不靠客户端 cookie */
export async function readVisitState(): Promise<{ visited: boolean; d0: D0Disposition }> {
  const jar = await cookies();
  const d0 = jar.get(D0_COOKIE)?.value;
  return {
    visited: jar.get(VISIT_COOKIE)?.value === "1",
    d0: d0 === "completed" || d0 === "skipped" ? d0 : null,
  };
}
