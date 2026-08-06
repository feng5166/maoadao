"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { D0_SCREENS, SKIP_LABEL, TOUCH, optimizedImg, type D0Screen } from "@/lib/d0/script";
import { cdn } from "@/lib/assets";
import { IconShell } from "./icons";

// D0Player(doc2.0/15 §四):五幕状态机,180 秒的认知跃迁。
// 心流单向,点按推进(用户控节奏);刷新从当前屏续播(sessionStorage),不从头;
// 无步骤条——场景即进度(doc2.0/14 §五)。
// 媒介三级降级(§五):静图秒开 → 呼吸循环就绪后无感替换;减少动效偏好下只出静图。
// 「听海」声音层默认关;S9 的静是设计(沉默声部),开着听海也没有声音。

const RESUME_KEY = "d0-screen";
const SEA_KEY = "d0-sea";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const on = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return reduced;
}

/** 慢连接判定(doc2.0/15 §五 降级梯的触发器):省流量/2g/3g/估算带宽 <1.5Mbps →
 *  全程静图档,循环视频一字节都不下——单条 1.3-2.1MB,慢链路上永远到不了 canplay,
 *  只会把静帧预取挤死(2026-08-05 实测国内到 vercel.app 仅 30-50KB/s)。
 *  Safari 没有 connection API → 回退视频档(它自己的带宽管理够激进)。 */
function slowConnection(): boolean {
  if (typeof navigator === "undefined") return false;
  const conn = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string; downlink?: number } }).connection;
  if (!conn) return false;
  if (conn.saveData) return true;
  if (/2g|3g/.test(conn.effectiveType ?? "")) return true;
  return typeof conn.downlink === "number" && conn.downlink < 1.5;
}

/** 呼吸分镜:静帧立即出,循环视频 canplay 后淡入盖上(无感替换)。
 *  视频三重礼让:本屏静帧先画完(onLoad)→ 下两屏预取 settle(父级 videoGo)→ 才挂载。 */
