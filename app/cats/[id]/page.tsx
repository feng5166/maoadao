import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import {
  CatBond,
  CatCurrentMoment,
  CatHeroScene,
  CatLifeBook,
  CatMemoryBox,
  CatRelationship,
  type FriendCard,
} from "@/components/cat-profile";
import { THREAD_LABELS } from "@/lib/sim/threads";
import { saveNudge } from "@/lib/actions";
import { recordMetNpc } from "@/lib/arrival";
import { SubmitButton } from "@/components/SubmitButton";
import { getViewerId } from "@/lib/identity";
import { track } from "@vercel/analytics/server";
import { LIFE_PHOTO_IDS } from "@/lib/cats-life";
import { coinsLine, energyLine, threadStage } from "@/lib/handbook";
import { CAT_SECRETS, secretOfDay } from "@/lib/secrets";
import { beijingHour, currentSegment, nowLine } from "@/lib/moments";
import { catDayOf } from "@/lib/sim/lifecycle";
import { factSummary } from "@/lib/sim/engine";
import type { Fact } from "@/lib/sim/types";
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

// 居民主页(CatProfilePage 2.0):不是猫的资料页,是走进一位岛民的家门。
// 同一套骨架,按访问关系渲染三种体验——
//   我的猫(陪伴):小屋 + 它还记得你 + 留言;
//   熟悉的猫(发现关系):它和你的猫的故事是入口;
//   陌生猫(产生兴趣):身份一句话 + 它今天在干嘛 + 一个没揭开的秘密。
// 数字(鱼币/体力/好感)全站不外露,只说生活语言;细账仅主人可翻。

