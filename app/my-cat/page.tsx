import Link from "next/link";
import { redirect } from "next/navigation";
import { CatAvatar } from "@/components/CatAvatar";
import { Track } from "@/components/Track";
import { SubmitButton } from "@/components/SubmitButton";
import { renameCat, saveNudge } from "@/lib/actions";
import { getViewerId } from "@/lib/identity";
import { getCatState, getLatestSummary, getPendingNudge, getViewerCat, getWorld } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { after } from "next/server";

export const dynamic = "force-dynamic";

// /my-cat：产品主入口。回答五个问题——
// 我的猫是谁 / 今天发生了什么 / 昨天的干预有没有影响 / 现在什么状态 / 我今天还能做什么

export default async function MyCatPage() {
  const viewerId = await getViewerId();
  const cat = await getViewerCat(viewerId);
  if (!cat) redirect("/adopt");

  const [state, world, summary, pendingNudge] = await Promise.all([
    getCatState(cat.id),
    getWorld(),
    getLatestSummary(cat.id),
    getPendingNudge(cat.id),
  ]);
  // 来岛第几天：以它的第一条事实为准
  const firstEvent = await prisma.event.findFirst({ where: { catId: cat.id }, orderBy: { day: "asc" }, select: { day: true } });
  const daysOnIsland = Math.max(1, world.day - (firstEvent?.day ?? world.day) + 1);
  // 活跃时间：连续使用天数与流失分析的数据源
  after(() =>
    prisma.user.update({ where: { id: viewerId! }, data: { lastActiveAt: new Date() } }).catch(() => {}),
  );
  const funnelEvents: { name: string; props?: Record<string, string | number | boolean> }[] = [
    { name: "daily_story_view", props: { islandDay: world.day, catDay: daysOnIsland } },
  ];
  if (daysOnIsland <= 1) funnelEvents.push({ name: "first_story_view", props: { catId: cat.id } });
  else funnelEvents.push({ name: "next_day_return", props: { catDay: daysOnIsland } });
  const stateChanges = (summary?.stateChanges ?? []) as { label: string; delta: string }[];
  const threadProgress = (summary?.threadProgress ?? []) as { label: string; step: number; total?: number }[];

  return (
    <div className="space-y-5">
      <Track events={funnelEvents} />
      {/* 顶部：猫的当前状态（不堆数值） */}
      <div className="rounded-2xl border border-[#EADFCC] bg-white p-5 shadow-sm">
        <div className="flex items-center gap-4">
          <CatAvatar id={cat.id} size={88} portraitUrl={cat.portraitUrl} />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">
              {cat.name}
              <span className="ml-2 text-sm font-normal text-[#A89B85]">来岛第 {daysOnIsland} 天</span>
            </h1>
            <p className="mt-1 text-sm text-[#6B5D48]">
              现在在{state?.location ?? "小屋"}，心情{state?.mood ?? "平静"}。
            </p>
            {!cat.portraitUrl && <p className="mt-0.5 text-xs text-[#C4A24C]">🎨 专属立绘绘制中，稍后刷新查看</p>}
            <div className="mt-1.5 flex gap-3 text-xs text-[#A89B85]">
              <Link href="/my-cat/history" className="hover:text-[#E08E0B]">📖 生活记录</Link>
              <Link href={`/cats/${cat.id}`} className="hover:text-[#E08E0B]">🔗 它的公开主页</Link>
              {summary && (
                <Link href={`/share/${cat.id}/${summary.day}`} className="hover:text-[#E08E0B]">🖼️ 今日分享卡</Link>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 主体：今天最重要的故事 */}
      {summary ? (
        <div className="rounded-2xl border border-[#EADFCC] bg-white p-5 shadow-sm">
          <p className="text-xs text-[#A89B85]">第 {summary.day} 天 · 今日故事</p>
          <h2 className="mt-1 text-xl font-bold">{summary.headline}</h2>
          <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{summary.narrative}</p>

          {(stateChanges.length > 0 || threadProgress.length > 0) && (
            <div className="mt-4 flex flex-wrap gap-2 border-t border-[#F5EDE0] pt-3">
              {stateChanges.map((c, i) => (
                <span key={i} className="rounded-full bg-[#FFF3E0] px-2.5 py-1 text-xs text-[#8A6D1B]">
                  {c.label} {c.delta}
                </span>
              ))}
              {threadProgress.map((t, i) => (
                <span key={`t${i}`} className="rounded-full bg-[#E8F0FE] px-2.5 py-1 text-xs text-[#3A5F7A]">
                  📌 {t.label} {t.step}{t.total ? `/${t.total}` : ""}
                </span>
              ))}
            </div>
          )}

          {/* 昨日建议回执：让用户相信系统有记忆、选择有效 */}
          {summary.interventionResponse && (
            <div className="mt-4 rounded-xl bg-[#F0F7EE] p-3 text-sm text-[#4E6B3A]">
              <p className="mb-1 text-xs font-medium">💬 关于你昨天的建议</p>
              {summary.interventionResponse}
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-[#EADFCC] bg-white p-5 text-center text-sm text-[#A89B85] shadow-sm">
          {cat.name}正在熟悉小岛……它的第一篇故事马上就好，稍后刷新看看。
          <br />
          记住：它会在你离开后继续生活。明天回来，它会告诉你发生了什么。
        </div>
      )}

      {/* 今日干预：每天一个主要动作 */}
      <div className="rounded-2xl border border-[#EADFCC] bg-white p-5 shadow-sm">
        <h2 className="font-bold">和{cat.name}说句话</h2>
        <p className="mb-3 mt-1 text-xs text-[#A89B85]">
          留言会成为它的记忆；建议会影响它明天想做的事——但采不采纳，要看它自己的决定。
        </p>
        {pendingNudge ? (
          <div className="rounded-xl bg-[#FFF9EE] p-3 text-sm text-[#8A6D1B]">
            ✅ {cat.name}已经记住了{pendingNudge.message ? `你的话${pendingNudge.suggestion ? "和建议" : ""}` : "你的建议"}。
            明天它是否采纳，要看它自己的决定。（明早 8 点后回来看结果）
          </div>
        ) : (
          <form action={saveNudge} className="space-y-3">
            <input type="hidden" name="catId" value={cat.id} />
            <textarea
              name="message" maxLength={60} rows={2} placeholder={`给${cat.name}留一句话（60 字内）`}
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
        )}
      </div>

      {/* 明日悬念：下一次召回理由 */}
      {summary?.tomorrowHook && (
        <p className="px-2 text-center text-sm italic text-[#8A7B65]">✨ {summary.tomorrowHook}</p>
      )}

      {/* 改名（一次机会），折叠在页脚 */}
      {!cat.renamedAt && (
        <details className="px-2 text-xs text-[#A89B85]">
          <summary className="cursor-pointer">名字想改一下？（机会只有一次）</summary>
          <form action={renameCat} className="mt-2 flex gap-2">
            <input
              name="newName" maxLength={12} placeholder="新名字"
              className="rounded-lg border border-[#E0D5C0] px-3 py-1.5 focus:border-[#F5A623] focus:outline-none"
            />
            <SubmitButton pendingText="改名中…" className="rounded-full bg-[#EADFCC] px-4 py-1.5 text-[#6B5D48] hover:bg-[#E0D5C0]">
              确定改名
            </SubmitButton>
          </form>
        </details>
      )}
    </div>
  );
}
