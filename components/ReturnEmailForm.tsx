"use client";

import { useState, useTransition } from "react";
import { confirmEmailCode, requestVerifyEmailCode } from "@/lib/account-actions";

// 确认登录邮箱(doc/20):验证的永远是"账户自己的登录邮箱",不是随手填的地址——
// 所以这里没有邮箱输入框。验证码只证明归属,不能用来登录或接管账户。
export function ReturnEmailForm({ email, mailReady }: { email: string; mailReady: boolean }) {
  const [code, setCode] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function sendCode() {
    setErr(null);
    startTransition(async () => {
      const r = await requestVerifyEmailCode();
      if (r.ok) setStep(2);
      else setErr(r.err ?? "出错了");
    });
  }

  function confirm() {
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("code", code);
      const r = await confirmEmailCode(fd);
      if (!r.ok) setErr(r.err ?? "出错了");
      // 成功:revalidatePath 把本区刷成"已确认"态
    });
  }

  // 邮路没通时给完整的封闭态,不摆一个禁用表单像出了故障
  if (!mailReady) {
    return (
      <div className="note-slip mt-3 p-3.5 text-center">
        <p className="font-diary text-[14px] text-ink-soft">岛外邮路正在修整。</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">
          目前请先保管好上面的回岛钥匙。邮路开通后，可以在这里确认你的登录邮箱。
        </p>
      </div>
    );
  }

  return (
    <div className="mt-2 space-y-3">
      {step === 1 ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <p className="flex-1 text-sm text-ink">
            寄一封确认信到 <span className="text-ink-soft">{email}</span>
          </p>
          <button
            type="button"
            onClick={sendCode}
            disabled={pending}
            className="shrink-0 border border-line px-4 py-2 text-sm text-sea-deep transition-colors hover:border-sea-deep disabled:opacity-55"
          >
            {pending ? "寄出中…" : "寄出验证码"}
          </button>
        </div>
      ) : (
        <div className="space-y-2.5 border-l-2 border-line pl-3">
          <p className="text-xs text-ink-soft">
            验证码已经寄到 {email}。
            <button type="button" onClick={() => { setStep(1); setCode(""); }} className="ml-1 text-ink-faint underline hover:text-ink-soft">
              重寄一封
            </button>
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="6 位验证码"
              maxLength={6}
              inputMode="numeric"
              className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none sm:w-40"
            />
            <button
              type="button"
              onClick={confirm}
              disabled={pending || code.length < 6}
              className="stamp-btn shrink-0 px-4 py-2 text-sm disabled:opacity-55"
            >
              {pending ? "确认中…" : "确认这个邮箱"}
            </button>
          </div>
        </div>
      )}
      {err && <p className="text-xs text-brick">{err}</p>}
    </div>
  );
}
