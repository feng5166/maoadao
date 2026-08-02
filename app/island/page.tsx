import Link from "next/link";
import { CatAvatar } from "@/components/CatAvatar";
import { LinkedText } from "@/components/LinkedText";
import { StayTrack } from "@/components/StayTrack";
import { SubmitButton } from "@/components/SubmitButton";
import { submitNewsTip } from "@/lib/actions";
import { getViewerId } from "@/lib/identity";
import { describeAffinity, getCatNameIndex, getIslandNews, getViewerCat, getWorld } from "@/lib/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 岛上的公告栏：不是信息流（v0.7）。日报是报纸，猫的日记是便签；
// 只看最近一天，往前一天天翻。

export default async function IslandPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const world = await getWorld();
  const { day: dayParam } = await searchParams;
  const day = Math.min(world.day, Math.max(1, Number(dayParam) || world.day));

  const viewerId = await getViewerId();
  const myCat = await getViewerCat(viewerId);
  const [news, diariesRaw, myTip, catIndex] = await Promise.all([
    getIslandNews(6).then((all) => all.filter((n) => n.day === day)),
    prisma.diaryEntry.findMany({
      where: { day },
      orderBy: { createdAt: "asc" },
      include: { cat: { select: { id: true, name: true, isNpc: true, portraitUrl: true } } },
    }),
    myCat
      ? prisma.newsTip.findFirst({ where: { catId: myCat.id }, orderBy: { createdAt: "desc" } })
      : Promise.resolve(null),
    getCatNameIndex(),
  ]);

  // 你的猫认识谁：affinity 映射，用来把认识的邻居置顶 + 标注关系（停留时间：读别人日记的动力来自"和我的猫有关"）
  const knownAffinity = new Map<string, number>();
  if (myCat) {
    const rels = await prisma.relationship.findMany({
      where: { OR: [{ catAId: myCat.id }, { catBId: myCat.id }] },
    });
    for (const r of rels) {
      knownAffinity.set(r.catAId === myCat.id ? r.catBId : r.catAId, r.affinity);
    }
  }
  const known = diariesRaw
    .filter((d) => knownAffinity.has(d.cat.id) && d.cat.id !== myCat?.id)
    .sort((a, b) => (knownAffinity.get(b.cat.id) ?? 0) - (knownAffinity.get(a.cat.id) ?? 0));
  const knownIds = new Set(known.map((d) => d.id));
  const diaries = [...known, ...diariesRaw.filter((d) => !knownIds.has(d.id))];

  return (
    <div className="mx-auto max-w-lg">
      <StayTrack page="island" />
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
              <li key={n.id} className="font-diary text-[15px] leading-relaxed">
                <LinkedText text={n.content} cats={catIndex} excludeId={n.catId ?? undefined} />
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 给小梅递线索：岛民也能上日报 */}
      {myCat && (
        <div className="mt-5 border border-line bg-paper-deep/40 p-4">
          <h2 className="font-title text-sm font-bold">给小梅递一条线索</h2>
          {myTip && !myTip.publishedAt ? (
            <p className="font-diary mt-1.5 text-sm leading-relaxed text-ink">
              小梅把你的线索夹进了采访本：「{myTip.content}」
              <br />
              <span className="text-xs text-ink-faint">明天的日报上见。</span>
            </p>
          ) : (
            <>
              <p className="mt-1 text-xs text-ink-faint">
                你看见的、听说的、想让全岛知道的——原话登在明天的日报上，署{myCat.name}的名。
                {myTip?.publishedAt && `（上一条登在第 ${myTip.publishDay} 期）`}
              </p>
              <form action={submitNewsTip} className="mt-2.5 flex gap-2">
                <input
                  name="content" maxLength={60} placeholder="60 字以内，写给全岛看"
                  className="min-w-0 flex-1 border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
                />
                <SubmitButton pendingText="递给小梅…" className="stamp-btn shrink-0 px-4 py-2 text-sm">
                  递过去
                </SubmitButton>
              </form>
            </>
          )}
        </div>
      )}

      {myCat && known.length > 0 && (
        <p className="mt-6 text-center text-xs text-ink-faint">↓ {myCat.name}认识的邻居，今天也写了日记</p>
      )}

      {/* 岛民便签：认识的猫置顶、首条默认展开 */}
      <div className="mt-4 space-y-4">
        {diaries.map((d, i) => {
          const aff = knownAffinity.get(d.cat.id);
          const isKnown = aff !== undefined && d.cat.id !== myCat?.id;
          return (
            <div key={d.id} className="note-slip p-4" style={{ transform: `rotate(${i % 2 === 0 ? "-0.4" : "0.4"}deg)` }}>
              <div className="flex items-center gap-2">
                <Link href={`/cats/${d.cat.id}`}>
                  <CatAvatar id={d.cat.id} size={32} portraitUrl={d.cat.portraitUrl} crop="head" />
                </Link>
                <Link href={`/cats/${d.cat.id}`} className="font-title text-sm font-bold hover:text-brick">
                  {d.cat.name}
                </Link>
                <span className="text-xs text-ink-faint">{d.mood}</span>
                {isKnown && (
                  <span className="ml-auto text-[11px] text-sage">和{myCat!.name}{describeAffinity(aff!)}</span>
                )}
              </div>
              <details className="mt-2" open={i === 0 && isKnown}>
                <summary className="font-diary cursor-pointer list-none text-[15px] leading-relaxed text-ink">
                  {d.content.slice(0, 40)}……<span className="text-xs text-ink-faint">（展开）</span>
                </summary>
                <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9]">
                  <LinkedText text={d.content} cats={catIndex} excludeId={d.cat.id} />
                </p>
              </details>
            </div>
          );
        })}
        {diaries.length === 0 && (
          <p className="font-diary py-10 text-center text-[15px] text-ink-soft">这一天的公告栏是空的。</p>
        )}
      </div>
    </div>
  );
}
