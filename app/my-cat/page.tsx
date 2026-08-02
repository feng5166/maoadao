import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { BoatArriving } from "@/components/BoatArriving";
import { PetCat } from "@/components/PetCat";
import { StayTrack } from "@/components/StayTrack";
import { WechatConnect } from "@/components/WechatConnect";
import { SubmitButton } from "@/components/SubmitButton";
import { Track } from "@/components/Track";
import { keepArrivalPromise, renameCat, saveNudge } from "@/lib/actions";
import { archiveArrivalNote, buildArrivalChecklist, markArrivalCelebrated } from "@/lib/arrival";
import { getViewerId } from "@/lib/identity";
import { getCatState, getLatestSummary, getPendingNudge, getViewerCat, getWorld } from "@/lib/queries";
import { marginNotes, petLine, sceneFor, todayLabel } from "@/lib/handbook";
import { beijingHour, currentSegment, nowLine, sameBeijingDay, unlockedSegments } from "@/lib/moments";
import { wechatEnabled } from "@/lib/wechat/bridge";
import { bondStage } from "@/lib/sim/firstweek";
import { catDayOf, inArrival } from "@/lib/sim/lifecycle";
import { factSummary } from "@/lib/sim/engine";
import { SEGMENT_CN, type Fact, type Segment } from "@/lib/sim/types";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 今日手账：单页连续叙事，不是卡片集合（v0.7）。
// 顺序：日期天气 → 场景与猫 → 一句状态 → 故事正文 → 它记得你昨天说的话 → 页边批注 → 今晚留句话 → 页尾悬念

