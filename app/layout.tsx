import type { Metadata } from "next";
import { Analytics } from "@vercel/analytics/next";
import Link from "next/link";
import { Suspense } from "react";
import { getViewerId } from "@/lib/identity";
import { getViewerCat } from "@/lib/queries";
import "./globals.css";

export const metadata: Metadata = {
  title: "猫啊岛",
  description: "领养一只会记住你、自己生活、还会交朋友的猫。",
};

// 导航按钮单独成组件挂 Suspense：查询不阻塞页面外壳的首字节（跨洋链路下体感差异明显）
async function NavCatButton() {
  const myCat = await getViewerCat(await getViewerId()).catch(() => null);
  return myCat ? (
    <Link href="/my-cat" className="stamp-btn px-4 py-1.5 text-sm">
      我的猫
    </Link>
  ) : (
    <Link href="/adopt" className="stamp-btn px-4 py-1.5 text-sm">
      去码头接它
    </Link>
  );
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="flex min-h-full flex-col">
        <header className="border-b border-line bg-paper">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Link href="/" className="font-title text-lg font-bold text-ink">
              猫啊岛
            </Link>
            <nav className="flex items-center gap-4 text-sm">
              <Link href="/island" className="text-sea-deep hover:text-brick">
                公告栏
              </Link>
              <Link href="/account" className="text-sea-deep hover:text-brick">
                账户
              </Link>
              <Suspense fallback={<span className="inline-block h-[33px] w-[92px] animate-pulse rounded-lg bg-paper-deep" />}>
                <NavCatButton />
              </Suspense>
            </nav>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        <footer className="mt-8 border-t border-line py-6 text-center text-xs text-ink-faint">
          猫啊岛 · 一座猫住的小岛 · maoadao.com
        </footer>
        <Analytics />
      </body>
    </html>
  );
}
