"use client";

import { useState, useTransition } from "react";
import { requestEmailCodeSafe, verifyEmailCodeSafe } from "@/lib/account-actions";

// 留一个回岛地址(原"邮箱绑定与找回"):寄信的语义,两步走——
// 第一步只有邮箱和"寄出验证码";寄出后才展开第二步填码确认。
// hasCat 时才出现"可能切换身份"的确认句(检测到已有身份才需要)。
export function ReturnEmailForm({ hasCat, mailReady }: { hasCat: boolean; mailReady: boolean }) {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [err, setErr] = useState<string | null>(null);
  const [confirmSwitch, setConfirmSwitch] = useState(false);
  const [pending, startTransition] = useTransition();

  function sendCode() {
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", email);
      const r = await requestEmailCodeSafe(fd);
      if (r.ok) setStep(2);
      else setErr(r.err ?? "出错了");
    });
  }

  function verify() {
    setErr(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("email", email);
      fd.set("code", code);
      if (confirmSwitch) fd.set("confirmSwitch", "on");
      const r = await verifyEmailCodeSafe(fd);
      if (!r.ok) setErr(r.err ?? "出错了");
      // 成功:revalidatePath 会把本页刷成"已留地址"态;切换身份则由 redirect 接管
    });
  }

  return (
    <div className="mt-2 space-y-3">
      {!mailReady && (
        <p className="border-l-2 border-line pl-2 text-xs text-ink-faint">
          岛上的邮路还没通(邮件服务未配置)——先把上面的回岛钥匙收好。
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="你的邮箱"
          disabled={step === 2}
          className="w-full flex-1 border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none disabled:text-ink-soft"
        />
        {step === 1 && (
          <button
            type="button"
            onClick={sendCode}
            disabled={pending || !email}
            className="shrink-0 border border-line px-4 py-2 text-sm text-sea-deep transition-colors hover:border-sea-deep disabled:opacity-55"
          >
            {pending ? "寄出中…" : "寄出验证码"}
          </button>
        )}
      </div>
      {step === 2 && (
        <div className="space-y-2.5 border-l-2 border-line pl-3">
          <p className="text-xs text-ink-soft">
            验证码已经寄出。<button type="button" onClick={() => { setStep(1); setCode(""); }} className="text-ink-faint underline hover:text-ink-soft">换个邮箱</button>
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
              onClick={verify}
              disabled={pending || code.length < 6}
              className="stamp-btn shrink-0 px-4 py-2 text-sm disabled:opacity-55"
            >
              {pending ? "确认中…" : "确认这个回岛地址"}
            </button>
          </div>
          {hasCat && (
            <label className="block cursor-pointer text-xs text-ink-faint">
              <input
                type="checkbox"
                checked={confirmSwitch}
                onChange={(e) => setConfirmSwitch(e.target.checked)}
                className="hidden"
              />
              <span className={`border-b pb-0.5 ${confirmSwitch ? "border-ink-faint text-ink-soft" : "border-transparent"}`}>
                我知道，这可能会切换到这个邮箱绑定的岛民身份。
              </span>
            </label>
          )}
        </div>
      )}
      {err && <p className="text-xs text-brick">{err}</p>}
    </div>
  );
}
