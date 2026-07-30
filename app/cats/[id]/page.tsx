import Link from "next/link";
import { notFound } from "next/navigation";
import { CatAvatar } from "@/components/CatAvatar";
import { THREAD_LABELS } from "@/lib/sim/threads";
import { saveNudge } from "@/lib/actions";
import { SubmitButton } from "@/components/SubmitButton";
import { getViewerId } from "@/lib/identity";
import {
  getActiveStorylines,
  getCat,
  getCatDiaries,
  getCatState,
  getFriends,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const GOAL_LABELS: Record<string, string> = {
  chill: "🛋️ 舒服躺平",
  earn: "🐟 攒钱开店",
  friends: "💕 交遍朋友",
  explore: "🗺️ 探索全岛",
};


export default async function CatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cat = await getCat(id);
  if (!cat) notFound();
  const viewerId = await getViewerId();
  const isOwner = !cat.isNpc && Boolean(cat.ownerId) && cat.ownerId === viewerId;

  const state = await getCatState(id);
  const diaries = await getCatDiaries(id);
  const friends = (await getFriends(id)).filter((f) => f.affinity > 0);
  const storylines = await getActiveStorylines(id);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-[#EADFCC] bg-white p-5 shadow-sm">
        <div className="flex items-start gap-4">
          <CatAvatar id={cat.id} size={80} portraitUrl={cat.portraitUrl} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">{cat.name}</h1>
            <p className="mt-0.5 text-sm text-[#8A7B65]">{cat.appearance}</p>
            {!cat.isNpc && !cat.portraitUrl && (
              <p className="mt-0.5 text-xs text-[#C4A24C]">🎨 专属立绘绘制中，稍后刷新查看</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cat.goal && (
                <span className="rounded-full bg-[#E8F5E9] px-2.5 py-0.5 text-xs text-[#4E7A3A]">
                  {GOAL_LABELS[cat.goal] ?? cat.goal}
                </span>
              )}
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
                📌 {s.kind === "shop"
                  ? `正在经营「${String((s.data as Record<string, unknown> | null)?.name ?? "小店")}」（第 ${s.startDay} 天开张）`
                  : `${THREAD_LABELS[s.kind] ?? s.kind}（进行到第 ${s.step} 步）`}
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

      {isOwner && (
        <section className="rounded-2xl border border-[#EADFCC] bg-white p-4 shadow-sm">
          <h2 className="mb-1 font-bold">和{cat.name}说句话</h2>
          <p className="mb-3 text-xs text-[#A89B85]">留言会成为它的记忆；建议会影响它明天想做的事（但它有自己的主意）。</p>
          <form action={saveNudge} className="space-y-3">
            <input type="hidden" name="catId" value={cat.id} />
            <textarea
              name="message" maxLength={60} rows={2} placeholder="给它留一句话（60 字内）"
              className="w-full rounded-lg border border-[#E0D5C0] px-3 py-2 text-sm focus:border-[#F5A623] focus:outline-none"
            />
            <label className="flex items-center gap-2 text-xs text-[#8A7B65]">
              <input type="checkbox" name="isPublic" className="accent-[#F5A623]" />
              允许它在公开日记里提到这句话（不勾选则只有它自己知道）
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-[#A89B85]">建议它明天：</span>
              {[
                { v: "", label: "随它去" },
                { v: "earn", label: "去赚钱" },
                { v: "explore", label: "去探险" },
                { v: "social", label: "找朋友" },
                { v: "rest", label: "好好休息" },
              ].map((o, i) => (
                <label key={o.v} className="flex cursor-pointer items-center gap-1 rounded-full border border-[#E0D5C0] px-2.5 py-1 has-[:checked]:border-[#F5A623] has-[:checked]:bg-[#FFF9EE]">
                  <input type="radio" name="suggestion" value={o.v} defaultChecked={i === 0} className="hidden" />
                  {o.label}
                </label>
              ))}
            </div>
            <SubmitButton pendingText="送出中…" className="rounded-full bg-[#F5A623] px-4 py-1.5 text-sm font-medium text-white hover:bg-[#E08E0B]">
              送给它 🐾
            </SubmitButton>
          </form>
        </section>
      )}

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
