import { prisma } from "@/lib/db";
import { firstWeekPlan } from "@/lib/sim/firstweek";
import { adminLogin, isAdmin } from "@/lib/admin-auth";
import { createInviteCodes, disableInviteCode, rateContent, toggleAdoptionPause, toggleWechatPause } from "@/lib/admin-actions";
import { adminLogout } from "@/lib/admin-auth";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

// 内部观察后台（定义 v0.6·P0-2）：种子测试时判断"用户为什么流失"，而不是只看留存数字。
// 鉴权：POST 密钥换 12 小时 httpOnly 会话 cookie（密钥绝不进 URL）；只读页面，无写操作

function fmt(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toISOString().slice(5, 16).replace("T", " ");
}

function hoursAgo(d: Date | null | undefined): number {
  if (!d) return Infinity;
  return (Date.now() - d.getTime()) / 3600_000;
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

  const [world, users, userCats, recentSummaries, nudges, threads, fallbackCount, modLogs, newsToday, invites, ratings, allNudges] = await Promise.all([
    prisma.worldState.findUnique({ where: { id: 1 } }),
    prisma.user.findMany({ orderBy: { createdAt: "desc" }, take: 50, include: { cats: { select: { id: true, name: true } } } }),
    prisma.cat.findMany({ where: { isNpc: false }, include: { state: true } }),
    prisma.catDailySummary.findMany({ orderBy: [{ day: "desc" }, { createdAt: "desc" }], take: 20 }),
    prisma.ownerNudge.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.storyline.findMany({ where: { status: "active" } }),
    prisma.diaryEntry.count({ where: { generatedBy: "fallback" } }),
    prisma.moderationLog.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.islandNews.findMany({ orderBy: { day: "desc" }, take: 4 }),
    prisma.inviteCode.findMany({ orderBy: { createdAt: "desc" }, take: 30 }),
    prisma.contentRating.findMany(),
    prisma.ownerNudge.findMany({ select: { catId: true } }),
  ]);
  const ratingBySummary = new Map(ratings.map((r) => [r.summaryId, r]));
  const nudgeCountByCat = new Map<string, number>();
  for (const n of allNudges) nudgeCountByCat.set(n.catId, (nudgeCountByCat.get(n.catId) ?? 0) + 1);

  // 生命周期分层（互斥，按优先级归入唯一一段）：流失 → 未干预 → 高活跃 → 连续 → 已干预不连续
  const owners = users.filter((u) => u.cats.length > 0);
  const segments = { churned: [], neverNudged: [], heavy: [], active: [], lapsing: [] } as Record<string, typeof owners>;
  for (const u of owners) {
    const h = hoursAgo(u.lastActiveAt);
    const nudgeN = nudgeCountByCat.get(u.cats[0]?.id ?? "") ?? 0;
    if (h > 72) segments.churned.push(u);
    else if (nudgeN === 0) segments.neverNudged.push(u);
    else if (nudgeN >= 5) segments.heavy.push(u);
    else if (h <= 36) segments.active.push(u);
    else segments.lapsing.push(u);
  }
  const firstDayByCat = new Map<string, number>(
    (
      await prisma.event.groupBy({
        by: ["catId"],
        where: { catId: { in: [...new Set(recentSummaries.map((x) => x.catId))] } },
        _min: { day: true },
      })
    ).map((g) => [g.catId, g._min.day ?? 0]),
  );
  const catNameById = new Map(userCats.map((c) => [c.id, c.name]));
  const day = world?.day ?? 0;

  // 建议采纳率：有 suggestion 且已消费的 nudge，对应日摘要里是否有回执
  const consumedSuggestions = nudges.filter((n) => n.suggestion && n.consumedDay !== null);

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🔭 观察后台</h1>
        <form action={adminLogout}>
          <SubmitButton pendingText="…" className="text-xs text-[#A89B85] hover:underline">退出登录</SubmitButton>
        </form>
      </div>

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
        <h2 className="mb-2 font-bold">生命周期分层</h2>
        <p className="mb-2 text-[10px] text-[#A89B85]">互斥分段：每个用户只属于一段（优先级：流失＞未干预＞高活跃＞连续＞不连续）</p>
        <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-5">
          {[
            { label: "已流失(>72h)", list: segments.churned },
            { label: "已领养未干预", list: segments.neverNudged },
            { label: "高活跃(≥5干预)", list: segments.heavy },
            { label: "连续使用中", list: segments.active },
            { label: "已干预不连续", list: segments.lapsing },
          ].map((x) => (
            <div key={x.label} className="rounded-lg border border-[#F5EDE0] p-2">
              <p className="text-lg font-bold">{x.list.length}</p>
              <p className="text-[#A89B85]">{x.label}</p>
              <p className="mt-1 text-[10px] text-[#C4B69C]">{x.list.map((u) => u.cats[0]?.name).filter(Boolean).join("、") || "—"}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-[#EADFCC] bg-white p-4">
        <h2 className="mb-2 font-bold">船票（邀请码）· 领养{world?.adoptionPaused ? "已暂停" : "开放中"}</h2>
        <div className="mb-3 flex flex-wrap items-end gap-2 text-xs">
          <form action={createInviteCodes} className="flex flex-wrap items-end gap-2">
            <label className="flex flex-col">批次
              <select name="batch" className="mt-1 rounded border border-[#E0D5C0] px-2 py-1">
                <option value="team">team</option>
                <option value="friends">friends</option>
                <option value="strangers">strangers</option>
              </select>
            </label>
            <label className="flex flex-col">每码次数
              <input name="maxUses" type="number" defaultValue={3} min={1} max={50} className="mt-1 w-20 rounded border border-[#E0D5C0] px-2 py-1" />
            </label>
            <label className="flex flex-col">张数
              <input name="count" type="number" defaultValue={5} min={1} max={20} className="mt-1 w-16 rounded border border-[#E0D5C0] px-2 py-1" />
            </label>
            <SubmitButton pendingText="…" className="rounded-full bg-[#3E3226] px-3 py-1.5 text-white">发放</SubmitButton>
          </form>
          <form action={toggleAdoptionPause}>
            <SubmitButton pendingText="…" className="rounded-full border border-[#E0D5C0] px-3 py-1.5">
              {world?.adoptionPaused ? "恢复领养" : "暂停领养"}
            </SubmitButton>
          </form>
          <form action={toggleWechatPause}>
            <SubmitButton pendingText="…" className="rounded-full border border-[#E0D5C0] px-3 py-1.5">
              {world?.wechatPaused ? "恢复微信捎信" : "暂停微信捎信"}
            </SubmitButton>
          </form>
        </div>
        <ul className="space-y-1 text-xs">
          {invites.map((c) => (
            <li key={c.code} className="flex items-center gap-2 border-t border-[#F5EDE0] pt-1">
              <span className={`font-mono ${c.disabled ? "line-through text-[#C4B69C]" : ""}`}>{c.code}</span>
              <span className="text-[#A89B85]">{c.batch} · {c.usedCount}/{c.maxUses}</span>
              {!c.disabled && (
                <form action={disableInviteCode}>
                  <input type="hidden" name="code" value={c.code} />
                  <SubmitButton pendingText="…" className="text-[#A05252] hover:underline">作废</SubmitButton>
                </form>
              )}
            </li>
          ))}
          {invites.length === 0 && <li className="text-[#A89B85]">还没有船票——先发放一批</li>}
        </ul>
      </section>

      <section className="rounded-2xl border border-[#EADFCC] bg-white p-4">
        <h2 className="mb-2 font-bold">用户与猫</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-[#A89B85]"><th className="p-1">用户</th><th className="p-1">状态</th><th className="p-1">猫</th><th className="p-1">批次</th><th className="p-1">干预</th><th className="p-1">最近活跃</th><th className="p-1">注册于</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t border-[#F5EDE0]">
                  <td className="p-1 font-mono">{u.id.slice(0, 12)}…</td>
                  <td className="p-1">{u.status}{u.email ? ` (${u.email})` : ""}</td>
                  <td className="p-1">{u.cats.map((c) => c.name).join("、") || "—"}</td>
                  <td className="p-1">{u.inviteBatch ?? "—"}</td>
                  <td className="p-1">{nudgeCountByCat.get(u.cats[0]?.id ?? "") ?? 0}</td>
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

      {/* 首周标记：来岛第几天与当日主题（v0.8 抽检用） */}
      <section className="rounded-2xl border border-[#EADFCC] bg-white p-4">
        <h2 className="mb-2 font-bold">用户猫每日摘要（近 20 条，抽检入口）</h2>
        <div className="space-y-3">
          {recentSummaries.map((s) => (
            <div key={s.id} className="border-t border-[#F5EDE0] pt-2 text-xs">
              <p className="font-medium">
                第{s.day}天 · {catNameById.get(s.catId) ?? s.catId} · {s.headline}
                {(() => {
                  const first = firstDayByCat.get(s.catId);
                  const plan = first != null ? firstWeekPlan(s.day - first + 1) : null;
                  return plan ? (
                    <span className="ml-1 rounded bg-[#F5EDE0] px-1 py-0.5 text-[10px] text-[#8A7B65]">
                      来岛第{plan.catDay}天 · {plan.theme} · {plan.form}
                    </span>
                  ) : null;
                })()}
              </p>
              <p className="mt-1 text-[#6B5D48]">{s.narrative}</p>
              {s.interventionResponse && <p className="mt-1 text-[#4E6B3A]">回执：{s.interventionResponse}</p>}
              {s.tomorrowHook && <p className="mt-1 italic text-[#8A7B65]">悬念：{s.tomorrowHook}</p>}
              <form action={rateContent} className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-[#8A7B65]">
                <input type="hidden" name="summaryId" value={s.id} />
                {(["continuity", "persona", "fun", "emotion", "suspense"] as const).map((k, idx) => {
                  const labels = ["连续", "人格", "趣味", "情绪", "悬念"];
                  const existing = ratingBySummary.get(s.id)?.[k];
                  return (
                    <label key={k}>{labels[idx]}
                      <select name={k} defaultValue={existing ?? ""} className="ml-0.5 rounded border border-[#E0D5C0]">
                        <option value="">-</option>
                        {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                      </select>
                    </label>
                  );
                })}
                <label><input type="checkbox" name="templated" defaultChecked={ratingBySummary.get(s.id)?.templated ?? false} /> 模板感</label>
                <label><input type="checkbox" name="factError" defaultChecked={ratingBySummary.get(s.id)?.factError ?? false} /> 事实错</label>
                <label><input type="checkbox" name="shareworthy" defaultChecked={ratingBySummary.get(s.id)?.shareworthy ?? false} /> 值得分享</label>
                <SubmitButton pendingText="…" className="rounded border border-[#E0D5C0] px-2 py-0.5">存</SubmitButton>
                {ratingBySummary.has(s.id) && <span className="text-[#4E6B3A]">已评</span>}
              </form>
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
