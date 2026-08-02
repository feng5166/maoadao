import Link from "next/link";
import Image from "next/image";
import { CatAvatar } from "@/components/CatAvatar";
import { StayTrack } from "@/components/StayTrack";
import { Track } from "@/components/Track";
import { getViewerId } from "@/lib/identity";
import { getHomeShowcase, getIslandNewsWithCats, getViewerCat } from "@/lib/queries";

export const dynamic = "force-dynamic";

// 首页：像翻开一本猫的生活绘本，不解释技术（v0.7 视觉去 AI 化）
// 标杆三件事：让访客看到猫（岛民名册）、看到世界在运转（天数/天气）、看到成品（样张日记）。

export default async function HomePage() {
  const viewerId = await getViewerId();
  // 三路并行：跨洋链路下省掉查询瀑布
  const [myCat, { world, npcs, totalCats, sampleDiary }, newsRaw] = await Promise.all([
    getViewerCat(viewerId),
    getHomeShowcase(),
    getIslandNewsWithCats(6),
  ]);
  // 历史坏数据兜底：缺了对象名的残句（"向借钱被拒"）不上首页
  const news = newsRaw.filter((n) => !n.content.includes("向借钱")).slice(0, 3);
  const stripCats = npcs.slice(0, 12);
  const moreCount = totalCats - stripCats.length;

  return (
    <div className="space-y-12 py-4">
      <Track events={[{ name: "landing_view", props: { hasCat: Boolean(myCat) } }]} />
      <StayTrack page="home" />

      {/* 第一屏：主视觉 + 一句话 + 世界在运转 + 一个动作 + 岛民名册 */}
      <div className="text-center">
        <div className="relative mx-auto max-w-md overflow-hidden rounded-lg border border-line">
          <Image src="/scenes/dock.jpg" alt="猫啊岛的码头" width={1099} height={628} priority className="w-full" />
        </div>
        <h1 className="font-title mt-6 text-2xl font-bold leading-relaxed">
          领养一只会记住你、
          <br />
          自己生活、还会交朋友的猫
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          当你离开后，它仍会在岛上继续生活。
        </p>
        {world.day > 0 && (
          <p className="mt-2 text-xs tracking-wide text-ink-faint">
            今天是岛上的第 {world.day} 天 · {world.weather} · 住着 {totalCats} 只猫
          </p>
        )}
        {myCat ? (
          <Link href="/my-cat" className="stamp-btn mt-6 inline-flex items-center gap-2">
            <CatAvatar id={myCat.id} size={26} portraitUrl={myCat.portraitUrl} crop="head" />
            看看{myCat.name}今天在干嘛
          </Link>
        ) : (
          <Link href="/adopt" className="stamp-btn mt-6 inline-block">
            去码头接它
          </Link>
        )}

        {/* 岛民名册：一排小猫站在码头边，先看到猫，才会想认识猫 */}
        {stripCats.length > 0 && (
          <div className="mt-9">
            <div className="flex flex-wrap items-end justify-center gap-y-1.5">
              {stripCats.map((c, i) => (
                <Link
                  key={c.id}
                  href={`/cats/${c.id}`}
                  title={c.name}
                  className={`${i > 0 ? "-ml-1.5" : ""} inline-block transition-transform duration-200 hover:z-10 hover:-translate-y-1.5`}
                  style={{ zIndex: i }}
                >
                  <CatAvatar id={c.id} size={50} portraitUrl={c.portraitUrl} />
                </Link>
              ))}
              {moreCount > 0 && (
                <span
                  className="-ml-1.5 mb-1 inline-flex h-[34px] w-[34px] items-center justify-center rounded-full bg-paper-deep text-[11px] text-ink-soft"
                  style={{ zIndex: stripCats.length }}
                >
                  +{moreCount}
                </span>
              )}
            </div>
            <p className="mt-2.5 text-xs text-ink-faint">
              {myCat ? "岛上的邻居们，点开认识一下" : "他们都已经在岛上住下了，就等一位新邻居"}
            </p>
          </div>
        )}
      </div>

      {/* 第二屏：三幅小场景解释 */}
      <div>
        <hr className="paper-rule" />
        <div className="mt-6 grid grid-cols-1 gap-6 text-center sm:grid-cols-3">
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
      </div>

      {/* 样张日记：真实的一页，胜过所有功能介绍 */}
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
              <p className="font-diary mt-3 text-[15px] leading-loose text-ink">{sampleDiary.content}</p>
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
    </div>
  );
}
