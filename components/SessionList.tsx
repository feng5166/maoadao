"use client";

import { useState, useTransition } from "react";
import { revokeOtherSessions } from "@/lib/account-actions";

// 在用的设备(doc/20 §八):看得见、踢得动。
export type SessionRow = { id: string; label: string; lastSeen: string; current: boolean };

export function SessionList({ sessions }: { sessions: SessionRow[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const others = sessions.filter((s) => !s.current).length;

  function revoke() {
    setMsg(null);
    startTransition(async () => {
      const r = await revokeOtherSessions();
      setMsg(r.ok ? `已经请其他 ${r.revoked ?? 0} 台设备下岛。` : (r.err ?? "出错了"));
    });
  }

  return (
    <div className="mt-2 space-y-2">
      <ul className="space-y-1 text-sm text-ink">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-baseline gap-x-2">
            <span>{s.label}</span>
            {s.current && <span className="text-[11px] text-sage">就是这台</span>}
            <span className="text-[11px] text-ink-faint">最近 {s.lastSeen}</span>
          </li>
        ))}
      </ul>
      {others > 0 && (
        <button
          type="button"
          onClick={revoke}
          disabled={pending}
          className="border border-line px-4 py-1.5 text-xs text-ink-soft hover:border-sea-deep disabled:opacity-55"
        >
          {pending ? "处理中…" : `请其他 ${others} 台设备下岛`}
        </button>
      )}
      {msg && <p className="text-xs text-sage">{msg}</p>}
    </div>
  );
}