export default async function MyCatPage({ searchParams }: { searchParams: Promise<{ from?: string }> }) {
  const { from } = await searchParams;
  const viewerId = await getViewerId();
  const cat = await getViewerCat(viewerId);
  if (!cat) redirect("/adopt");
  const world = await getWorld(); // 60s 模块缓存，通常不产生查询

  // ============ 第一波：彼此无依赖的查询全部并行（doc/11 P1-3）============
  // 跨洋链路下每次串行往返 ~215ms：原先 14 次串行，现压成 2-3 波
  const [state, summary, pendingNudge, firstEvent, nudgeTotal, weekBook, viewer, arrivalNote, echoRaw, todayEvents] =
    await Promise.all([
      getCatState(cat.id),
      getLatestSummary(cat.id),
      getPendingNudge(cat.id),
      prisma.event.findFirst({ where: { catId: cat.id }, orderBy: { day: "asc" }, select: { day: true } }),
      prisma.ownerNudge.count({ where: { catId: cat.id } }),
      prisma.weekBook.findUnique({ where: { catId_weekIndex: { catId: cat.id, weekIndex: 1 } } }),
      prisma.user.findUnique({ where: { id: viewerId! }, select: { lastSeenDay: true, visitDays: true } }),
      prisma.arrivalNote.findUnique({ where: { catId: cat.id } }),
      // 留言回音：多取一条，最新一天的（已在上方展示）由下面过滤
      prisma.catDailySummary.findMany({
        where: { catId: cat.id, interventionResponse: { not: null } },
        orderBy: { day: "desc" },
        take: 6,
        select: { id: true, day: true, interventionResponse: true },
      }),
      prisma.event.findMany({ where: { catId: cat.id, day: world.day } }),
    ]);

  // 猫龄改读 firstTickDay（doc/14 §一）；0 = 未回填历史数据，回退首事件倒推
  const firstTickDay = cat.firstTickDay > 0 ? cat.firstTickDay : (firstEvent?.day ?? world.day) + 1;
  // ARRIVAL 阶段（doc/14 §三）：D1 是入岛微型时间，按相遇流程揭示，豁免正常时段门
  const arrivalPhase = inArrival(world.day, firstTickDay);
  const daysOnIsland = catDayOf(world.day, firstTickDay);
  const everNudged = nudgeTotal > 0;
  const missedDays = viewer?.lastSeenDay != null ? world.day - viewer.lastSeenDay : 0;
  const echoHistory = summary ? echoRaw.filter((e) => e.day < summary.day).slice(0, 5) : [];

  // 第一天的小约定：note/nudgeCount 已在第一波预取，纯构建不再查库；
  // 刚记住的单件这次高亮庆祝一次，展示过就记下，下次回归安静的划掉态。
  // 第三件事按通道开关切换：微信可用 → "给它留一个能找到你的方式"(doc/13 T3)
  const wechatBound = wechatEnabled() && arrivalNote?.archivedAt == null
    ? Boolean(await prisma.channel.findFirst({ where: { userId: viewerId!, kind: "wechat_openclaw" }, select: { id: true } }))
    : false;
  const arrival = buildArrivalChecklist(
    cat.name,
    cat.firstWords,
    arrivalNote,
    nudgeTotal,
    wechatEnabled() ? { mode: "connect", done: wechatBound } : undefined,
  );
  const justDoneKeys = arrival?.tasks.filter((t) => t.justDone).map((t) => t.key) ?? [];
  if (arrival?.allDone) after(() => archiveArrivalNote(cat.id));
  else if (justDoneKeys.length > 0) after(() => markArrivalCelebrated(cat.id, justDoneKeys));

  const isNewVisitDay = viewer?.lastSeenDay !== world.day;
  after(() =>
    prisma.user
      .update({
        where: { id: viewerId! },
        data: { lastActiveAt: new Date(), lastSeenDay: world.day, ...(isNewVisitDay ? { visitDays: { increment: 1 } } : {}) },
      })
      .catch(() => {}),
  );
  const hour = beijingHour();
  const funnelEvents: { name: string; props?: Record<string, string | number | boolean> }[] = [
    // seg 进埋点：验证"时段解锁"是否带来同日二次打开（doc/09 §9）
    { name: "daily_story_view", props: { islandDay: world.day, catDay: daysOnIsland, seg: currentSegment(hour) ?? "night" } },
  ];
  if (daysOnIsland <= 1) funnelEvents.push({ name: "first_story_view", props: { catId: cat.id } });
  else funnelEvents.push({ name: "next_day_return", props: { catDay: daysOnIsland } });

  const bond = bondStage(daysOnIsland, nudgeTotal, viewer?.visitDays ?? 0);
  const choices = ((summary?.choices ?? null) as { value: string; label: string }[] | null) ?? null;
  const missedOne = viewer?.lastSeenDay != null && world.day - viewer.lastSeenDay === 2;
  const threadProgress = ((summary?.threadProgress ?? []) as { label: string; step: number; total?: number; done?: boolean; failed?: boolean }[]) ?? [];
  // 今天落幕的事件线：办成一件事是值得郑重庆祝的时刻，单独收束，不混进页边批注
  const finishedThreads = threadProgress.filter((t) => t.done);
  const notes = summary
    ? marginNotes((summary.stateChanges ?? []) as { label: string; delta: string }[], threadProgress)
    : [];
  const scene = sceneFor(state?.location);

  // ============ "它现在怎么样"（doc/09 §5）：时段门的推导，全部内存计算 ============
  const segOrder: Record<string, number> = { morning: 0, afternoon: 1, evening: 2 };
  todayEvents.sort((a, b) => (segOrder[a.segment] ?? 0) - (segOrder[b.segment] ?? 0) || (a.isMain ? -1 : 1));
  const targetIds = [...new Set(todayEvents.map((e) => e.targetId).filter((x): x is string => !!x))];
  // 早八 cron 还没跑完时 world.day 还是昨天——那是完整过完的一天，不做时段裁剪。
  // ARRIVAL_DAY(doc/12 §五 + doc/14 §三):来岛第一天是全产品唯一豁免时段门的一天——
  // 任何现实时刻登岛,首日剧本完整播放;世界时间 ≠ 用户时间。
  // catDayOf 锚定 firstTickDay 后，daysOnIsland<=1 与 ARRIVAL 阶段严格等价（被准入门跳过的那天也算 D1）
  const arrivalDay = arrivalPhase;
  const gating = !arrivalDay && (hour < 8 || (world.lastTickAt != null && sameBeijingDay(world.lastTickAt, new Date())));
  const unlocked = new Set<string>(gating ? unlockedSegments(hour) : ["morning", "afternoon", "evening"]);
  const dayComplete = unlocked.size === 3;
  // 日记是一天的收束（doc/09 §5）：晚上六点起亮出今天的；白天先读昨天的，早八先看"它怎么说"。
  const showTodayStory = dayComplete || (summary != null && summary.day < world.day);

  // ============ 第二波：依赖第一波结果的查询并行 ============
  const [missedSummaries, commission, targets, prevSummary] = await Promise.all([
    missedDays >= 3
      ? prisma.catDailySummary.findMany({
          where: { catId: cat.id, day: { gt: viewer!.lastSeenDay!, lt: summary?.day ?? world.day } },
          orderBy: { day: "asc" },
        })
      : Promise.resolve([]),
    // 待办的邻居委托：把"这件事"具体成"棉花托你的事"
    choices
      ? prisma.storyline.findFirst({ where: { catId: cat.id, kind: "commission", status: "active", step: 1 } })
      : Promise.resolve(null),
    targetIds.length
      ? prisma.cat.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } })
      : Promise.resolve([]),
    !showTodayStory && summary
      ? prisma.catDailySummary.findFirst({ where: { catId: cat.id, day: { lt: summary.day } }, orderBy: { day: "desc" } })
      : Promise.resolve(null),
  ]);
  const commissionNpc = commission ? String((commission.data as Record<string, unknown>).npcName ?? "") : "";
  const targetById = new Map(targets.map((t) => [t.id, { name: t.name }]));
  // ARRIVAL 阶段"此刻"照走现实时段（深夜自动睡下变体），事件集是到岛专用的三条
  const seg = gating || arrivalPhase ? currentSegment(hour) : null;
  const nowEvent = arrivalDay
    ? (todayEvents.find((e) => e.type === "arrival_home") ?? todayEvents.find((e) => e.type === "arrival") ?? null)
    : seg
      ? (todayEvents.find((e) => e.segment === seg && e.isMain) ?? todayEvents.find((e) => e.segment === seg) ?? null)
      : null;
  const nowText = nowLine(
    cat.name,
    nowEvent
      ? {
          type: nowEvent.type,
          data: nowEvent.data as Record<string, unknown>,
          targetName: nowEvent.targetId ? targetById.get(nowEvent.targetId)?.name : null,
        }
      : null,
    hour,
    state?.location,
  );
  const timeline = todayEvents
    .filter((e) => unlocked.has(e.segment))
    .map((e) => ({
      id: e.id,
      seg: SEGMENT_CN[e.segment as Segment],
      text: factSummary({ type: e.type, outcome: e.outcome, data: e.data as Record<string, unknown>, targetId: e.targetId ?? undefined } as Fact, targetById),
    }));

  // 第三波（仅白天读昨日日记时多一跳）：展示那篇日记的形态
  const displayed = showTodayStory ? summary : prevSummary;
  const displayedDiary = displayed
    ? await prisma.diaryEntry.findUnique({ where: { catId_day: { catId: cat.id, day: displayed.day } }, select: { form: true } })
    : null;

  // 未寄出的信(doc/11 §六):24h 窗口关了发不出去的消息不丢弃——
  // 变成 Web 上的一封信,提示回微信一句重开窗口。只展示最新且未被后续送达取代的一封。
  const unsentLetter = wechatEnabled()
    ? await prisma.outboundMessage.findFirst({
        where: { userId: viewerId!, createdAt: { gte: new Date(Date.now() - 3 * 86400_000) } },
        orderBy: { createdAt: "desc" },
      }).then((m) => (m?.status === "window_closed" ? m : null))
    : null;

  // D2 双向履约(doc/12 §八.3):主人答应回来,并真的回来了——只在 D2 首次有效回访出现一次
  const promiseKept = daysOnIsland === 2 && isNewVisitDay;
  if (promiseKept) funnelEvents.push({ name: "d2_promise_view" });

  // 猫对主人的第一印象(doc/12 §三.4):亮相期(D1-2)在照片下露一行
  const impressionMemo =
    daysOnIsland <= 2 ? await prisma.memoryEntry.findFirst({ where: { catId: cat.id, kind: "first_impression" } }) : null;

  return (
    <div className="mx-auto max-w-lg">
      <Track events={funnelEvents} />
      <StayTrack page="my-cat" />

      {/* 页眉：日期与天气（手账体例） */}
      <p className="text-center text-xs tracking-widest text-ink-faint">
        {todayLabel()} · 来岛第 {daysOnIsland} 天 · {world.weather}
      </p>

      {/* D2 双向履约:先确认"你回来了",再看它怎么说(doc/12 §八.3,一次性) */}
      {promiseKept && (
        <p className="font-diary mt-4 text-center text-[17px] text-ink">你真的来了。</p>
      )}

      {/* 首屏 = 它现在怎么样（doc/10 §5）：场景、此刻、心情——先看见它在生活，再读故事 */}
      <div className="relative mt-3 overflow-hidden rounded-lg border border-line">
        <Image src={scene} alt="" width={1200} height={686} priority className="w-full" />
        <PetCat id={cat.id} portraitUrl={cat.portraitUrl} line={petLine(cat.id, world.day, state?.mood)} />
      </div>

      {/* 此刻状态行：当前时段事实的现在时（doc/09：打开=看它此刻在干嘛） */}
      <p className="font-diary mt-4 text-center text-[15px] text-ink">{nowText}</p>
      {/* 微信来的路(doc/11 修订 §五):确认刚才那句话已收进——只说"收到",不说"照做" */}
      {from === "wechat" && pendingNudge?.message && (
        <p className="mt-1.5 text-center text-xs text-ink-soft">
          你刚从微信里告诉它:「{pendingNudge.message}」——它把这句话收进了今天的纸条。
        </p>
      )}
      <p className="mt-1 text-center text-xs text-ink-soft">这会儿的心情：{state?.mood ?? "平静"}</p>
      {/* 船靠岸(doc/12 §八.9):首日的生成等待是世界过程,不是 loading */}
      {!cat.portraitUrl &&
        (arrivalDay ? <BoatArriving stage="boat" /> : <p className="mt-1 text-center text-xs text-ink-faint">它的画像还在画，稍后刷新看看</p>)}
      {arrivalDay && cat.portraitUrl && !cat.arrivalPhotoUrl && <BoatArriving stage="photo" />}
      <p className="mt-1.5 text-center text-xs text-ink-faint">{bond.line}</p>
      {missedOne && (
        <p className="mt-1 text-center text-xs text-ink-faint">昨天你没来，它还是把日记写好了。</p>
      )}

      {/* 首访引导：三句话讲清产品，完成第一次留言后消失 */}
      {!everNudged && (
        <div className="mt-5 border border-line bg-paper-deep/40 p-4 text-center">
          <p className="font-diary text-[15px] leading-[2] text-ink">
            这是{cat.name}在岛上的家。
            <br />
            它会在你离开后继续生活——钓鱼、串门、卷进故事。
            <br />
            你说的话它会记住，但听不听，它有自己的主意。
          </p>
          <p className="mt-2 text-xs text-ink-soft">↓ 往下翻，给它留句话，明早八点回来看它怎么说</p>
        </div>
      )}

      {/* 相遇照片：第一天你和它的第一张照片（立绘定稿后合成，D1 的小高潮） */}
      {cat.arrivalPhotoUrl && daysOnIsland <= 2 && (
        <div className="mt-5">
          <Track events={[{ name: "arrival_photo_view" }]} />
          <div className="note-slip mx-auto max-w-sm p-3" style={{ transform: "rotate(-0.8deg)" }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- 动态合成图走自有 API，长缓存 */}
            <img
              src={`${cat.arrivalPhotoUrl}?s=720`}
              alt={`${cat.name}来岛第一天的照片`}
              width={1000}
              height={687}
              className="h-auto w-full"
            />
            <p className="font-diary mt-2 text-center text-[14px] text-ink-soft">猫啊岛历 第 1 天 · 码头</p>
          </div>
          <p className="mt-1.5 text-center text-xs text-ink-faint">你们的第一张照片，它会一直收着。</p>
        </div>
      )}

      {/* 猫对主人的第一印象(doc/12 §三.4):亮相屏一行,与首日日记同源 */}
      {impressionMemo && (
        <p className="font-diary mt-3 text-center text-[14px] text-ink-soft">{impressionMemo.content}</p>
      )}

      {/* 让它找到你(doc/11):亮相后的主曝光——情感峰值点接关系动作 */}
      {daysOnIsland <= 2 && (
        <WechatConnect userId={viewerId!} catName={cat.name} variant="prominent" />
      )}

      {/* 第一天的小约定：码头塞给新岛民的一张纸，记满收进生活册。
          刚记住的一件高亮庆祝一次；三件记满郑重收束——盖章、道贺、交代往后的日子 */}
      {arrival && (
        <div className="note-slip mt-4 p-4" style={{ transform: "rotate(0.5deg)" }}>
          <div className="flex items-center justify-between">
            <p className="font-title text-sm font-bold">第一天的小约定</p>
            {arrival.allDone && <span className="seal">记住了</span>}
          </div>
          <p className="mt-0.5 text-xs text-ink-faint">
            {arrival.allDone ? `今天，${cat.name}记住了三件事。` : "不是要办的事——是它第一天想记住的三件小事。"}
          </p>
          <ul className="mt-2.5 space-y-2">
            {arrival.tasks.map((t) => (
              <li key={t.key} className="font-diary text-[15px] leading-snug">
                <span className={t.done ? (t.justDone ? "font-bold text-brick" : "text-ink-faint line-through") : "text-ink"}>
                  {t.done ? "✓" : "○"} {t.label}
                </span>
                {t.justDone && <span className="ml-1.5 text-xs text-brick">{t.cheer}</span>}
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
                      记住了，明天见
                    </SubmitButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
          {arrival.allDone && (
            <div className="mt-3 border-t border-line pt-2.5 text-xs leading-relaxed text-ink-soft">
              往后的日子就简单了：每天早上八点来看它写了什么，睡前给它
              <a href="#nudge" className="text-sea-deep hover:text-brick">留句话</a>，常去
              <Link href="/island" className="text-sea-deep hover:text-brick">公告栏</Link>串串门。
              <p className="mt-1 text-ink-faint">这张纸收进生活册了——它在岛上的日子，从今天正式开始。</p>
            </div>
          )}
        </div>
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

      {/* 微瞬间时间轴：当日事实按现实时段解锁（下午的事，要到下午才知道） */}
      {timeline.length > 0 && (
        <div className="mt-5 border-t border-line pt-4">
          <p className="text-center text-xs tracking-widest text-ink-faint">
            {dayComplete ? "它今天的一天" : "今天到现在"}
          </p>
          <ul className="mt-2 space-y-1.5">
            {timeline.map((t) => (
              <li key={t.id} className="font-diary text-[14px] leading-relaxed text-ink-soft">
                <span className="mr-1.5 text-xs text-ink-faint">{t.seg}</span>
                {t.text}
              </li>
            ))}
          </ul>
          {!dayComplete && (
            <p className="mt-2 text-center text-xs text-ink-faint">
              {hour < 13 ? "下午的事，要到下午才知道。" : "晚上的事，要到晚上才知道。"}
            </p>
          )}
        </div>
      )}

      {/* 早八先看"它怎么说"：今天的日记晚上才收束，但它对你留言的回应一早就在 */}
      {!showTodayStory && summary?.interventionResponse && (
        <div className="mt-6">
          <p className="text-xs tracking-widest text-ink-faint">它记得你昨天说的话</p>
          <p className="font-diary mt-1 border-l-2 border-line pl-3 text-[15px] leading-relaxed text-ink">
            {summary.interventionResponse}
          </p>
        </div>
      )}

      {/* 故事正文 + 更新状态 */}
      {summary && summary.day < world.day && (
        <p className="mt-4 text-center text-xs text-ink-faint">
          今天的日记还没送到（每天早上八点前后写好）——先看看它昨天写的
        </p>
      )}
      {!showTodayStory && displayed && (
        <p className="mt-4 text-center text-xs text-ink-faint">
          今天的日记要等它把这一天过完（晚上六点后来看）——先翻翻它昨天写的
        </p>
      )}
      {displayed ? (
        <article className="mt-6">
          <h1 className="font-title text-center text-xl font-bold">{displayed.headline}</h1>
          {displayedDiary?.form === "note" ? (
            <div className="note-slip mx-auto mt-4 max-w-sm p-4" style={{ transform: "rotate(-0.6deg)" }}>
              <p className="mb-1 text-xs text-ink-faint">它贴在门上的便条</p>
              <p className="font-diary whitespace-pre-wrap text-[15px] leading-[1.9] text-ink">{displayed.narrative}</p>
            </div>
          ) : displayedDiary?.form === "dialogue" ? (
            <div className="mx-auto mt-4 max-w-md border-l-2 border-line pl-4">
              <p className="mb-1 text-xs text-ink-faint">在岛上听到的对话</p>
              <p className="font-diary whitespace-pre-wrap text-[15px] leading-[2] text-ink">{displayed.narrative}</p>
            </div>
          ) : (
            <p className="font-diary mt-4 whitespace-pre-wrap text-[16px] leading-[2] text-ink">{displayed.narrative}</p>
          )}

          {/* 它记得你昨天说的话（收束态：随日记一起看） */}
          {showTodayStory && summary?.interventionResponse && (
            <div className="mt-6">
              <p className="text-xs tracking-widest text-ink-faint">它记得你昨天说的话</p>
              <p className="font-diary mt-1 border-l-2 border-line pl-3 text-[15px] leading-relaxed text-ink">
                {summary.interventionResponse}
              </p>
            </div>
          )}

          {/* 页边批注（属于今天的账，随收束一起亮） */}
          {showTodayStory && notes.length > 0 && (
            <div className="margin-note mt-6 border-t border-line pt-3">
              {notes.map((n, i) => (
                <p key={i}>{n}</p>
              ))}
            </div>
          )}

          {/* 事件线落幕：一件持续多日的事今天有了结局——郑重收束 + 交代往后 */}
          {showTodayStory && finishedThreads.length > 0 && (
            <div className="note-slip mt-6 p-4 text-center" style={{ transform: "rotate(-0.4deg)" }}>
              {finishedThreads.map((t) => (
                <div key={t.label} className="mt-2 first:mt-0">
                  <span className="seal">{t.failed ? "落幕" : "办成了"}</span>
                  <p className="font-diary mt-1.5 text-[15px] text-ink">
                    「{t.label}」{t.failed ? "到底没成——不过日子还长，岛上的事没有白经历的" : "有了结局"}。
                  </p>
                </div>
              ))}
              <p className="mt-2.5 text-xs text-ink-faint">
                这条线收进<Link href="/my-cat/history" className="text-sea-deep hover:text-brick">生活册</Link>了，随时能回看整件事
                ——过些天，还会有新的事找上它。
              </p>
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

      {/* 未寄出的信：窗口关了没送出去的话（doc/11 §六,平台限制翻译成情感资产） */}
      {unsentLetter && (
        <div className="note-slip mt-8 p-4" style={{ transform: "rotate(0.4deg)" }}>
          <p className="text-xs tracking-widest text-ink-faint">它写给你、没寄出去的信</p>
          <p className="font-diary mt-2 whitespace-pre-wrap text-[15px] leading-[1.9] text-ink">
            {unsentLetter.content.split("\n").filter((l) => !l.includes("http")).join("\n").trim()}
          </p>
          <p className="mt-2 text-xs text-ink-soft">在微信回它一句，信就能寄到了——隔太久没说话，送信的路就生了。</p>
        </div>
      )}

      {/* 今晚给它留句话（唯一的明显容器） */}
      <div id="nudge" className="mt-8 border border-line bg-paper-deep/40 p-4">
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
            {/* 建议选择器。D1 收进二级（doc/10 §7）：第一次见面不让主人"管理"猫——不选=它自己决定 */}
            {(() => {
              const picker = (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {daysOnIsland > 1 && (
                    <span className="text-xs text-ink-soft">
                      {commissionNpc ? `${commissionNpc}托付的事，你希望它……` : choices ? "这件事，你希望它……" : "你希望它明天……"}
                    </span>
                  )}
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
                      className="cursor-pointer border border-line px-2.5 py-1.5 has-[:checked]:border-sea-deep has-[:checked]:bg-paper"
                    >
                      <input type="radio" name="suggestion" value={o.v} defaultChecked={i === 0} className="hidden" />
                      {o.label}
                    </label>
                  ))}
                </div>
              );
              return daysOnIsland <= 1 ? (
                <details>
                  <summary className="cursor-pointer text-xs text-ink-soft">
                    你希望它明天更接近哪种生活？（不选的话，它自己决定）
                  </summary>
                  <div className="mt-2">{picker}</div>
                </details>
              ) : (
                picker
              );
            })()}
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

      {/* 页尾悬念（跟着展示的那篇日记走：白天是昨晚留的念想，正好指向今天） */}
      {displayed?.tomorrowHook && (
        <p className="font-diary mt-8 text-center text-[15px] italic leading-relaxed text-ink-soft">
          {displayed.tomorrowHook}
        </p>
      )}

      {/* 页脚小字：档案与分享入口 + 改名 */}
      <div className="mt-10 border-t border-line pt-4 text-center text-xs text-ink-faint">
        <div className="flex justify-center gap-4">
          <Link href="/my-cat/history" className="hover:text-brick">生活册</Link>
          <Link href={`/cats/${cat.id}`} className="hover:text-brick">它的公开主页</Link>
          {displayed && <Link href={`/share/${cat.id}/${displayed.day}`} className="hover:text-brick">分享卡</Link>}
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
