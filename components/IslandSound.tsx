"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { track } from "@vercel/analytics";
import { cdn } from "@/lib/assets";
import { IconShell } from "./icons";

// 岛声层(2026-08-06):全站背景声,按"你在岛上的哪儿 × 什么时辰"换。
//
// 定性(与 AGENTS.md §5、doc2.0/04 第五声部一致):**不是背景音乐,是岛的动静**。
// 海浪、风、幌子、虫鸣——它属于世界,不属于界面。因此:
//   · 没有播放器 UI,只有页头一枚海螺;不显示进度、时长、曲名;
//   · 换地方是交叉淡入,不是停一下再放——岛不会因为你换了个地方就静音;
//   · 音量压到很低(0.26),该是注意不到的那种在场。
//
// 两处技术选择,都是踩过才定的:
//   ① **用 Web Audio 不用 <audio loop>**:mp3 编码在首尾各带一段静音填充,
//      HTMLAudio 循环到接缝会有可听见的"咔"一下;解码成 PCM 由 AudioBufferSourceNode
//      循环才是真无缝。跨域 fetch 解码依赖 OSS 的 CORS(已放行本站四个来源)。
//   ② **先试放、被拒再等手势**:浏览器禁止无手势自动播放,但"曾经互动过的站点"
//      往往获得豁免(Chrome 的 MEI)。所以不设硬门槛——直接试,resume/play 失败
//      才挂一次性 pointerdown 重试。写成硬门槛的那版:刷新后必须再点一次才有声。

const KEY = "island-sound";
const VOLUME = 0.26;
const FADE = 1.6; // 秒,交叉淡入淡出

/** 路由 → 声床。/adopt 有自己的分屏声音设计(doc2.0/15),岛声层让位不参与 */
function bedFor(pathname: string, night: boolean): string | null {
  if (pathname.startsWith("/adopt")) return null;
  const time = night ? "night" : "day";
  if (pathname.startsWith("/my-cat") || pathname.startsWith("/cats")) return `home-${time}`;
  if (pathname.startsWith("/island")) return `village-${time}`;
  return `dock-${time}`; // 首页及其余:码头
}

function isNight(): boolean {
  const h = (new Date().getUTCHours() + 8) % 24; // 北京时间,与站点夜色同一时钟
  return h >= 19 || h < 6;
}

type Layer = { src: AudioBufferSourceNode; gain: GainNode; bed: string };

