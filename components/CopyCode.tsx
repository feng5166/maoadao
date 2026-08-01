"use client";

import { useState } from "react";

// 找回码 + 一键复制。世界观口径：找回码是"猫爪印"，复制成功即"已抄下"。
export function CopyCode({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // 微信内置浏览器等旧内核兜底
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
    <div className="mt-2 flex items-stretch gap-2">
      <p className="min-w-0 flex-1 bg-paper-deep px-3 py-3 text-center font-mono text-base tracking-wider text-ink sm:text-lg">
        {code}
      </p>
      <button
        type="button"
        onClick={copy}
        className="shrink-0 border border-line px-4 text-sm text-sea-deep transition-colors hover:border-sea-deep"
        aria-label="复制找回码"
      >
        {copied ? "已抄下 🐾" : "复制"}
      </button>
    </div>
  );
}
