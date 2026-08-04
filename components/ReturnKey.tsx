"use client";

import { useState } from "react";
import { IconKey } from "./icons";

// 回岛钥匙(原"找回码"):等同身份凭证——默认脱敏展示(截图/直播/朋友圈都不怕),
// 点"看一眼完整的"才亮出全串;抄下后提醒别外传;打印版带"仅限本人保管"。
export function ReturnKey({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // MAO-Z4YE-••••-••••-••••-CSGF:留头尾两组,中间遮住
  const parts = code.split("-");
  const masked =
    parts.length > 3
      ? [parts[0], parts[1], ...parts.slice(2, -1).map(() => "••••"), parts[parts.length - 1]].join("-")
      : code;

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = code;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  }

  function print() {
    if (!revealed) {
      setRevealed(true);
      // 等亮出全串再唤起打印
      setTimeout(() => window.print(), 150);
    } else {
      window.print();
    }
  }

  return (
    <div className="note-slip p-3.5" style={{ transform: "rotate(0.3deg)" }}>
      <p className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-ink-faint">
        <IconKey size={13} /> 回岛钥匙 · 仅限本人保管
      </p>
      <p className="mt-2 break-all text-center font-mono text-[15px] tracking-wider text-ink">
        {revealed ? code : masked}
      </p>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        {!revealed && (
          <button type="button" onClick={() => setRevealed(true)} className="text-xs text-ink-faint underline hover:text-ink-soft">
            看一眼完整的
          </button>
        )}
        <button
          type="button"
          onClick={copy}
          className="border border-line px-4 py-1.5 text-sea-deep transition-colors hover:border-sea-deep"
        >
          {copied ? "已抄下" : "抄下钥匙"}
        </button>
        <button
          type="button"
          onClick={print}
          className="border border-line px-4 py-1.5 text-ink-faint transition-colors hover:text-ink-soft"
        >
          打印一份
        </button>
      </div>
      {copied && <p className="mt-2 text-center text-xs text-brick">抄好了就收起来——不要把它发给别人。</p>}
      {/* 打印版页脚:屏幕上不显示 */}
      <p className="hidden text-center text-xs print:block">猫啊岛 · 回岛钥匙 · 仅限本人保管，请勿交给他人</p>
    </div>
  );
}
