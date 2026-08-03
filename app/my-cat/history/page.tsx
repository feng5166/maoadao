import Link from "next/link";
import { redirect } from "next/navigation";
import { CatAvatar } from "@/components/CatAvatar";
import { THREAD_LABELS } from "@/lib/sim/threads";
import { threadStage } from "@/lib/handbook";
import { getViewerId } from "@/lib/identity";
import { firstsFor } from "@/lib/firsts";
import { describeAffinity, getActiveStorylines, getFriends, getSummaries, getViewerCat } from "@/lib/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 生活册：让用户感到"时间被保存了"，而不是"数据被记录了"（v0.7）。
// 重要的日子（有回执/大事）完整展开，普通日子一句摘录可展开。

export default async function HistoryPage() {
  const viewerId = await getViewerId();
  const cat = await getViewerCat(viewerId);
  if (!cat) redirect("/adopt");

  const [summaries, friendsAll, threads, keepsakes, arrivalNote, firsts] = await Promise.all([
    getSummaries(cat.id),
    getFriends(cat.id, 8),
    getActiveStorylines(cat.id),
    prisma.memoryEntry.findMany({
      where: { catId: cat.id, importance: { gte: 6 }, kind: { in: ["observation", "thread", "semantic"] } },
      orderBy: [{ importance: "desc" }, { day: "desc" }],
      take: 6,
    }),
    prisma.arrivalNote.findUnique({ where: { catId: cat.id } }),
    firstsFor(cat.id),
  ]);
  const friends = friendsAll.filter((f) => Math.abs(f.affinity) > 5);
  const firstDay = summaries.length ? summaries[summaries.length - 1].day : 0;

  return (
    <div className="mx-auto max-w-lg">
      <div className="text-center">
        <p className="seal">生活册</p>
        <h1 className="font-title mt-2 text-xl font-bold">{cat.name}在岛上的日子</h1>
        <p className="mt-1 text-xs text-ink-faint">
          <Link href="/my-cat" className="hover:text-brick">← 回到今天</Link>
        </p>
      </div>

      {/* 正在发生的事 */}
      {threads.length > 0 && (
        <div className="mt-6">
          <p className="text-xs tracking-widest text-ink-faint">还没讲完的故事</p>
          {threads.map((t) => (
            <p key={t.id} className="font-diary mt-1 text-[15px]">
              「{THREAD_LABELS[t.kind] ?? t.kind}」{threadStage(t.step, t.kind === "lighthouse" ? 7 : undefined)}
              <span className="ml-2 text-xs text-ink-faint">第 {t.startDay} 天开始 · 第 {t.step} 步</span>
            </p>
          ))}
        </div>
      )}

      {/* 岛民名册 */}
      {friends.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-xs tracking-widest text-ink-faint">它认识的猫</p>
          <div className="mt-2 space-y-2">
            {friends.map((f) => (
              <Link key={f.id} href={`/cats/${f.otherId}`} className="flex items-center gap-3 py-1 hover:opacity-80">
                <CatAvatar id={f.otherId} size={34} portraitUrl={f.otherPortraitUrl} crop="head" />
                <span className="font-diary text-[15px]">{f.otherName}</span>
                <span className="text-xs text-ink-soft">{describeAffinity(f.affinity)}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 收进册子的入岛须知 */}
      {arrivalNote?.archivedAt && (
        <div className="note-slip mt-6 p-4" style={{ transform: "rotate(-0.5deg)" }}>
          <p className="font-title text-sm font-bold text-ink-faint">入岛须知</p>
          <p className="font-diary mt-1.5 text-[15px] leading-relaxed text-ink-faint line-through">
            给{cat.name}留下第一句话 · 带它认识邻居 · 和它约好明早八点
          </p>
          <p className="mt-1 text-xs text-ink-faint">那天在码头领到的纸，三件都办妥了。</p>
        </div>
      )}

      {/* 它记得的第一次：从事实回放派生的纪念（doc/09 数字生命层） */}
      {firsts.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-xs tracking-widest text-ink-faint">它记得的第一次</p>
          <ul className="mt-2 space-y-1.5">
            {firsts.map((f, i) => (
              <li key={i} className="font-diary text-[15px] leading-relaxed">
                {f.text}
                <span className="ml-2 text-xs text-ink-faint">来岛第 {f.catDay} 天</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 值得记住的 */}
      {keepsakes.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-xs tracking-widest text-ink-faint">值得记住的</p>
          <ul className="mt-2 space-y-1.5">
            {keepsakes.map((k) => (
              <li key={k.id} className="font-diary text-[15px] leading-relaxed">
                {k.content}
                <span className="ml-2 text-xs text-ink-faint">第 {k.day} 天</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 按日翻册 */}
      <div className="mt-8 border-t-4 border-double border-line pt-5">
        {summaries.length === 0 && (
          <p className="font-diary py-8 text-center text-[15px] text-ink-soft">第一页还空着——它的故事今晚开始写。</p>
        )}
        <div className="space-y-6">
          {summaries.map((s) => {
            const important = Boolean(s.interventionResponse) || s.day === firstDay;
            return (
              <section key={s.id}>
                <div className="flex items-baseline justify-between">
                  <h2 className="font-title font-bold">
                    <span className="mr-2 text-xs font-normal text-ink-faint">来岛第 {s.day - firstDay + 1} 天</span>
                    {s.headline}
                  </h2>
                  <Link href={`/share/${cat.id}/${s.day}`} className="shrink-0 text-xs text-ink-faint hover:text-brick">
                    分享
                  </Link>
                </div>
                {important ? (
                  <>
                    <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9]">{s.narrative}</p>
                    {s.interventionResponse && (
                      <p className="font-diary mt-2 border-l-2 border-line pl-3 text-sm leading-relaxed text-ink-soft">
                        {s.interventionResponse}
                      </p>
                    )}
                  </>
                ) : (
                  <details className="mt-1">
                    <summary className="font-diary cursor-pointer list-none text-[15px] text-ink-soft">
                      {s.narrative.slice(0, 42)}……<span className="text-xs text-ink-faint">（展开）</span>
                    </summary>
                    <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9]">{s.narrative}</p>
                  </details>
                )}
                <hr className="paper-rule mt-5" />
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
