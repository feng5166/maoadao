"use client";

import { useState, useTransition } from "react";
import { resetPasswordWithRecovery } from "@/lib/account-actions";
import { ReturnKey } from "./ReturnKey";

// 用回岛钥匙回来(doc/20):邮箱+钥匙双因子 → 设新密码;旧钥匙作废,新钥匙当场展示一次。
export function ResetPasswordForm() {
  const [err, setErr] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (newKey) {
    return (
      <div className="space-y-3">
        <p className="font-diary text-sm leading-relaxed text-ink">
          密码已经换好。旧钥匙同时作废了——这是你的新回岛钥匙,只在此刻展示这一次:
        </p>
        <ReturnKey code={newKey} />
        <p className="text-xs text-ink-faint">抄好之后,用新密码正常登录。</p>
        <a href="/login" className="stamp-btn inline-block px-5 py-1.5 text-sm">去登录</a>
      </div>
    );
  }

  return (
    <form
      className="space-y-2.5"
      action={(fd) => {
        setErr(null);
        startTransition(async () => {
          const r = await resetPasswordWithRecovery(fd);
          if (r.ok && r.newKey) setNewKey(r.newKey);
          else setErr(r.err ?? "出错了,稍后再试");
        });
      }}
    >
      <input
        name="email" type="email" required placeholder="登录邮箱"
        className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
      />
      <input
        name="code" required placeholder="回岛钥匙 MAO-XXXX-…" maxLength={34}
        className="w-full border border-line bg-paper px-3 py-2 font-mono text-sm uppercase focus:border-sea-deep focus:outline-none"
      />
      <input
        name="password" type="password" required minLength={8} placeholder="新密码(至少 8 个字符)"
        className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
      />
      <input
        name="password2" type="password" required placeholder="再输一遍新密码"
        className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
      />
      {err && <p className="text-xs text-brick">{err}</p>}
      <button type="submit" disabled={pending} className="stamp-btn w-full py-2 text-sm disabled:opacity-60">
        {pending ? "开门中…" : "换好密码,回到岛上"}
      </button>
    </form>
  );
}
