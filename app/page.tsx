import Link from "next/link";
import { SceneImage } from "@/components/SceneImage";
import { CatAvatar } from "@/components/CatAvatar";
import { PetCat } from "@/components/PetCat";
import { LivingImage } from "@/components/LivingImage";
import { resolveMotion } from "@/lib/visual/motion";
import { StayTrack } from "@/components/StayTrack";
import { Track } from "@/components/Track";
import { getViewerId } from "@/lib/identity";
import { getCatNameIndex, getHomeShowcase, getIslandNewsWithCats } from "@/lib/queries";
import { beijingHour, currentSegment, nowLine } from "@/lib/moments";
import { factSummary } from "@/lib/sim/engine";
import { petLine } from "@/lib/handbook";
import { hashSeed, mulberry32, pick } from "@/lib/sim/rng";
import { lookupTicket } from "@/lib/tickets";
import { readVisitState } from "@/lib/visit";
import { FLOW_VERSION } from "@/lib/d0/script";
import { MarkIslandVisit } from "@/components/MarkIslandVisit";
import type { Fact } from "@/lib/sim/types";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 首页 = 猫啊岛的一扇窗(2.1 翻转,2026-08-09):先看到岛上此刻正在发生的事,再决定上岛。
// 分流唯一主身份信号 = hasYard(14 §九 红线③:hasCat 转 backend-only,永不再参与路由)。
// 新访客 = 值班猫在码头 + 上岛看看;岛民 = 回院子。

