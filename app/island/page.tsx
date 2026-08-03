import Link from "next/link";
import { CatAvatar } from "@/components/CatAvatar";
import { LinkedText } from "@/components/LinkedText";
import { StayTrack } from "@/components/StayTrack";
import { SubmitButton } from "@/components/SubmitButton";
import { IconWeather } from "@/components/icons";
import { submitNewsTip } from "@/lib/actions";
import { getViewerId } from "@/lib/identity";
import { describeAffinity, getCat, getCatNameIndex, getIslandNews, getViewerCat, getWorld } from "@/lib/queries";
import { factSummary } from "@/lib/sim/engine";
import { SEGMENT_CN, type Fact, type Segment } from "@/lib/sim/types";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 猫啊岛·今日:不是公告栏,是岛屿观察窗——每天来看看这个小岛今天发生了什么。
// 小屋负责"一只猫的生命",这里负责"整个世界还在运行"。
// 层次:世界的一口气(天气+岛上动向) → 我的猫的足迹(私人入口) → 今天正在发生(三件)
//      → 日报 → 朋友的猫留下的几页 → 岛上的小事 → 想说话的再找爆米花(沉底)

const WEATHER_LINE: Record<string, string> = {
  晴: "今天岛上太阳很好,石板路晒得暖暖的。",
  雨: "今天岛上下着雨,屋檐一直在滴水。",
  阴: "今天岛上没什么太阳,风倒是软的。",
  多云: "今天岛上云走得很慢。",
  风: "今天岛上的风有点大。",
};

