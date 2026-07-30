import Link from "next/link";
import { notFound } from "next/navigation";
import { CatAvatar } from "@/components/CatAvatar";
import {
  getActiveStorylines,
  getCat,
  getCatDiaries,
  getCatState,
  getFriends,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function CatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cat = await getCat(id);
  if (!cat) notFound();

  const state = await getCatState(id);
  const diaries = await getCatDiaries(id);
  const friends = (await getFriends(id)).filter((f) => f.affinity > 0);
  const storylines = await getActiveStorylines(id);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#EADFCC] bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <CatAvatar id={cat.id} size={80} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{cat.name}</h1>
            <p className="mt-0.5 text-sm text-[#8A7B65]">{cat.appearance}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cat.personaTags.map((tag) => (
                <span key={tag} className="rounded-full bg-[#FFF3E0] px-2.5 py-0.5 text-xs text-[#B8860B]">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-[#6B5D48]">{cat.bio}</p>

        {state && (
          <div className="mt-4 grid grid-cols-4 gap-2 border-t border-[#F5EDE0] pt-4 text-center">
            <div>
              <p className="text-lg font-bold">🐟 {state.coins}</p>
              <p className="text-xs text-[#A89B85]">鱼币</p>
            </div>
            <div>
              <p className="text-lg font-bold">⚡ {state.energy}</p>
              <p className="text-xs text-[#A89B85]">体力</p>
            </div>
            <div>
              <p className="text-lg font-bold">{state.mood}</p>
              <p className="text-xs text-[#A89B85]">心情</p>
            </div>
            <div>
              <p className="truncate text-lg font-bold">{state.location}</p>
              <p className="text-xs text-[#A89B85]">位置</p>
            </div>
          </div>
        )}

        {storylines.length > 0 && (
          <div className="mt-3 rounded-xl bg-[#FFF9EE] p-3 text-sm">
            {storylines.map((s) => (
              <p key={s.id}>
                📌 正在经营「{String(s.data.name ?? s.kind)}」（第 {s.startDay} 天开张）
              </p>
            ))}
          </div>
        )}

        {friends.length > 0 && (
          <div className="mt-4 border-t border-[#F5EDE0] pt-4">
            <p className="mb-2 text-xs text-[#A89B85]">朋友</p>
            <div className="flex flex-wrap gap-3">
              {friends.map((f) => (
                <Link key={f.id} href={`/cats/${f.otherId}`} className="flex items-center gap-1.5 text-sm hover:text-[#E08E0B]">
                  <CatAvatar id={f.otherId} size={28} />
                  {f.otherName}
                  <span className="text-xs text-[#C4B69C]">{f.affinity > 40 ? "❤️" : "·"}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      <section>
        <h2 className="mb-3 font-bold">{cat.name}的日记</h2>
        {diaries.length === 0 && (
          <p className="py-8 text-center text-sm text-[#A89B85]">
            还没有日记——等岛上的下一天开始吧。
          </p>
        )}
        <div className="space-y-3">
          {diaries.map((d) => (
            <article key={d.id} className="rounded-2xl border border-[#EADFCC] bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between">
                <p className="text-xs text-[#A89B85]">第 {d.day} 天 · {d.mood}</p>
                <Link
                  href={`/share/${cat.id}/${d.day}`}
                  className="rounded-full border border-[#EADFCC] px-3 py-1 text-xs text-[#8A7B65] hover:border-[#F5A623] hover:text-[#E08E0B]"
                >
                  分享卡
                </Link>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed">{d.content}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
