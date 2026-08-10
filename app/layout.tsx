import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { getViewerId } from "@/lib/identity";
import { prisma } from "@/lib/db";
import { beijingHour } from "@/lib/moments";
import { HeaderCta } from "@/components/HeaderCta";
import { NightLamp } from "@/components/NightLamp";
import { IslandSound } from "@/components/IslandSound";
import { FontFallback } from "@/components/FontFallback";
// 自托管中文 webfont 不再从这里 import(2026-08-06 性能治理)：分片声明约 106KB(gz)
// 会进每一页的渲染阻塞样式表，而 Apple/Windows 用户命中系统宋体/楷体、一个字体文件
// 都不下。改由 FontFallback 探测系统字体后按需挂载 public/fonts/ 下的声明；
// 资产由 scripts/fonts-publish.ts 生成（升级字体包后重跑）。
import "./globals.css";

export const metadata: Metadata = {
  title: "猫啊岛",
  description: "在猫啊岛有一个自己的院子。摆下点什么，偶尔会有猫按自己的性子来看看。",
};

// 导航按钮单独成组件挂 Suspense：查询不阻塞页面外壳的首字节（跨洋链路下体感差异明显）
// 2.1 翻转:唯一主身份信号 = hasYard(14 §九 红线③)
async function NavCatButton() {
  const uid = await getViewerId().catch(() => null);
  const home = uid ? await prisma.home.findUnique({ where: { userId: uid }, select: { yard: { select: { id: true } } } }).catch(() => null) : null;
  return <HeaderCta hasYard={Boolean(home?.yard)} />;
}

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // 夜里的岛:夜间时段全站换夜色纸(data-theme 服务端就位,无闪白);页头提灯可点灯切回,cookie 记偏好
  const hour = beijingHour();
  const night = hour >= 19 || hour < 6;
  const lampOn = (await cookies()).get("lamp")?.value === "on";
  const dark = night && !lampOn;
  return (
    <html lang="zh-CN" className="h-full antialiased" data-theme={dark ? "night" : undefined}>
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line bg-paper">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-title text-lg font-bold text-ink">
              猫啊岛
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              {/* 岛声层:页头一枚海螺,没有播放器 —— 声音属于世界不属于界面 */}
              <IslandSound />
              {night && <NightLamp initialLit={!dark} />}
              <Link href="/island" className="text-sea-deep hover:text-brick">
                岛上
              </Link>
              <Link href="/account" className="text-sea-deep hover:text-brick">
                岛民册
              </Link>
              <Suspense fallback={<span className="inline-block h-[33px] w-[92px] animate-pulse rounded-lg bg-paper-deep" />}>
                <NavCatButton />
              </Suspense>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        <footer className="mt-8 space-y-1.5 border-t border-line py-6 text-center text-xs text-ink-faint">
          <p>猫啊岛 · 一座猫住的小岛 · maoadao.com</p>
          <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
            <a href="https://beian.miit.gov.cn" target="_blank" rel="noopener" className="hover:text-ink-soft">
              浙ICP备2026050677号
            </a>
            <a
              href="https://beian.mps.gov.cn/#/query/webSearch?code=11010502061775"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1 hover:text-ink-soft"
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- 14px 政府备案图标，不走优化管线 */}
              <img src="/ghs.png" alt="公安备案图标" className="h-3.5 w-3.5" />
              京公网安备11010502061775号
            </a>
          </p>
        </footer>
        <FontFallback />
        <Analytics />
      </body>
    </html>
  );
}
