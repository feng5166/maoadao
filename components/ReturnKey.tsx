"use client";

import { useState, useTransition } from "react";
import { revealRecoveryKey } from "@/lib/account-actions";
import { IconKey } from "./icons";

/** 一次性展示的新钥匙(重置密码后当场给的那把):此刻不在登录态,没法验密码,
 *  也没有第二次机会——直接亮出全串,催用户抄走。 */
export function OneTimeKey({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="note-slip p-3.5" style={{ transform: "rotate(0.3deg)" }}>
      <p className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-ink-faint">
        <IconKey size={13} /> 新的回岛钥匙 · 仅此一次
      </p>
      <p className="mt-2 break-all text-center font-mono text-[15px] tracking-wider text-ink">{code}</p>
      <div className="mt-3 text-center">
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(code).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 3000);
          }}
          className="border border-line px-4 py-1.5 text-sm text-sea-deep transition-colors hover:border-sea-deep"
        >
          {copied ? "已抄下" : "抄下钥匙"}
        </button>
      </div>
    </div>
  );
}

// 回岛钥匙(原"找回码"):等同身份凭证——
// 页面上只渲染脱敏串,完整串要现问服务端;已设密码的账户还要验一次密码(doc/20 §八)。
// 这样源码里、截图里、缓存里都不会留下整把钥匙。
export function ReturnKey({ masked, needsPassword }: { masked: string; needsPassword: boolean }) {
  const [code, setCode] = useState<string | null>(null);
  const [pw, setPw] = useState("");
  const [asking, setAsking] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pending, startTransition] = useTransition();

  function reveal(then?: (full: string) => void) {
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("password", pw);
      const r = await revealRecoveryKey(fd);
      if (r.ok && r.code) {
        setCode(r.code);
        setAsking(false);
        setPw("");
        then?.(r.code);
      } else setErr(r.err ?? "出错了");
    });
  }

  /** 需要完整串的动作(抄下/打印):没亮出来就先走一次取回流程 */
  function withCode(fn: (full: string) => void) {
    if (code) fn(code);
    else if (needsPassword && !asking) setAsking(true);
    else reveal(fn);
  }

  async function copy(full: string) {
    try {
      await navigator.clipboard.writeText(full);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = full;
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

  return (
    <div className="note-slip p-3.5" style={{ transform: "rotate(0.3deg)" }}>
      <p className="flex items-center gap-1.5 text-[10px] tracking-[0.2em] text-ink-faint">
        <IconKey size={13} /> 回岛钥匙 · 仅限本人保管
      </p>
      <p className="mt-2 break-all text-center font-mono text-[15px] tracking-wider text-ink">{code ?? masked}</p>

      {asking && !code && (
        <div className="mt-3 space-y-2">
          <p className="text-xs text-ink-faint">钥匙等同身份,先确认一下是你本人:</p>
          <input
            type="password"
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="当前密码"
            autoComplete="current-password"
            className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => reveal()}
              disabled={pending || !pw}
              className="border border-line px-4 py-1.5 text-xs text-sea-deep hover:border-sea-deep disabled:opacity-55"
            >
              {pending ? "确认中…" : "亮出钥匙"}
            </button>
            <button type="button" onClick={() => { setAsking(false); setPw(""); setErr(null); }} className="text-xs text-ink-faint hover:text-ink-soft">
              算了
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-sm">
        {!code && !asking && (
          <button type="button" onClick={() => withCode(() => {})} className="text-xs text-ink-faint underline hover:text-ink-soft">
            {pending ? "取回中…" : "看一眼完整的"}
          </button>
        )}
        <button
          type="button"
          onClick={() => withCode(copy)}
          className="border border-line px-4 py-1.5 text-sea-deep transition-colors hover:border-sea-deep"
        >
          {copied ? "已抄下" : "抄下钥匙"}
        </button>
        <button
          type="button"
          onClick={() => withCode(() => setTimeout(() => window.print(), 150))}
          className="border border-line px-4 py-1.5 text-ink-faint transition-colors hover:text-ink-soft"
        >
          打印一份
        </button>
      </div>
      {err && <p className="mt-2 text-center text-xs text-brick">{err}</p>}
      {copied && <p className="mt-2 text-center text-xs text-brick">抄好了就收起来——不要把它发给别人。</p>}
      {/* 打印版页脚:屏幕上不显示 */}
      <p className="hidden text-center text-xs print:block">猫啊岛 · 回岛钥匙 · 仅限本人保管，请勿交给他人</p>
    </div>
  );
}
