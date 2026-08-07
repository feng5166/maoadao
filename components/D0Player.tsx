"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { track } from "@vercel/analytics";
import { D0_SCREENS, FLOW_VERSION, SKIP_LABEL, TOUCH, optimizedImg, type D0Screen } from "@/lib/d0/script";
import { cdn } from "@/lib/assets";
import { useTapAdvance } from "./useTapAdvance";
import { IconShell } from "./icons";

// D0Player(doc2.0/15 §四):五幕状态机,180 秒的认知跃迁。
// 心流单向,点按推进(用户控节奏);刷新从当前屏续播(sessionStorage),不从头;
// 无步骤条——场景即进度(doc2.0/14 §五)。
// 媒介三级降级(§五):静图秒开 → 呼吸循环就绪后无感替换;减少动效偏好下只出静图。
// 「听海」声音层默认关;S9 的静是设计(沉默声部),开着听海也没有声音。

export const D0_RESUME_KEY = "d0-screen";
const RESUME_KEY = D0_RESUME_KEY;
const SEA_KEY = "d0-sea";
// 与岛声层(components/IslandSound.tsx)共用一个偏好:全站开过声音的人,
// 进 D0 不该再被要求开一次;在 D0 里开的,出去也接着有声
const ISLAND_KEY = "island-sound";

// 系统偏好与网络状况都是**外部状态**,不该先 useState(false) 再在 effect 里改一次
//(那会多一轮渲染,也正是 react-hooks/set-state-in-effect 要拦的写法)。
// useSyncExternalStore 直接订阅:服务端渲染用第三个参数给保守值。
function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );
}

