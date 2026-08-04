"use client";

import { useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { IconShell } from "./icons";

// 海螺留声(P3 声音包装):不摆播放器,声音是生活痕迹——
// 一枚海螺按钮,点一下海风和它的声音一起出来。
export function SeaVoice({ src, seconds }: { src: string; seconds?: number }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  function toggle() {
    const a = audioRef.current;
    if (!a) return;
    if (playing) {
      a.pause();
      a.currentTime = 0;
      setPlaying(false);
    } else {
      void a.play();
      setPlaying(true);
      track("voice_play");
    }
  }
  return (
    <div className="mt-3 text-center">
      <p className="text-xs text-ink-faint">海螺里存着它的声音</p>
      <button
        type="button"
        onClick={toggle}
        className="mt-1.5 inline-flex items-center gap-1.5 border border-line px-3.5 py-1.5 text-sm text-sea-deep transition-colors hover:border-sea-deep"
      >
        <IconShell size={16} />
        {playing ? "海风正吹着……再点一下放回去" : `凑近听听${seconds ? ` · ${seconds} 秒` : ""}`}
      </button>
      <audio ref={audioRef} preload="none" src={src} onEnded={() => setPlaying(false)} className="hidden" />
    </div>
  );
}
