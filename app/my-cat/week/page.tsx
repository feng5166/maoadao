import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getViewerId } from "@/lib/identity";

export const dynamic = "force-dynamic";

// 第一周纪念册：一页可截图的"我们的第一周"。
export default async function WeekPage() {
  const viewerId = await getViewerId();
  if (!viewerId) redirect("/adopt");
  const cat = await prisma.cat.findUnique({ where: { ownerId: viewerId } });
  if (!cat) redirect("/adopt");
  const book = await prisma.weekBook.findUnique({ where: { catId_weekIndex: { catId: cat.id, weekIndex: 1 } } });
  if (!book) redirect("/my-cat");

  const c = book.content as {
    topMoments?: string[];
    catLine?: string;
    nextWeekWish?: string;
    visitDays?: number;
    messageCount?: number;
    bestFriend?: string | null;
    keepsakes?: string[];
    arrivalHeadline?: string;
  };

  return (
    <main className="mx-auto max-w-xl px-5 pb-16 pt-8">
      <p className="text-center text-xs tracking-widest text-ink-faint">猫啊岛 · 生活纪念</p>
      <h1 className="font-title mt-2 text-center text-2xl text-ink">我们的第一周</h1>
      <p className="mt-1 text-center text-sm text-ink-soft">{cat.name}来岛的第 1—7 天</p>

      <div className="paper-rule mt-6 p-6">
        {c.arrivalHeadline && <p className="text-xs text-ink-faint">开头是这样的：{c.arrivalHeadline}</p>}

        <h2 className="font-title mt-4 text-base text-ink">这周最难忘的三件事</h2>
        <ol className="mt-2 space-y-2">
          {(c.topMoments ?? []).map((m, i) => (
            <li key={i} className="font-diary flex gap-2 text-[15px] leading-[1.9] text-ink">
              <span className="text-ink-faint">{["一", "二", "三"][i] ?? i + 1}、</span>
              <span>{m}</span>
            </li>
          ))}
        </ol>

        <div className="mt-5 flex flex-wrap gap-x-6 gap-y-1 border-t border-line pt-4 text-sm text-ink-soft">
          <span>你来看过它 {c.visitDays ?? 0} 天</span>
          <span>给它留了 {c.messageCount ?? 0} 句话</span>
          {c.bestFriend && <span>它最好的朋友：{c.bestFriend}</span>}
        </div>

        {(c.keepsakes?.length ?? 0) > 0 && (
          <div className="mt-4">
            <p className="text-xs text-ink-faint">它一直收着的东西</p>
            <ul className="font-diary mt-1 space-y-1 text-[14px] leading-[1.8] text-ink-soft">
              {c.keepsakes!.map((k, i) => (
                <li key={i}>· {k}</li>
              ))}
            </ul>
          </div>
        )}

        {c.catLine && (
          <div className="note-slip mt-6 p-4" style={{ transform: "rotate(-0.5deg)" }}>
            <p className="font-diary text-[15px] leading-[1.9] text-ink">{c.catLine}</p>
            <p className="mt-1 text-right text-xs text-ink-faint">—— {cat.name}</p>
          </div>
        )}

        {c.nextWeekWish && <p className="font-diary mt-5 text-[14px] italic leading-[1.8] text-ink-soft">下周，{c.nextWeekWish}</p>}
      </div>

      <div className="mt-6 flex justify-center gap-4 text-sm">
        <Link href="/my-cat" className="text-ink-soft underline underline-offset-4">回今日手账</Link>
        <Link href="/my-cat/history" className="text-ink-soft underline underline-offset-4">翻生活册</Link>
      </div>
    </main>
  );
}
