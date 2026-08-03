"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { CatAvatar } from "./CatAvatar";

/** 摸摸它：每天一句由状态确定性生成的反应。它不受你控制，但会回应你。
 *  chip 形态：猫已经以贴纸出现在画面里(导演系统)时,不再叠圆头像,只留一枚安静的小按钮 */
export function PetCat({ id, portraitUrl, line, chip = false }: { id: string; portraitUrl?: string | null; line: string; chip?: boolean }) {
  const [petted, setPetted] = useState(false);
  const pet = () => {
    if (!petted) {
      setPetted(true);
      track("pet_cat");
    }
  };
  if (chip) {
    return (
      <div className="absolute bottom-2 left-2">
        <button
          type="button"
          onClick={pet}
          className="note-slip px-2.5 py-1 text-xs text-ink-soft transition-transform hover:scale-105 active:scale-95"
        >
          摸摸它
        </button>
        {petted && (
          <div className="note-slip absolute bottom-full left-0 mb-2 w-52 px-3 py-2 text-left">
            <p className="font-diary text-[13px] leading-relaxed text-ink">{line}</p>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="absolute bottom-2 left-2">
      <button
        type="button"
        aria-label="摸摸它"
        className="flex rounded-full border-2 border-paper transition-transform hover:scale-105 active:scale-95"
        onClick={pet}
      >
        <CatAvatar id={id} size={64} portraitUrl={portraitUrl} />
      </button>
      {petted && (
        <div className="note-slip absolute bottom-full left-0 mb-2 w-52 px-3 py-2 text-left">
          <p className="font-diary text-[13px] leading-relaxed text-ink">{line}</p>
        </div>
      )}
    </div>
  );
}
