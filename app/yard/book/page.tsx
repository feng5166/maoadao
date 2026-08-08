// 岛猫册（flag 内，18 最小条目）：观察笔记腔，不做数据卡；单入口（18 §八 禁四 Tab）。
// 三态：认识的猫 / 有传闻的猫 / 还没弄清的动静——第三态是这本册子的灵魂。

import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getViewerId } from "@/lib/identity";
import { buildCatBook } from "@/lib/yard/book";
import { ensureRumorSupply } from "@/lib/yard/clues";
import { yardGameplayEnabled } from "@/lib/yard/flags";
import { recordSurfaceView } from "@/lib/yard/signals";

export const dynamic = "force-dynamic";

export default async function CatBookPage() {
  const uid = await getViewerId();
  const user = uid ? await prisma.user.findUnique({ where: { id: uid }, select: { yardAccess: true } }) : null;
  if (!uid || !yardGameplayEnabled(user)) notFound();

  // Director 时机：翻册子这一刻，今天的传闻（如果有）落到你的册上——
  // 只把既有世界事实按时机露出来，不创造世界事实（lib/yard/clues.ts 四红线）
  await ensureRumorSupply(uid);
  await recordSurfaceView(uid, "cat_book"); // 观测面事实（20 D3/D5 推导用；世界侧永不读）
  const book = await buildCatBook(uid);

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <header>
        <h1 className="font-title text-2xl">岛猫册</h1>
        <p className="mt-1 text-sm opacity-70">
          {book.confirmedCount > 0 ? `你在岛上已经认识了 ${book.confirmedCount} 只猫。` : "这本册子还是新的。"}
        </p>
      </header>

      <section className="mt-6 border-t border-line pt-4">
        <h2 className="text-sm opacity-60">认识的猫</h2>
        {book.confirmed.length > 0 ? (
          <ul className="mt-2 space-y-3">
            {book.confirmed.map((c) => (
              <li key={c.catId} className="font-diary text-sm">
                <span className="font-title">{c.name}</span>——{c.seenBand}。
                {c.behaviorsSeen.length > 0 && <>见过它{c.behaviorsSeen.slice(0, 3).join("，")}。</>}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 font-diary text-sm opacity-70">还没有真正见过谁。</p>
        )}
      </section>

      <section className="mt-6 border-t border-line pt-4">
        <h2 className="text-sm opacity-60">有传闻的猫</h2>
        {book.rumors.length > 0 ? (
          <ul className="mt-2 space-y-2">
            {book.rumors.map((r) => (
              <li key={r.id} className="font-diary text-sm">{r.text}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 font-diary text-sm opacity-70">还没听说什么。</p>
        )}
      </section>

      <section className="mt-6 border-t border-line pt-4">
        <h2 className="text-sm opacity-60">还没弄清的动静</h2>
        {book.evidence.length > 0 ? (
          <ul className="mt-2 space-y-3">
            {book.evidence.map((e) => (
              <li key={e.clusterKey} className="font-diary text-sm">
                {e.band}，{e.traits.join("，")}——{e.countBand}。
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 font-diary text-sm opacity-70">院子里暂时没有看不懂的痕迹。</p>
        )}
      </section>

      {book.mementos.length > 0 && (
        <section className="mt-6 border-t border-line pt-4">
          <h2 className="text-sm opacity-60">留下来的东西</h2>
          <ul className="mt-2 space-y-2">
            {book.mementos.map((m) => (
              <li key={m.id} className="font-diary text-sm">{m.text}</li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-8 border-t border-line pt-4 text-sm">
        <Link href="/yard" className="underline underline-offset-4 opacity-70">回院子</Link>
      </p>
    </main>
  );
}
