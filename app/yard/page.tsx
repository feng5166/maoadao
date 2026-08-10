// 院子首页（第二刀：动作收进画面，flag 内）。分层铁律照旧：页面只触发
// "补算已经应该发生的世界"，访问不创造结果（lib/yard/view.ts）。
//
// 第二刀两条红线（2026-08-08 拍板）：
// ① 动作提示不是 HUD——默认画面只有生活；用户有意靠近对象（tap 热点）才浮出
//    最小动作词；动作完成 UI 退回生活（details 默认收起，提交后整页回生活态）；
// ② 动作贴对象走：摆放/收起贴槽位，收下贴留物，翻册贴门口台阶，
//    换回来贴门口的单子——不做底部工具栏、不做导航 Tab、不做商城弹窗。
// 视觉守 AGENTS 硬约束：无 emoji、无卡片堆栈、纸张分割线、note-slip/stamp-btn。

import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { getViewerId } from "@/lib/identity";
import { yardGameplayEnabled } from "@/lib/yard/flags";
import { getYardView, type YardView } from "@/lib/yard/view";
import { WINDOWS } from "@/lib/yard/config";
import { spotFor, zoneOfSlot } from "@/lib/yard/scene-render";
import { SubmitButton } from "@/components/SubmitButton";
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

/** 场景内热点（details：收起=只有生活，展开=最小动作词，完成即退回） */
function Hotspot({ x, y, label, resetKey, children }: { x: number; y: number; label: string; resetKey?: string; children: React.ReactNode }) {
  // resetKey=内容签名:动作完成(摆上/收起/收下)后状态变 → details 重挂即收起——
  // "动作完成,UI 退回生活"(第二刀红线①;RSC diff 会保留 open 的 DOM 态,须重挂)
  return (
    <details key={resetKey} className="absolute" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}>
      <summary aria-label={label} className="block h-12 w-12 -translate-x-1/2 -translate-y-1/2 cursor-pointer list-none rounded-full [&::-webkit-details-marker]:hidden" />
      <div className="note-slip absolute left-1/2 z-10 w-52 -translate-x-1/2 p-3 text-sm leading-relaxed">{children}</div>
    </details>
  );
}