/** 慢连接:同理订阅 connection 变化(切 wifi/蜂窝时档位跟着变) */
function useSlowConnection(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const conn = (navigator as Navigator & { connection?: EventTarget }).connection;
      conn?.addEventListener("change", cb);
      return () => conn?.removeEventListener("change", cb);
    },
    slowConnection,
    () => false,
  );
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
// 换屏靠调用处的 key= 重挂本组件,不靠 effect 把状态改回去——
// 后者是"用渲染修正渲染",多一轮且正是 set-state-in-effect 要拦的。
function BreathingShot({ img, video }: { img: string; video?: string }) {
  const [ready, setReady] = useState(false);
  const [stillOk, setStillOk] = useState(false);
  return (
    <div className="relative aspect-square w-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        // 预取命中缓存时 onLoad 可能赶在挂载前:ref 回调里补一次 complete 判定
        ref={(el) => {
          if (el?.complete) setStillOk(true);
        }}
        src={optimizedImg(img)}
        alt=""
        onLoad={() => setStillOk(true)}
        className="absolute inset-0 h-full w-full object-cover"
        draggable={false}
      />
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

export function D0Player({
  ticket,
  replay = false,
  onDone,
}: {
  ticket?: string;
  /** ?d0=1 重看引路:纯叙事重放——不落 disposition、不进业务漏斗(否则重复计数) */
  replay?: boolean;
  onDone: (mode: "complete" | "skip") => void;
}) {
  const reduced = useReducedMotion();
  const [idx, setIdx] = useState(0);
  const [sea, setSea] = useState(false);
  // 这三样都是"只对当前这一屏成立"的临时态。存屏 id 而不是布尔值,
  // 换屏时靠比对自然失效——不必再用 effect 把它们回写成 false
  //(那种写法多一轮渲染,也正是 react-hooks/set-state-in-effect 要拦的)。
  const [touchedOn, setTouchedOn] = useState<string | null>(null);
  const [timeoutOn, setTimeoutOn] = useState<string | null>(null);
  const [hintOn, setHintOn] = useState<string | null>(null);
  // 媒介档位:慢连接/减少动效 → 静图档(降级梯第二级,doc2.0/15 §五)
  const slow = useSlowConnection();
  // 视频放行闸:下两屏静帧预取 settle(或 3.5s 兜底)之前,本屏视频不挂载。
  // 同样存屏 id——放行的是"哪一屏",换屏即自动收回
  const [videoGoOn, setVideoGoOn] = useState<string | null>(null);
  const preloadGen = useRef(0);
  const ambientRef = useRef<HTMLAudioElement | null>(null);
  const cueRef = useRef<HTMLAudioElement | null>(null);
  const s9EnterRef = useRef<number | null>(null);
  const doneRef = useRef(false);

  const tier: "video" | "still" = reduced || slow ? "still" : "video";

  const screen: D0Screen = D0_SCREENS[idx];

  /* eslint-disable react-hooks/set-state-in-effect --
     storage 只在客户端存在:放进 useState 惰性初值会让服务端渲一屏、客户端渲另一屏
     (水合不一致)。挂载后再落座是这类"客户端专有初值"的正确位置,别改成初值读取。 */
  // 刷新续播:回到离开时的那一屏(心流单向,不支持回退)。
  useEffect(() => {
    const saved = sessionStorage.getItem(RESUME_KEY);
    const savedIdx = saved ? D0_SCREENS.findIndex((s) => s.id === saved) : -1;
    if (savedIdx > 0) {
      setIdx(savedIdx);
      track("d0_resume", { screen: saved!, flowVersion: FLOW_VERSION });
    }
    setSea(sessionStorage.getItem(SEA_KEY) === "1" || localStorage.getItem(ISLAND_KEY) === "on");
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */
  useEffect(() => {
    sessionStorage.setItem(RESUME_KEY, screen.id);
  }, [screen.id]);

  // 进屏埋点(S9 特殊:出屏才知道驻留时长);d0_enter 带媒介档,漏斗才分得清两种体验
  useEffect(() => {
    if (screen.id === "S9") {
      s9EnterRef.current = replay ? null : Date.now(); // 重看的驻留不混进首看的 aha 指标
      return;
    }
    if (replay) return; // 重放不进漏斗:各幕进屏事件只统计第一次走这条路的人
    if (screen.enterEvent)
      track(screen.enterEvent, {
        flowVersion: FLOW_VERSION,
        ...(screen.enterEvent === "d0_enter" ? { tier: slowConnection() ? "still" : "video" } : {}),
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen.id]);

  // 重看引路:开场记一次,与首次观看彻底分开
  useEffect(() => {
    if (replay) track("d0_replay_start", { flowVersion: FLOW_VERSION });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 预取下一两屏静帧(doc2.0/15 §四 加载策略)——走优化器 URL,和渲染同源才命中缓存。
  // 预取 settle 后才放行本屏视频(3.5s 兜底):慢链路上静帧永远赢过 1.5MB 的循环
  useEffect(() => {
    const gen = ++preloadGen.current;
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
    const id = D0_SCREENS[idx].id;
    const go = () => {
      if (preloadGen.current === gen) setVideoGoOn(id);
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
    const t = setTimeout(() => setTimeoutOn("S6a"), TOUCH.timeoutMs);
    return () => clearTimeout(t);
  }, [screen.id]);

  // 点按屏停 3 秒还没动作,浮出一行小字(不宣布,只轻轻提一句)
  useEffect(() => {
    if (screen.button || screen.id === "S6a") return;
    const id = screen.id;
    const t = setTimeout(() => setHintOn(id), 3000);
    return () => clearTimeout(t);
  }, [screen.id, screen.button]);

  const advance = useCallback(() => {
    if (screen.id === "S9" && s9EnterRef.current) {
      track("d0_aha_dwell", { ms: Date.now() - s9EnterRef.current, flowVersion: FLOW_VERSION });
      s9EnterRef.current = null;
    }
    if (idx < D0_SCREENS.length - 1) setIdx(idx + 1);
  }, [idx, screen.id]);

  const finish = useCallback(
    (mode: "complete" | "skip") => {
      if (doneRef.current) return;
      doneRef.current = true;
      sessionStorage.removeItem(RESUME_KEY);
      if (replay) {
        // 重看只是叙事重放:不重报业务完成事件,也不动 disposition——
        // 否则漏斗重复计数,且"当初是不是跳过的"这条分析被抹掉
        track("d0_replay_complete", { mode, flowVersion: FLOW_VERSION });
        onDone(mode);
        return;
      }
      track(mode === "skip" ? "d0_skip" : "d0_complete", { flowVersion: FLOW_VERSION });
      // 改名兼容(保留一个版本周期):旧看板统计的是 d0_to_d1,断掉会让 D0 完成率
      // 在上线当天凭空归零。两个名字都发,取其一即可,不要相加
      if (mode === "complete") track("d0_to_d1", { flowVersion: FLOW_VERSION, legacyAliasOf: "d0_complete" });
      // D0 的去向落成长效标记:下次不再重播(走完与跳过都不播,但数据分得开)。
      // 失败静默——大不了下次再看一遍 D0,不该挡住去见猫
      void fetch("/api/d0/complete", {
        method: "POST",
        credentials: "same-origin",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode }),
      }).catch(() => {});
      onDone(mode);
    },
    [onDone, replay],
  );

  // S6a 轻触:D0 唯一交互——一次、无反应池、无任何奖励(doc2.0/14 §五)
  const onTouch = useCallback(() => {
    if (touchedOn === "S6a") return;
    setTouchedOn("S6a");
    if (!replay) track("d0_touch", { flowVersion: FLOW_VERSION }); // 重看的轻触不计入轻触率
    if (sea && cueRef.current) {
      cueRef.current.src = cdn(`/sounds/D0/${TOUCH.cue}`);
      cueRef.current.volume = 0.5;
      cueRef.current.play().catch(() => {});
    }
  }, [touchedOn, sea, replay]);

  const isS6a = screen.id === "S6a";
  const isGate = screen.id === "S10";
  // 三个"本屏才成立"的派生量:与当前屏比对得出,不存布尔也就不必回写
  const touched = touchedOn === screen.id;
  const touchTimeout = timeoutOn === screen.id;
  const hint = hintOn === screen.id;
  const videoGo = videoGoOn === screen.id;
  const tapAdvances = !screen.button && (!isS6a || touched || touchTimeout);
  // 热区 = 整个正文区(画面/旁白/四周留白都算),不是只有画面那一块
  useTapAdvance(tapAdvances ? advance : null);
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
    // key=屏 id:换屏即重挂,静帧/视频的就绪态自然归零(不靠 effect 回写)
    if (screen.img) return <BreathingShot key={screen.id} img={screen.img} video={tier === "video" && videoGo && showVideo ? screen.video : undefined} />;
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
            localStorage.setItem(ISLAND_KEY, next ? "on" : "off"); // 带出 D0,全站接着有声
          }}
          className={`inline-flex items-center gap-1 px-2 py-1 text-xs transition-colors ${sea ? "text-sea-deep" : "text-ink-faint"}`}
        >
          <IconShell size={14} />
          {sea ? "听着海" : "听海"}
        </button>
      </div>

      {/* 点按由 useTapAdvance 统一接管(整个正文区),这里只留手势提示 */}
      <div className={`mt-2 overflow-hidden rounded-lg border border-line ${tapAdvances ? "cursor-pointer" : ""}`}>
        {media}
      </div>

      {/* 旁白区:固定最小高度,行文逐行浮现;S9 的字在画面里,这里留白 */}
      <div className={`mt-6 min-h-[7.5rem] text-center ${tapAdvances ? "cursor-pointer" : ""}`}>
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
