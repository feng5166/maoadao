"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { IconBoat } from "./icons";

// 船票(岛民册改版):不是灰底代码条,是一张实体票——票号只在票面局部出现,
// 主动作是"寄出这张船票"(整段带链接的邀请话复制到手里),"只抄票号"收进二级。
export function TicketCard({ code, shareUrl }: { code: string; shareUrl: string }) {
  const [sent, setSent] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

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

  async function sendTicket() {
    const text = `送你一张猫啊岛的船票：${code}\n岛上住着一群会自己生活的猫。领养一只，它会记住你，也会在你离开后继续过它的日子。\n凭票上岛：${shareUrl}`;
    await copyText(text);
    setSent(true);
    track("ticket_share_copy");
    setTimeout(() => setSent(false), 4000);
  }

  async function copyOnlyCode() {
    await copyText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="note-slip overflow-hidden">
      <div className="flex items-stretch">
        <div className="min-w-0 flex-1 px-3.5 py-2.5">
          <p className="text-[10px] tracking-[0.2em] text-ink-faint">猫啊岛 · 船票</p>
          <p className="mt-1 break-all font-mono text-[13px] tracking-wide text-ink">{code}</p>
          <p className="mt-1 text-[11px] text-ink-faint">仅限一位岛民使用 · 单程</p>
        </div>
        <div className="flex shrink-0 flex-col items-center justify-center gap-1 border-l border-dashed border-line px-3 text-sea-deep">
          <IconBoat size={18} />
          <span className="text-[10px] tracking-widest text-ink-faint">未寄出</span>
        </div>
      </div>
      <div className="flex border-t border-line text-sm">
        <button
          type="button"
          onClick={sendTicket}
          className="flex-1 px-3 py-2 text-brick transition-colors hover:bg-paper-deep/40"
        >
          {sent ? "已经拿在手里了——转给想邀的人吧" : "寄出这张船票"}
        </button>
        {!sent && (
          <button
            type="button"
            onClick={copyOnlyCode}
            className="shrink-0 border-l border-line px-3 py-2 text-xs text-ink-faint transition-colors hover:text-ink-soft"
          >
            {copiedCode ? "已抄下" : "只抄票号"}
          </button>
        )}
      </div>
    </div>
  );
}
