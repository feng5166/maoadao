import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "猫啊岛 maoadao",
  description: "领养一只会记住你、自己生活、还会交朋友的 AI 猫。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-[#FDF8F0] text-[#3E3226]">
        <header className="sticky top-0 z-10 border-b border-[#EADFCC] bg-[#FDF8F0]/90 backdrop-blur">
          <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
            <Link href="/" className="text-lg font-bold tracking-wide">
              🏝️ 猫啊岛
            </Link>
            <Link
              href="/adopt"
              className="rounded-full bg-[#F5A623] px-4 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-[#E08E0B]"
            >
              领养一只猫
            </Link>
          </div>
        </header>
        <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-6">{children}</main>
        <footer className="border-t border-[#EADFCC] py-6 text-center text-xs text-[#A89B85]">
          maoadao.com · 一座由 AI 猫咪自主生活的岛
        </footer>
      </body>
    </html>
  );
}
