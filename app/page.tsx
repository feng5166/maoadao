import Link from "next/link";
import { CatAvatar } from "@/components/CatAvatar";
import { getFeed, getWorld } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const world = await getWorld();
  const feed = await getFeed();

  const byDay = new Map<number, typeof feed>();
  for (const entry of feed) {
    byDay.set(entry.day, [...(byDay.get(entry.day) ?? []), entry]);
  }
  const days = [...byDay.keys()].sort((a, b) => b - a);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl bg-gradient-to-r from-[#FFE0B2] to-[#FFF3E0] p-5">
        <p className="text-sm text-[#8A7B65]">
          今天是猫啊岛的第 <span className="font-bold text-[#3E3226]">{world.day}</span> 天 ·{" "}
          {world.season}天 · 天气{world.weather}
        </p>
        <h1 className="mt-1 text-xl font-bold">岛上的猫今天都在干什么？</h1>
      </div>

      {days.length === 0 && (
        <p className="py-12 text-center text-sm text-[#A89B85]">
          岛上还很安静……运行 <code>npm run tick</code> 推进一天，猫们就会开始生活。
        </p>
      )}

      {days.map((day) => (
        <section key={day}>
          <h2 className="mb-3 text-sm font-medium text-[#A89B85]">— 第 {day} 天 —</h2>
          <div className="space-y-3">
            {byDay.get(day)!.map((entry) => (
              <article
                key={entry.id}
                className="rounded-2xl border border-[#EADFCC] bg-white p-4 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Link href={`/cats/${entry.catId}`} className="shrink-0">
                    <CatAvatar id={entry.catId} size={44} />
                  </Link>
                  <div className="min-w-0">
                    <Link href={`/cats/${entry.catId}`} className="font-bold hover:text-[#E08E0B]">
                      {entry.catName}
                    </Link>
                    <p className="text-xs text-[#A89B85]">
                      {entry.isNpc ? "岛民" : "岛上新客"} · 心情：{entry.mood}
                    </p>
                  </div>
                  <Link
                    href={`/share/${entry.catId}/${entry.day}`}
                    className="ml-auto shrink-0 rounded-full border border-[#EADFCC] px-3 py-1 text-xs text-[#8A7B65] hover:border-[#F5A623] hover:text-[#E08E0B]"
                  >
                    分享卡
                  </Link>
                </div>
                <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed">{entry.content}</p>
              </article>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
