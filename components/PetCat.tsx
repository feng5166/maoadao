"use client";

import { useState } from "react";
import { track } from "@vercel/analytics";
import { CatAvatar } from "./CatAvatar";

/** 摸摸它：每天一句由状态确定性生成的反应。它不受你控制，但会回应你。 */
export function PetCat({ id, portraitUrl, line }: { id: string; portraitUrl?: string | null; line: string }) {
  const [petted, setPetted] = useState(false);
  return (
    <div className="absolute bottom-2 left-2">
      <button
        type="button"
        aria-label="摸摸它"
        className="block rounded-full border-2 border-paper transition-transform hover:scale-105 active:scale-95"
        onClick={() => {
          if (!petted) {
            setPetted(true);
            track("pet_cat");
          }
        }}
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
