"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { IconBoat } from "./icons";

// 船票夹(岛民册精修):砖红只留给顶部"随手拿一张船票"——自动挑一张没拿出过的,
// 复制整段邀请话;每张票面上只有小动作,不再三个大按钮排队像批量后台。
// 状态三分:未拿出 / 已交到你手里(拿出过,记在本设备) / 已有人凭它登岛(服务端核销,在页面另列)。
// "拿出过"只是给自己的记号,不代表对方已用——措辞据实。

const TAKEN_KEY = "maoadao.ticketsTaken";

function loadTaken(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(TAKEN_KEY) ?? "[]") as string[]);
  } catch {
    return new Set();
  }
}

function shareText(code: string, shareUrl: string): string {
  return `送你一张猫啊岛的船票：${code}\n岛上住着一群会自己生活的猫。领养一只，它会记住你，也会在你离开后继续过它的日子。\n凭票上岛：${shareUrl}`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // 微信内置浏览器等旧内核兜底
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    ta.remove();
  }
}

export function TicketWallet({ tickets }: { tickets: { code: string; shareUrl: string }[] }) {
  const [taken, setTaken] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null); // 刚复制过的那张
  const [quickFlash, setQuickFlash] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage 只在客户端有,首帧后同步一次避免水合不一致
    setTaken(loadTaken());
  }, []);

  function markTaken(code: string) {
    const next = new Set(taken).add(code);
    setTaken(next);
    try {
      localStorage.setItem(TAKEN_KEY, JSON.stringify([...next]));
    } catch {}
    setFlash(code);
    setTimeout(() => setFlash((f) => (f === code ? null : f)), 4000);
  }

  async function take(code: string, shareUrl: string) {
    await copyText(shareText(code, shareUrl));
    markTaken(code);
    track("ticket_share_copy");
  }

  // 随手拿一张:优先没拿出过的,都拿过了就取第一张
  async function quickTake() {
    const fresh = tickets.find((t) => !taken.has(t.code)) ?? tickets[0];
    if (!fresh) return;
    await take(fresh.code, fresh.shareUrl);
    setQuickFlash(true);
    setTimeout(() => setQuickFlash(false), 4000);
  }

  const shown = expanded ? tickets : tickets.slice(0, 3);

  return (
    <div className="mt-3 space-y-2.5">
      <button type="button" onClick={quickTake} className="stamp-btn w-full py-2 text-sm">
        {quickFlash ? "已经交到你手里了——转给想邀的人吧" : "随手拿一张船票"}
      </button>

      {shown.map((t) => {
        const isTaken = taken.has(t.code);
        return (
          <div key={t.code} className="note-slip overflow-hidden">
            <div className="flex items-stretch">
              <div className="min-w-0 flex-1 px-3.5 py-2.5">
                <p className="text-[10px] tracking-[0.2em] text-ink-faint">猫啊岛 · 船票 · 出发港 码头</p>
                <p className="mt-1 break-all font-mono text-[13px] tracking-wide text-ink">{t.code}</p>
                <p className="mt-1 text-[11px] text-ink-faint">
                  {isTaken ? "等一位新岛民凭它上船" : "仅限一位岛民使用 · 单程"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-center justify-center gap-1 border-l border-dashed border-line px-2.5 text-sea-deep">
                <IconBoat size={17} />
                <span className="text-[10px] tracking-widest text-ink-faint">{isTaken ? "已拿出" : "未拿出"}</span>
              </div>
            </div>
            <div className="flex justify-end gap-4 border-t border-line px-3.5 py-1.5 text-xs">
              <button
                type="button"
                onClick={() => take(t.code, t.shareUrl)}
                className="text-sea-deep transition-colors hover:text-brick"
              >
                {flash === t.code ? "已经拿在手里了" : isTaken ? "再寄一次" : "寄给一位新岛民"}
              </button>
              <button
                type="button"
                onClick={async () => {
                  await copyText(t.code);
                  markTaken(t.code);
                }}
                className="text-ink-faint transition-colors hover:text-ink-soft"
              >
                只抄票号
              </button>
            </div>
          </div>
        );
      })}

      {!expanded && tickets.length > 3 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="block w-full text-center text-xs text-ink-faint hover:text-ink-soft"
        >
          展开其余 {tickets.length - 3} 张
        </button>
      )}
    </div>
  );
}
