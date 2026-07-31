import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 1) 首访身份预置：进站即发放 uid cookie，杜绝"两个并发领养各自造身份"的孤儿猫竞态
// 2) 分享回流归因：from=share_card 种 7 天归因 cookie
export function middleware(req: NextRequest) {
  const res = NextResponse.next();

  if (!req.cookies.get("maoadao_uid")) {
    res.cookies.set("maoadao_uid", `u-${crypto.randomUUID()}`, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 60 * 60 * 24 * 365,
      path: "/",
    });
  }

  if (req.nextUrl.searchParams.get("from") === "share_card" && !req.cookies.get("maoadao_ref")) {
    res.cookies.set("maoadao_ref", "share_card", { maxAge: 60 * 60 * 24 * 7, sameSite: "lax", path: "/" });
  }

  return res;
}

export const config = {
  matcher: ["/((?!_next|api|favicon.ico|.*\\.).*)"],
};