export function IslandSound() {
  const pathname = usePathname();
  const [on, setOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const buffers = useRef<Map<string, AudioBuffer>>(new Map());
  const layer = useRef<Layer | null>(null);
  const wantBed = useRef<string | null>(null);
  const retryBound = useRef(false);
  const starting = useRef<string | null>(null); // 同一张床的并发启动只做一次

  const getCtx = (): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    return ctxRef.current;
  };

  const loadBuffer = useCallback(async (bed: string): Promise<AudioBuffer | null> => {
    const cached = buffers.current.get(bed);
    if (cached) return cached;
    const ctx = getCtx();
    if (!ctx) return null;
    try {
      const res = await fetch(cdn(`/sounds/island/${bed}.mp3`));
      if (!res.ok) return null;
      const buf = await ctx.decodeAudioData(await res.arrayBuffer());
      buffers.current.set(bed, buf);
      return buf;
    } catch {
      return null; // 取不到就安静,声音从来不是必需品
    }
  }, []);

  const stopLayer = useCallback((l: Layer | null, fade = FADE) => {
    if (!l) return;
    const ctx = ctxRef.current;
    if (!ctx) return;
    const t = ctx.currentTime;
    l.gain.gain.cancelScheduledValues(t);
    l.gain.gain.setValueAtTime(l.gain.gain.value, t);
    l.gain.gain.linearRampToValueAtTime(0, t + fade);
    setTimeout(() => {
      try {
        l.src.stop();
      } catch {}
    }, fade * 1000 + 100);
  }, []);

  /** 切到目标声床:老的淡出、新的淡入,交叠不留静默。返回是否真的出声了 */
  const play = useCallback(
    async (bed: string | null): Promise<boolean> => {
      wantBed.current = bed;
      if (!bed) {
        stopLayer(layer.current);
        layer.current = null;
        return true;
      }
      if (layer.current?.bed === bed || starting.current === bed) return true;
      const ctx = getCtx();
      if (!ctx) return false;
      if (ctx.state !== "running") {
        // ⚠️ 不能裸 await resume():**没有用户手势时这个 promise 会一直挂着不 resolve**
        //(不是 reject),裸 await 会让 play() 永不返回,连"失败后挂重试监听"都跑不到
        //——刷新后再也不出声的那个 bug 就是这么来的。给它一个 300ms 的赛跑上限。
        await Promise.race([ctx.resume().catch(() => {}), new Promise((r) => setTimeout(r, 300))]);
      }
      if (ctx.state !== "running") return false; // 还没拿到手势
      starting.current = bed;
      const buf = await loadBuffer(bed);
      starting.current = null;
      if (!buf) return false;
      if (wantBed.current !== bed) return true; // 期间又换了地方,这次作废

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(VOLUME, ctx.currentTime + FADE);
      gain.connect(ctx.destination);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true; // 解码后循环 = 真无缝,没有 mp3 填充造成的接缝
      src.connect(gain);
      src.start();

      stopLayer(layer.current);
      layer.current = { src, gain, bed };
      return true;
    },
    [loadBuffer, stopLayer],
  );

  // 偏好恢复
  /* eslint-disable react-hooks/set-state-in-effect --
     storage 只在客户端存在:放进 useState 惰性初值会让服务端渲一屏、客户端渲另一屏
     (水合不一致)。挂载后再落座是这类"客户端专有初值"的正确位置,别改成初值读取。 */
  useEffect(() => {
    if (localStorage.getItem(KEY) === "on") setOn(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  // 开着就跟着路由走;放不出来(还没手势)就挂一次性重试
  useEffect(() => {
    if (!on) return;
    let cancelled = false;
    void play(bedFor(pathname, isNight())).then((ok) => {
      if (ok || cancelled || retryBound.current) return;
      retryBound.current = true;
      const retry = () => {
        retryBound.current = false;
        void play(bedFor(window.location.pathname, isNight()));
      };
      window.addEventListener("pointerdown", retry, { once: true });
      window.addEventListener("keydown", retry, { once: true });
    });
    return () => {
      cancelled = true;
    };
  }, [on, pathname, play]);

  // 关掉:立刻淡出
  useEffect(() => {
    if (on) return;
    stopLayer(layer.current);
    layer.current = null;
    wantBed.current = null;
  }, [on, stopLayer]);

  // 切到后台就停,不在别人后台里响;回来接着放
  useEffect(() => {
    const onVis = () => {
      if (!on) return;
      if (document.hidden) {
        stopLayer(layer.current, 0.4);
        layer.current = null;
      } else {
        void play(bedFor(pathname, isNight()));
      }
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [on, pathname, play, stopLayer]);

  // 卸载兜底
  useEffect(() => {
    return () => {
      stopLayer(layer.current, 0.2);
      layer.current = null;
    };
  }, [stopLayer]);

  const toggle = () => {
    const next = !on;
    setOn(next);
    localStorage.setItem(KEY, next ? "on" : "off");
    track(next ? "island_sound_on" : "island_sound_off", { page: pathname });
    // 这一下点击本身就是手势,直接起(effect 也会跑,play 内部按 bed 去重)
    if (next) void play(bedFor(pathname, isNight()));
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={on ? "关掉岛上的声音" : "听听岛上的声音"}
      title={on ? "岛上的声音开着" : "听海"}
      className={`transition-colors ${on ? "text-sea-deep" : "text-ink-faint hover:text-sea-deep"}`}
    >
      <IconShell size={17} />
    </button>
  );
}
