import { NextRequest } from "next/server";
import { prisma } from "@/lib/db";

// keep-warm（doc/11 P0-2）：内测流量稀疏，Neon 免费档 5 分钟无查询即挂起，
// 每次真人访问都会撞上 0.5-2s 的 compute 唤醒。cron 每 5 分钟轻触一次，
// 顺带保持函数实例与数据库连接的热度。
//
// 需要鉴权(2026-08-07 review P2):原先任何人都能高频打这个端点,
// 每次都落一条真库查询 —— 白送人一个免费的打库入口。与 /api/tick 同一把 CRON_SECRET。
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response("unauthorized", { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  await prisma.$queryRaw`SELECT 1`;
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
