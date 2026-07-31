import Link from "next/link";
import Image from "next/image";
import { CatAvatar } from "@/components/CatAvatar";
import { Track } from "@/components/Track";
import { getViewerId } from "@/lib/identity";
import { getIslandNews, getViewerCat } from "@/lib/queries";

export const dynamic = "force-dynamic";

// 首页：像翻开一本猫的生活绘本，不解释技术（v0.7 视觉去 AI 化）

export default async function HomePage() {
  const viewerId = await getViewerId();
  const myCat = await getViewerCat(viewerId);
  const news = (await getIslandNews(3)).slice(0, 3);

  return (
    <div className="space-y-10 py-4">
      <Track events={[{ name: "landing_view", props: { hasCat: Boolean(myCat) } }]} />

      {/* 第一屏：主视觉 + 一句话 + 一个动作 */}
      <div className="text-center">
        <div className="relative mx-auto max-w-md overflow-hidden rounded-lg border border-line">
          <Image src="/scenes/dock.jpg" alt="猫啊岛的码头" width={1200} height={686} priority className="w-full" />
        </div>
        <h1 className="font-title mt-6 text-2xl font-bold leading-relaxed">
          领养一只会记住你、
          <br />
          自己生活、还会交朋友的猫
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          当你离开后，它仍会在岛上继续生活。
        </p>
        {myCat ? (
          <Link href="/my-cat" className="stamp-btn mt-6 inline-flex items-center gap-2">
            <CatAvatar id={myCat.id} size={26} portraitUrl={myCat.portraitUrl} />
            看看{myCat.name}今天在干嘛
          </Link>
        ) : (
          <Link href="/adopt" className="stamp-btn mt-6 inline-block">
            去码头接它
          </Link>
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
            <div key={s.title}>
              <div className="overflow-hidden rounded-lg border border-line">
                <Image src={s.img} alt="" width={600} height={343} className="w-full" />
              </div>
              <h2 className="font-title mt-3 font-bold">{s.title}</h2>
              <p className="mt-1 text-xs leading-relaxed text-ink-soft">{s.text}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 岛报一角 */}
      {news.length > 0 && (
        <div className="newspaper px-4 py-3">
          <p className="font-press text-center text-sm font-bold">猫啊岛日报</p>
          <hr className="paper-rule my-2" />
          <ul className="space-y-1.5 text-sm leading-relaxed text-ink">
            {news.map((n) => (
              <li key={n.id} className="font-diary">
                {n.content}
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