export default async function IslandPage({ searchParams }: { searchParams: Promise<{ day?: string }> }) {
  const world = await getWorld(); // 60s 模块缓存，通常不产生查询
  const { day: dayParam } = await searchParams;
  const day = Math.min(world.day, Math.max(1, Number(dayParam) || world.day));
  const isToday = day === world.day;

  const viewerId = await getViewerId();
  // 两波并行（doc/11 P1-3）
  const [myCat, news, diariesRaw, catIndex, xiaomei, dayEvents] = await Promise.all([
    getViewerCat(viewerId),
    getIslandNews(6).then((all) => all.filter((n) => n.day === day)),
    prisma.diaryEntry.findMany({
      where: { day },
      orderBy: { createdAt: "asc" },
      include: { cat: { select: { id: true, name: true, isNpc: true, portraitUrl: true } } },
    }),
    getCatNameIndex(),
    getCat("npc-xiaomei"),
    prisma.event.findMany({
      where: { day },
      select: { id: true, catId: true, segment: true, type: true, outcome: true, data: true, targetId: true, isMain: true, contentValue: true },
    }),
  ]);
  const [myTip, rels] = myCat
    ? await Promise.all([
        prisma.newsTip.findFirst({ where: { catId: myCat.id }, orderBy: { createdAt: "desc" } }),
        prisma.relationship.findMany({ where: { OR: [{ catAId: myCat.id }, { catBId: myCat.id }] } }),
      ])
    : [null, []];

  const nameOf = new Map(catIndex.map((c) => [c.id, { name: c.name }]));
  const portraitOf = new Map(diariesRaw.map((d) => [d.cat.id, d.cat.portraitUrl]));
  const summaryOf = (e: (typeof dayEvents)[number]) =>
    factSummary({ type: e.type, outcome: e.outcome, data: e.data as Record<string, unknown>, targetId: e.targetId ?? undefined } as Fact, nameOf);
  const metaOf = (e: (typeof dayEvents)[number]) => {
    const loc = (e.data as Record<string, unknown>)?.location;
    return [typeof loc === "string" ? loc : null, SEGMENT_CN[e.segment as Segment]].filter(Boolean).join(" · ");
  };
  const mains = dayEvents.filter((e) => e.isMain);
  const mainOf = new Map(mains.map((e) => [e.catId, e]));

  // ---- 世界的一口气:天气 + 岛上动向(从当天主事件的地点里挑两个) ----
  const locs = [...new Set(mains.map((e) => (e.data as Record<string, unknown>)?.location).filter((l): l is string => typeof l === "string"))];
  const worldBreath =
    locs.length >= 2
      ? `有猫去了${locs[0]},也有猫在${locs[1]}忙自己的事。`
      : locs.length === 1
        ? `有猫去了${locs[0]},也有猫在忙自己的事。`
        : "大家都在过自己的日子。";

  // ---- 我的猫的足迹(私人入口):它今天干了什么 + 认识的邻居去了哪 ----
  const knownAffinity = new Map<string, number>();
  if (myCat) for (const r of rels) knownAffinity.set(r.catAId === myCat.id ? r.catBId : r.catAId, r.affinity);
  const myMain = myCat ? mainOf.get(myCat.id) : undefined;
  const friendTracks = myCat
    ? [...knownAffinity.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([fid]) => ({ id: fid, name: nameOf.get(fid)?.name ?? "邻居", ev: mainOf.get(fid) }))
        .filter((f) => f.ev)
    : [];

  // ---- 今天正在发生:三件(主事件按分量排,类型去重,值班猫机制在首页,这里不排除) ----
  const happening = [...mains]
    .filter((e) => e.catId !== myCat?.id)
    .sort((a, b) => b.contentValue - a.contentValue)
    .filter((e, i, arr) => arr.findIndex((x) => x.type === e.type) === i)
    .slice(0, 3);

  // ---- 日记分层:朋友的猫置顶,其余是岛上的小事 ----
  const known = diariesRaw
    .filter((d) => knownAffinity.has(d.cat.id) && d.cat.id !== myCat?.id)
    .sort((a, b) => (knownAffinity.get(b.cat.id) ?? 0) - (knownAffinity.get(a.cat.id) ?? 0));
  const knownIds = new Set(known.map((d) => d.id));
  const rest = diariesRaw.filter((d) => !knownIds.has(d.id) && d.cat.id !== myCat?.id);
  const mine = diariesRaw.filter((d) => d.cat.id === myCat?.id);

  const diaryCard = (d: (typeof diariesRaw)[number], i: number, open: boolean) => {
    const aff = knownAffinity.get(d.cat.id);
    const isKnown = aff !== undefined && d.cat.id !== myCat?.id;
    const main = mainOf.get(d.cat.id);
    return (
      <div key={d.id} className="note-slip p-4" style={{ transform: `rotate(${i % 2 === 0 ? "-0.4" : "0.4"}deg)` }}>
        <div className="flex items-center gap-2">
          <Link href={`/cats/${d.cat.id}`}>
            <CatAvatar id={d.cat.id} size={32} portraitUrl={d.cat.portraitUrl} crop="head" />
          </Link>
          <span className="min-w-0">
            <Link href={`/cats/${d.cat.id}`} className="font-title text-sm font-bold hover:text-brick">
              {d.cat.name}
            </Link>
            <span className="ml-2 text-xs text-ink-faint">{[main ? metaOf(main) : null, d.mood].filter(Boolean).join(" · ")}</span>
          </span>
          {isKnown && (
            <span className="ml-auto shrink-0 text-[11px] text-sage">和{myCat!.name}{describeAffinity(aff!)}</span>
          )}
        </div>
        <details className="mt-2" open={open}>
          <summary className="font-diary cursor-pointer list-none text-[15px] leading-relaxed text-ink">
            {d.content.slice(0, 40)}……<span className="text-xs text-ink-faint">(翻开)</span>
          </summary>
          <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9]">
            <LinkedText text={d.content} cats={catIndex} excludeId={d.cat.id} />
          </p>
        </details>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-lg">
      <StayTrack page="island" />

      {/* ============ 世界的一口气:今天的岛 ============ */}
      <div className="text-center">
        <h1 className="font-title text-xl font-bold">{isToday ? "猫啊岛 · 今日" : `猫啊岛 · 第 ${day} 天`}</h1>
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-sea-deep">
          <IconWeather size={14} />
          第 {day} 天 · {world.weather}
        </p>
        <p className="font-diary mt-2 text-[14px] leading-relaxed text-ink-soft">
          {WEATHER_LINE[world.weather] ?? `今天岛上是${world.weather}天。`}
          <br />
          {worldBreath}
        </p>
        <p className="mt-2 text-xs text-ink-faint">
          {day > 1 && (
            <Link href={`/island?day=${day - 1}`} className="hover:text-brick">← 前一天</Link>
          )}
          {day > 1 && day < world.day && <span className="mx-2">·</span>}
          {day < world.day && (
            <Link href={`/island?day=${day + 1}`} className="hover:text-brick">后一天 →</Link>
          )}
        </p>
      </div>

      {/* ============ 我的猫的足迹(私人入口) ============ */}
      {myCat && (myMain || friendTracks.length > 0) && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-xs tracking-widest text-ink-faint">{isToday ? "今天,和你有关的" : "那天,和你有关的"}</p>
          <ul className="font-diary mt-2 space-y-1.5 text-[14px] leading-relaxed text-ink">
            {myMain && (
              <li>
                <Link href="/my-cat" className="hover:text-brick">
                  {myCat.name}
                </Link>
                {summaryOf(myMain)}
              </li>
            )}
            {friendTracks.map((f) => (
              <li key={f.id} className="text-ink-soft">
                <Link href={`/cats/${f.id}`} className="text-sea-deep hover:text-brick">
                  {f.name}
                </Link>
                {summaryOf(f.ev!)}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ============ 今天正在发生:三件 ============ */}
      {happening.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-xs tracking-widest text-ink-faint">{isToday ? "今天,岛上正在发生" : "那天,岛上发生了"}</p>
          <div className="mt-3 space-y-2.5">
            {happening.map((e) => (
              <Link
                key={e.id}
                href={`/cats/${e.catId}`}
                className="flex items-start gap-3 border border-line bg-paper-deep/20 px-3.5 py-2.5 transition-colors hover:border-sea-deep"
              >
                <CatAvatar id={e.catId} size={34} portraitUrl={portraitOf.get(e.catId)} crop="head" />
                <span className="min-w-0">
                  <span className="font-diary block text-[15px] leading-relaxed text-ink">
                    {nameOf.get(e.catId)?.name ?? "岛民"}
                    {summaryOf(e)}
                  </span>
                  {metaOf(e) && <span className="mt-0.5 block text-[11px] text-ink-faint">{metaOf(e)}</span>}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* ============ 爆米花日报(报纸) ============ */}
      {news.length > 0 && (
        <div className="newspaper mt-6 px-4 py-3">
          <p className="font-press text-center text-sm font-bold">猫啊岛日报</p>
          <p className="text-center text-[10px] tracking-widest text-ink-faint">主编 爆米花 · 第 {day} 期</p>
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

      {/* ============ 朋友的猫留下的几页 ============ */}
      {myCat && known.length > 0 && (
        <div className="mt-6">
          <p className="text-center text-xs tracking-widest text-ink-faint">{myCat.name}认识的邻居,{isToday ? "今天" : "那天"}也写了日记</p>
          <div className="mt-3 space-y-4">{known.map((d, i) => diaryCard(d, i, i === 0))}</div>
        </div>
      )}

      {/* ============ 岛上的小事 ============ */}
      {(rest.length > 0 || mine.length > 0) && (
        <div className="mt-6">
          <p className="text-center text-xs tracking-widest text-ink-faint">岛上的小事</p>
          <div className="mt-3 space-y-4">
            {mine.map((d, i) => diaryCard(d, i, false))}
            {rest.map((d, i) => diaryCard(d, i + mine.length, false))}
          </div>
        </div>
      )}
      {diariesRaw.length === 0 && (
        <p className="font-diary py-10 text-center text-[15px] text-ink-soft">这一天,岛上安安静静的。</p>
      )}

      {/* ============ 想让全岛知道一件事?(沉底弱化——不是发帖,是递话) ============ */}
      {myCat && (
        <div className="mt-8 border-t border-line pt-4">
          {myTip && !myTip.publishedAt ? (
            <p className="font-diary text-sm leading-relaxed text-ink">
              爆米花把你的线索夹进了采访本:「{myTip.content}」
              <span className="ml-1 text-xs text-ink-faint">明天的日报上见。</span>
            </p>
          ) : (
            <details>
              <summary className="cursor-pointer text-center text-xs text-ink-faint hover:text-brick">
                你也想让全岛知道一件事?——递给爆米花
              </summary>
              <div className="mt-3 flex items-start gap-2.5">
                {xiaomei && (
                  <Link href={`/cats/${xiaomei.id}`} className="mt-0.5 flex shrink-0" aria-label="爆米花的档案">
                    <CatAvatar id={xiaomei.id} size={38} portraitUrl={xiaomei.portraitUrl} crop="head" />
                  </Link>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs leading-relaxed text-ink-soft">
                    <Link href="/cats/npc-xiaomei" className="text-sea-deep hover:text-brick">爆米花</Link>
                    是《猫啊岛日报》的主编——你看见的、听说的,原话登在明天的日报上,署{myCat.name}的名。
                    {myTip?.publishedAt && `(上一条登在第 ${myTip.publishDay} 期)`}
                  </p>
                  <form action={submitNewsTip} className="mt-2.5 flex gap-2">
                    <input
                      name="content" maxLength={60} placeholder="60 字以内"
                      className="min-w-0 flex-1 border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
                    />
                    <SubmitButton pendingText="递过去…" className="stamp-btn shrink-0 px-4 py-2 text-sm">
                      递过去
                    </SubmitButton>
                  </form>
                </div>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
