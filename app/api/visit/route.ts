import { cookies } from "next/headers";
import { VISIT_COOKIE, visitCookieOptions } from "@/lib/visit";

export const dynamic = "force-dynamic";

// 留下这台浏览器来过的痕迹。RSC 渲染期间写不了 cookie,所以由首页一个无 UI 的
// 客户端组件在挂载后打一次——首访当次本来就该看新人态,cookie 对下一次生效正好。
// 不上 middleware:一个只服务首页分流的低风险标记,不值得把全站请求链路拉进来。
export async function POST() {
  const jar = await cookies();
  if (jar.get(VISIT_COOKIE)?.value !== "1") jar.set(VISIT_COOKIE, "1", visitCookieOptions);
  return new Response(null, { status: 204 });
}
