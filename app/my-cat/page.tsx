import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { PetCat } from "@/components/PetCat";
import { StayTrack } from "@/components/StayTrack";
import { SubmitButton } from "@/components/SubmitButton";
import { Track } from "@/components/Track";
import { keepArrivalPromise, renameCat, saveNudge } from "@/lib/actions";
import { archiveArrivalNote, getArrivalChecklist } from "@/lib/arrival";
import { getViewerId } from "@/lib/identity";
import { getCatState, getLatestSummary, getPendingNudge, getViewerCat, getWorld } from "@/lib/queries";
import { marginNotes, petLine, sceneFor, todayLabel } from "@/lib/handbook";
import { bondStage } from "@/lib/sim/firstweek";
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
  const nudgeTotal = await prisma.ownerNudge.count({ where: { catId: cat.id } });
  const everNudged = nudgeTotal > 0;
  const weekBook = await prisma.weekBook.findUnique({ where: { catId_weekIndex: { catId: cat.id, weekIndex: 1 } } });
  const todayDiary = summary ? await prisma.diaryEntry.findUnique({ where: { catId_day: { catId: cat.id, day: summary.day } }, select: { form: true } }) : null;
  const viewer = await prisma.user.findUnique({ where: { id: viewerId! }, select: { lastSeenDay: true, visitDays: true } });
  const missedDays = viewer?.lastSeenDay != null ? world.day - viewer.lastSeenDay : 0;
  const missedSummaries =
    missedDays >= 3
      ? await prisma.catDailySummary.findMany({
          where: { catId: cat.id, day: { gt: viewer!.lastSeenDay!, lt: summary?.day ?? world.day } },
          orderBy: { day: "asc" },
        })
      : [];

  // 留言回音历史：往期它对你留言的反应（当天的已在上方"它记得你昨天说的话"展示，这里收更早的）
  const echoHistory = summary
    ? await prisma.catDailySummary.findMany({
        where: { catId: cat.id, day: { lt: summary.day }, interventionResponse: { not: null } },
        orderBy: { day: "desc" },
        take: 5,
        select: { id: true, day: true, interventionResponse: true },
      })
    : [];

  // 入岛三件事：三件做完时这次仍完整显示（划掉+告别文案），渲染后收册
  const arrival = await getArrivalChecklist(cat.id, cat.name);
  if (arrival?.allDone) after(() => archiveArrivalNote(cat.id));

    const isNewVisitDay = viewer?.lastSeenDay !== world.day;
  after(() =>
    prisma.user
      .update({
        where: { id: viewerId! },
        data: { lastActiveAt: new Date(), lastSeenDay: world.day, ...(isNewVisitDay ? { visitDays: { increment: 1 } } : {}) },
      })
      .catch(() => {}),
  );
  const funnelEvents: { name: string; props?: Record<string, string | number | boolean> }[] = [
    { name: "daily_story_view", props: { islandDay: world.day, catDay: daysOnIsland } },
  ];
  if (daysOnIsland <= 1) funnelEvents.push({ name: "first_story_view", props: { catId: cat.id } });
  else funnelEvents.push({ name: "next_day_return", props: { catDay: daysOnIsland } });

  const bond = bondStage(daysOnIsland, nudgeTotal, viewer?.visitDays ?? 0);
  const choices = ((summary?.choices ?? null) as { value: string; label: string }[] | null) ?? null;
  // 待办的邻居委托：把"这件事"具体成"棉花托你的事"
  const commission = choices
    ? await prisma.storyline.findFirst({ where: { catId: cat.id, kind: "commission", status: "active", step: 1 } })
    : null;
  const commissionNpc = commission ? String((commission.data as Record<string, unknown>).npcName ?? "") : "";
  const missedOne = viewer?.lastSeenDay != null && world.day - viewer.lastSeenDay === 2;
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
      <StayTrack page="my-cat" />

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

      {/* 入岛三件事：码头塞给新岛民的一张纸，做完收进生活册 */}
      {arrival && (
        <div className="note-slip mt-4 p-4" style={{ transform: "rotate(0.5deg)" }}>
          <p className="font-title text-sm font-bold">入岛须知</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            {arrival.allDone ? "都办妥了——这张纸收进生活册了。" : `把${cat.name}安顿好，就这三件事。`}
          </p>
          <ul className="mt-2.5 space-y-2">
            {arrival.tasks.map((t) => (
              <li key={t.key} className="font-diary text-[15px] leading-snug">
                <span className={t.done ? "text-ink-faint line-through" : "text-ink"}>
                  {t.done ? "✓" : "○"} {t.label}
                </span>
                {!t.done && (
                  <span className="ml-1.5 text-xs text-ink-faint">
                    {t.hint}
                    {t.key === "meet" && (
                      <>
                        {" · "}
                        <Link href="/island" className="text-sea-deep hover:text-brick">去公告栏</Link>
                      </>
                    )}
                  </span>
                )}
                {!t.done && t.key === "promise" && (
                  <form action={keepArrivalPromise} className="mt-1">
                    <SubmitButton pendingText="…" className="border border-line px-3 py-1 text-xs text-sea-deep hover:border-sea-deep">
                      记住了，明早八点见
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 场景 + 猫（可摸摸它：每天一句由状态确定性生成的反应） */}
      <div className="relative mt-3 overflow-hidden rounded-lg border border-line">
        <Image src={scene} alt="" width={1200} height={686} priority className="w-full" />
        <PetCat id={cat.id} portraitUrl={cat.portraitUrl} line={petLine(cat.id, world.day, state?.mood)} />
      </div>

      {/* 一句当前状态 */}
      <p className="font-diary mt-4 text-center text-[15px] text-ink">
        {cat.name}现在在{state?.location ?? "小屋"}，看起来{state?.mood ?? "很平静"}。
      </p>
      {!cat.portraitUrl && <p className="mt-1 text-center text-xs text-ink-faint">它的画像还在画，稍后刷新看看</p>}
      <p className="mt-1.5 text-center text-xs text-ink-faint">{bond.line}</p>
      {missedOne && (
        <p className="mt-1 text-center text-xs text-ink-faint">昨天你没来，它还是把日记写好了。</p>
      )}

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
          {todayDiary?.form === "note" ? (
            <div className="note-slip mx-auto mt-4 max-w-sm p-4" style={{ transform: "rotate(-0.6deg)" }}>
              <p className="mb-1 text-xs text-ink-faint">它贴在门上的便条</p>
              <p className="font-diary whitespace-pre-wrap text-[15px] leading-[1.9] text-ink">{summary.narrative}</p>
            </div>
          ) : todayDiary?.form === "dialogue" ? (
            <div className="mx-auto mt-4 max-w-md border-l-2 border-line pl-4">
              <p className="mb-1 text-xs text-ink-faint">今天在岛上听到的对话</p>
              <p className="font-diary whitespace-pre-wrap text-[15px] leading-[2] text-ink">{summary.narrative}</p>
            </div>
          ) : (
            <p className="font-diary mt-4 whitespace-pre-wrap text-[16px] leading-[2] text-ink">{summary.narrative}</p>
          )}

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

      {/* 往期回音：它这些天怎么回应你说过的话（读自己留下的痕迹，也喂"它记得我"的认知） */}
      {echoHistory.length > 0 && (
        <details className="mt-8 border-t border-line pt-4">
          <summary className="cursor-pointer list-none text-xs tracking-widest text-ink-faint">
            它这些天怎么回应你说过的话（{echoHistory.length}）
          </summary>
          <div className="mt-3 space-y-3">
            {echoHistory.map((e) => (
              <div key={e.id} className="border-l-2 border-line pl-3">
                <p className="text-[11px] text-ink-faint">第 {e.day} 天</p>
                <p className="font-diary mt-0.5 text-[15px] leading-relaxed text-ink">{e.interventionResponse}</p>
              </div>
            ))}
          </div>
        </details>
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
              <span className="text-xs text-ink-soft">
                {commissionNpc ? `${commissionNpc}托付的事，你希望它……` : choices ? "这件事，你希望它……" : "你希望它明天……"}
              </span>
              {(choices
                ? [{ v: "", label: "让它自己拿主意" }, ...choices.map((c) => ({ v: c.value, label: c.label }))]
                : [
                    { v: "", label: "随它去" },
                    { v: "earn", label: "去赚点鱼币" },
                    { v: "explore", label: "出门走走" },
                    { v: "social", label: "找朋友玩" },
                    { v: "rest", label: "好好休息" },
                  ]
              ).map((o, i) => (
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

      {weekBook && (
        <div className="mt-8 text-center">
          <Link href="/my-cat/week" className="seal">我们的第一周 →</Link>
        </div>
      )}

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
          <Link href="/account#tickets" className="hover:text-brick">送朋友船票</Link>
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
