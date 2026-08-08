// 院子首页（竖切第二格，flag 内）。分层：页面只触发"补算已经应该发生的世界"，
// 访问不创造结果（lib/yard/view.ts 铁律）。视觉守 AGENTS 硬约束：无 emoji、
// 无卡片堆栈、纸张分割线、操作区用 note-slip/stamp-btn。文案过 04 终审在翻转前统一做。

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { getViewerId } from "@/lib/identity";
import { yardGameplayEnabled } from "@/lib/yard/flags";
import { getYardView } from "@/lib/yard/view";
import { WINDOWS } from "@/lib/yard/config";
import { buyItemAction, claimYardAction, collectVisitAction, placeItemAction, removeItemAction } from "./actions";

export const dynamic = "force-dynamic";

/** 窗口 → 叙事时段口径（Narrative Segment，16：用户永远只听到"上午/下午…"） */
function segmentName(windowIndex: number): string {
  const w = WINDOWS[windowIndex];
  if (!w) return "";
  if (w.index === 12) return "夜里";
  if (w.startMin < 720) return "上午";
  if (w.startMin < 1080) return "下午";
  return "晚上";
}

export default async function YardPage() {
  const uid = await getViewerId();
  const user = uid ? await prisma.user.findUnique({ where: { id: uid }, select: { yardAccess: true } }) : null;
  if (!yardGameplayEnabled(user)) notFound(); // flag 外不存在这条路（护栏③）

  const view = uid ? await getYardView(uid) : null;

  if (!view) {
    return (
      <main className="mx-auto max-w-xl px-5 py-10">
        <h1 className="font-title text-2xl">院门口</h1>
        <p className="mt-3 text-sm opacity-80">这里空着一个院子。凭船票，就能住下。</p>
        <form action={claimYardAction} className="note-slip mt-6 p-4">
          <label className="block text-sm" htmlFor="ticket">船票</label>
          <input id="ticket" name="ticket" required placeholder="BOAT-…" className="mt-2 w-full border-b border-line bg-transparent py-1 font-mono text-sm outline-none" />
          <button type="submit" className="stamp-btn mt-4">进院子</button>
        </form>
      </main>
    );
  }

  const uncollected = [...view.records, ...view.traceMarks].filter((r) => r.left.leftText && !r.collected);

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <header>
        <h1 className="font-title text-2xl">我的院子</h1>
        <p className="mt-1 text-sm opacity-70">
          {segmentName(view.windowIndex)}，{view.weather}。小鱼干 ×{view.fish}
          {view.materials.map((m) => ` · ${m.name} ×${m.qty}`).join("")}
        </p>
      </header>

      {/* 院子本身（Renderer 第一刀：Base+锚点+猫+痕迹）——功能区文字暂留下方，
          第二刀把动作收进画面（让功能藏在生活里，但仍然找得到） */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/yard/scene?v=${view.dayKey}-${view.windowIndex}`} alt="院子" className="mt-4 w-full" />


      {/* 此刻 */}
      <section className="mt-6 border-t border-line pt-4">
        {view.present.length > 0 ? (
          view.present.map((p) => (
            <p key={p.visitId} className="font-diary">
              {p.catName}正在这儿——{p.behavior}。
            </p>
          ))
        ) : (
          <p className="font-diary opacity-70">院子里这会儿安安静静的。</p>
        )}
      </section>

      {/* 来过（FULL_RECORD） */}
      {view.records.length > 0 && (
        <section className="mt-6 border-t border-line pt-4">
          <h2 className="text-sm opacity-60">来过</h2>
          <ul className="mt-2 space-y-3">
            {view.records.map((r) => (
              <li key={r.visitId} className="font-diary text-sm">
                {segmentName(r.windowIndex)}，{r.catName}来过——{r.behaviors.join("，")}。
                {r.left.leftText && (r.collected ? <span className="opacity-60">（留下的东西收好了）</span> : (
                  <form action={collectVisitAction} className="inline">
                    <input type="hidden" name="visitId" value={r.visitId} />
                    <span>走的时候留下了{r.left.leftText}。</span>
                    <button type="submit" className="underline underline-offset-4">收下</button>
                  </form>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 痕迹（TRACE_ONLY：不知道是谁——认知层无 catId） */}
      {view.traceMarks.length > 0 && (
        <section className="mt-6 border-t border-line pt-4">
          <h2 className="text-sm opacity-60">有谁来过</h2>
          <ul className="mt-2 space-y-3">
            {view.traceMarks.map((t) => (
              <li key={t.visitId} className="font-diary text-sm">
                {segmentName(t.windowIndex)}的事：{t.traces.join("，")}。
                {t.left.leftText && (t.collected ? <span className="opacity-60">（留下的东西收好了）</span> : (
                  <form action={collectVisitAction} className="inline">
                    <input type="hidden" name="visitId" value={t.visitId} />
                    <span>地上还留着{t.left.leftText}。</span>
                    <button type="submit" className="underline underline-offset-4">收下</button>
                  </form>
                ))}
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 布置：三个位置 */}
      <section className="mt-6 border-t border-line pt-4">
        <h2 className="text-sm opacity-60">院子里</h2>
        <ul className="mt-2 space-y-4">
          {view.slots.map((s) => (
            <li key={s.slotKey} className="text-sm">
              <span className="font-title">{s.slotName}</span>
              {s.itemName ? (
                <>
                  ——摆着{s.itemName}
                  {s.placedThisWindow && <span className="opacity-60">（刚摆下，猫还没见过它）</span>}
                  <form action={removeItemAction} className="inline pl-2">
                    <input type="hidden" name="slotKey" value={s.slotKey} />
                    <button type="submit" className="underline underline-offset-4 opacity-70">收起</button>
                  </form>
                </>
              ) : (
                <span className="opacity-70">——空着</span>
              )}
              {view.ownedIdle.length > 0 && (
                <form action={placeItemAction} className="mt-1 flex items-center gap-2">
                  <input type="hidden" name="slotKey" value={s.slotKey} />
                  <select name="itemKey" className="border-b border-line bg-transparent py-0.5 text-sm outline-none" defaultValue="">
                    <option value="" disabled>挑一样摆上…</option>
                    {view.ownedIdle.map((o) => (
                      <option key={o.itemKey} value={o.itemKey}>
                        {o.itemName}{o.count > 1 ? ` ×${o.count}` : ""}
                      </option>
                    ))}
                  </select>
                  <button type="submit" className="underline underline-offset-4">摆上</button>
                </form>
              )}
            </li>
          ))}
        </ul>
        {view.ownedIdle.length === 0 && <p className="mt-3 text-sm opacity-60">手边的东西都摆出去了。</p>}
      </section>

      {/* 杂货铺（第一个 Sink，19：钱只买可能性）——价格是世界事实 */}
      <section className="mt-6 border-t border-line pt-4">
        <h2 className="text-sm opacity-60">杂货铺捎来的单子</h2>
        <ul className="mt-2 space-y-2">
          {view.shop.map((s) => (
            <li key={s.itemKey} className="flex items-baseline justify-between text-sm">
              <span>{s.itemName}<span className="pl-2 opacity-60">{s.price}条小鱼干</span></span>
              {view.fish >= s.price ? (
                <form action={buyItemAction} className="inline">
                  <input type="hidden" name="itemKey" value={s.itemKey} />
                  <button type="submit" className="underline underline-offset-4">换回来</button>
                </form>
              ) : (
                <span className="opacity-40">还差{s.price - view.fish}条</span>
              )}
            </li>
          ))}
        </ul>
      </section>

      {uncollected.length === 0 && view.present.length === 0 && view.records.length === 0 && view.traceMarks.length === 0 && (
        <p className="mt-6 border-t border-line pt-4 text-sm opacity-60">摆点什么，等等看谁会来。</p>
      )}

      <p className="mt-8 border-t border-line pt-4 text-sm">
        <a href="/yard/book" className="underline underline-offset-4 opacity-70">翻翻岛猫册</a>
      </p>
    </main>
  );
}
