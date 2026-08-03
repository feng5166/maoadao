"use client";

import { useState } from "react";
import Link from "next/link";
import { SubmitButton } from "./SubmitButton";
import { releaseCat } from "@/lib/account-actions";

// 送别的二次确认：第一步是想清楚（勾选），第二步是它回头看你一眼。
// 不用系统弹窗——反悔的机会要长在世界里。

export function FarewellConfirm({ catName }: { catName: string }) {
  const [agreed, setAgreed] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  if (step === 1) {
    return (
      <div className="note-slip mx-auto mt-6 max-w-md p-4">
        <label className="flex items-start gap-2 text-sm font-bold text-ink">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-1 accent-[#a8503c]"
          />
          <span>我想清楚了，送{catName}离开，它的一切都不保留</span>
        </label>
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs leading-relaxed text-ink-soft">
          <li>· 它的日记、照片和收到的信，会跟着船一起走</li>
          <li>· 它在岛上的痕迹，会被风和潮水慢慢带走</li>
          <li>· 这是一场告别，也是一个新的开始</li>
        </ul>
        <button
          type="button"
          disabled={!agreed}
          onClick={() => setStep(2)}
          className="stamp-btn mt-4 w-full disabled:cursor-not-allowed disabled:opacity-40"
        >
          送它上船
        </button>
      </div>
    );
  }

  return (
    <div className="note-slip mx-auto mt-6 max-w-md p-4 text-center">
      <p className="font-diary text-[16px] leading-relaxed text-ink">
        {catName}走到跳板前，回头看了你一眼。
      </p>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">
        船开走以后，它和它的一切都不会再回来。真的要送它走吗？
      </p>
      <Link
        href="/account"
        className="mt-4 block border border-line px-4 py-2 text-sm text-sea-deep hover:border-sea-deep"
      >
        再抱一下，不送了
      </Link>
      <form action={releaseCat} className="mt-2">
        <input type="hidden" name="confirmRelease" value="on" />
        <SubmitButton
          pendingText={`${catName}上船了，船正在慢慢驶远……`}
          className="stamp-btn w-full"
        >
          嗯，送它上船
        </SubmitButton>
      </form>
    </div>
  );
}