const GOAL_LINES: Record<string, string> = {
  chill: "它想要的日子:晒着太阳打盹",
  earn: "它想要的日子:攒鱼币开一家小店",
  friends: "它想要的日子:认识岛上所有邻居",
  explore: "它想要的日子:把岛走个遍",
};

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

  const [state, diariesAll, friendsAll, storylines, catIndex, todayEvents, myRel] = await Promise.all([
    getCatState(id),
    getCatDiaries(id),
    getFriends(id),
    prisma.storyline.findMany({ where: { catId: id, status: "active" } }),
    getCatNameIndex(),
    prisma.event.findMany({
      where: { catId: id, day: world.day },
      select: { type: true, segment: true, isMain: true, data: true, targetId: true },
    }),
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

  // ---- 关系故事:它和朋友们(以及和你的猫)最近一起经历的事,从事实回放派生 ----
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
  const firstMetWith = new Map<string, number>();
  const latestWith = new Map<string, { day: number; text: string }>();
  for (const e of sharedEvents) {
    const otherId = e.catId === id ? e.targetId! : e.catId;
    if (!firstMetWith.has(otherId)) firstMetWith.set(otherId, e.day);
    latestWith.set(otherId, {
      day: e.day,
      text: factSummary({ type: e.type, outcome: e.outcome, data: e.data as Record<string, unknown>, targetId: e.targetId ?? undefined } as Fact, nameOf),
    });
  }

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
  const hasSecrets = Boolean(CAT_SECRETS[cat.id]?.length);
  const diaries = viewerState === "stranger" ? diariesAll.slice(0, 3) : diariesAll;

  const friendCards: FriendCard[] = friends.map((f) => ({
    relId: f.id,
    otherId: f.otherId,
    otherName: f.otherName,
    otherPortraitUrl: f.otherPortraitUrl,
    affinityText: describeAffinity(f.affinity),
    story: latestWith.get(f.otherId) ?? null,
  }));

  return (
    <div className="mx-auto max-w-3xl">
      {/* ============ 首屏:生活照 + 它是谁、现在怎么样(60/40) ============ */}
      <div className="gap-6 md:grid md:grid-cols-5">
        <div className="md:col-span-3">
          <CatHeroScene
            name={cat.name}
            lifePhoto={lifePhoto}
            arrivalPhoto={isOwner ? cat.arrivalPhotoUrl : null}
            catId={cat.id}
            portraitUrl={cat.portraitUrl}
          />
        </div>

        <div className="mt-5 md:col-span-2 md:mt-0">
          <p className="text-xs tracking-widest text-ink-faint">
            {viewerState === "owner" ? "它在岛上的小屋" : viewerState === "friend" ? `${myCat!.name}的朋友` : "岛上的居民"}
          </p>
          <h1 className="font-title mt-1 text-2xl font-bold">{cat.name}</h1>
          <p className="mt-1 text-sm text-ink-soft">{cat.appearance}</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cat.personaTags.map((tag) => (
              <span key={tag} className="border border-line px-2 py-0.5 text-xs text-ink-soft">
                {tag}
              </span>
            ))}
          </div>
          {viewerState === "stranger" && bioFirstLine && (
            <p className="mt-2 text-sm leading-relaxed text-ink">{bioFirstLine}</p>
          )}

          <CatCurrentMoment nowText={nowText} mood={state?.mood} />

          {isOwner && (
            <a href="#nudge" className="mt-3 inline-block text-sm text-sea-deep hover:text-brick">
              给它留句话 ↓
            </a>
          )}
          {viewerState === "stranger" && (
            <p className="mt-3 text-xs text-ink-faint">
              {hasSecrets && <>有猫说,它藏着一个秘密。</>}
              <a href="#lifebook" className="text-sea-deep hover:text-brick">
                去看看它的生活册 ↓
              </a>
            </p>
          )}
          {!cat.isNpc && !cat.portraitUrl && (
            <p className="mt-2 text-xs text-ink-faint">专属立绘绘制中，稍后刷新查看</p>
          )}
        </div>
      </div>

      {/* ============ 它和你的猫(熟猫的关系入口) ============ */}
      {viewerState === "friend" && myCat && myRel && (
        <CatBond
          myCatName={myCat.name}
          affinityText={describeAffinity(myRel.affinity)}
          firstMetDay={firstMetWith.get(myCat.id) ?? null}
          latestStory={latestWith.get(myCat.id) ?? null}
        />
      )}

      {/* ============ 近况(散文体,熟人以上可见;细账仅主人) ============ */}
      {viewerState !== "stranger" && (
        <div className="margin-note mt-6 border-t border-line pt-4">
          <p className="text-xs tracking-widest text-ink-faint">
            {daysOnIsland ? `来岛第 ${daysOnIsland} 天` : `猫啊岛历 第 ${world.day} 天`}
            {cat.goal && GOAL_LINES[cat.goal] ? ` · ${GOAL_LINES[cat.goal]}` : ""}
          </p>
          {cat.bio && <p className="mt-2">{cat.bio}</p>}
          {state && (
            <>
              <p className="mt-1">{coinsLine(state.coins)}</p>
              <p>{energyLine(state.energy)}</p>
              {isOwner && (
                <details className="mt-1 text-xs text-ink-faint">
                  <summary className="cursor-pointer">翻开细账</summary>
                  <p className="mt-1">鱼币 {state.coins} 枚 · 体力 {state.energy} · 此刻在{state.location}</p>
                </details>
              )}
            </>
          )}
        </div>
      )}

      {/* ============ 还没讲完的故事 ============ */}
      {viewerState !== "stranger" && storylines.length > 0 && (
        <div className="mt-6 border-t border-line pt-4">
          <p className="text-xs tracking-widest text-ink-faint">还没讲完的故事</p>
          {storylines.map((s) => (
            <p key={s.id} className="font-diary mt-1.5 text-[15px] text-ink">
              {s.kind === "shop"
                ? `它正在经营「${String((s.data as Record<string, unknown> | null)?.name ?? "小店")}」,第 ${s.startDay} 天开张的。`
                : `「${THREAD_LABELS[s.kind] ?? s.kind}」${threadStage(s.step, s.kind === "lighthouse" ? 7 : undefined)}。`}
            </p>
          ))}
        </div>
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

      {/* ============ 它还记得 + 一个小秘密 ============ */}
      {viewerState !== "stranger" && (
        <CatMemoryBox
          firstWordsLine={
            isOwner && cat.firstWords ? `你第一次对它说:「${cat.firstWords}」——它一直留着这句话。` : null
          }
          keepsakes={keepsakes}
          secret={secret}
        />
      )}

      {/* ============ 生活册 ============ */}
      <CatLifeBook name={cat.name} catId={cat.id} pages={diaries} catIndex={catIndex} />
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
