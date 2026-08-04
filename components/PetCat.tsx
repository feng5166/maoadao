"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { CatAvatar } from "./CatAvatar";
import { playCatVoice } from "./CatVoice";
import type { CatVoiceProfile, VoiceEmotion, VoiceState } from "@/lib/voice/engine";

/** 摸摸它的声音上下文(doc/17):点击 = user_touch,连点自带阶梯与不耐烦 */
export interface PetVoice {
  profile: CatVoiceProfile;
  state: VoiceState;
  emotion: VoiceEmotion;
  relationLevel: 0 | 1 | 2 | 3;
}

/** 摸摸它：每天一句由状态确定性生成的反应。它不受你控制，但会回应你。
 *  反应像真的猫理你一下——冒出来几秒,自己淡掉;再摸还会理你(埋点只报首次)。
 *  chip 形态：猫已经以贴纸出现在画面里(导演系统)时,不再叠圆头像,只留一枚安静的小按钮 */
export function PetCat({ id, portraitUrl, line, chip = false, voice }: { id: string; portraitUrl?: string | null; line: string; chip?: boolean; voice?: PetVoice }) {
  const [petted, setPetted] = useState(false);
  const [showLine, setShowLine] = useState(false);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pet = () => {
    if (!petted) {
      setPetted(true);
      track("pet_cat");
    }
    // 猫语声音引擎(doc/17):20% 轻短喵起步,连点会不耐烦;引擎自己决定要不要出声
    if (voice) {
      playCatVoice(
        { catId: id, context: "user_touch", state: voice.state, emotion: voice.emotion, intensity: 1, relationLevel: voice.relationLevel },
        voice.profile,
      );
    }
    setShowLine(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowLine(false), 4000);
  };
  useEffect(() => () => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
  }, []);
  const bubble = petted && (
    <div
      className={`note-slip absolute bottom-full left-0 mb-2 w-52 px-3 py-2 text-left transition-opacity duration-700 ${showLine ? "opacity-100" : "pointer-events-none opacity-0"}`}
    >
      <p className="font-diary text-[13px] leading-relaxed text-ink">{line}</p>
    </div>
  );
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
        {bubble}
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
      {bubble}
    </div>
  );
}
