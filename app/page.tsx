import Link from "next/link";
import { CatAvatar } from "@/components/CatAvatar";
import { Track } from "@/components/Track";
import { getViewerId } from "@/lib/identity";
import { getIslandNews, getViewerCat, getWorld } from "@/lib/queries";

export const dynamic = "force-dynamic";

// 产品中心从"看整个岛"改为"看我的猫"：首页只做介绍与入口（定义 v0.5·九）

export default async function HomePage() {
  const viewerId = await getViewerId();
  const myCat = await getViewerCat(viewerId);
  const world = await getWorld();
  const news = (await getIslandNews(3)).slice(0, 3);

  return (
    <div className="space-y-8 py-6">
      <Track events={[{ name: "landing_view", props: { hasCat: Boolean(myCat) } }]} />
      <div className="text-center">
        <p className="text-5xl">🏝️</p>
        <h1 className="mt-4 text-2xl font-bold leading-relaxed">
          领养一只会记住你、自己生活、
          <br />
          还会交朋友的 AI 猫
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-[#8A7B65]">
          它会在你离开后继续生活：钓鱼、交朋友、卷进各种故事。
          <br />
          <span className="font-medium text-[#6B5D48]">明天回来，它会告诉你发生了什么。</span>
        </p>
        {myCat ? (
          <Link
            href="/my-cat"
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#F5A623] px-8 py-3 font-medium text-white shadow-md hover:bg-[#E08E0B]"
          >
            <CatAvatar id={myCat.id} size={28} portraitUrl={myCat.portraitUrl} />
            看看{myCat.name}今天在干嘛
          </Link>
        ) : (
          <Link
            href="/adopt"
            className="mt-6 inline-block rounded-full bg-[#F5A623] px-8 py-3 font-medium text-white shadow-md hover:bg-[#E08E0B]"
          >
            领养我的猫 🐾
          </Link>
        )}
        <p className="mt-3 text-xs text-[#A89B85]">今天是猫啊岛的第 {world.day} 天 · 岛上住着一群有故事的猫</p>
      </div>

      {news.length > 0 && (
        <div className="rounded-2xl border border-[#EADFCC] bg-[#FFFDF7] p-4">
          <p className="mb-2 text-xs font-medium text-[#B8860B]">📰 猫啊岛日报 · 最近发生</p>
          <ul className="space-y-1.5 text-sm text-[#6B5D48]">
            {news.map((n) => (
              <li key={n.id}>
                <span className="mr-1.5 text-xs text-[#C4B69C]">第{n.day}天</span>
                {n.content}
              </li>
            ))}
          </ul>
          <Link href="/island" className="mt-3 inline-block text-xs text-[#B8860B] hover:underline">
            去岛上逛逛，看所有猫的日记 →
          </Link>
        </div>
      )}
    </div>
  );
}
