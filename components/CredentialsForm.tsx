"use client";

import { useState, useTransition } from "react";
import { setupCredentials } from "@/lib/account-actions";

// 把这段相遇存进岛民册(doc/20):设置登录邮箱+密码,立即生效。
// 口径红线:明确告知"暂不验证邮箱,也不能用它找回"——不假装它是可靠的回岛路。
export function CredentialsForm() {
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();

  if (done) {
    return (
      <p className="font-diary mt-2 text-sm leading-relaxed text-ink">
        已经收进岛民册。以后换设备,可以用这个邮箱和密码回来。
      </p>
    );
  }

  return (
    <form
      className="mt-3 space-y-2.5"
      action={(fd) => {
        setErr(null);
        startTransition(async () => {
          const r = await setupCredentials(fd);
          if (r.ok) setDone(true);
          else setErr(r.err ?? "出错了,稍后再试");
        });
      }}
    >
      <input
        name="email" type="email" required placeholder="登录邮箱"
        className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
      />
      <input
        name="password" type="password" required minLength={8} placeholder="设置密码(至少 8 个字符,中文和空格都行)"
        className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
      />
      <input
        name="password2" type="password" required placeholder="再输一遍密码"
        className="w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
      />
      <p className="text-xs leading-relaxed text-ink-faint">
        邮箱暂时只用于登录,不会寄确认信,也还不能用它找回密码——请确认没有输错,并保管好回岛钥匙。
      </p>
      {err && <p className="text-xs text-brick">{err}</p>}
      <button type="submit" disabled={pending} className="stamp-btn px-5 py-1.5 text-sm disabled:opacity-60">
        {pending ? "收录中…" : "存进岛民册"}
      </button>
    </form>
  );
}
