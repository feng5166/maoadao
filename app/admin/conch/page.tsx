import { prisma } from "@/lib/db";
import { isAdmin } from "@/lib/admin-auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

// 海螺观测台(V2 doc/19 指标):北极星 = 每周≥3天用户主动找猫/留话/回应,
// 不是窗口开启率。内部后台,不受用户侧视觉约束。

const DAY_MS = 86400_000;
const bjDate = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(d);

// 统计全部在这里算(库函数对 react-hooks/purity 不透明,组件体保持纯净)
async function loadConchStats() {
  const now = new Date();
  const since14 = new Date(now.getTime() - 14 * DAY_MS);
  const since7 = new Date(now.getTime() - 7 * DAY_MS);
  const [channels, outbound, inbound] = await Promise.all([
    prisma.channel.findMany({ where: { kind: "wechat_openclaw" } }),
    prisma.outboundMessage.findMany({ where: { createdAt: { gte: since14 } }, orderBy: { createdAt: "desc" } }),
    prisma.wechatMessageLog.findMany({ where: { createdAt: { gte: since14 }, userId: { not: null } }, orderBy: { createdAt: "desc" } }),
  ]);

  // 窗口存活率
  const alive = channels.filter((c) => c.windowOpenUntil && c.windowOpenUntil > now).length;

  // 每条推送的 12h 回复率(按 kind)
  const sent = outbound.filter((m) => m.status === "sent" && m.sentAt);
  const kinds = [...new Set(sent.map((m) => m.kind))];
  const replyRate = kinds.map((k) => {
    const list = sent.filter((m) => m.kind === k);
    const replied = list.filter((m) =>
      inbound.some((i) => i.userId === m.userId && i.createdAt > m.sentAt! && i.createdAt.getTime() - m.sentAt!.getTime() < 12 * 3600_000),
    );
    return { kind: k, sent: list.length, replied: replied.length };
  });

  // 主动动作占比(matched 分类)
  const matchedCount = new Map<string, number>();
  for (const i of inbound) matchedCount.set(i.matched, (matchedCount.get(i.matched) ?? 0) + 1);

  // 每用户近 7 天主动天数 + 北极星
  const perUserDays = new Map<string, Set<string>>();
  for (const i of inbound.filter((x) => x.createdAt >= since7)) {
    if (!perUserDays.has(i.userId!)) perUserDays.set(i.userId!, new Set());
    perUserDays.get(i.userId!)!.add(bjDate(i.createdAt));
  }
  const northStar = channels.filter((c) => (perUserDays.get(c.userId)?.size ?? 0) >= 3).length;

  // 断联恢复:window_closed 后 72h 内该用户是否有 inbound
  const closedDrops = outbound.filter((m) => m.status === "window_closed");
  const recovered = closedDrops.filter((m) =>
    inbound.some((i) => i.userId === m.userId && i.createdAt > m.createdAt && i.createdAt.getTime() - m.createdAt.getTime() < 72 * 3600_000),
  );
  return { now, channels, inbound, alive, replyRate, matchedCount, perUserDays, northStar, closedDrops, recovered };
}

export default async function ConchAdminPage() {
  if (!(await isAdmin())) {
    return (
      <p className="mt-24 text-center text-sm">
        未登录。先去 <Link href="/admin" className="underline">观察后台</Link> 输入密钥。
      </p>
    );
  }
  const { now, channels, inbound, alive, replyRate, matchedCount, perUserDays, northStar, closedDrops, recovered } =
    await loadConchStats();

  const stat = (label: string, value: string | number, sub?: string) => (
    <div key={label} className="rounded-xl border border-[#EADFCC] bg-white p-3 text-center">
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs text-[#A89B85]">{label}</p>
      {sub && <p className="text-[10px] text-[#C4B69C]">{sub}</p>}
    </div>
  );

  return (
    <div className="space-y-6 text-sm">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">🐚 海螺观测台(近 14 天)</h1>
        <Link href="/admin" className="text-xs text-[#A89B85] hover:underline">← 观察后台</Link>
      </div>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stat("北极星:周≥3天主动", `${northStar}/${channels.length}`, "近7天主动找猫/留话/回应")}
        {stat("窗口存活", `${alive}/${channels.length}`, "windowOpenUntil > now")}
        {stat("断联恢复率", closedDrops.length ? `${Math.round((recovered.length / closedDrops.length) * 100)}%` : "—", `${recovered.length}/${closedDrops.length} 封信后72h回来`)}
        {stat("入站总量", inbound.length)}
      </section>

      <section className="rounded-2xl border border-[#EADFCC] bg-white p-4">
        <h2 className="mb-2 font-bold">每类推送的 12h 回复率(内容是否值得回应)</h2>
        <table className="w-full text-xs">
          <thead><tr className="text-left text-[#A89B85]"><th>类型</th><th>发出</th><th>12h内被回复</th><th>回复率</th></tr></thead>
          <tbody>
            {replyRate.sort((a, b) => b.sent - a.sent).map((r) => (
              <tr key={r.kind} className="border-t border-[#F5EDE0]">
                <td className="py-1 font-bold">{r.kind}</td>
                <td>{r.sent}</td>
                <td>{r.replied}</td>
                <td>{r.sent ? `${Math.round((r.replied / r.sent) * 100)}%` : "—"}</td>
              </tr>
            ))}
            {replyRate.length === 0 && <tr><td colSpan={4} className="py-2 text-[#A89B85]">近 14 天没有推送。</td></tr>}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl border border-[#EADFCC] bg-white p-4">
        <h2 className="mb-2 font-bold">主动动作分布(海螺是否成为手机入口)</h2>
        <div className="flex flex-wrap gap-2 text-xs">
          {[...matchedCount.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => (
            <span key={k} className="rounded bg-[#F5EDE0] px-2 py-1">{k}: {v}</span>
          ))}
          {matchedCount.size === 0 && <span className="text-[#A89B85]">近 14 天没有入站。</span>}
        </div>
      </section>

      <section className="rounded-2xl border border-[#EADFCC] bg-white p-4">
        <h2 className="mb-2 font-bold">每用户近 7 天主动天数</h2>
        <ul className="space-y-1 text-xs">
          {channels.map((c) => (
            <li key={c.id} className="flex gap-3 border-t border-[#F5EDE0] pt-1">
              <span className="font-mono">{c.userId.slice(0, 14)}…</span>
              <span className="font-bold">{perUserDays.get(c.userId)?.size ?? 0} 天</span>
              <span className="text-[#A89B85]">窗口{c.windowOpenUntil && c.windowOpenUntil > now ? "开" : "关"}{c.mutedAt ? " · 已退订" : ""}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
