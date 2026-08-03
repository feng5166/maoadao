import Link from "next/link";
import { CatAvatar } from "@/components/CatAvatar";
import { LinkedText } from "@/components/LinkedText";
import { StayTrack } from "@/components/StayTrack";
import { SubmitButton } from "@/components/SubmitButton";
import { IconWeather } from "@/components/icons";
import { accentTape } from "@/components/cat-profile";
import { submitNewsTip } from "@/lib/actions";
import { getViewerId } from "@/lib/identity";
import { describeAffinity, getCat, getCatNameIndex, getIslandNews, getViewerCat, getWorld } from "@/lib/queries";
import { factSummary } from "@/lib/sim/engine";
import { SEGMENT_CN, type Fact, type Segment } from "@/lib/sim/types";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 猫啊岛·今日(1.5):早上打开手机,看见小岛今天贴出来的一张小报。
// 层次:世界的一口气(天气场景) → 和你有关的 → 今天岛上的一件事(头版) →
//      今天的岛(地点感) → 日报 → 朋友们留下的几页 → 岛上的小事(五条,随机发现感) → 递话(沉底)

// 天气不是标签,是会影响世界的东西:第一行是天,第二行是天带来的小事
const WEATHER_SCENE: Record<string, [string, string]> = {
  晴: ["今天岛上太阳很好,石板路晒得暖暖的。", "晒衣绳上今天全是毯子。"],
  雨: ["今天岛上下着雨,屋檐一直在滴水。", "集市的棚子提前收起来了。"],
  阴: ["今天岛上没什么太阳,风倒是软的。", "海面是灰蓝色的,很平。"],
  多云: ["今天岛上云走得很慢。", "云影一块块从坡上滑过去。"],
  风: ["今天岛上的风有点大。", "晾着的渔网被吹得鼓了起来。"],
};

// 迷你岛屿地图:建立"我住在一个岛"的空间感。手绘感的固定布点,今天有猫在的地方点亮。
const MAP_SPOTS: { key: string; label: string; x: number; y: number }[] = [
  { key: "灯塔", label: "灯塔坡", x: 238, y: 34 },
  { key: "松林", label: "松林小径", x: 66, y: 44 },
  { key: "溪流", label: "溪流浅滩", x: 44, y: 96 },
  { key: "集市", label: "集市广场", x: 152, y: 74 },
  { key: "码头", label: "码头", x: 262, y: 100 },
  { key: "礁石", label: "海边礁石", x: 96, y: 134 },
  { key: "渔船", label: "废弃渔船", x: 204, y: 138 },
];

