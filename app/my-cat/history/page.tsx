import Link from "next/link";
import { redirect } from "next/navigation";
import { CatAvatar } from "@/components/CatAvatar";
import { THREAD_LABELS } from "@/lib/sim/threads";
import { getViewerId } from "@/lib/identity";
import { describeAffinity, getActiveStorylines, getFriends, getSummaries, getViewerCat } from "@/lib/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 猫的长期档案：生活记录 / 认识的猫 / 纪念物 / 正在发生的故事（定义 v0.5·五）
// 情感资产要能回看，否则内容产生后很快消失。

export default async function HistoryPage() {
  const viewerId = await getViewerId();
  const cat = await getViewerCat(viewerId);
  if (!cat) redirect("/adopt");

  const [summaries, friendsAll, threads, keepsakes] = await Promise.all([
    getSummaries(cat.id),
    getFriends(cat.id, 8),
    getActiveStorylines(cat.id),
    // 纪念物：只展示有叙事意义的（高重要性的观察/情节记忆）
    prisma.memoryEntry.findMany({
      where: { catId: cat.id, importance: { gte: 6 }, kind: { in: ["observation", "thread", "semantic"] } },
      orderBy: [{ importance: "desc" }, { day: "desc" }],
      take: 8,
    }),
  ]);
  const friends = friendsAll.filter((f) => Math.abs(f.affinity) > 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/my-cat" className="text-sm text-[#A89B85] hover:text-[#E08E0B]">← 回到今天</Link>
        <h1 className="text-xl font-bold">{cat.name}的生活档案</h1>
      </div>

      {/* 正在发生的故事 */}
      {threads.length > 0 && (
        <section className="rounded-2xl border border-[#EADFCC] bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-[#3A5F7A]">📌 正在发生的故事</h2>
          {threads.map((t) => (
            <p key={t.id} className="text-sm text-[#6B5D48]">
              {THREAD_LABELS[t.kind] ?? t.kind}
              {t.kind === "lighthouse" ? `：${t.step}/7` : `（第 ${t.startDay} 天开始）`}
            </p>
          ))}
        </section>
      )}

      {/* 认识的猫：翻译成人话，不显数值 */}
      {friends.length > 0 && (
        <section className="rounded-2xl border border-[#EADFCC] bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-sm font-bold text-[#3A5F7A]">🐾 认识的猫</h2>
          <div className="space-y-2">
            {friends.map((f) => (
              <Link key={f.id} href={`/cats/${f.otherId}`} className="flex items-center gap-3 rounded-lg p-1.5 hover:bg-[#FFF9EE]">
                <CatAvatar id={f.otherId} size={36} />
                <div>
                  <p className="text-sm font-medium">{f.otherName}</p>
                  <p className="text-xs text-[#A89B85]">{describeAffinity(f.affinity)} · 最近一次来往在第 {f.lastInteractionDay} 天</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 纪念 */}
      {keepsakes.length > 0 && (
        <section className="rounded-2xl border border-[#EADFCC] bg-white p-4 shadow-sm">
          <h2 className="mb-2 text-sm font-bold text-[#3A5F7A]">🎁 值得记住的事</h2>
          <ul className="space-y-1.5 text-sm text-[#6B5D48]">
            {keepsakes.map((k) => (
              <li key={k.id}>
                <span className="mr-1.5 text-xs text-[#C4B69C]">第{k.day}天</span>
                {k.content}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 生活记录：按日回看 */}
      <section>
        <h2 className="mb-3 text-sm font-bold text-[#3A5F7A]">📖 生活记录</h2>
        {summaries.length === 0 && (
          <p className="py-8 text-center text-sm text-[#A89B85]">还没有记录——第一天的故事正在发生。</p>
        )}
        <div className="space-y-3">
          {summaries.map((s) => (
            <article key={s.id} className="rounded-2xl border border-[#EADFCC] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#A89B85]">第 {s.day} 天</p>
                <Link
                  href={`/share/${cat.id}/${s.day}`}
                  className="rounded-full border border-[#EADFCC] px-3 py-1 text-xs text-[#8A7B65] hover:border-[#F5A623] hover:text-[#E08E0B]"
                >
                  分享卡
                </Link>
              </div>
              <h3 className="mt-1 font-bold">{s.headline}</h3>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{s.narrative}</p>
              {s.interventionResponse && (
                <p className="mt-2 rounded-lg bg-[#F0F7EE] p-2 text-xs text-[#4E6B3A]">💬 {s.interventionResponse}</p>
              )}
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
