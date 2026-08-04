"use client";

import { useState } from "react";
import { IconKey } from "./icons";

// 回岛钥匙(原"找回码"):一件要收好的物件,不是一串系统码。
export function ReturnKey({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

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
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="note-slip p-3.5" style={{ transform: "rotate(0.3deg)" }}>
      <p className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-ink-faint">
        <IconKey size={13} /> 回岛钥匙
      </p>
      <p className="mt-2 break-all text-center font-mono text-[15px] tracking-wider text-ink">{code}</p>
      <div className="mt-3 flex justify-center gap-2 text-sm">
        <button
          type="button"
          onClick={copy}
          className="border border-line px-4 py-1.5 text-sea-deep transition-colors hover:border-sea-deep"
        >
          {copied ? "已抄下" : "抄下钥匙"}
        </button>
        <button
          type="button"
          onClick={() => window.print()}
          className="border border-line px-4 py-1.5 text-ink-faint transition-colors hover:text-ink-soft"
        >
          打印一份
        </button>
      </div>
    </div>
  );
}
