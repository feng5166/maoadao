import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { CatAvatar } from "@/components/CatAvatar";
import { IconBoat, IconFishCoin, IconHeart, IconHouse, IconLighthouse, IconPaw } from "@/components/icons";
import { accentTape } from "@/components/cat-profile";
import { THREAD_LABELS } from "@/lib/sim/threads";
import { leftBehindFor, sceneFor, threadStage } from "@/lib/handbook";
import { getViewerId } from "@/lib/identity";
import { firstsFor } from "@/lib/firsts";
import { catDayOf } from "@/lib/sim/lifecycle";
import { describeAffinity, getActiveStorylines, getCatNameIndex, getFriends, getSummaries, getViewerCat, getWorld } from "@/lib/queries";
import { factSummary } from "@/lib/sim/engine";
import { SEGMENT_CN, type Fact, type Segment } from "@/lib/sim/types";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 生活册 = 我们已经一起经历过什么(与"我的猫=它此刻怎么样"、"今日=岛上发生什么"彻底分工)。
// 结构:扉页(拥有感) → 还没讲完的一件事 → 它认识的猫(关系时间线) →
//      第一天留下的东西(D1 纪念) → 它记得的第一次(收藏) → 按天翻阅(生活页)。
// 时间口径:来岛第 N 天为主,猫啊岛世界日为辅。

// 第一次的小图标:按内容配一枚手绘章,不做成就列表
const FIRST_ICONS: [RegExp, typeof IconPaw][] = [
  [/钓|鱼竿/, IconBoat],
  [/星/, IconLighthouse],
  [/零工|鱼币|赚|帮工/, IconFishCoin],
  [/朋友|认识|串门|见/, IconHeart],
  [/集市|买|摊/, IconHouse],
];
function firstIcon(text: string) {
  for (const [re, Icon] of FIRST_ICONS) if (re.test(text)) return Icon;
  return IconPaw;
}

