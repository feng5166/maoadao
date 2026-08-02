import { prisma } from "@/lib/db";

// keep-warm（doc/11 P0-2）：内测流量稀疏，Neon 免费档 5 分钟无查询即挂起，
// 每次真人访问都会撞上 0.5-2s 的 compute 唤醒。cron 每 5 分钟轻触一次，
// 顺带保持函数实例与数据库连接的热度。

export async function GET() {
  await prisma.$queryRaw`SELECT 1`;
  return new Response("ok", { headers: { "Cache-Control": "no-store" } });
}