function BreathingShot({ img, video }: { img: string; video?: string }) {
  const [ready, setReady] = useState(false);
  const [stillOk, setStillOk] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  useEffect(() => setReady(false), [video]);
  useEffect(() => {
    setStillOk(false);
    // 预取命中缓存时 load 事件可能赶在挂载前:complete 兜底
    if (imgRef.current?.complete) setStillOk(true);
  }, [img]);
  return (
    <div className="relative aspect-square w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img ref={imgRef} src={optimizedImg(img)} alt="" onLoad={() => setStillOk(true)} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      {video && stillOk && (
        <video
          key={video}
          src={cdn(video)}
          muted
          loop
          playsInline
          autoPlay
          preload="auto"
          onCanPlay={() => setReady(true)}
          className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${ready ? "opacity-100" : "opacity-0"}`}
        />
      )}
    </div>
  );
}

/** S1 脚印前景层(doc2.0/15:S1 不生成,现有码头场景 + 脚印合成):
 *  手绘风爪印一串,由近及远往岛里去。 */
function Footprints() {
  // 落点沿栈道木板由近及远(场景 dock-dusk:栈道从画面底部中右伸向岛)
  const prints = [
    { x: 66, y: 91, s: 1.0, r: -12 },
    { x: 58, y: 83, s: 0.84, r: -4 },
    { x: 53, y: 75, s: 0.7, r: 5 },
    { x: 50, y: 68, s: 0.58, r: -3 },
    { x: 48, y: 62, s: 0.48, r: 6 },
  ];
  return (
    // preserveAspectRatio="none":场景图不是方的,脚印按画面百分比落点(默认保纵比会挤进中央竖条)
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      {prints.map((p, i) => (
        <g key={i} transform={`translate(${p.x} ${p.y}) scale(${p.s}) rotate(${p.r})`} fill="rgba(64,52,40,0.5)">
          <ellipse cx="0" cy="1.6" rx="2.3" ry="1.9" />
          <circle cx="-2.3" cy="-1.5" r="0.85" />
          <circle cx="-0.8" cy="-2.3" r="0.85" />
          <circle cx="0.8" cy="-2.3" r="0.85" />
          <circle cx="2.3" cy="-1.5" r="0.85" />
        </g>
      ))}
    </svg>
  );
}

/** S0 船票静物:已寄到的邀请,没有领取动作(doc2.0/14 幕一) */
function TicketStill({ ticket }: { ticket?: string }) {
  return (
    <div className="flex aspect-square w-full items-center justify-center bg-paper-deep">
      <div className="note-slip relative w-[78%] -rotate-2 px-5 py-6">
        <p className="font-press text-xs tracking-[0.3em] text-ink-soft">猫啊岛 · 航渡</p>
        <p className="font-title mt-3 text-xl font-bold">单程 · 仅限一位岛民</p>
        {ticket && <p className="mt-2 text-xs tracking-wider text-ink-faint">{ticket}</p>}
        <p className="font-diary mt-5 text-[13px] text-ink-soft">去岛的船，总在傍晚靠岸。</p>
        <div className="absolute -right-px top-0 h-full border-r border-dashed border-line" />
        <span className="seal absolute right-3 top-3">已靠岸</span>
      </div>
    </div>
  );
}

export function D0Player({ ticket, onDone }: { ticket?: string; onDone: (mode: "complete" | "skip") => void }) {
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [sea, setSea] = useState(false);
  const [touched, setTouched] = useState(false);
  const [touchTimeout, setTouchTimeout] = useState(false);
  const [hint, setHint] = useState(false);
  // 媒介档位:慢连接/减少动效 → 静图档(降级梯第二级,doc2.0/15 §五)
  const [slow, setSlow] = useState(false);
  // 视频放行闸:下两屏静帧预取 settle(或 3.5s 兜底)之前,本屏视频不挂载
  const [videoGo, setVideoGo] = useState(false);
  const preloadGen = useRef(0);
  const ambientRef = useRef<HTMLAudioElement | null>(null);
  const cueRef = useRef<HTMLAudioElement | null>(null);
  const s9EnterRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  useEffect(() => setSlow(slowConnection()), []);
  const tier: "video" | "still" = reduced || slow ? "still" : "video";

  const screen: D0Screen = D0_SCREENS[idx];

  // 刷新续播:回到离开时的那一屏(心流单向,不支持回退)
  useEffect(() => {
    const saved = sessionStorage.getItem(RESUME_KEY);
    const savedIdx = saved ? D0_SCREENS.findIndex((s) => s.id === saved) : -1;
    if (savedIdx > 0) setIdx(savedIdx);
    setSea(sessionStorage.getItem(SEA_KEY) === "1");
  }, []);
  useEffect(() => {
    sessionStorage.setItem(RESUME_KEY, screen.id);
  }, [screen.id]);

  // 进屏埋点(S9 特殊:出屏才知道驻留时长);d0_enter 带媒介档,漏斗才分得清两种体验
  useEffect(() => {
    if (screen.id === "S9") {
      s9EnterRef.current = Date.now();
      return;
    }
    if (screen.enterEvent) track(screen.enterEvent, screen.enterEvent === "d0_enter" ? { tier: slowConnection() ? "still" : "video" } : undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.id]);

  // 预取下一两屏静帧(doc2.0/15 §四 加载策略)——走优化器 URL,和渲染同源才命中缓存。
  // 预取 settle 后才放行本屏视频(3.5s 兜底):慢链路上静帧永远赢过 1.5MB 的循环
  useEffect(() => {
    const gen = ++preloadGen.current;
    setVideoGo(false);
    const jobs: Promise<unknown>[] = [];
    for (const next of D0_SCREENS.slice(idx + 1, idx + 3)) {
      const src = next.img ?? next.scene;
      if (!src) continue;
      jobs.push(
        new Promise((resolve) => {
          const im = new Image();
          im.onload = im.onerror = resolve;
          im.src = optimizedImg(src);
        }),
      );
    }
    const go = () => {
      if (preloadGen.current === gen) setVideoGo(true);
    };
    void Promise.allSettled(jobs).then(go);
    const cap = setTimeout(go, 3500);
    return () => clearTimeout(cap);
  }, [idx]);

  // 「听海」环境声:每屏换素材;S9 无 ambient = 静(设计)
  useEffect(() => {
    const a = ambientRef.current;
    if (!a) return;
    if (!sea || !screen.ambient) {
      a.pause();
      return;
    }
    const src = cdn(`/sounds/D0/${screen.ambient}`);
    if (!a.src.endsWith(src)) a.src = src;
    a.loop = true;
    a.volume = 0.45;
    a.play().catch(() => {});
  }, [sea, screen.ambient]);

  // 进屏一次性音效(听海开启时);S6 的「呣」在轻触时刻单独触发
  useEffect(() => {
    if (!sea || !screen.cue || !cueRef.current) return;
    cueRef.current.src = cdn(`/sounds/D0/${screen.cue}`);
    cueRef.current.volume = 0.6;
    cueRef.current.play().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.id, sea]);

  // S6a:8 秒不轻触则浮现下一步点按区(轻触可被略过,不强制——doc2.0/15 §四)
  useEffect(() => {
    if (screen.id !== "S6a") return;
    setTouched(false);
    setTouchTimeout(false);
    const t = setTimeout(() => setTouchTimeout(true), TOUCH.timeoutMs);
    return () => clearTimeout(t);
  }, [screen.id]);

  // 点按屏停 3 秒还没动作,浮出一行小字(不宣布,只轻轻提一句)
  useEffect(() => {
    setHint(false);
    if (screen.button || screen.id === "S6a") return;
    const t = setTimeout(() => setHint(true), 3000);
    return () => clearTimeout(t);
  }, [screen.id, screen.button]);

  const advance = useCallback(() => {
    if (screen.id === "S9" && s9EnterRef.current) {
      track("d0_aha_dwell", { ms: Date.now() - s9EnterRef.current });
      s9EnterRef.current = null;
    }
    if (idx < D0_SCREENS.length - 1) setIdx(idx + 1);
  }, [idx, screen.id]);

  const finish = useCallback(
    (mode: "complete" | "skip") => {
      if (doneRef.current) return;
      doneRef.current = true;
      sessionStorage.removeItem(RESUME_KEY);
      track(mode === "skip" ? "d0_skip" : "d0_to_d1");
      onDone(mode);
    },
    [onDone],
  );

  // S6a 轻触:D0 唯一交互——一次、无反应池、无任何奖励(doc2.0/14 §五)
  const onTouch = useCallback(() => {
    if (touched) return;
    setTouched(true);
    track("d0_touch");
    if (sea && cueRef.current) {
      cueRef.current.src = cdn(`/sounds/D0/${TOUCH.cue}`);
      cueRef.current.volume = 0.5;
      cueRef.current.play().catch(() => {});
    }
  }, [touched, sea]);

  const isS6a = screen.id === "S6a";
  const isGate = screen.id === "S10";
  const tapAdvances = !screen.button && (!isS6a || touched || touchTimeout);
  // S6a 未轻触时不放旁白也不放视频——回应发生在你蹲下来之后
  const showLines = !isS6a || touched;
  const showVideo = !isS6a || touched;

  const media = useMemo(() => {
    if (screen.id === "S0") return <TicketStill ticket={ticket} />;
    if (screen.scene)
      return (
        // aspect 锁死(场景图 1200×686):图未到时布局不跳
        <div className="relative aspect-[1200/686] w-full overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={optimizedImg(screen.scene)} alt="" className="h-full w-full object-cover" draggable={false} />
          <Footprints />
        </div>
      );
    if (screen.img) return <BreathingShot img={screen.img} video={tier === "video" && videoGo && showVideo ? screen.video : undefined} />;
    // S9 独屏一句:纸面排版屏
    return (
      <div className="flex aspect-square w-full items-center justify-center bg-paper-deep px-8">
        <p className="fx-rise font-diary text-center text-[19px] leading-[2.3] text-ink">{screen.lines?.[0]}</p>
      </div>
    );
  }, [screen, ticket, showVideo, tier, videoGo]);

  return (
    <div className="mx-auto max-w-lg select-none">
      {/* 听海开关:唯一的常驻控件,默认关(声音是层,不是戏) */}
      <div className="flex justify-end pt-2">
        <button
          type="button"
          onClick={() => {
            const next = !sea;
            setSea(next);
            sessionStorage.setItem(SEA_KEY, next ? "1" : "0");
          }}
          className={`inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors ${sea ? "text-sea-deep" : "text-ink-faint"}`}
        >
          <IconShell size={14} />
          {sea ? "听着海" : "听海"}
        </button>
      </div>

      <div
        className={`mt-2 overflow-hidden rounded-lg border border-line ${tapAdvances ? "cursor-pointer" : ""}`}
        onClick={tapAdvances ? advance : undefined}
      >
        {media}
      </div>

      {/* 旁白区:固定最小高度,行文逐行浮现;S9 的字在画面里,这里留白 */}
      <div className="mt-6 min-h-[7.5rem] text-center" onClick={tapAdvances ? advance : undefined}>
        {screen.id !== "S9" && showLines && (
          <p key={`${screen.id}-lines`} className="font-diary text-[16px] leading-[2.2] text-ink">
            {screen.lines?.map((l, i) => (
              <span key={i} className={`block ${i === 0 ? "fx-rise" : i === 1 ? "fx-rise-2" : "fx-rise-3"}`}>
                {l}
              </span>
            ))}
          </p>
        )}
        {isS6a && !touched && (
          <div className="fx-rise-2 mt-2">
            <button type="button" onClick={onTouch} className="stamp-btn px-7 py-2.5">
              {TOUCH.button}
            </button>
            {touchTimeout && <p className="fx-rise mt-3 text-xs text-ink-faint">（也可以不打扰它——点画面，接着走。）</p>}
          </div>
        )}
        {screen.button && (
          <div className="fx-rise-3 mt-3">
            <button
              type="button"
              onClick={() => (isGate ? finish("complete") : advance())}
              className="stamp-btn px-8 py-2.5"
            >
              {screen.button}
            </button>
            {screen.id === "S1" && (
              <p className="mt-4 text-right text-xs">
                <button type="button" onClick={() => finish("skip")} className="text-ink-faint underline-offset-2 hover:underline">
                  {SKIP_LABEL}
                </button>
              </p>
            )}
          </div>
        )}
        {hint && tapAdvances && <p className="fx-rise mt-2 text-xs text-ink-faint">（点一下画面，接着走。）</p>}
      </div>

      <audio ref={ambientRef} preload="none" className="hidden" />
      <audio ref={cueRef} preload="none" className="hidden" />
    </div>
  );
}
