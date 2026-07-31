import { prisma } from "@/lib/db";
import { adminLogin, isAdmin } from "@/lib/admin-auth";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

// 内部观察后台（定义 v0.6·P0-2）：种子测试时判断"用户为什么流失"，而不是只看留存数字。
// 鉴权：POST 密钥换 12 小时 httpOnly 会话 cookie（密钥绝不进 URL）；只读页面，无写操作

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(5, 16).replace("T", " ");
}

export default async function AdminPage() {
  if (!(await isAdmin())) {
    // 密钥只走 POST 表单，绝不进 URL
    return (
      <form action={adminLogin} className="mx-auto mt-24 flex max-w-xs gap-2">
        <input
          name="key" type="password" placeholder="管理密钥" autoComplete="off"
          className="flex-1 rounded-lg border border-[#E0D5C0] px-3 py-2 text-sm focus:border-[#F5A623] focus:outline-none"
        />
        <SubmitButton pendingText="…" className="rounded-full bg-[#3E3226] px-4 py-2 text-sm text-white">
          进入
        </SubmitButton>
      </form>
    );
  }

  const [world, users, userCats, recentSummaries, nudges, threads, fallbackCount, modLogs, newsToday] = await Promise.all([
    prisma.worldState.findUnique({ where: { id: 1 } }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { cats: { select: { id: true, name: true } } } }),
    prisma.cat.findMany({ where: { isNpc: false }, include: { state: true } }),
    prisma.catDailySummary.findMany({ orderBy: [{ day: "desc" }, { createdAt: "desc" }], take: 20 }),
    prisma.ownerNudge.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.storyline.findMany({ where: { status: "active" } }),
    prisma.diaryEntry.count({ where: { generatedBy: "fallback" } }),
    prisma.moderationLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.islandNews.findMany({ orderBy: { day: "desc" }, take: 4 }),
  ]);
  const catNameById = new Map(userCats.map((c) => [c.id, c.name]));
  const day = world?.day ?? 0;

  // 建议采纳率：有 suggestion 且已消费的 nudge，对应日摘要里是否有回执
  const consumedSuggestions = nudges.filter((n) => n.suggestion && n.consumedDay !== null);

  return (
    <div className="space-y-6 text-sm">
      <h1 className="text-xl font-bold">🔭 观察后台</h1>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: "世界天数", value: day },
          { label: "用户数", value: users.length },
          { label: "用户猫", value: userCats.length },
          { label: "兜底日记累计", value: fallbackCount },
        ].map((s) => (
          <div key={s.label} className="rounded-xl border border-[#EADFCC] bg-white p-3 text-center">
            <p className="text-2xl font-bold">{s.value}</p>
            <p className="text-xs text-[#A89B85]">{s.label}</p>
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-[#EADFCC] bg-white p-4">
        <h2 className="mb-2 font-bold">用户与猫</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[#A89B85]"><th className="p-1">用户</th><th className="p-1">状态</th><th className="p-1">猫</th><th className="p-1">最近活跃</th><th className="p-1">注册于</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-[#F5EDE0]">
                  <td className="p-1 font-mono">{u.id.slice(0, 12)}…</td>
                  <td className="p-1">{u.status}{u.email ? ` (${u.email})` : ""}</td>
                  <td className="p-1">{u.cats.map((c) => c.name).join("、") || "—"}</td>
                  <td className="p-1">{fmt(u.lastActiveAt)}</td>
                  <td className="p-1">{fmt(u.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-2xl border border-[#EADFCC] bg-white p-4">
        <h2 className="mb-2 font-bold">留言与建议（近 30 条，采纳看回执）</h2>
        <ul className="space-y-1.5 text-xs">
          {nudges.map((n) => (
            <li key={n.id} className="border-t border-[#F5EDE0] pt-1.5">
              <span className="font-medium">{catNameById.get(n.catId) ?? n.catId}</span>
              {n.message && <span> · 留言「{n.message}」{n.isPublic ? "(公开)" : "(私密)"}</span>}
              {n.suggestion && <span> · 建议 {n.suggestion}</span>}
              <span className="text-[#A89B85]"> · {n.consumedDay ? `第${n.consumedDay}天已消费` : "待消费"}</span>
            </li>
          ))}
          {nudges.length === 0 && <li className="text-[#A89B85]">暂无</li>}
        </ul>
        <p className="mt-2 text-xs text-[#A89B85]">已消费的建议数：{consumedSuggestions.length}</p>
      </section>

      <section className="rounded-2xl border border-[#EADFCC] bg-white p-4">
        <h2 className="mb-2 font-bold">用户猫每日摘要（近 20 条，抽检入口）</h2>
        <div className="space-y-3">
          {recentSummaries.map((s) => (
            <div key={s.id} className="border-t border-[#F5EDE0] pt-2 text-xs">
              <p className="font-medium">
                第{s.day}天 · {catNameById.get(s.catId) ?? s.catId} · {s.headline}
              </p>
              <p className="mt-1 text-[#6B5D48]">{s.narrative}</p>
              {s.interventionResponse && <p className="mt-1 text-[#4E6B3A]">回执：{s.interventionResponse}</p>}
              {s.tomorrowHook && <p className="mt-1 italic text-[#8A7B65]">悬念：{s.tomorrowHook}</p>}
            </div>
          ))}
          {recentSummaries.length === 0 && <p className="text-xs text-[#A89B85]">暂无</p>}
        </div>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-[#EADFCC] bg-white p-4">
          <h2 className="mb-2 font-bold">活跃事件线</h2>
          <ul className="space-y-1 text-xs">
            {threads.map((t) => (
              <li key={t.id}>{t.kind} · {catNameById.get(t.catId) ?? t.catId} · 第{t.step}步（第{t.startDay}天起，最近推进第{t.lastAdvanceDay}天）</li>
            ))}
            {threads.length === 0 && <li className="text-[#A89B85]">无</li>}
          </ul>
          <h2 className="mb-2 mt-4 font-bold">最近日报</h2>
          <ul className="space-y-1 text-xs text-[#6B5D48]">
            {newsToday.map((n) => <li key={n.id}>第{n.day}天 · {n.content}</li>)}
          </ul>
        </div>
        <div className="rounded-2xl border border-[#EADFCC] bg-white p-4">
          <h2 className="mb-2 font-bold">审核日志（近 20 条）</h2>
          <ul className="space-y-1.5 text-xs">
            {modLogs.map((m) => (
              <li key={m.id} className="border-t border-[#F5EDE0] pt-1.5">
                <span className={m.verdict === "block" ? "text-[#A05252]" : "text-[#8A6D1B]"}>{m.verdict}</span>
                {m.reason && <span> · {m.reason}</span>}
                <p className="text-[#A89B85]">{m.input.slice(0, 60)}</p>
              </li>
            ))}
            {modLogs.length === 0 && <li className="text-[#A89B85]">暂无拦截</li>}
          </ul>
        </div>
      </section>
    </div>
  );
}
