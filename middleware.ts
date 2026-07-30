import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

// 分享回流归因：带 from=share_card 进站的访客种 7 天归因 cookie，
// 后续完成领养时标记 referred（referred_adopt_complete 漏斗）
export function middleware(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  if (from === "share_card") {
    const res = NextResponse.next();
    if (!req.cookies.get("maoadao_ref")) {
      res.cookies.set("maoadao_ref", "share_card", { maxAge: 60 * 60 * 24 * 7, sameSite: "lax", path: "/" });
    }
    return res;
  }
  return NextResponse.next();
}

export const config = { matcher: ["/cats/:path*", "/", "/adopt"] };
