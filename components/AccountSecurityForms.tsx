"use client";

import { useState, useTransition } from "react";
import { changeLoginEmail, changePassword } from "@/lib/account-actions";

// 修改登录邮箱 / 修改密码(doc/20 §八):都要重新输入当前密码。
// 改邮箱是"填错邮箱"的逃生舱——新地址立即生效但回到未确认态,想要邮件找回再去确认。

const inputCls = "w-full border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none";

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [newEmail, setNewEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("newEmail", newEmail);
      fd.set("currentPassword", pw);
      const r = await changeLoginEmail(fd);
      if (r.ok) {
        setMsg({ ok: true, text: `登录邮箱已改成 ${newEmail}。新地址还没确认归属,下次登录用它。` });
        setNewEmail("");
        setPw("");
      } else setMsg({ ok: false, text: r.err ?? "出错了" });
    });
  }

  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink-soft">换一个登录邮箱</summary>
      <div className="mt-2 space-y-2">
        <p className="text-xs leading-relaxed text-ink-faint">
          现在是 {currentEmail}。填错了可以在这儿改——需要再输一次当前密码。
        </p>
        <input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="新的登录邮箱" className={inputCls} />
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="当前密码" autoComplete="current-password" className={inputCls} />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !newEmail || !pw}
          className="border border-line px-4 py-1.5 text-xs text-sea-deep hover:border-sea-deep disabled:opacity-55"
        >
          {pending ? "改写中…" : "换成这个邮箱"}
        </button>
        {msg && <p className={`text-xs ${msg.ok ? "text-sage" : "text-brick"}`}>{msg.text}</p>}
      </div>
    </details>
  );
}

export function ChangePasswordForm() {
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  function submit() {
    setMsg(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("currentPassword", cur);
      fd.set("password", pw);
      fd.set("password2", pw2);
      const r = await changePassword(fd);
      if (r.ok) {
        setMsg({ ok: true, text: "密码改好了。回岛钥匙没有变,继续收好它。" });
        setCur("");
        setPw("");
        setPw2("");
      } else setMsg({ ok: false, text: r.err ?? "出错了" });
    });
  }

  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink-soft">换一个密码</summary>
      <div className="mt-2 space-y-2">
        <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="当前密码" autoComplete="current-password" className={inputCls} />
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="新密码(至少 8 个字)" autoComplete="new-password" className={inputCls} />
        <input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} placeholder="再打一遍新密码" autoComplete="new-password" className={inputCls} />
        <button
          type="button"
          onClick={submit}
          disabled={pending || !cur || !pw || !pw2}
          className="border border-line px-4 py-1.5 text-xs text-sea-deep hover:border-sea-deep disabled:opacity-55"
        >
          {pending ? "改写中…" : "换成新密码"}
        </button>
        {msg && <p className={`text-xs ${msg.ok ? "text-sage" : "text-brick"}`}>{msg.text}</p>}
      </div>
    </details>
  );
}
