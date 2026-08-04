import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import { cookies } from "next/headers";
import { Suspense } from "react";
import { getViewerId } from "@/lib/identity";
import { getViewerCat } from "@/lib/queries";
import { beijingHour } from "@/lib/moments";
import { HeaderCta } from "@/components/HeaderCta";
import { NightLamp } from "@/components/NightLamp";
// 自托管中文 webfont（unicode-range 分片，按需下载）：Apple 设备命中系统宋体/楷体
// 不会下载；Android/Windows 缺字库时兜底，避免手账感退化成默认黑体。
import "@fontsource/noto-serif-sc/400.css";
import "@fontsource/noto-serif-sc/700.css";
import "lxgw-wenkai-lite-webfont/lxgwwenkailite-regular.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "猫啊岛",
  description: "领养一只会记住你、自己生活、还会交朋友的猫。",
};

// 导航按钮单独成组件挂 Suspense：查询不阻塞页面外壳的首字节（跨洋链路下体感差异明显）
// 渲染交给 HeaderCta（客户端）：在 /adopt 流程里不再显示「去码头接它」
async function NavCatButton() {
  const myCat = await getViewerCat(await getViewerId()).catch(() => null);
  return <HeaderCta hasCat={Boolean(myCat)} />;
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
        <Analytics />
      </body>
    </html>
  );
}
