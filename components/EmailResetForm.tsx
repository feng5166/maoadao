"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { requestPasswordResetEmail, resetPasswordWithEmailCode } from "@/lib/account-actions";

// 邮件重置密码(doc/20 §六):只有确认过归属的邮箱才有这条路。
// 对外响应一律中性——不告诉来访者某个邮箱是否注册过、是否已确认。

const inputCls = "w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none";

export function EmailResetForm() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function send() {
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", email);
      const r = await requestPasswordResetEmail(fd);
      if (r.ok) setStep(2);
      else setErr(r.err ?? "出错了");
    });
  }

  function submit() {
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("code", code);
      fd.set("password", pw);
      fd.set("password2", pw2);
      const r = await resetPasswordWithEmailCode(fd);
      if (r.ok) setDone(true);
      else setErr(r.err ?? "出错了");
    });
  }

  if (done) {
    return (
      <div className="note-slip p-4 text-center">
        <p className="font-diary text-[15px] text-ink">新密码设好了。</p>
        <p className="mt-2 text-xs text-ink-faint">回岛钥匙没有变,继续收好它。</p>
        <p className="mt-3 text-sm">
          <Link href="/login" className="text-sea-deep hover:text-brick">去登录 →</Link>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      <input
        type="email" value={email} onChange={(e) => setEmail(e.target.value)}
        placeholder="登录邮箱" disabled={step === 2} autoComplete="email"
        className={`${inputCls} disabled:text-ink-soft`}
      />
      {step === 1 ? (
        <button
          type="button" onClick={send} disabled={pending || !email}
          className="stamp-btn w-full py-2 text-sm disabled:opacity-55"
        >
          {pending ? "寄出中…" : "把重置验证码寄给我"}
        </button>
      ) : (
        <div className="space-y-2.5 border-l-2 border-line pl-3">
          <p className="text-xs leading-relaxed text-ink-soft">
            如果这个邮箱确认过归属,验证码已经寄出去了。
            <button type="button" onClick={() => { setStep(1); setCode(""); }} className="ml-1 text-ink-faint underline hover:text-ink-soft">
              换个邮箱
            </button>
          </p>
          <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="6 位验证码" maxLength={6} inputMode="numeric" className={inputCls} />
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="新密码(至少 8 个字)" autoComplete="new-password" className={inputCls} />
          <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="再打一遍新密码" autoComplete="new-password" className={inputCls} />
          <button
            type="button" onClick={submit} disabled={pending || code.length < 6 || !pw || !pw2}
            className="stamp-btn w-full py-2 text-sm disabled:opacity-55"
          >
            {pending ? "设置中…" : "设成新密码"}
          </button>
        </div>
      )}
      {err && <p className="text-xs text-brick">{err}</p>}
    </div>
  );
}
