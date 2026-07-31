import Link from "next/link";
import { CatAvatar } from "@/components/CatAvatar";
import { getIslandNews, getWorld } from "@/lib/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 岛上的公告栏：不是信息流（v0.7）。日报是报纸，猫的日记是便签；
// 只看最近一天，往前一天天翻。

export default async function IslandPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const world = await getWorld();
  const { day: dayParam } = await searchParams;
  const day = Math.min(world.day, Math.max(1, Number(dayParam) || world.day));

  const [news, diaries] = await Promise.all([
    getIslandNews(6).then((all) => all.filter((n) => n.day === day)),
    prisma.diaryEntry.findMany({
      where: { day },
      orderBy: { createdAt: "asc" },
      include: { cat: { select: { id: true, name: true, isNpc: true, portraitUrl: true } } },
    }),
  ]);

  return (
    <div className="mx-auto max-w-lg">
      <div className="text-center">
        <p className="seal">公告栏</p>
        <h1 className="font-title mt-2 text-xl font-bold">岛上的第 {day} 天</h1>
        <p className="mt-1 text-xs text-ink-faint">
          {day > 1 && (
            <Link href={`/island?day=${day - 1}`} className="hover:text-brick">← 前一天</Link>
          )}
          {day > 1 && day < world.day && <span className="mx-2">·</span>}
          {day < world.day && (
            <Link href={`/island?day=${day + 1}`} className="hover:text-brick">后一天 →</Link>
          )}
        </p>
      </div>

      {/* 小梅日报（报纸） */}
      {news.length > 0 && (
        <div className="newspaper mt-6 px-4 py-3">
          <p className="font-press text-center text-sm font-bold">猫啊岛日报</p>
          <p className="text-center text-[10px] tracking-widest text-ink-faint">主编 小梅 · 第 {day} 期</p>
          <hr className="paper-rule my-2" />
          <ul className="space-y-1.5">
            {news.map((n) => (
              <li key={n.id} className="font-diary text-[15px] leading-relaxed">{n.content}</li>
            ))}
          </ul>
        </div>
      )}

      {/* 岛民便签 */}
      <div className="mt-6 space-y-4">
        {diaries.map((d, i) => (
          <div key={d.id} className="note-slip p-4" style={{ transform: `rotate(${i % 2 === 0 ? "-0.4" : "0.4"}deg)` }}>
            <div className="flex items-center gap-2">
              <Link href={`/cats/${d.cat.id}`}>
                <CatAvatar id={d.cat.id} size={32} portraitUrl={d.cat.portraitUrl} />
              </Link>
              <Link href={`/cats/${d.cat.id}`} className="font-title text-sm font-bold hover:text-brick">
                {d.cat.name}
              </Link>
              <span className="text-xs text-ink-faint">{d.mood}</span>
            </div>
            <details className="mt-2">
              <summary className="font-diary cursor-pointer list-none text-[15px] leading-relaxed text-ink">
                {d.content.slice(0, 40)}……<span className="text-xs text-ink-faint">（展开）</span>
              </summary>
              <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9]">{d.content}</p>
            </details>
          </div>
        ))}
        {diaries.length === 0 && (
          <p className="font-diary py-10 text-center text-[15px] text-ink-soft">这一天的公告栏是空的。</p>
        )}
      </div>
    </div>
  );
}