function SlotHotspot({ view, slotKey }: { view: YardView; slotKey: string }) {
  const slot = view.slots.find((s) => s.slotKey === slotKey);
  if (!slot) return null;
  const spot = spotFor(zoneOfSlot(slotKey), "cat", `slot:${slotKey}`);
  return (
    <Hotspot x={spot.x} y={spot.y} label={slot.slotName} resetKey={`${slotKey}:${slot.itemKey ?? "empty"}`}>
      <p className="font-title text-xs tracking-widest opacity-60">{slot.slotName}</p>
      {slot.itemName ? (
        <div className="mt-1.5 flex items-baseline justify-between gap-2">
          <span className="font-diary">摆着{slot.itemName}{slot.placedThisWindow && "（刚摆下）"}。</span>
          <form action={removeItemAction}>
            <input type="hidden" name="slotKey" value={slotKey} />
            <SubmitButton pendingText="……" className="underline underline-offset-4">收起</SubmitButton>
          </form>
        </div>
      ) : (
        <p className="font-diary mt-1.5">这里空着。</p>
      )}
      {view.ownedIdle.length > 0 && (
        <div className="mt-2 border-t border-line pt-2">
          <p className="text-xs opacity-60">{slot.itemName ? "换一样上来" : "手边的东西，点一样摆上"}</p>
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1.5">
            {view.ownedIdle.map((o) => (
              <form key={o.itemKey} action={placeItemAction} className="inline">
                <input type="hidden" name="slotKey" value={slotKey} />
                <input type="hidden" name="itemKey" value={o.itemKey} />
                <SubmitButton pendingText="……" className="font-diary underline decoration-line underline-offset-4 hover:decoration-current">
                  {o.itemName}{o.count > 1 ? ` ×${o.count}` : ""}
                </SubmitButton>
              </form>
            ))}
          </div>
        </div>
      )}
    </Hotspot>
  );
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
          <SubmitButton pendingText="进院子……" className="stamp-btn mt-4">进院子</SubmitButton>
        </form>
      </main>
    );
  }

  // 留物与痕迹的热点（收下贴着东西本身）
  const collectables = [
    ...view.traceMarks.map((t) => ({
      visitId: t.visitId, slotKey: t.slotKey, line: t.traces.join("，"),
      left: t.left, collected: t.collected,
    })),
    ...view.records.filter((r) => r.left.leftText && !r.collected).map((r) => ({
      visitId: r.visitId, slotKey: r.slotKey, line: `${segmentName(r.windowIndex)}${r.catName}来过`,
      left: r.left, collected: r.collected,
    })),
  ];

  return (
    <main className="mx-auto max-w-xl px-5 py-8">
      <header>
        <h1 className="font-title text-2xl">我的院子</h1>
        <p className="mt-1 text-sm opacity-70">
          {segmentName(view.windowIndex)}，{view.weather}。小鱼干 ×{view.fish}
          {view.materials.map((m) => ` · ${m.name} ×${m.qty}`).join("")}
        </p>
      </header>

      {/* 院子本身：默认只有生活；靠近对象才有动作；做完退回生活。
          ?v= 携带画面语义指纹（同语义同 URL——收下/摆放后 URL 变,浏览器缓存不吃变化） */}
      <div className="relative mt-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`/yard/scene?v=${[
            view.dayKey, view.windowIndex,
            view.slots.map((s) => s.itemKey ?? "-").join("."),
            view.present.length,
            collectables.filter((c) => !c.collected).length,
          ].join("-")}`}
          alt="院子"
          className="w-full"
        />

        {view.slots.map((s) => (
          <SlotHotspot key={s.slotKey} view={view} slotKey={s.slotKey} />
        ))}

        {collectables.map((c) => {
          const spot = spotFor(zoneOfSlot(c.slotKey), "trace", `visit:${c.visitId}`);
          return (
            <Hotspot key={c.visitId} x={spot.x} y={spot.y} label="地上的东西" resetKey={`${c.visitId}:${c.collected}`}>
              <p className="font-diary">{c.line}。</p>
              {c.left.leftText && !c.collected && (
                <form action={collectVisitAction} className="mt-1">
                  <input type="hidden" name="visitId" value={c.visitId} />
                  <span className="font-diary">留着{c.left.leftText}。</span>
                  <SubmitButton pendingText="……" className="pl-1 underline underline-offset-4">收下</SubmitButton>
                </form>
              )}
            </Hotspot>
          );
        })}

        {/* 翻册：台阶边那本册子（空间入口，不是导航 Tab） */}
        <Link href="/yard/book" className="note-slip absolute bottom-2 left-2 px-2 py-1 text-sm">
          岛猫册
        </Link>

        {/* 换回来：门口挂着的单子（世界隐喻；不是商城弹窗） */}
        <details className="absolute bottom-2 right-2">
          <summary className="note-slip block cursor-pointer list-none px-2 py-1 text-sm [&::-webkit-details-marker]:hidden">
            杂货铺捎来的单子
          </summary>
          <div className="note-slip absolute bottom-full right-0 z-10 mb-1 w-56 p-3 text-sm">
            {view.shop.map((s) => (
              <div key={s.itemKey} className="flex items-baseline justify-between py-0.5">
                <span>{s.itemName}<span className="pl-2 opacity-60">{s.price}条小鱼干</span></span>
                {view.fish >= s.price ? (
                  <form action={buyItemAction} className="inline">
                    <input type="hidden" name="itemKey" value={s.itemKey} />
                    <SubmitButton pendingText="……" className="underline underline-offset-4">换回来</SubmitButton>
                  </form>
                ) : (
                  <span className="opacity-40">还差{s.price - view.fish}条</span>
                )}
              </div>
            ))}
          </div>
        </details>
      </div>

      {/* 此刻（一句旁白：画里已经有它，字只是轻声说一句） */}
      {view.present.length > 0 && (
        <section className="mt-4">
          {view.present.map((p) => (
            <p key={p.visitId} className="font-diary text-sm">{p.catName}正在这儿——{p.behavior}。</p>
          ))}
        </section>
      )}

      {/* 来过（Disclosure 叙事面；收下动作在画里，不在这里） */}
      {view.records.length > 0 && (
        <section className="mt-6 border-t border-line pt-4">
          <h2 className="text-sm opacity-60">来过</h2>
          <ul className="mt-2 space-y-2">
            {view.records.map((r) => (
              <li key={r.visitId} className="font-diary text-sm">
                {segmentName(r.windowIndex)}，{r.catName}来过——{r.behaviors.join("，")}。
                {r.left.leftText && r.collected && <span className="opacity-60">（留下的东西收好了）</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {view.present.length === 0 && view.records.length === 0 && view.traceMarks.length === 0 && (
        <p className="mt-6 border-t border-line pt-4 text-sm opacity-60">摆点什么，等等看谁会来。</p>
      )}
    </main>
  );
}