// 值班猫候选:社交型 NPC(每天换一只,明天再来是另一只——活感的最便宜来源)
const DUTY_POOL = ["npc-mianhua", "npc-juzi", "npc-bingfen", "npc-xiaomei", "npc-heidou", "npc-lingdang"];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  const viewerId = await getViewerId();
  const [myHome, { world, npcs, totalCats, sampleDiary }, newsRaw, catIndex] = await Promise.all([
    viewerId
      ? prisma.home.findUnique({ where: { userId: viewerId }, select: { yard: { select: { id: true } } } })
      : Promise.resolve(null),
    getHomeShowcase(),
    getIslandNewsWithCats(6),
    getCatNameIndex(),
  ]);
  const hasYard = Boolean(myHome?.yard);
  const todayEvents = await prisma.event.findMany({
    where: { day: world.day },
    select: { id: true, catId: true, segment: true, type: true, outcome: true, data: true, targetId: true, isMain: true, contentValue: true },
  });

  const news = newsRaw.filter((n) => !n.content.includes("向借钱")).slice(0, 3);
  const nameOf = new Map(catIndex.map((c) => [c.id, { name: c.name }]));
  const hour = beijingHour();
  const seg = currentSegment(hour);
  const night = hour >= 19 || hour < 6;
  const raining = world.weather === "雨";

  // 船票上下文:带票来的人和陌生访客是两种人——首屏必须认出来。
  // 分流优先级:岛民(hasYard) > 船票 > 普通访客(已经是岛民的人不再被当受邀者招呼)
  const ticketLook = hasYard ? { state: "none" as const } : await lookupTicket((await searchParams).ticket);
  const invited = ticketLook.state === "valid" ? ticketLook : null;
  // 用过 ≠ 查无此票:对一张根本不存在的票说"已经有人用过了"是在编造事实(doc/04)
  const badTicket = ticketLook.state === "spent" ? "spent" : ticketLook.state === "unknown" ? "unknown" : null;

  // 三个信号拆开(2026-08-06 拍板,2.1 换轨):来过 / 看完 D0 / 有院子。
  // 优先级:岛民(hasYard) > 船票 > 看完/跳过 D0 > 来过 > 第一次。
  const { visited, d0 } = await readVisitState();
  const landingState = hasYard
    ? "RESIDENT"
    : invited
      ? "VALID_TICKET"
      : d0 === "completed"
        ? "D0_COMPLETED_NO_CAT"
        : d0 === "skipped"
          ? "D0_SKIPPED_NO_CAT"
          : visited
            ? "RETURNED_D0_INCOMPLETE"
            : "FIRST_VISIT";
  const seenD0 = landingState === "D0_COMPLETED_NO_CAT" || landingState === "D0_SKIPPED_NO_CAT";
  const returning = landingState === "RETURNED_D0_INCOMPLETE";
  const ticketState = invited
    ? invited.fromIslander
      ? "VALID_RESIDENT"
      : "VALID_OFFICIAL"
    : badTicket === "spent"
      ? "SPENT"
      : badTicket === "unknown"
        ? "UNKNOWN"
        : "NONE";

  // ---- 值班猫(未领养首屏的主角):今天在码头等你的那一只 ----
  const dutyPoolPresent = DUTY_POOL.filter((id) => npcs.some((n) => n.id === id));
  const dutyId = dutyPoolPresent.length > 0 ? pick(mulberry32(hashSeed(world.day, "dock-duty")), dutyPoolPresent) : npcs[0]?.id;
  const dutyCat = npcs.find((n) => n.id === dutyId) ?? null;

  // 首屏主角恒为世界(值班猫)——岛民的院子内容在 /yard 自己的画面里
  const heroCat = dutyCat;

  // ---- 岛上此刻:三件真实发生的事(NPC,当前时段;夜里改"今晚"过去时) ----
  const npcMainToday = todayEvents
    .filter((e) => e.catId.startsWith("npc-") && e.isMain)
    .filter((e) => e.catId !== dutyId); // 值班猫已在首屏,不重复出场
  const segPick = seg ? npcMainToday.filter((e) => e.segment === seg) : npcMainToday.filter((e) => e.segment === "evening");
  const nowThree = [...segPick]
    .sort((a, b) => b.contentValue - a.contentValue)
    .filter((e, i, arr) => arr.findIndex((x) => x.type === e.type) === i) // 三件事尽量不同类
    .slice(0, 3)
    .map((e) => ({
      id: e.id,
      catId: e.catId,
      catName: nameOf.get(e.catId)?.name ?? "岛民",
      portraitUrl: npcs.find((n) => n.id === e.catId)?.portraitUrl,
      line: seg
        ? nowLine(nameOf.get(e.catId)?.name ?? "它", { type: e.type, data: e.data as Record<string, unknown>, targetName: e.targetId ? nameOf.get(e.targetId)?.name : null }, hour)
        : `${nameOf.get(e.catId)?.name}今晚:${factSummary({ type: e.type, outcome: e.outcome, data: e.data as Record<string, unknown>, targetId: e.targetId ?? undefined } as Fact, nameOf)}`,
    }));


  return (
    <div className="space-y-12 py-4">
      <Track
        events={[
          {
            name: "landing_view",
            props: {
              hasYard,
              seg: seg ?? "night",
              viewerState: landingState,
              d0Disposition: d0 ? d0.toUpperCase() : "NONE",
              visitFootprint: visited,
              ticketState,
              flowVersion: FLOW_VERSION,
            },
          },
        ]}
      />
      <StayTrack page="home" />
      {/* 留下"来过"的痕迹(RSC 渲染期写不了 cookie,挂载后打一次 /api/visit)。
          首访当次照常是新人态,cookie 对下一次生效——正是想要的 */}
      <MarkIslandVisit />

      {/* 岛历行:世界在走(顶部,状态色) */}
      {world.day > 0 && (
        <p className="-mb-8 text-center text-xs tracking-widest text-sea-deep">
          猫啊岛历 第 {world.day} 天 · {world.weather} · 住着 {totalCats} 只猫
        </p>
      )}

      {/* 第一屏:活的岛屿舞台——场景更大,猫是主角,夜里天会黑 */}
      <div className="text-center">
        {/* 微动导演(doc/15 V1.5):环境层由 MotionSpec 声明,LivingImage 统一播放 */}
        <LivingImage
          motion={resolveMotion({ scene: "dock", time: night ? "night" : "day", pose: null, raining })}
          className="relative mx-auto max-w-3xl overflow-hidden rounded-lg border border-line"
        >
          {/* 夜里不压滤镜,直接换夜晚版码头图(月亮/渔火是画出来的,滤镜压暗效果差) */}
          <SceneImage src={night ? "/scenes/dock-night.jpg" : "/scenes/dock.jpg"} alt="猫啊岛的码头" width={1099} height={628} priority sizes="(max-width: 768px) 100vw, 768px" className="w-full" />
          {heroCat && (
            <PetCat
              id={heroCat.id}
              portraitUrl={heroCat.portraitUrl}
              line={petLine(heroCat.id, world.day)}
            />
          )}
        </LivingImage>

        {hasYard ? (
          <>
            {/* 岛民:回院子(院子内容在 /yard 的画面里,首页不复述) */}
            <h1 className="font-title mt-6 text-2xl font-bold leading-relaxed">
              你在岛上的院子，门还虚掩着。
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              {night ? "夜里的院子也会有动静。" : "回去看看——说不定有谁来过。"}
            </p>
            <Link href="/yard" className="stamp-btn mt-6 inline-block">
              回院子
            </Link>
          </>
        ) : invited ? (
          <>
            {/* 受邀态:有人把票寄到你手里了——先承认这件事,再谈上岛 */}
            <h1 className="font-title mt-6 text-2xl font-bold leading-relaxed">
              这张船票，已经寄到你手里了。
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              {/* 猫名自带"的"时(如「阿道的猫」)不加引号会连成一串,一律用引号隔开 */}
              {invited.inviter
                ? `岛上「${invited.inviter}」的主人，给你留了一张。`
                : "一张寄到你手里的船票。"}
            </p>
            <div className="mt-6 flex items-center justify-center gap-4">
              <Link href={`/adopt?ticket=${encodeURIComponent(invited.code)}`} className="stamp-btn inline-block">
                带着它登岛
              </Link>
              <a href="#now" className="text-sm text-sea-deep hover:text-brick">
                先看看岛上 ↓
              </a>
            </div>
            <p className="mt-3 font-mono text-xs tracking-wider text-ink-faint">{invited.code}</p>
          </>
        ) : seenD0 ? (
          <>
            {/* 状态 3:走完(或主动跳过)D0,还没进院子。文案接 S10 v3 冻结事实 */}
            <h1 className="font-title mt-6 text-2xl font-bold leading-relaxed">
              那只带路的猫，已经回码头去了。
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              院门虚掩着——这里，以后就是你的地方。
            </p>
            <div className="mt-6 flex items-center justify-center gap-4">
              <Link href="/adopt" className="stamp-btn inline-block">
                进院子
              </Link>
              <a href="#now" className="text-sm text-sea-deep hover:text-brick">
                先看看岛上 ↓
              </a>
            </div>
            {badTicket && (
              <p className="mt-3 text-xs text-ink-faint">
                {badTicket === "spent" ? "（你带来的那张船票，已经有人用过了。）" : "（你带来的那张船票，登记处查不到。）"}
              </p>
            )}
            <p className="mt-3 text-xs text-ink-faint">
              <Link href="/adopt?d0=1" className="text-sea-deep hover:text-brick">重新看看那只猫怎么带路的</Link>
            </p>
          </>
        ) : returning ? (
          <>
            {/* 状态 2:来过,但 D0 没走完。岛承认有一丝痕迹,但不宣布"欢迎回来",
                也不制造具体未发生的事(没说你上次走到过哪儿) */}
            <h1 className="font-title mt-6 text-2xl font-bold leading-relaxed">
              码头边那只猫看了你一眼，像是见过。
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">前面的路，还没有走完。</p>
            <div className="mt-6 flex items-center justify-center gap-4">
              <Link href="/adopt" className="stamp-btn inline-block">
                继续往码头走
              </Link>
              <a href="#now" className="text-sm text-sea-deep hover:text-brick">
                先看看岛上 ↓
              </a>
            </div>
            {badTicket && (
              <p className="mt-3 text-xs text-ink-faint">
                {badTicket === "spent" ? "（你带来的那张船票，已经有人用过了。）" : "（你带来的那张船票，登记处查不到。）"}
              </p>
            )}
            <p className="mt-2 text-xs text-ink-faint">
              已经是岛民?<Link href="/login" className="text-sea-deep hover:text-brick">回到岛上</Link>
            </p>
          </>
        ) : (
          <>
            {/* 未领养:短句 + 场景动作,不再念产品定义 */}
            <h1 className="font-title mt-6 text-2xl font-bold leading-relaxed">
              {badTicket === "spent"
                ? "这张船票，已经有人用过了。"
                : badTicket === "unknown"
                  ? "这张船票，登记处查不到。"
                  : "这座岛上的猫，各过各的日子。"}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              {badTicket === "spent"
                ? "一张票只带得动一个人。想上岛，找个岛上的人再要一张。"
                : badTicket === "unknown"
                  ? "老章翻了两遍册子，没有这个号。找给你票的人再要一次。"
                  : "岛上有个院子空着。住下的人，会慢慢认识它们。"}
            </p>
            <div className="mt-6 flex items-center justify-center gap-4">
              <Link href="/adopt" className="stamp-btn inline-block">
                上岛看看
              </Link>
              <a href="#now" className="text-sm text-sea-deep hover:text-brick">
                先看看岛上 ↓
              </a>
            </div>
            {dutyCat && !badTicket && (
              <p className="mt-3 text-xs text-ink-faint">今天在码头值班的是{dutyCat.name}——摸摸它试试。</p>
            )}
            <p className="mt-2 text-xs text-ink-faint">
              已经来过?<Link href="/login" className="text-sea-deep hover:text-brick">回到岛上</Link>
            </p>
          </>
        )}
      </div>

      {/* 岛上此刻:三件真实发生的事(替代功能三卡的位置)——不解释系统,直接看见社会在运转 */}
      {nowThree.length > 0 && (
        <div id="now">
          <hr className="paper-rule" />
          <p className="font-title mt-6 text-center text-sm text-ink-soft">
            {seg ? "此刻，岛上正在发生" : "今晚，岛上发生了这些"}
          </p>
          <div className="mx-auto mt-4 max-w-md space-y-2.5">
            {nowThree.map((x) => (
              <Link
                key={x.id}
                href={`/cats/${x.catId}`}
                className="flex items-center gap-3 border border-line bg-paper-deep/30 px-3.5 py-2.5 transition-colors hover:border-sea-deep"
              >
                <CatAvatar id={x.catId} size={34} portraitUrl={x.portraitUrl} crop="head" />
                <span className="font-diary min-w-0 text-left text-[15px] leading-relaxed text-ink">{x.line}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* 岛上的邻居:横滑状态卡——名字 + 此刻在干嘛 + 和你的猫的关系(或身份一句) */}
      {npcs.length > 0 && (
        <div>
          <p className="font-title text-center text-sm text-ink-soft">岛上的邻居</p>
          <div className="neighbor-scroll mx-auto mt-4 max-w-2xl">
            {npcs.map((c) => {
              const ev = seg
                ? (todayEvents.find((e) => e.catId === c.id && e.segment === seg && e.isMain) ??
                   todayEvents.find((e) => e.catId === c.id && e.segment === seg) ?? null)
                : null;
              const status = nowLine(
                "",
                ev ? { type: ev.type, data: ev.data as Record<string, unknown>, targetName: ev.targetId ? nameOf.get(ev.targetId)?.name : null } : null,
                hour,
              ).replace(/^现在/, "").replace(/^，/, "");
              const relLine = (c.bio ?? "").split(/[。!！]/)[0];
              return (
                <Link key={c.id} href={`/cats/${c.id}`} className="neighbor-card group text-center">
                  <div className="mx-auto w-fit transition-transform duration-200 group-hover:-translate-y-1">
                    {/* 邻居在呼吸(V1.5 P3):NPC 猫体微动,相位按猫错开;自己的猫不做(拍板) */}
                    <LivingImage motion={resolveMotion({ scene: "card", time: "day", pose: "sit", catId: c.id, catScale: 1 })} inline>
                      <CatAvatar id={c.id} size={64} portraitUrl={c.portraitUrl} />
                    </LivingImage>
                  </div>
                  <p className="font-title mt-1.5 text-sm font-bold text-ink">{c.name}</p>
                  <p className="font-diary mt-0.5 text-xs leading-snug text-ink-soft">{status}</p>
                  <p className="mt-1 text-[11px] leading-snug text-ink-faint">{relLine}</p>
                </Link>
              );
            })}
          </div>
          <p className="mt-1 text-center text-xs text-ink-faint">
            {hasYard ? "都住在离你院子不远的地方" : "他们都已经在岛上住下了，就等一位新邻居"}
          </p>
        </div>
      )}

      {/* 从岛上寄来的一页:只给 5 行,想看全的打开(物件感第三轮加强) */}
      {sampleDiary && (
        <div>
          <hr className="paper-rule" />
          <div className="mx-auto mt-8 max-w-md">
            <p className="font-title text-center text-sm text-ink-soft">从岛上寄来的一页</p>
            <div className="diary-page mt-4 px-5 pb-5 pt-6">
              <div className="flex items-center justify-between text-xs text-ink-faint">
                <span>岛上的第 {sampleDiary.day} 天</span>
                <Link
                  href={`/cats/${sampleDiary.cat.id}`}
                  className="inline-flex items-center gap-1.5 text-ink-soft transition-colors hover:text-brick"
                >
                  <CatAvatar id={sampleDiary.cat.id} size={22} portraitUrl={sampleDiary.cat.portraitUrl} crop="head" />
                  {sampleDiary.cat.name}的日记
                </Link>
              </div>
              <p className="font-diary mt-3 line-clamp-5 text-[15px] leading-loose text-ink">{sampleDiary.content}</p>
              <p className="mt-2 text-right text-xs">
                <Link href={`/cats/${sampleDiary.cat.id}`} className="text-sea-deep hover:text-brick">
                  打开这一页 →
                </Link>
              </p>
            </div>
            <p className="mt-3 text-center text-xs text-ink-faint">每天早上八点，你的猫也会写下这样的一页。</p>
          </div>
        </div>
      )}

      {/* 岛报一角 */}
      {news.length > 0 && (
        <div className="newspaper px-4 py-3">
          <p className="font-press text-center text-sm font-bold">猫啊岛日报</p>
          {news[0] && <p className="mt-0.5 text-center text-[11px] text-ink-faint">第 {news[0].day} 天 · 岛上要闻</p>}
          <hr className="paper-rule my-2" />
          <ul className="space-y-2.5 text-sm leading-relaxed text-ink">
            {news.map((n) => (
              <li key={n.id} className="flex items-start gap-2.5">
                {n.cat ? (
                  <Link href={`/cats/${n.cat.id}`} title={n.cat.name} className="mt-0.5 shrink-0">
                    <CatAvatar id={n.cat.id} size={24} portraitUrl={n.cat.portraitUrl} crop="head" />
                  </Link>
                ) : (
                  <span className="mt-0.5 w-[24px] shrink-0" />
                )}
                <span className="font-diary">{n.content}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-right text-xs">
            <Link href="/island" className="text-sea-deep hover:text-brick">
              去公告栏看更多 →
            </Link>
          </p>
        </div>
      )}

      {/* 收尾才解释:看过真实内容后,这三句是总结不是教育(2.1 换轨:院子承诺) */}
      {!hasYard && (
        <div>
          <hr className="paper-rule" />
          <p className="mt-6 text-center text-xs tracking-widest text-ink-faint">你刚才看到的，就是它们的日常</p>
          <div className="mt-5 grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
            {[
              { img: "/scenes/reef.jpg", title: "它们会自己生活", text: "钓鱼、赶集、串门——你不在的时候，岛上的一天照常发生。" },
              { img: "/scenes/yard.jpg", title: "你会有自己的院子", text: "摆下点什么，偶尔会有猫按自己的性子来看看。" },
              { img: "/scenes/lighthouse.jpg", title: "你会慢慢认识这座岛", text: "谁常来、谁少见、谁只在夜里走动——都要靠你自己弄清。" },
            ].map((s) => (
              <div key={s.title} className="scene-float">
                {/* 统一裁成横幅比例:院子母场景是竖图,居中裁到空地段 */}
                <div className="aspect-[1099/628] overflow-hidden rounded-lg border border-line">
                  <SceneImage src={s.img} width={1099} height={628} sizes="(max-width: 640px) 100vw, 245px" className="h-full w-full object-cover" />
                </div>
                <h2 className="font-title mt-3 font-bold">{s.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{s.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center">
            <Link href="/adopt" className="stamp-btn inline-block">
              上岛看看
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