export default async function HistoryPage() {
  const viewerId = await getViewerId();
  const cat = await getViewerCat(viewerId);
  if (!cat) redirect("/adopt");
  const world = await getWorld();

  const viewer = viewerId ? await prisma.user.findUnique({ where: { id: viewerId }, select: { passwordHash: true, emailVerifiedAt: true } }) : null;
  const [summaries, friendsAll, threads, keepsakes, arrivalNote, firsts, catIndex] = await Promise.all([
    getSummaries(cat.id),
    getFriends(cat.id, 8),
    getActiveStorylines(cat.id),
    prisma.memoryEntry.findMany({
      where: { catId: cat.id, importance: { gte: 6 }, kind: { in: ["observation", "thread", "semantic"] } },
      orderBy: [{ importance: "desc" }, { day: "desc" }],
      take: 3,
    }),
    prisma.arrivalNote.findUnique({ where: { catId: cat.id } }),
    firstsFor(cat.id),
    getCatNameIndex(),
  ]);
  const nameOf = new Map(catIndex.map((c) => [c.id, { name: c.name }]));
  const friends = friendsAll.filter((f) => Math.abs(f.affinity) > 5);
  const firstDay = summaries.length ? summaries[summaries.length - 1].day : world.day;
  const daysOnIsland = cat.firstTickDay > 0 ? catDayOf(world.day, cat.firstTickDay) : world.day - firstDay + 1;
  const catDayOfSummary = (d: number) => (cat.firstTickDay > 0 ? catDayOf(d, cat.firstTickDay) : d - firstDay + 1);
  const tape = accentTape(cat.id);

  // ---- 关系时间线 + 每天的生活页素材:一次把相关事件取够 ----
  const friendIds = friends.slice(0, 3).map((f) => f.otherId);
  const summaryDays = summaries.map((s) => s.day);
  const threadKeys = threads.map((t) => t.kind);
  const [sharedEvents, dayMains, threadLatest] = await Promise.all([
    friendIds.length
      ? prisma.event.findMany({
          where: { OR: [{ catId: cat.id, targetId: { in: friendIds } }, { catId: { in: friendIds }, targetId: cat.id }] },
          orderBy: [{ day: "asc" }, { id: "asc" }],
          select: { catId: true, targetId: true, day: true, type: true, outcome: true, data: true },
        })
      : Promise.resolve([]),
    summaryDays.length
      ? prisma.event.findMany({
          where: { catId: cat.id, day: { in: summaryDays }, isMain: true },
          select: { day: true, segment: true, data: true, targetId: true },
        })
      : Promise.resolve([]),
    threadKeys.length
      ? prisma.event.findMany({
          where: { catId: cat.id, threadKey: { in: threadKeys } },
          orderBy: { day: "desc" },
          take: threadKeys.length * 3,
          select: { threadKey: true, day: true },
        })
      : Promise.resolve([]),
  ]);
  const firstWith = new Map<string, { day: number; text: string }>();
  const latestWith = new Map<string, { day: number; text: string }>();
  for (const e of sharedEvents) {
    const otherId = e.catId === cat.id ? e.targetId! : e.catId;
    const story = {
      day: e.day,
      text: factSummary({ type: e.type, outcome: e.outcome, data: e.data as Record<string, unknown>, targetId: e.targetId ?? undefined } as Fact, nameOf),
    };
    if (!firstWith.has(otherId)) firstWith.set(otherId, story);
    latestWith.set(otherId, story);
  }
  const mainByDay = new Map<number, { loc: string | null; seg: string; targetId: string | null }>();
  for (const e of dayMains) {
    const loc = (e.data as Record<string, unknown>)?.location;
    if (!mainByDay.has(e.day)) mainByDay.set(e.day, { loc: typeof loc === "string" ? loc : null, seg: e.segment, targetId: e.targetId });
  }
  const threadLastDay = new Map<string, number>();
  for (const e of threadLatest) if (e.threadKey && !threadLastDay.has(e.threadKey)) threadLastDay.set(e.threadKey, e.day);

  const heroImg = cat.arrivalPhotoUrl
    ? `${cat.arrivalPhotoUrl}${cat.arrivalPhotoUrl.includes("?") ? "&" : "?"}s=720`
    : null;

  return (
    <div className="mx-auto max-w-lg">
      {/* ============ 扉页:我们已经一起生活了多久 ============ */}
      <div className="note-slip relative p-5 text-center" style={{ transform: "rotate(-0.3deg)" }}>
        <div className="absolute -top-2 left-1/2 h-[18px] w-[86px] -translate-x-1/2 rotate-[-2deg]" style={{ background: tape }} />
        <p className="text-xs tracking-widest text-ink-faint">生活册</p>
        <h1 className="font-title mt-1.5 text-xl font-bold">{cat.name}在岛上的日子</h1>
        <p className="font-diary mt-1 text-[15px] text-ink">
          来岛第 <span className="text-[19px] font-bold">{daysOnIsland}</span> 天
          <span className="ml-2 text-xs text-ink-faint">猫啊岛第 {world.day} 天</span>
        </p>
        {heroImg ? (
          // eslint-disable-next-line @next/next/no-img-element -- 相遇照片走自有 API,长缓存
          <img src={heroImg} alt={`${cat.name}来岛第一天的照片`} className="mx-auto mt-3 w-full max-w-sm" />
        ) : (
          <div className="mt-3 flex justify-center">
            <CatAvatar id={cat.id} size={120} portraitUrl={cat.portraitUrl} />
          </div>
        )}
        {cat.firstWords && (
          <p className="font-diary mt-3 text-[14px] leading-relaxed text-ink">
            它第一次见到你时,你对它说:
            <br />「{cat.firstWords}」
          </p>
        )}
        <p className="mt-2 text-xs text-ink-faint">
          <Link href="/my-cat" className="hover:text-brick">← 回到今天</Link>
        </p>
      </div>

      {/* ============ 还没讲完的一件事 ============ */}
      {threads.length > 0 && (
        <div className="mt-7">
          <p className="text-xs tracking-widest text-ink-faint">还没讲完的一件事</p>
          {threads.map((t) => (
            <p key={t.id} className="font-diary mt-1.5 text-[15px] leading-relaxed text-ink">
              「{THREAD_LABELS[t.kind] ?? t.kind}」{threadStage(t.step, t.kind === "lighthouse" ? 7 : undefined)}。
              {threadLastDay.has(t.kind) && (
                <span className="ml-1 text-xs text-ink-faint">最近一次是来岛第 {catDayOfSummary(threadLastDay.get(t.kind)!)} 天</span>
              )}
            </p>
          ))}
        </div>
      )}

      {/* ============ 它认识的猫:怎么认识、最近怎样(P3 关系时间线) ============ */}
      {friends.length > 0 && (
        <div className="mt-7">
          <p className="text-xs tracking-widest text-ink-faint">它认识的猫</p>
          <div className="mt-2.5 space-y-3">
            {friends.slice(0, 3).map((f) => {
              const first = firstWith.get(f.otherId);
              const latest = latestWith.get(f.otherId);
              return (
                <Link key={f.id} href={`/cats/${f.otherId}`} className="flex items-start gap-3 py-0.5 hover:opacity-80">
                  <CatAvatar id={f.otherId} size={38} portraitUrl={f.otherPortraitUrl} crop="head" />
                  <span className="min-w-0">
                    <span className="flex items-baseline gap-2">
                      <span className="font-title text-sm font-bold text-ink">{f.otherName}</span>
                      <span className="text-[11px] text-sage">{describeAffinity(f.affinity)}</span>
                    </span>
                    {first && (
                      <span className="font-diary mt-0.5 block text-[13px] leading-snug text-ink-soft">
                        第一次见面:来岛第 {catDayOfSummary(first.day)} 天
                      </span>
                    )}
                    {latest && latest.day !== first?.day && (
                      <span className="font-diary block text-[13px] leading-snug text-ink-soft">最近:{latest.text}</span>
                    )}
                  </span>
                </Link>
              );
            })}
          </div>
          {friends.length > 3 && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-ink-faint hover:text-brick">
                还认识 {friends.length - 3} 只({friends.slice(3).map((f) => f.otherName).join("、")})
              </summary>
            </details>
          )}
        </div>
      )}

      {/* ============ 第一天留下的东西(D1 纪念章节) ============ */}
      {arrivalNote?.archivedAt && (
        <div className="mt-7">
          <p className="text-xs tracking-widest text-ink-faint">第一天留下的东西</p>
          <div className="note-slip relative mt-2.5 p-4" style={{ transform: "rotate(0.5deg)" }}>
            <div className="absolute -top-2 right-10 h-[15px] w-[56px] rotate-[3deg]" style={{ background: tape }} />
            <div className="flex items-center justify-between">
              <p className="font-title text-sm font-bold">码头塞给你们的那张纸</p>
              <span className="seal">第 1 天</span>
            </div>
            <ul className="font-diary mt-2 space-y-1 text-[15px] leading-relaxed text-ink-faint">
              <li className="line-through">✓ 给{cat.name}留下第一句话</li>
              <li className="line-through">✓ 带它认识一位邻居</li>
              <li className="line-through">✓ 和它约好明早八点</li>
            </ul>
            <p className="font-diary mt-2 flex items-center gap-1.5 text-[13px] text-ink-soft">
              <IconPaw size={13} className="shrink-0 text-ink-faint" />
              那天写在纸上的三件事,后来都发生了。
            </p>
          </div>
        </div>
      )}

      {/* ============ 它记得的第一次(收藏,不是成就) ============ */}
      {firsts.length > 0 && (
        <div className="mt-7">
          <p className="text-xs tracking-widest text-ink-faint">它记得的第一次</p>
          <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {firsts.map((f, i) => {
              const Icon = firstIcon(f.text);
              return (
                <div key={i} className="note-slip flex items-start gap-2.5 p-3" style={{ transform: `rotate(${i % 2 === 0 ? "-0.3" : "0.3"}deg)` }}>
                  <Icon size={18} className="mt-0.5 shrink-0 text-sea-deep" />
                  <span>
                    <span className="font-diary block text-[14px] leading-snug text-ink">{f.text}</span>
                    <span className="mt-0.5 block text-[11px] text-ink-faint">来岛第 {f.catDay} 天</span>
                  </span>
                </div>
              );
            })}
          </div>
          {keepsakes.length > 0 && (
            <div className="margin-note mt-3">
              {keepsakes.map((k) => (
                <p key={k.id}>
                  {k.content}
                  <span className="ml-2 text-xs text-ink-faint">来岛第 {catDayOfSummary(k.day)} 天</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}

      {/* D7 后的低权重提醒(doc/20 §五 入口二):一起生活一周了,才提一次确认邮箱——
          不弹窗、不打断,放在册子末尾之前,像一句顺口的叮嘱 */}
      {daysOnIsland >= 7 && viewer?.passwordHash && !viewer.emailVerifiedAt && (
        <p className="margin-note mt-7 border-t border-line pt-4">
          已经一起生活 {daysOnIsland} 天了。
          <Link href="/account" className="text-sea-deep hover:text-brick">确认一下登录邮箱</Link>
          ,可以给这段日子多留一条回来的路。
        </p>
      )}

      {/* ============ 按天翻阅:每一天是一张生活页 ============ */}
      <div className="mt-8 border-t-4 border-double border-line pt-5">
        {summaries.length === 0 && (
          <p className="font-diary py-8 text-center text-[15px] text-ink-soft">第一页还空着——它的故事今晚开始写。</p>
        )}
        <div className="space-y-5">
          {summaries.map((s, i) => {
            const main = mainByDay.get(s.day);
            const sceneImg = main?.loc ? sceneFor(main.loc) : null;
            const left = leftBehindFor(cat.id, s.day, sceneImg);
            const met = main?.targetId ? nameOf.get(main.targetId)?.name : null;
            const metaLine = [main ? SEGMENT_CN[main.seg as Segment] : null, main?.loc].filter(Boolean).join(" · ");
            const latest = i === 0;
            return (
              <article key={s.id} className="note-slip p-4" style={{ transform: `rotate(${i % 2 === 0 ? "-0.3" : "0.3"}deg)` }}>
                <p className="font-diary text-[13px] text-ink-soft">
                  来岛第 {catDayOfSummary(s.day)} 天
                  <span className="ml-2 text-[11px] text-ink-faint">猫啊岛第 {s.day} 天{metaLine ? ` · ${metaLine}` : ""}</span>
                </p>
                <h2 className="font-title mt-1 text-[15px] font-bold text-ink">{s.headline}</h2>
                {latest ? (
                  <>
                    {sceneImg && (
                      <div className="mt-2 overflow-hidden rounded-sm border border-line">
                        <Image src={sceneImg} alt="" width={1200} height={686} className="w-full" />
                      </div>
                    )}
                    <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9] text-ink">{s.narrative}</p>
                    {s.interventionResponse && (
                      <p className="font-diary mt-2 border-l-2 border-line pl-3 text-sm leading-relaxed text-ink">
                        {s.interventionResponse}
                      </p>
                    )}
                  </>
                ) : (
                  <details className="mt-1">
                    <summary className="font-diary cursor-pointer list-none text-[14px] leading-relaxed text-ink-soft">
                      {s.narrative.slice(0, 42)}……<span className="text-xs text-ink-faint">(翻开这一页)</span>
                    </summary>
                    {sceneImg && (
                      <div className="mt-2 overflow-hidden rounded-sm border border-line">
                        <Image src={sceneImg} alt="" width={1200} height={686} loading="lazy" className="w-full" />
                      </div>
                    )}
                    <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9] text-ink">{s.narrative}</p>
                    {s.interventionResponse && (
                      <p className="font-diary mt-2 border-l-2 border-line pl-3 text-sm leading-relaxed text-ink">
                        {s.interventionResponse}
                      </p>
                    )}
                    <p className="mt-2 text-right text-xs">
                      <Link href={`/share/${cat.id}/${s.day}`} className="text-ink-faint hover:text-brick">
                        把这一页做成分享卡
                      </Link>
                    </p>
                  </details>
                )}
                {(left || met) && (
                  <p className="mt-2.5 text-[11px] leading-relaxed text-ink-faint">
                    {left && (
                      <>
                        <span className="mr-1.5 inline-block -rotate-2 border border-line px-1.5 py-0.5">留下</span>
                        {left}
                      </>
                    )}
                    {left && met && <span className="mx-1.5">·</span>}
                    {met && <>遇见了 {met}</>}
                  </p>
                )}
                {latest && (
                  <p className="mt-2 text-right text-xs">
                    <Link href={`/share/${cat.id}/${s.day}`} className="text-ink-faint hover:text-brick">
                      把这一页做成分享卡
                    </Link>
                  </p>
                )}
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
