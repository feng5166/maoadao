import { cookies } from "next/headers";
import { D0_COOKIE, visitCookieOptions } from "@/lib/visit";

export const dynamic = "force-dynamic";

// D0 的去向:走完(completed)还是主动跳过(skipped)。两者以后都不再重播——
// 主动跳过的人下一次又被从 S0 拉一遍,同样是破坏心流单向;但数据上必须分得开,
// 才答得了"跳过的人接猫率与次日留存是不是显著更差"。
// 只升不降:已经走完的人后来点了跳过口,不把 completed 冲成 skipped。
export async function POST(req: Request) {
  let mode = "";
  try {
    mode = String(((await req.json()) as { mode?: string }).mode ?? "");
  } catch {
    return new Response("bad json", { status: 400 });
  }
  if (mode !== "complete" && mode !== "skip") return new Response("bad mode", { status: 400 });

  const jar = await cookies();
  if (jar.get(D0_COOKIE)?.value === "completed" && mode === "skip") return new Response(null, { status: 204 });
  jar.set(D0_COOKIE, mode === "complete" ? "completed" : "skipped", visitCookieOptions);
  return new Response(null, { status: 204 });
}
