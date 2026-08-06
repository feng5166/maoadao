import Link from "next/link";
import Image from "next/image";
import { CatAvatar } from "@/components/CatAvatar";
import { PetCat } from "@/components/PetCat";
import { LivingImage } from "@/components/LivingImage";
import { resolveMotion } from "@/lib/visual/motion";
import { StayTrack } from "@/components/StayTrack";
import { Track } from "@/components/Track";
import { getViewerId } from "@/lib/identity";
import { describeAffinity, getCatNameIndex, getCatState, getHomeShowcase, getIslandNewsWithCats, getViewerCat } from "@/lib/queries";
import { beijingHour, currentSegment, nowLine } from "@/lib/moments";
import { factSummary } from "@/lib/sim/engine";
import { petLine } from "@/lib/handbook";
import { hashSeed, mulberry32, pick } from "@/lib/sim/rng";
import type { Fact } from "@/lib/sim/types";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 首页 = 猫啊岛的一扇窗(首页改版第一轮):先看到岛上此刻正在发生的事,再决定去接猫/找猫。
// 不再是产品介绍页——"原来岛上现在真的有一只猫在生活"才是 Aha。
// 新老分流:未领养 = 今日值班猫在码头等你;已领养 = 自己的猫此刻在干嘛。

// 值班猫候选:社交型 NPC(每天换一只,明天再来是另一只——活感的最便宜来源)
const DUTY_POOL = ["npc-mianhua", "npc-juzi", "npc-bingfen", "npc-xiaomei", "npc-heidou", "npc-lingdang"];

