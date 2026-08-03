import Link from "next/link";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { CatAvatar } from "@/components/CatAvatar";
import { LinkedText } from "@/components/LinkedText";
import {
  IconCompass,
  IconFishCoin,
  IconHeart,
  IconHouse,
  IconLighthouse,
  IconMood,
  IconPaw,
  IconSpark,
} from "@/components/icons";
import { THREAD_LABELS } from "@/lib/sim/threads";
import { saveNudge } from "@/lib/actions";
import { recordMetNpc } from "@/lib/arrival";
import { SubmitButton } from "@/components/SubmitButton";
import { getViewerId } from "@/lib/identity";
import { track } from "@vercel/analytics/server";
import {
  getActiveStorylines,
  getCat,
  getCatDiaries,
  getCatNameIndex,
  getCatState,
  getFriends,
  getViewerCat,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

const GOAL_LABELS: Record<string, { Icon: typeof IconHouse; label: string }> = {
  chill: { Icon: IconHouse, label: "舒服躺平" },
  earn: { Icon: IconFishCoin, label: "攒钱开店" },
  friends: { Icon: IconHeart, label: "交遍朋友" },
  explore: { Icon: IconCompass, label: "探索全岛" },
};


export default async function CatPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const { id } = await params;
  const { from } = await searchParams;
  if (from === "share_card") await track("share_open", { catId: id }).catch(() => {});
  const viewerId = await getViewerId();
  // 两波并行（doc/11 P1-3）：原先 7 次串行查询
  const [cat, myCat] = await Promise.all([getCat(id), getViewerCat(viewerId)]);
  if (!cat) notFound();
  const isOwner = !cat.isNpc && Boolean(cat.ownerId) && cat.ownerId === viewerId;

  // 逛别的猫的主页 = 带自己的猫认识了一位邻居（小约定之二）
  if (myCat && myCat.id !== cat.id) after(() => recordMetNpc(myCat.id, cat.id).catch(() => {}));

  const goal = cat.goal ? GOAL_LABELS[cat.goal] : null;
  const GoalIcon = goal?.Icon;

  const [state, diaries, friendsAll, storylines, catIndex] = await Promise.all([
    getCatState(id),
    getCatDiaries(id),
    getFriends(id),
    getActiveStorylines(id),
    getCatNameIndex(),
  ]);
  const friends = friendsAll.filter((f) => f.affinity > 0);

  return (
    <div className="space-y-6">
      <div className="border-b border-line pb-5">
        <div className="flex items-start gap-4">
          <CatAvatar id={cat.id} size={80} portraitUrl={cat.portraitUrl} />
          <div className="min-w-0">
            <h1 className="font-title text-2xl font-bold">{cat.name}</h1>
            <p className="mt-0.5 text-sm text-ink-soft">{cat.appearance}</p>
            {!cat.isNpc && !cat.portraitUrl && (
              <p className="mt-0.5 text-xs text-[#C4A24C]">专属立绘绘制中，稍后刷新查看</p>
            )}
            <div className="mt-2 flex flex-wrap gap-1.5">
              {cat.goal && (
                <span className="flex items-center gap-1 border border-line px-2 py-0.5 text-xs text-sage">
                  {GoalIcon && <GoalIcon size={13} />}
                  {goal?.label ?? cat.goal}
                </span>
              )}
              {cat.personaTags.map((tag) => (
                <span key={tag} className="border border-line px-2 py-0.5 text-xs text-ink-soft">
                  {tag}
                </span>
              ))}
            </div>
          </div>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-ink">{cat.bio}</p>

        {state && (
          <div className="mt-4 grid grid-cols-4 gap-2 border-t border-line pt-4 text-center">
            <div>
              <p className="flex items-center justify-center gap-1 text-lg font-bold"><IconFishCoin size={16} className="text-lamp" /> {state.coins}</p>
              <p className="text-xs text-ink-faint">鱼币</p>
            </div>
            <div>
              <p className="flex items-center justify-center gap-1 text-lg font-bold"><IconSpark size={16} className="text-ink-soft" /> {state.energy}</p>
              <p className="text-xs text-ink-faint">体力</p>
            </div>
            <div>
              <p className="flex items-center justify-center gap-1 text-base font-bold sm:text-lg"><IconMood size={16} className="shrink-0 text-ink-soft" /> <span className="truncate">{state.mood}</span></p>
              <p className="text-xs text-ink-faint">心情</p>
            </div>
            <div>
              <p className="flex items-center justify-center gap-1 text-base font-bold sm:text-lg"><IconPaw size={16} className="shrink-0 text-ink-soft" /> <span className="truncate">{state.location}</span></p>
              <p className="text-xs text-ink-faint">位置</p>
            </div>
          </div>
        )}

        {storylines.length > 0 && (
          <div className="mt-3 border-l-2 border-line pl-3 text-sm">
            {storylines.map((s) => (
              <p key={s.id} className="flex items-start gap-1.5">
                <IconLighthouse size={14} className="mt-1 shrink-0 text-sea-deep" /> {s.kind === "shop"
                  ? `正在经营「${String((s.data as Record<string, unknown> | null)?.name ?? "小店")}」（第 ${s.startDay} 天开张）`
                  : `${THREAD_LABELS[s.kind] ?? s.kind}（进行到第 ${s.step} 步）`}
              </p>
            ))}
          </div>
        )}

        {friends.length > 0 && (
          <div className="mt-4 border-t border-line pt-4">
            <p className="mb-2 text-xs text-ink-faint">朋友</p>
            <div className="flex flex-wrap gap-3">
              {friends.map((f) => (
                <Link key={f.id} href={`/cats/${f.otherId}`} className="flex items-center gap-1.5 text-sm hover:text-brick">
                  <CatAvatar id={f.otherId} size={28} />
                  {f.otherName}
                  <span className="text-xs text-ink-faint">{f.affinity > 40 ? <IconHeart size={12} className="text-brick" /> : "·"}</span>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {isOwner && (
        <section className="note-slip p-4">
          <h2 className="mb-1 font-bold">和{cat.name}说句话</h2>
          <p className="mb-3 text-xs text-ink-faint">留言会成为它的记忆；建议会影响它明天想做的事（但它有自己的主意）。</p>
          <form action={saveNudge} className="space-y-3">
            <input type="hidden" name="catId" value={cat.id} />
            <textarea
              name="message" maxLength={60} rows={2} placeholder="给它留一句话（60 字内）"
              className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
            />
            <label className="flex items-center gap-2 text-xs text-ink-soft">
              <input type="checkbox" name="isPublic" className="accent-[#5c7382]" />
              允许它在公开日记里提到这句话（不勾选则只有它自己知道）
            </label>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-xs text-ink-faint">建议它明天：</span>
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
            <SubmitButton pendingText="送出中…" className="stamp-btn px-4 py-1.5 text-sm">
              送给它 <IconPaw size={14} />
            </SubmitButton>
          </form>
        </section>
      )}

      <section>
        <h2 className="font-title mb-3 font-bold">{cat.name}的日记</h2>
        {diaries.length === 0 && (
          <p className="py-8 text-center text-sm text-ink-faint">
            还没有日记——等岛上的下一天开始吧。
          </p>
        )}
        <div className="space-y-3">
          {diaries.map((d) => (
            <article key={d.id} className="note-slip p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-ink-faint">第 {d.day} 天 · {d.mood}</p>
                <Link
                  href={`/share/${cat.id}/${d.day}`}
                  className="text-xs text-ink-faint hover:text-brick"
                >
                  分享卡
                </Link>
              </div>
              <p className="mt-2 font-diary whitespace-pre-wrap text-[15px] leading-[1.9]">
                <LinkedText text={d.content} cats={catIndex} excludeId={cat.id} />
              </p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}
