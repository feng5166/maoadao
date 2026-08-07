import { NextRequest } from "next/server";
import { redirect } from "next/navigation";
import { verifyEntryToken } from "@/lib/wechat/entry";
import { startSession } from "@/lib/session";

export const dynamic = "force-dynamic";

// 微信消息深链入口:令牌换会话 → 直达"它现在怎么样"。
// 用户感受是"找到猫",不是"登录网站"(doc/11 修订·门铃规则 §五)。
//
// 2026-08-06 修:原先只写 maoadao_uid cookie。但身份解析(lib/identity.ts)明确
// **拒绝"已设密码 + 无有效会话"的 uid**——所以注册用户从微信点进来会被当成
// 未登录,一路跳去领养页。这里必须兑换成真会话:startSession 落一行可撤销的
// Session(设备列表里显示为「微信里」,能随时踢),而不是一枚裸 uid。
export async function GET(req: NextRequest) {
  const wt = req.nextUrl.searchParams.get("wt");
  const userId = wt ? verifyEntryToken(wt) : null;
  if (userId) {
    await startSession(userId); // 同时种 sid 与 uid cookie
    redirect("/my-cat?from=wechat&focus=now");
  }
  redirect("/");
}
