import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import {
  CatCurrentMoment,
  CatHeroScene,
  CatHutItems,
  CatLifeBook,
  CatMemoryBox,
  CatRelationship,
  RelationshipStoryCard,
  accentTape,
  type FriendCard,
  type SharedStory,
} from "@/components/cat-profile";
import { THREAD_LABELS } from "@/lib/sim/threads";
import { saveNudge } from "@/lib/actions";
import { recordMetNpc } from "@/lib/arrival";
import { SubmitButton } from "@/components/SubmitButton";
import { getViewerId } from "@/lib/identity";
import { track } from "@vercel/analytics/server";
import { LIFE_PHOTO_IDS, LIFE_PHOTO_PLACES } from "@/lib/cats-life";
import { coinsLine, energyLine, marginNotes, sceneFor } from "@/lib/handbook";
import { getLatestSummary } from "@/lib/queries";
import { HUT_ITEMS, secretOfDay } from "@/lib/secrets";
import { beijingHour, currentSegment, nowLine } from "@/lib/moments";
import { catDayOf } from "@/lib/sim/lifecycle";
import { factSummary } from "@/lib/sim/engine";
import { hashSeed, mulberry32, pick } from "@/lib/sim/rng";
import { SEGMENT_CN, type Fact, type Segment } from "@/lib/sim/types";
import { prisma } from "@/lib/db";
import {
  describeAffinity,
  getCat,
  getCatDiaries,
  getCatNameIndex,
  getCatState,
  getFriends,
  getViewerCat,
  getWorld,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

// 居民主页(小屋版):偶然走进一位岛民的家门,看见它最近的生活。
// 空间感的顺序——进门(生活照+此刻) → 看见你们的交情 → 它留下的东西 →
// 它认识的朋友 → 最近的日子 → 它心里挂着的一件小事 → 翻它的生活册。
// 三种访问关系:我的猫(陪伴)/熟猫(发现关系)/陌生猫(产生兴趣,只给钩子)。

const GOAL_LINES: Record<string, string> = {
  chill: "它想要的日子,是晒着太阳打盹。",
  earn: "它想要的日子,是攒够鱼币开一家小店。",
  friends: "它想要的日子,是认识岛上所有邻居。",
  explore: "它想要的日子,是把岛走个遍。",
};

// 照片下那句闲话:不陈述事实,只给一点"刚发生过"的余温
const HERO_FLAVORS = [
  "今天它在这里待了很久。",
  "路过的猫说,刚才还看见它在这儿。",
  "风从海上过来,它的耳朵动了动。",
  "它挑了个晒得到太阳的位置。",
  "这是它常来的地方。",
];

// 这个瞬间留下了什么(生活册页脚小物,按当天地点派生;猫不制造悬念,只留下痕迹)
const LEFT_BEHIND: Record<string, string[]> = {
  reef: ["半枚白色的小贝壳", "一颗被海水磨圆的玻璃珠", "爪印一排,朝着退潮的方向"],
  lighthouse: ["一根灰色的羽毛", "一小段旧绳头", "草叶上蹭下来的一撮毛"],
  market: ["一张皱巴巴的价签", "半张烤鱼的油纸", "摊子底下滚出来的小硬币"],
  dock: ["一小截缆绳须", "一片剥落的船漆", "木板上晒干的一个湿爪印"],
  pines: ["一颗完整的松果", "一片还带着露水的松针", "树皮上新添的一道磨爪印"],
  home: ["窗台上的一小撮猫毛", "一团玩剩的毛线", "垫子上一个睡出来的窝"],
  boat: ["一小块生锈的铁环", "一片藤蔓的叶子", "船板缝里抠出来的小螺壳"],
  farewell: ["一枚黄昏色的小石子", "码头尽头的一个坐印"],
  sailed: ["一枚黄昏色的小石子", "码头尽头的一个坐印"],
};

// 小屋门口的生活痕迹(按天轮换):小事情比大事件更有陪伴感
const TRACE_LINES = [
  "门口的碗里还剩小半条鱼干。",
  "窗台上晾着一片捡回来的叶子。",
  "垫子旁边散落着一团玩了一半的毛线。",
  "门边立着它前几天拖回来的小木棍。",
  "窗边的小贝壳被排成了一排。",
  "晾着的毯子上还留着一个睡出来的窝。",
];

// 事件线阶段 → 心事语气(不出现任务/线/进度)
function threadFlavor(step: number, total?: number): string {
  if (!total) return step <= 1 ? "才刚开了个头,还没跟谁细说" : "断断续续地,还在惦记";
  const ratio = step / total;
  if (ratio <= 0.3) return "才刚开了个头,还没跟谁细说";
  if (ratio <= 0.7) return "眼看着有点眉目了";
  return "好像就快有结果了";
}

export default async function CatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  if (from === "share_card") await track("share_open", { catId: id }).catch(() => {});
  const viewerId = await getViewerId();
  const [cat, myCat, world] = await Promise.all([getCat(id), getViewerCat(viewerId), getWorld()]);
  if (!cat) notFound();
  const isOwner = !cat.isNpc && Boolean(cat.ownerId) && cat.ownerId === viewerId;

  // 逛别的猫的主页 = 带自己的猫认识了一位邻居（小约定之二）
  if (myCat && myCat.id !== cat.id) after(() => recordMetNpc(myCat.id, cat.id).catch(() => {}));

  const [state, diariesAll, friendsAll, storylines, catIndex, todayEvents, latestSummary, myRel] = await Promise.all([
    getCatState(id),
    getCatDiaries(id, 12),
    getFriends(id),
    prisma.storyline.findMany({ where: { catId: id, status: "active" } }),
    getCatNameIndex(),
    prisma.event.findMany({
      where: { catId: id, day: world.day },
      select: { type: true, segment: true, isMain: true, data: true, targetId: true },
    }),
    getLatestSummary(id),
    myCat && myCat.id !== id
      ? prisma.relationship.findFirst({
          where: {
            OR: [
              { catAId: myCat.id, catBId: id },
              { catAId: id, catBId: myCat.id },
            ],
          },
        })
      : Promise.resolve(null),
  ]);
  const viewerState: "owner" | "friend" | "stranger" = isOwner ? "owner" : myRel ? "friend" : "stranger";
  const friends = friendsAll.filter((f) => f.affinity > 0).slice(0, 6);
  const nameOf = new Map(catIndex.map((c) => [c.id, { name: c.name }]));
  const diaries = viewerState === "stranger" ? diariesAll.slice(0, 3) : diariesAll.slice(0, 10);

  // ---- 此刻:它现在在哪里、在干嘛(和首页同一套事实) ----
  const hour = beijingHour();
  const seg = currentSegment(hour);
  const nowEvent = seg
    ? (todayEvents.find((e) => e.segment === seg && e.isMain) ?? todayEvents.find((e) => e.segment === seg) ?? null)
    : null;
  const nowText = nowLine(
    cat.name,
    nowEvent
      ? { type: nowEvent.type, data: nowEvent.data as Record<string, unknown>, targetName: nowEvent.targetId ? nameOf.get(nowEvent.targetId)?.name : null }
      : null,
    hour,
    state?.location,
  );
  // 照片说明跟照片场景走(生活照是固定资产),不用实时位置——否则画面是礁石、文字写集市就穿帮
  const photoPlace = LIFE_PHOTO_PLACES[cat.id];
  const heroCaption = `猫啊岛第 ${world.day} 天${photoPlace ? ` · ${photoPlace}` : ""}`;
  const heroFlavor = pick(mulberry32(hashSeed(world.day, "hero", cat.id)), HERO_FLAVORS);
  const segCn = seg ? SEGMENT_CN[seg as Segment] : "夜里";
  // 推开窗那行:现在几时、它在哪(这里用实时位置,和"此刻"叙事一致)
  const momentDateLine = `猫啊岛第 ${world.day} 天 · ${segCn}${state?.location ? ` · ${state.location}` : ""}`;
  const traceLine = pick(mulberry32(hashSeed(world.day, "trace", cat.id)), TRACE_LINES);
  // 最近这些天:用每日结果里的真实变化(赚了鱼币/和谁近了/心事进展),不是角色总结
  const recentNotes = latestSummary
    ? marginNotes(
        (latestSummary.stateChanges ?? []) as { label: string; delta: string }[],
        ((latestSummary.threadProgress ?? []) as { label: string; step: number; total?: number; done?: boolean }[]).filter((t) => !t.done),
      ).map((n) => n.replace(/^今天/, "前两天"))
    : [];

  // ---- 关系是经历:第一次见面 + 最近一次,从事实回放派生 ----
  const friendIds = friends.map((f) => f.otherId);
  const storyPairIds = myCat && myRel && !friendIds.includes(myCat.id) ? [...friendIds, myCat.id] : friendIds;
  const sharedEvents = storyPairIds.length
    ? await prisma.event.findMany({
        where: {
          OR: [
            { catId: id, targetId: { in: storyPairIds } },
            { catId: { in: storyPairIds }, targetId: id },
          ],
        },
        orderBy: [{ day: "asc" }, { id: "asc" }],
        select: { catId: true, targetId: true, day: true, type: true, outcome: true, data: true },
      })
    : [];
  const firstWith = new Map<string, SharedStory>();
  const latestWith = new Map<string, SharedStory>();
  for (const e of sharedEvents) {
    const otherId = e.catId === id ? e.targetId! : e.catId;
    const story = {
      day: e.day,
      text: factSummary({ type: e.type, outcome: e.outcome, data: e.data as Record<string, unknown>, targetId: e.targetId ?? undefined } as Fact, nameOf),
    };
    if (!firstWith.has(otherId)) firstWith.set(otherId, story);
    latestWith.set(otherId, story);
  }

  // ---- 生活册每页的照片:当天主事件的地点 → 场景图 ----
  const diaryDays = diaries.map((d) => d.day);
  const dayMains = diaryDays.length
    ? await prisma.event.findMany({
        where: { catId: id, day: { in: diaryDays }, isMain: true },
        select: { day: true, segment: true, data: true },
      })
    : [];
  const mainByDay = new Map<number, { loc: string | null; seg: string }>();
  for (const e of dayMains) {
    const loc = (e.data as Record<string, unknown>)?.location;
    if (!mainByDay.has(e.day)) mainByDay.set(e.day, { loc: typeof loc === "string" ? loc : null, seg: e.segment });
  }
  const lifePages = diaries.map((d) => {
    const main = mainByDay.get(d.day);
    // 观察窗口三要素:时段 · 地点 · 心情——缺哪项省哪项
    const meta = [main ? SEGMENT_CN[main.seg as Segment] : null, main?.loc, d.mood ? `心情${d.mood}` : null]
      .filter(Boolean)
      .join(" · ");
    const sceneImg = main?.loc ? sceneFor(main.loc) : null;
    // "留下":按地点小物池 + 天数轮换;隔天出现一次,别机械到每页都有
    const sceneKey = sceneImg?.match(/\/scenes\/(\w+)\.jpg/)?.[1];
    const pool = sceneKey ? LEFT_BEHIND[sceneKey] : undefined;
    const leftBehind =
      pool && hashSeed(d.day, "left-gate", cat.id) % 2 === 0
        ? pick(mulberry32(hashSeed(d.day, "left", cat.id)), pool)
        : null;
    return {
      id: d.id,
      day: d.day,
      mood: d.mood,
      content: d.content,
      sceneImg,
      metaLine: meta || null,
      leftBehind,
    };
  });

  const keepsakes =
    viewerState === "stranger"
      ? []
      : await prisma.memoryEntry.findMany({
          where: { catId: id, importance: { gte: 6 }, kind: { in: ["observation", "thread", "semantic"] } },
          orderBy: [{ importance: "desc" }, { day: "desc" }],
          take: 4,
        });

  const daysOnIsland = cat.firstTickDay > 0 ? catDayOf(world.day, cat.firstTickDay) : null;
  const lifePhoto = LIFE_PHOTO_IDS.has(cat.id) ? `/cats-life/${cat.id}.jpg` : null;
  const bioFirstLine = (cat.bio ?? "").split(/(?<=[。!！?？])/)[0] || cat.bio || "";
  const secret = secretOfDay(cat.id, world.day);
  const hutItems = HUT_ITEMS[cat.id] ?? [];
  const tape = accentTape(cat.id);

  const friendCards: FriendCard[] = friends.map((f) => ({
    relId: f.id,
    otherId: f.otherId,
    otherName: f.otherName,
    otherPortraitUrl: f.otherPortraitUrl,
    affinityText: describeAffinity(f.affinity),
    latestStory: latestWith.get(f.otherId) ?? null,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      {/* ============ 进门:生活照 + 它是谁、此刻在干嘛 ============ */}
      <div className="gap-6 md:grid md:grid-cols-5">
        <div className="md:col-span-3">
          <CatHeroScene
            name={cat.name}
            catId={cat.id}
            lifePhoto={lifePhoto}
            arrivalPhoto={isOwner ? cat.arrivalPhotoUrl : null}
            portraitUrl={cat.portraitUrl}
            captionMeta={heroCaption}
            flavorLine={heroFlavor}
          />
        </div>

        <div className="mt-6 md:col-span-2 md:mt-0">
          {/* 推开窗的顺序:小屋 → 此刻(现场感优先) → 它是谁(弱化) */}
          <p className="text-xs tracking-widest text-ink-faint">
            {viewerState === "owner" ? "你常来串门的地方" : viewerState === "friend" ? `${myCat!.name}朋友的家` : "岛上的一间小屋"}
          </p>
          <h1 className="font-title mt-1 text-2xl font-bold">{cat.name}的小屋</h1>

          <CatCurrentMoment dateLine={momentDateLine} nowText={nowText} mood={state?.mood} traceLine={traceLine} />

          <div className="mt-4 border-t border-line pt-3">
            <p className="text-xs text-ink-soft">{cat.appearance}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {cat.personaTags.map((tag) => (
                <span key={tag} className="border border-line px-2 py-0.5 text-[11px] text-ink-faint">
                  {tag}
                </span>
              ))}
            </div>
            {(viewerState === "stranger" ? bioFirstLine : cat.bio) && (
              <p className="mt-2 text-xs leading-relaxed text-ink-soft">
                {viewerState === "stranger" ? bioFirstLine : cat.bio}
              </p>
            )}
          </div>

          {isOwner && (
            <a href="#nudge" className="mt-3 inline-block text-sm text-sea-deep hover:text-brick">
              给它留句话 ↓
            </a>
          )}
          {viewerState === "stranger" && (
            <p className="mt-3 text-xs leading-relaxed text-ink-faint">
              {hutItems.length > 0 && <>小屋里还留着一些以前的东西。</>}
              <a href="#lifebook" className="text-sea-deep hover:text-brick">
                去翻翻它的生活册 ↓
              </a>
            </p>
          )}
          {!cat.isNpc && !cat.portraitUrl && (
            <p className="mt-2 text-xs text-ink-faint">专属立绘绘制中，稍后刷新查看</p>
          )}
        </div>
      </div>

      {/* ============ 它的小屋里:生活痕迹,不是背包 ============ */}
      <CatHutItems items={hutItems.slice(0, 3)} tape={tape} />

      {/* ============ 你们的交情(熟猫的入口) ============ */}
      {viewerState === "friend" && myCat && myRel && (
        <RelationshipStoryCard
          catName={cat.name}
          myCatName={myCat.name}
          affinityText={describeAffinity(myRel.affinity)}
          firstStory={firstWith.get(myCat.id) ?? null}
          latestStory={latestWith.get(myCat.id) ?? null}
          tape={tape}
        />
      )}

      {/* ============ 它留下的东西(记忆优先于名单) ============ */}
      {viewerState !== "stranger" && (
        <CatMemoryBox
          firstWordsLine={
            isOwner && cat.firstWords ? `你第一次对它说:「${cat.firstWords}」——它一直留着这句话。` : null
          }
          keepsakes={keepsakes}
          secret={secret}
          tape={tape}
        />
      )}

      {/* ============ 它认识的朋友 ============ */}
      {viewerState === "stranger" ? (
        friends.length > 0 && (
          <p className="mt-6 border-t border-line pt-4 text-sm text-ink-soft">
            它常来往的:
            {friends.map((f, i) => (
              <span key={f.id}>
                {i > 0 && "、"}
                <Link href={`/cats/${f.otherId}`} className="text-sea-deep hover:text-brick">
                  {f.otherName}
                </Link>
              </span>
            ))}
          </p>
        )
      ) : (
        <CatRelationship friends={friendCards} />
      )}

      {/* ============ 最近这些天(真实的变化,不是角色总结) ============ */}
      {viewerState !== "stranger" && (
        <div className="margin-note mt-6 border-t border-line pt-4">
          <p className="text-xs tracking-widest text-ink-faint">最近这些天</p>
          {recentNotes.length > 0 && recentNotes.map((n, i) => <p key={i} className={i === 0 ? "mt-2" : ""}>{n}</p>)}
          {recentNotes.length === 0 && cat.goal && GOAL_LINES[cat.goal] && <p className="mt-2">{GOAL_LINES[cat.goal]}</p>}
          {state && (
            <>
              <p>{coinsLine(state.coins)}</p>
              <p>{energyLine(state.energy)}</p>
              {isOwner && (
                <details className="mt-1 text-xs text-ink-faint">
                  <summary className="cursor-pointer">翻开细账</summary>
                  <p className="mt-1">
                    {daysOnIsland ? `来岛第 ${daysOnIsland} 天 · ` : ""}鱼币 {state.coins} 枚 · 体力 {state.energy} · 此刻在{state.location}
                  </p>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {/* ============ 它心里挂着的一件小事 ============ */}
      {viewerState !== "stranger" && storylines.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-xs tracking-widest text-ink-faint">岛上的一件小事</p>
          {storylines.map((s) => (
            <p key={s.id} className="font-diary mt-1.5 text-[15px] leading-relaxed text-ink">
              {s.kind === "shop"
                ? `它正在打理自己的小店「${String((s.data as Record<string, unknown> | null)?.name ?? "小店")}」——第 ${s.startDay} 天开张的,每天都有点新章程。`
                : `它最近心里挂着一件事,和${THREAD_LABELS[s.kind] ?? s.kind}有关——${threadFlavor(s.step, s.kind === "lighthouse" ? 7 : undefined)}。`}
            </p>
          ))}
        </div>
      )}

      {/* ============ 生活册 ============ */}
      <CatLifeBook name={cat.name} catId={cat.id} pages={lifePages} catIndex={catIndex} />
      {viewerState === "stranger" && diariesAll.length > diaries.length && (
        <p className="mt-3 text-center text-xs text-ink-faint">
          更早的日子,等{myCat ? `${myCat.name}和它熟起来` : "你也在岛上住下"}再翻。
        </p>
      )}

      {/* ============ 给它留句话(仅主人) ============ */}
      {isOwner && (
        <section id="nudge" className="mt-8 border border-line bg-paper-deep/40 p-4">
          <h2 className="font-title font-bold">给它留句话</h2>
          <p className="mb-3 mt-0.5 text-xs text-ink-faint">它会记住的。听不听,它有自己的主意。</p>
          <form action={saveNudge} className="space-y-3">
            <input type="hidden" name="catId" value={cat.id} />
            <textarea
              name="message" maxLength={60} rows={2} placeholder={`想对${cat.name}说的话(60 字内)`}
              className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
            />
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" name="isPublic" className="accent-[#5c7382]" />
              它可以在日记里提到这句话(不勾选就只有它自己知道)
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-ink-soft">你希望它明天……</span>
              {[
                { v: "", label: "随它去" },
                { v: "earn", label: "去赚点鱼币" },
                { v: "explore", label: "出门走走" },
                { v: "social", label: "找朋友玩" },
                { v: "rest", label: "好好休息" },
              ].map((o, i) => (
                <label key={o.v} className="cursor-pointer border border-line px-2.5 py-1.5 has-[:checked]:border-sea-deep has-[:checked]:bg-paper">
                  <input type="radio" name="suggestion" value={o.v} defaultChecked={i === 0} className="hidden" />
                  {o.label}
                </label>
              ))}
            </div>
            <SubmitButton pendingText="正在交给它…" className="stamp-btn px-5 py-1.5 text-sm">
              交给它
            </SubmitButton>
          </form>
        </section>
      )}
    </div>
  );
}
