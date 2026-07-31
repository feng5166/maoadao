import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { CatAvatar } from "@/components/CatAvatar";
import { SubmitButton } from "@/components/SubmitButton";
import { Track } from "@/components/Track";
import { renameCat, saveNudge } from "@/lib/actions";
import { getViewerId } from "@/lib/identity";
import { getCatState, getLatestSummary, getPendingNudge, getViewerCat, getWorld } from "@/lib/queries";
import { marginNotes, sceneFor, todayLabel } from "@/lib/handbook";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 今日手账：单页连续叙事，不是卡片集合（v0.7）。
// 顺序：日期天气 → 场景与猫 → 一句状态 → 故事正文 → 它记得你昨天说的话 → 页边批注 → 今晚留句话 → 页尾悬念

export default async function MyCatPage() {
  const viewerId = await getViewerId();
  const cat = await getViewerCat(viewerId);
  if (!cat) redirect("/adopt");

  const [state, world, summary, pendingNudge] = await Promise.all([
    getCatState(cat.id),
    getWorld(),
    getLatestSummary(cat.id),
    getPendingNudge(cat.id),
  ]);
  const firstEvent = await prisma.event.findFirst({ where: { catId: cat.id }, orderBy: { day: "asc" }, select: { day: true } });
  const daysOnIsland = Math.max(1, world.day - (firstEvent?.day ?? world.day) + 1);
  const everNudged = (await prisma.ownerNudge.count({ where: { catId: cat.id } })) > 0;
  const viewer = await prisma.user.findUnique({ where: { id: viewerId! }, select: { lastSeenDay: true } });
  const missedDays = viewer?.lastSeenDay != null ? world.day - viewer.lastSeenDay : 0;
  const missedSummaries =
    missedDays >= 3
      ? await prisma.catDailySummary.findMany({
          where: { catId: cat.id, day: { gt: viewer!.lastSeenDay!, lt: summary?.day ?? world.day } },
          orderBy: { day: "asc" },
        })
      : [];

  after(() => prisma.user.update({ where: { id: viewerId! }, data: { lastActiveAt: new Date(), lastSeenDay: world.day } }).catch(() => {}));
  const funnelEvents: { name: string; props?: Record<string, string | number | boolean> }[] = [
    { name: "daily_story_view", props: { islandDay: world.day, catDay: daysOnIsland } },
  ];
  if (daysOnIsland <= 1) funnelEvents.push({ name: "first_story_view", props: { catId: cat.id } });
  else funnelEvents.push({ name: "next_day_return", props: { catDay: daysOnIsland } });

  const notes = summary
    ? marginNotes(
        (summary.stateChanges ?? []) as { label: string; delta: string }[],
        (summary.threadProgress ?? []) as { label: string; step: number; total?: number }[],
      )
    : [];
  const scene = sceneFor(state?.location);

  return (
    <div className="mx-auto max-w-lg">
      <Track events={funnelEvents} />

      {/* 页眉：日期与天气（手账体例） */}
      <p className="text-center text-xs tracking-widest text-ink-faint">
        {todayLabel()} · 来岛第 {daysOnIsland} 天 · {world.weather}
      </p>

      {/* 首访引导：三句话讲清产品，完成第一次留言后消失 */}
      {!everNudged && (
        <div className="mt-4 border border-line bg-paper-deep/40 p-4 text-center">
          <p className="font-diary text-[15px] leading-[2] text-ink">
            这是{cat.name}在岛上的家。
            <br />
            它会在你离开后继续生活——钓鱼、串门、卷进故事。
            <br />
            你说的话它会记住，但听不听，它有自己的主意。
          </p>
          <p className="mt-2 text-xs text-ink-soft">↓ 往下翻，给它留下第一句话，明早八点回来看它怎么说</p>
        </div>
      )}

      {/* 场景 + 猫 */}
      <div className="relative mt-3 overflow-hidden rounded-lg border border-line">
        <Image src={scene} alt="" width={1200} height={686} priority className="w-full" />
        <div className="absolute bottom-2 left-2 rounded-full border-2 border-paper">
          <CatAvatar id={cat.id} size={64} portraitUrl={cat.portraitUrl} />
        </div>
      </div>

      {/* 一句当前状态 */}
      <p className="font-diary mt-4 text-center text-[15px] text-ink">
        {cat.name}现在在{state?.location ?? "小屋"}，看起来{state?.mood ?? "很平静"}。
      </p>
      {!cat.portraitUrl && <p className="mt-1 text-center text-xs text-ink-faint">它的画像还在画，稍后刷新看看</p>}

      {/* 你不在的这几天 */}
      {missedSummaries.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-center text-xs tracking-widest text-ink-faint">
            你不在的这 {missedDays} 天，{cat.name}经历了几件事
          </p>
          <div className="mt-2 space-y-2">
            {missedSummaries.map((m) => (
              <details key={m.id}>
                <summary className="font-diary cursor-pointer list-none text-[15px] text-ink-soft">
                  · {m.headline}
                  <span className="ml-1 text-xs text-ink-faint">（展开）</span>
                </summary>
                <p className="font-diary mt-1 whitespace-pre-wrap pl-3 text-[15px] leading-[1.9]">{m.narrative}</p>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* 故事正文 + 更新状态 */}
      {summary && summary.day < world.day && (
        <p className="mt-4 text-center text-xs text-ink-faint">
          今天的日记还没送到（每天早上八点前后写好）——先看看它昨天写的
        </p>
      )}
      {summary ? (
        <article className="mt-6">
          <h1 className="font-title text-center text-xl font-bold">{summary.headline}</h1>
          <p className="font-diary mt-4 whitespace-pre-wrap text-[16px] leading-[2] text-ink">{summary.narrative}</p>

          {/* 它记得你昨天说的话 */}
          {summary.interventionResponse && (
            <div className="mt-6">
              <p className="text-xs tracking-widest text-ink-faint">它记得你昨天说的话</p>
              <p className="font-diary mt-1 border-l-2 border-line pl-3 text-[15px] leading-relaxed text-ink">
                {summary.interventionResponse}
              </p>
            </div>
          )}

          {/* 页边批注 */}
          {notes.length > 0 && (
            <div className="margin-note mt-6 border-t border-line pt-3">
              {notes.map((n, i) => (
                <p key={i}>{n}</p>
              ))}
            </div>
          )}
        </article>
      ) : (
        <p className="font-diary mt-8 text-center text-[15px] leading-relaxed text-ink-soft">
          {cat.name}正在熟悉小岛。它的第一篇日记今晚就会写好——
          <br />
          它会在你离开后继续生活，明天回来看看它写了什么。
        </p>
      )}

      {/* 今晚给它留句话（唯一的明显容器） */}
      <div className="mt-8 border border-line bg-paper-deep/40 p-4">
        <h2 className="font-title font-bold">今晚给它留句话</h2>
        {pendingNudge ? (
          <p className="font-diary mt-2 text-sm leading-relaxed text-ink">
            {cat.name}把你的话记下了。听不听，要看它自己的决定——
            <br />
            明天早上八点之后回来，看看它怎么说。
          </p>
        ) : (
          <form action={saveNudge} className="mt-3 space-y-3">
            <input type="hidden" name="catId" value={cat.id} />
            <textarea
              name="message" maxLength={60} rows={2} placeholder={`想对${cat.name}说的话（60 字内）`}
              className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
            />
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" name="isPublic" className="accent-[#5c7382]" />
              它可以在日记里提到这句话（不勾选就只有它自己知道）
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
                <label
                  key={o.v}
                  className="cursor-pointer border border-line px-2.5 py-1 has-[:checked]:border-sea-deep has-[:checked]:bg-paper"
                >
                  <input type="radio" name="suggestion" value={o.v} defaultChecked={i === 0} className="hidden" />
                  {o.label}
                </label>
              ))}
            </div>
            <SubmitButton pendingText="正在交给它…" className="stamp-btn px-5 py-1.5 text-sm">
              交给它
            </SubmitButton>
          </form>
        )}
      </div>

      {/* 页尾悬念 */}
      {summary?.tomorrowHook && (
        <p className="font-diary mt-8 text-center text-[15px] italic leading-relaxed text-ink-soft">
          {summary.tomorrowHook}
        </p>
      )}

      {/* 页脚小字：档案与分享入口 + 改名 */}
      <div className="mt-10 border-t border-line pt-4 text-center text-xs text-ink-faint">
        <div className="flex justify-center gap-4">
          <Link href="/my-cat/history" className="hover:text-brick">生活册</Link>
          <Link href={`/cats/${cat.id}`} className="hover:text-brick">它的公开主页</Link>
          {summary && <Link href={`/share/${cat.id}/${summary.day}`} className="hover:text-brick">今日分享卡</Link>}
        </div>
        {!cat.renamedAt && (
          <details className="mt-3">
            <summary className="cursor-pointer">名字想改一下？（机会只有一次）</summary>
            <form action={renameCat} className="mt-2 flex justify-center gap-2">
              <input
                name="newName" maxLength={12} placeholder="新名字"
                className="border border-line bg-paper px-3 py-1.5 focus:border-sea-deep focus:outline-none"
              />
              <SubmitButton pendingText="…" className="border border-line px-4 py-1.5 text-ink-soft hover:border-sea-deep">
                就叫这个
              </SubmitButton>
            </form>
          </details>
        )}
      </div>
    </div>
  );
}