export default async function HomePage() {
  const viewerId = await getViewerId();
  const [myCat, { world, npcs, totalCats, sampleDiary }, newsRaw, catIndex] = await Promise.all([
    getViewerCat(viewerId),
    getHomeShowcase(),
    getIslandNewsWithCats(6),
    getCatNameIndex(),
  ]);
  const [todayEvents, myState, myRels] = await Promise.all([
    prisma.event.findMany({
      where: { day: world.day },
      select: { id: true, catId: true, segment: true, type: true, outcome: true, data: true, targetId: true, isMain: true, contentValue: true },
    }),
    myCat ? getCatState(myCat.id) : Promise.resolve(null),
    myCat
      ? prisma.relationship.findMany({ where: { OR: [{ catAId: myCat.id }, { catBId: myCat.id }] } })
      : Promise.resolve([]),
  ]);
  const affinityWith = new Map<string, number>();
  for (const r of myRels) affinityWith.set(r.catAId === myCat?.id ? r.catBId : r.catAId, r.affinity);

  const news = newsRaw.filter((n) => !n.content.includes("向借钱")).slice(0, 3);
  const nameOf = new Map(catIndex.map((c) => [c.id, { name: c.name }]));
  const hour = beijingHour();
  const seg = currentSegment(hour);
  const night = hour >= 19 || hour < 6;
  const raining = world.weather === "雨";

  // ---- 值班猫(未领养首屏的主角):今天在码头等你的那一只 ----
  const dutyPoolPresent = DUTY_POOL.filter((id) => npcs.some((n) => n.id === id));
  const dutyId = dutyPoolPresent.length > 0 ? pick(mulberry32(hashSeed(world.day, "dock-duty")), dutyPoolPresent) : npcs[0]?.id;
  const dutyCat = npcs.find((n) => n.id === dutyId) ?? null;

  // ---- 已领养首屏:自己的猫此刻在干嘛(与 /my-cat 同一套事实) ----
  const heroCat = myCat ?? dutyCat;
  let heroNow: string | null = null;
  if (myCat) {
    const mine = todayEvents.filter((e) => e.catId === myCat.id);
    const ev =
      mine.find((e) => e.type === "arrival_home") ??
      mine.find((e) => e.type === "arrival") ??
      (seg ? (mine.find((e) => e.segment === seg && e.isMain) ?? mine.find((e) => e.segment === seg) ?? null) : null);
    heroNow = nowLine(
      myCat.name,
      ev ? { type: ev.type, data: ev.data as Record<string, unknown>, targetName: ev.targetId ? nameOf.get(ev.targetId)?.name : null } : null,
      hour,
      myState?.location,
    );
  }

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
      <Track events={[{ name: "landing_view", props: { hasCat: Boolean(myCat), seg: seg ?? "night" } }]} />
      <StayTrack page="home" />

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
          <Image src={night ? "/scenes/dock-night.jpg" : "/scenes/dock.jpg"} alt="猫啊岛的码头" width={1099} height={628} priority className="w-full" />
          {heroCat && (
            <PetCat
              id={heroCat.id}
              portraitUrl={heroCat.portraitUrl}
              line={petLine(heroCat.id, world.day, myCat ? myState?.mood : undefined)}
            />
          )}
        </LivingImage>

        {myCat ? (
          <>
            {/* 已领养:自己的猫是首屏主角 */}
            <h1 className="font-title mt-6 text-2xl font-bold leading-relaxed">{heroNow}</h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              {night ? "今天的日记已经写好,压在门口的石头下。" : "它的一天正在进行——这会儿过去,正赶得上。"}
            </p>
            <Link href="/my-cat" className="stamp-btn mt-6 inline-flex items-center gap-2">
              <CatAvatar id={myCat.id} size={26} portraitUrl={myCat.portraitUrl} crop="head" />
              上岛找它
            </Link>
          </>
        ) : (
          <>
            {/* 未领养:短句 + 场景动作,不再念产品定义 */}
            <h1 className="font-title mt-6 text-2xl font-bold leading-relaxed">
              有一只猫，正在岛上等你。
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">
              它会记住你，也会在你离开后继续生活。
            </p>
            <div className="mt-6 flex items-center justify-center gap-4">
              <Link href="/adopt" className="stamp-btn inline-block">
                去码头接它
              </Link>
              <a href="#now" className="text-sm text-sea-deep hover:text-brick">
                先看看岛上 ↓
              </a>
            </div>
            {dutyCat && (
              <p className="mt-3 text-xs text-ink-faint">今天在码头值班的是{dutyCat.name}——摸摸它试试。</p>
            )}
            <p className="mt-2 text-xs text-ink-faint">
              在别处上过岛?<Link href="/login" className="text-sea-deep hover:text-brick">用邮箱和密码回来</Link>
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
              const aff = affinityWith.get(c.id);
              const relLine = myCat
                ? aff !== undefined
                  ? `和${myCat.name}:${describeAffinity(aff)}`
                  : `和${myCat.name}还没打过照面`
                : (c.bio ?? "").split(/[。!！]/)[0];
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
            {myCat ? "都是它的邻居——点开认识一下" : "他们都已经在岛上住下了，就等一位新邻居"}
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

      {/* 收尾才解释:看过真实内容后,这三句是总结不是教育 */}
      {!myCat && (
        <div>
          <hr className="paper-rule" />
          <p className="mt-6 text-center text-xs tracking-widest text-ink-faint">你刚才看到的，就是它们的日常</p>
          <div className="mt-5 grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
            {[
              { img: "/scenes/reef.jpg", title: "它会自己生活", text: "钓鱼、赶集、串门——你不在的时候，它的一天照常发生。" },
              { img: "/scenes/home.jpg", title: "它会记住你", text: "你留下的话它都记得，第二天会告诉你听没听、为什么。" },
              { img: "/scenes/lighthouse.jpg", title: "它每天带回新的故事", text: "岛上有秘密，也有普通的日子。每天早上八点更新。" },
            ].map((s) => (
              <div key={s.title} className="scene-float">
                <div className="overflow-hidden rounded-lg border border-line">
                  <Image src={s.img} alt="" width={1099} height={628} className="w-full" />
                </div>
                <h2 className="font-title mt-3 font-bold">{s.title}</h2>
                <p className="mt-1 text-xs leading-relaxed text-ink-soft">{s.text}</p>
              </div>
            ))}
          </div>
          <p className="mt-8 text-center">
            <Link href="/adopt" className="stamp-btn inline-block">
              去码头接它
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
