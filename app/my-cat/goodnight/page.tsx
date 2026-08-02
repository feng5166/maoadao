import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Track } from "@/components/Track";
import { getViewerId } from "@/lib/identity";
import { getViewerCat } from "@/lib/queries";

export const dynamic = "force-dynamic";

// 夜晚离开仪式（doc/10 §8）：D1 留完话不直接结束。
// 这一页只建立一个认知——"你离开后，它会继续生活"。

export default async function GoodnightPage() {
  const viewerId = await getViewerId();
  const cat = await getViewerCat(viewerId);
  if (!cat) redirect("/adopt");

  return (
    <div className="mx-auto max-w-lg">
      <Track events={[{ name: "leave_for_tomorrow" }]} />

      <div className="relative mt-8 overflow-hidden rounded-lg border border-line">
        <Image src="/scenes/home.jpg" alt="" width={1200} height={686} priority className="w-full" />
        {/* 夜色：入夜的滤镜盖在白天的小屋上 */}
        <div className="absolute inset-0 bg-[#1c2733]/55" />
        <p className="absolute bottom-3 left-0 right-0 text-center text-xs tracking-widest text-[#fdf9f2]/80">
          猫啊岛的夜，安静下来了
        </p>
      </div>

      <div className="mt-10 text-center">
        <p className="font-diary text-[16px] leading-[2.2] text-ink">
          你离开后，{cat.name}把那张纸放在了床边。
          <br />
          它说，明天早上会告诉你今天发生的事。
        </p>
      </div>

      <div className="mt-10 text-center">
        <Link href="/my-cat" className="stamp-btn inline-block px-8 py-2.5">
          明天来看它
        </Link>
        <p className="mt-3 text-xs text-ink-faint">明早八点，它的第一篇日记会准时写好。</p>
      </div>
    </div>
  );
}