function IslandMiniMap({ catsAtSpot }: { catsAtSpot: Map<string, string[]> }) {
  // 地图不是导航,是偷窥窗口:亮点下面写着谁在这儿
  return (
    <svg viewBox="0 0 320 178" className="mx-auto mt-3 w-full max-w-[340px]" aria-hidden="true">
      {/* 岛的轮廓:一笔不太规整的手绘圈 */}
      <path
        d="M36 96 C28 58 68 24 128 22 C196 19 288 32 296 82 C302 122 258 158 188 162 C112 167 46 136 36 96 Z"
        fill="none"
        stroke="var(--line)"
        strokeWidth="1.5"
      />
      {MAP_SPOTS.map((s) => {
        const cats = catsAtSpot.get(s.key) ?? [];
        const on = cats.length > 0;
        return (
          <g key={s.key}>
            <circle cx={s.x} cy={s.y} r={on ? 3.5 : 2.5} fill={on ? "var(--brick)" : "var(--line)"} />
            <text x={s.x} y={s.y - 7} textAnchor="middle" fontSize="10" fill={on ? "var(--ink)" : "var(--ink-faint)"} style={{ fontFamily: "inherit" }}>
              {s.label}
            </text>
            {on && (
              <text x={s.x} y={s.y + 14} textAnchor="middle" fontSize="9" fill="var(--ink-soft)" style={{ fontFamily: "inherit" }}>
                {cats.slice(0, 2).join(" · ")}
                {cats.length > 2 ? " …" : ""}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}

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
      select: { id: true, catId: true, segment: true, type: true, outcome: true, data: true, targetId: true, isMain: true, contentValue: true, threadKey: true },
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
  const locOf = (e: (typeof dayEvents)[number]) => {
    const loc = (e.data as Record<string, unknown>)?.location;
    return typeof loc === "string" ? loc : null;
  };
  const metaOf = (e: (typeof dayEvents)[number]) =>
    [locOf(e), SEGMENT_CN[e.segment as Segment]].filter(Boolean).join(" · ");
  const mains = dayEvents.filter((e) => e.isMain);
  const mainOf = new Map(mains.map((e) => [e.catId, e]));
  // 地图上"谁在哪里":按地点归组,亮点下写名字
  const catsAtSpot = new Map<string, string[]>();
  for (const spot of MAP_SPOTS) {
    const cats = mains
      .filter((e) => locOf(e)?.includes(spot.key))
      .map((e) => nameOf.get(e.catId)?.name)
      .filter((n): n is string => Boolean(n));
    if (cats.length) catsAtSpot.set(spot.key, cats);
  }

  const [sceneLine, ambientLine] = WEATHER_SCENE[world.weather] ?? [`今天岛上是${world.weather}天。`, ""];

  // ---- 我的猫的足迹(私人入口) ----
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

  // ---- 头版:今天岛上的一件事 + 还有这些也在发生 ----
  const ranked = [...mains]
    .filter((e) => e.catId !== myCat?.id)
    .sort((a, b) => b.contentValue - a.contentValue)
    .filter((e, i, arr) => arr.findIndex((x) => x.type === e.type) === i);
  const headline = ranked[0];
  const alsoHappening = ranked.slice(1, 3);
  const featuredIds = new Set(ranked.slice(0, 3).map((e) => e.catId));

  // ---- 日记分层:朋友的猫(卡片) / 岛上的小事(一行体,随机发现感) ----
  const known = diariesRaw
    .filter((d) => knownAffinity.has(d.cat.id) && d.cat.id !== myCat?.id)
    .sort((a, b) => (knownAffinity.get(b.cat.id) ?? 0) - (knownAffinity.get(a.cat.id) ?? 0));
  const knownIds = new Set(known.map((d) => d.cat.id));
  // 小事 = 没被头版和朋友区覆盖的猫,当天主事件一行:走过街角看见一件小事
  const smallThings = mains
    .filter((e) => e.catId !== myCat?.id && !featuredIds.has(e.catId) && !knownIds.has(e.catId))
    .sort((a, b) => b.contentValue - a.contentValue)
    .map((e) => ({ id: e.id, catId: e.catId, name: nameOf.get(e.catId)?.name ?? "岛民", text: summaryOf(e) }));
  const smallFirst = smallThings.slice(0, 5);
  const smallMore = smallThings.slice(5);

  return (
    <div className="mx-auto max-w-lg">
      <StayTrack page="island" />

      {/* ============ 世界的一口气 ============ */}
      <div className="text-center">
        <h1 className="font-title text-xl font-bold">{isToday ? "猫啊岛 · 今日" : `猫啊岛 · 第 ${day} 天`}</h1>
        <p className="mt-1.5 flex items-center justify-center gap-1.5 text-xs text-sea-deep">
          <IconWeather size={14} />
          第 {day} 天 · {world.weather}
        </p>
        <p className="font-diary mt-2 text-[14px] leading-relaxed text-ink-soft">
          {sceneLine}
          {ambientLine && (
            <>
              <br />
              {ambientLine}
            </>
          )}
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

      {/* ============ 和你有关的 ============ */}
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

      {/* ============ 岛闻头版:每天一个事件中心(唯一记忆点) ============ */}
      {headline && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-center">
            <span className="seal">岛闻 · 第 {day} 天</span>
          </p>
          <Link
            href={`/cats/${headline.catId}`}
            className="note-slip relative mt-3 block p-5 transition-colors hover:border-sea-deep"
            style={{ transform: "rotate(-0.4deg)" }}
          >
            <span
              className="absolute -top-2 left-1/2 h-[16px] w-[72px] -translate-x-1/2 rotate-[-2deg]"
              style={{ background: accentTape(headline.catId) }}
            />
            <span className="flex items-start gap-3.5">
              <CatAvatar id={headline.catId} size={52} portraitUrl={portraitOf.get(headline.catId)} crop="head" />
              <span className="min-w-0">
                <span className="font-diary block text-[17px] leading-relaxed text-ink">
                  {nameOf.get(headline.catId)?.name ?? "岛民"}
                  {summaryOf(headline)}
                </span>
                <span className="mt-1.5 block text-[11px] text-ink-faint">
                  {[
                    metaOf(headline),
                    headline.targetId && nameOf.get(headline.targetId)
                      ? `${nameOf.get(headline.catId)?.name} 和 ${nameOf.get(headline.targetId)!.name}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
                {headline.threadKey && (
                  <span className="font-diary mt-1.5 block text-[13px] text-ink-soft">这件事,好像还没完。</span>
                )}
              </span>
            </span>
          </Link>
          {alsoHappening.length > 0 && (
            <ul className="font-diary mt-3 space-y-1.5 text-[14px] leading-relaxed text-ink-soft">
              {alsoHappening.map((e) => (
                <li key={e.id}>
                  ·{" "}
                  <Link href={`/cats/${e.catId}`} className="hover:text-brick">
                    {nameOf.get(e.catId)?.name ?? "岛民"}
                  </Link>
                  {summaryOf(e)}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* ============ 今天的岛:偷窥窗口,谁在哪里 ============ */}
      {catsAtSpot.size > 0 && (
        <div className="mt-6 border-t border-line pt-4 text-center">
          <p className="text-xs tracking-widest text-ink-faint">{isToday ? "今天的岛" : "那天的岛"}</p>
          <IslandMiniMap catsAtSpot={catsAtSpot} />
          {/* 翻页的停顿:地图之后,喘一口气再进别人的日子 */}
          <p className="font-diary mt-2 text-[13px] text-ink-faint">岛上的每只猫,都有自己的今天。</p>
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

      {/* ============ 朋友们留下的几页 ============ */}
      {myCat && known.length > 0 && (
        <div className="mt-6">
          <p className="text-center text-xs tracking-widest text-ink-faint">{myCat.name}的朋友们,{isToday ? "今天" : "那天"}留下的几页</p>
          <div className="mt-3 space-y-4">
            {known.map((d, i) => {
              const aff = knownAffinity.get(d.cat.id);
              const main = mainOf.get(d.cat.id);
              return (
                <div key={d.id} className="note-slip relative p-4" style={{ transform: `rotate(${i % 2 === 0 ? "-0.4" : "0.4"}deg)` }}>
                  {i === 0 && (
                    <span
                      className="absolute -top-2 right-8 h-[15px] w-[58px] rotate-[3deg]"
                      style={{ background: accentTape(d.cat.id) }}
                    />
                  )}
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
                    <span className="ml-auto shrink-0 text-[11px] text-sage">和{myCat.name}{describeAffinity(aff!)}</span>
                  </div>
                  <details className="mt-2" open={i === 0}>
                    <summary className="font-diary cursor-pointer list-none text-[15px] leading-relaxed text-ink">
                      {d.content.slice(0, 40)}……<span className="text-xs text-ink-faint">(翻开)</span>
                    </summary>
                    <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9]">
                      <LinkedText text={d.content} cats={catIndex} excludeId={d.cat.id} />
                    </p>
                  </details>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ============ 岛上的小事:走过街角看见的(五条,不刷信息流) ============ */}
      {smallFirst.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-center text-xs tracking-widest text-ink-faint">岛上的小事</p>
          <ul className="font-diary mt-2.5 space-y-1.5 text-[14px] leading-relaxed text-ink-soft">
            {smallFirst.map((s) => (
              <li key={s.id}>
                ·{" "}
                <Link href={`/cats/${s.catId}`} className="text-ink hover:text-brick">
                  {s.name}
                </Link>
                {s.text}
              </li>
            ))}
          </ul>
          {smallMore.length > 0 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-center text-xs text-ink-faint hover:text-brick">
                更多岛上的小事({smallMore.length})
              </summary>
              <ul className="font-diary mt-2 space-y-1.5 text-[14px] leading-relaxed text-ink-soft">
                {smallMore.map((s) => (
                  <li key={s.id}>
                    ·{" "}
                    <Link href={`/cats/${s.catId}`} className="text-ink hover:text-brick">
                      {s.name}
                    </Link>
                    {s.text}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
      {diariesRaw.length === 0 && mains.length === 0 && (
        <p className="font-diary py-10 text-center text-[15px] text-ink-soft">这一天,岛上安安静静的。</p>
      )}

      {/* ============ 想让全岛知道一件事?(沉底弱化) ============ */}
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
