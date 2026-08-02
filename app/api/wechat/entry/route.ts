import { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { verifyEntryToken } from "@/lib/wechat/entry";

export const dynamic = "force-dynamic";

const COOKIE = "maoadao_uid";
const ONE_YEAR = 60 * 60 * 24 * 365;

// 微信消息深链入口:令牌换 cookie → 直达"它现在怎么样"。
// 用户感受是"找到猫",不是"登录网站"(doc/11 修订·门铃规则 §五)。
export async function GET(req: NextRequest) {
  const wt = req.nextUrl.searchParams.get("wt");
  const userId = wt ? verifyEntryToken(wt) : null;
  if (userId) {
    const jar = await cookies();
    jar.set(COOKIE, userId, { httpOnly: true, sameSite: "lax", secure: true, maxAge: ONE_YEAR, path: "/" });
    redirect("/my-cat?from=wechat&focus=now");
  }
  redirect("/");
}
