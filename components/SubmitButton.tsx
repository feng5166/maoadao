"use client";

import { useFormStatus } from "react-dom";

/** 提交中禁用并显示状态——审核要几秒，防止用户连点 */
export function SubmitButton({ children, pendingText, className }: { children: React.ReactNode; pendingText: string; className: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className} disabled:cursor-not-allowed disabled:opacity-60`}>
      {pending ? pendingText : children}
    </button>
  );
}
