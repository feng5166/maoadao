"use client";

import { useState, useTransition } from "react";
import { loginWithPassword } from "@/lib/account-actions";

// 回到猫啊岛:邮箱+密码登录。统一报错;本设备已有别的猫时展开切换确认。
export function LoginForm() {
  const [err, setErr] = useState<string | null>(null);
  const [needSwitch, setNeedSwitch] = useState(false);
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="space-y-2.5"
      action={(fd) => {
        setErr(null);
        startTransition(async () => {
          const r = await loginWithPassword(fd);
          // 成功时 server action 内部 redirect,不会走到这里
          if (r && !r.ok) {
            setErr(r.err ?? "出错了,稍后再试");
            if (r.needSwitch) setNeedSwitch(true);
          }
        });
      }}
    >
      <input
        name="email" type="email" required placeholder="登录邮箱"
        className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
      />
      <input
        name="password" type="password" required placeholder="密码"
        className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
      />
      {needSwitch && (
        <label className="flex items-start gap-2 text-xs leading-relaxed text-ink-soft">
          <input type="checkbox" name="confirmSwitch" className="mt-0.5 accent-[#5c7382]" />
          我知道,切换后这台设备上原来的猫会留在原身份下
        </label>
      )}
      {err && <p className="text-xs text-brick">{err}</p>}
      <button type="submit" disabled={pending} className="stamp-btn w-full py-2 text-sm disabled:opacity-60">
        {pending ? "回岛中…" : "回来"}
      </button>
    </form>
  );
}
