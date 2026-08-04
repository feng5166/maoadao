"use client";

import { useEffect, useRef } from "react";
import {
  newVoiceSession,
  resolveCatVoice,
  type CatVoiceProfile,
  type CatVoiceRequest,
  type VoiceSession,
} from "@/lib/voice/engine";

// 猫语声音播放层(doc/17):引擎跑在客户端,会话状态模块级单例(跨组件共享冷却/配额)。
// 自动播放被浏览器拦截 → 静默跳过(允许不发声);页面隐藏 → 立即停掉循环声。

let session: VoiceSession | null = null;
let currentLoop: HTMLAudioElement | null = null;

function getSession(): VoiceSession {
  if (!session) session = newVoiceSession();
  return session;
}

/** 立即按请求播一声(点击等用户手势场景直接调) */
export function playCatVoice(req: CatVoiceRequest, profile: CatVoiceProfile): void {
  const r = resolveCatVoice(req, profile, getSession());
  if (!r.shouldPlay || !r.audioUrl) return;
  const go = () => {
    // 呼噜是唯一循环声:全局只留一个,新声音来了旧的让位
    if (currentLoop) {
      currentLoop.pause();
      currentLoop = null;
    }
    const a = new Audio(r.audioUrl);
    a.volume = r.volume ?? 0.7;
    a.playbackRate = r.playbackRate ?? 1;
    if (r.loop) {
      a.loop = true;
      currentLoop = a;
      // 呼噜段落 5-15s 后渐弱收掉,不变成背景噪音
      const stopAfter = 8000 + Math.random() * 6000;
      setTimeout(() => {
        if (currentLoop !== a) return;
        const fade = setInterval(() => {
          a.volume = Math.max(0, a.volume - 0.08);
          if (a.volume <= 0.02) {
            clearInterval(fade);
            a.pause();
            if (currentLoop === a) currentLoop = null;
          }
        }, 150);
      }, stopAfter);
    }
    a.play().catch(() => {
      /* 自动播放被拦 = 这次不叫 */
    });
  };
  setTimeout(go, r.delayMs ?? 0);
}

/** 进入页面时的状态声音(user_enter / 睡觉呼噜 / 海螺来路) */
export function CatVoiceOnEnter({ req, profile }: { req: CatVoiceRequest; profile: CatVoiceProfile }) {
  const fired = useRef(false);
  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    // 睡觉呼噜:停留 3s 后再渐入(doc/17);其余场景按引擎 delay
    const wait = req.state === "sleeping" ? 3000 : 0;
    const t = setTimeout(() => playCatVoice(req, profile), wait);
    const onHide = () => {
      if (document.visibilityState === "hidden" && currentLoop) {
        currentLoop.pause();
        currentLoop = null;
      }
    };
    document.addEventListener("visibilitychange", onHide);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onHide);
      if (currentLoop) {
        currentLoop.pause();
        currentLoop = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
