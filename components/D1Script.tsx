"use client";

import { useActionState, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { createCat } from "@/lib/actions";
import { optimizedImg } from "@/lib/d0/script";
import { cdn } from "@/lib/assets";
import { useTapAdvance } from "./useTapAdvance";
import { SubmitButton } from "./SubmitButton";
import { IconLighthouse, IconPaw, IconPine, IconReef } from "./icons";

// D1 相遇剧本流(doc/21 v2):从「创建一只猫」到「遇见一只猫」。
// 拍2 岔路(收 boldness)→ 拍3 遭遇+第一次拒绝(收 sociability;diligence 由它当时在
// 做什么决定)→ 拍4 第一眼+第一声 → 拍5 名字来自岛上 → 拍6 礼物=拒绝的解除 →
// 拍7 称呼+第一句话 → 登记(createCat,adoptCat 契约一个不少)。
// 红线(doc/21 §八):不给重试/不做任务/名字不当场改(留到小屋)/心事归旁人。

type Route = "reef" | "pines" | "lighthouse";
type Action = "reach" | "wait" | "walk";

// 三方向(拍2):动机必须是好奇,不能是性格——前台一个性格词都不许出现
const ROUTES: {
  key: Route;
  place: string;
  hook: string;
  hookDay?: string;
  scene: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  imp: string; // → impBold 既有枚举(boldness 82/52/25)
  dil: string; // → impDiligent:由它当时在做什么决定(拖贝壳=忙/按羽毛=看心情/守石头=懒)
}[] = [
  { key: "reef", place: "海边礁石", hook: "潮水退下去了，礁石底下好像卡着什么东西。", scene: "reef", icon: IconReef, imp: "dash", dil: "busy" },
  { key: "pines", place: "松林小径", hook: "林子里有窸窸窣窣的动静，一停下来就没了。", scene: "pines", icon: IconPine, imp: "slow", dil: "mood" },
  { key: "lighthouse", place: "灯塔坡", hook: "灯塔顶上的灯还亮着——好像有人忘了关。", hookDay: "灯塔的门开着——平时它总是关着的。", scene: "lighthouse", icon: IconLighthouse, imp: "watch", dil: "nap" },
];

// 遭遇(拍3):每一段都过猫化测试——收藏与占有/对小东西的执念/对地点的固执
const ENCOUNTERS: Record<Route, string[]> = {
  reef: ["一只猫正把一枚比它脑袋还大的贝壳往岩缝里拖。", "拖两步，滑回去一步。它换了个角度，再来。", "它发现了你——停住，尾巴尖动了一下。"],
  pines: ["它把一片羽毛按在爪子底下，风一掀就重新压住。", "按了很久，也没打算把它怎么样。", "你踩到一根枯枝，它抬起头。"],
  lighthouse: ["它每天傍晚都坐在同一块石头上，朝着海面。", "岛上的人说，以前有条船。", "它听见脚步，耳朵转过来，身子没动。"],
};

// 你的动作(拍3,收 sociability)与它的反应:三条都不给"成功"
const ACTIONS: { key: Action; label: string; reaction: string; imp: string }[] = [
  { key: "reach", label: "蹲下来，朝它伸手", reaction: "它退开一步，看着你。", imp: "greet" },
  { key: "wait", label: "站着不动，等它", reaction: "它盯了你一会儿，没动。", imp: "wait" },
  { key: "walk", label: "不看它，自己往前走两步", reaction: "它跟了两步，又停下。", imp: "alone" },
];

const FIRST_SIGHTS = [
  { v: "tail", label: "毛茸茸的大尾巴" },
  { v: "eyes", label: "圆圆的眼睛" },
  { v: "ears", label: "小小的耳朵" },
  { v: "messy", label: "总是乱糟糟的毛" },
];

// 名字来自岛上(拍5):确定性名字池,不走 LLM;避开在册 NPC 名与「煤球」(doc/22 §十五⑤)
const NAME_POOLS: Record<Route, string[]> = {
  reef: ["海苔", "贝贝", "潮潮", "海盐"],
  pines: ["松果", "苔苔", "栗子", "毛豆"],
  lighthouse: ["灰灰", "芝麻", "石头", "小满"],
};

// 礼物=拒绝的解除动作(拍6):关键不在"给了什么",在"它本来想留给自己"
const GIFTS: Record<Route, { item: string; arc: string[] }> = {
  reef: {
    item: "贝壳",
    arc: ["它退开的那一步，还站在原地。", "盯着那枚贝壳看了很久——", "它本来是要把它藏起来的。", "最后还是叼起来，推到你脚边，", "然后先一步往小屋的方向走了。"],
  },
  pines: {
    item: "羽毛",
    arc: ["它把爪子抬开了一点。", "那片按了很久的羽毛，风一吹就要走——它又按住。", "过了一会儿，它松开爪子，", "把羽毛叼起来，放到你脚边，", "然后先一步往小屋的方向走了。"],
  },
  lighthouse: {
    item: "旧绳结",
    arc: ["它从石头缝里，把那截旧绳结扒拉了出来。", "每天来、每天扒拉两下的那一截。", "它盯着看了一会儿，", "叼起来，放到你脚边，", "然后先一步往小屋的方向走了。"],
  },
};

// 它已经在那儿(§四 叙事真实):bio 写它在岛上的日子,不写"刚搬来"
const BIOS: Record<Route, string> = {
  reef: "海边长大的猫。总想把比自己脑袋还大的东西拖回岩缝里藏好。",
  pines: "松林里的猫。会把一片羽毛按在爪子底下，按很久，也不打算怎么样。",
  lighthouse: "灯塔坡的猫。每天傍晚坐在同一块石头上，朝着海面。岛上的人说，以前有条船。",
};
const TAGS: Record<Route, string> = { reef: "倔、爱收藏", pines: "有耐心、看心情", lighthouse: "固执、安静" };

// goal 砍掉不问(§三):由三轴推导
function deriveGoal(route: Route, action: Action): string {
  const dil = route === "reef" ? 82 : route === "pines" ? 52 : 25;
  const soc = action === "reach" ? 82 : action === "wait" ? 50 : 22;
  const bold = dil; // 方向同时定 boldness(82/52/25)
  if (dil > 60) return "earn";
  if (soc > 60) return "friends";
  if (bold > 60) return "explore";
  return "chill";
}

// 第一声(拍4,doc/17 first_meet):形态随 sociability,音色随 boldness(catVoiceProfile 同式)
function firstMeow(route: Route, action: Action, sightIdx: number) {
  const timbre = route === "reef" ? "deep" : route === "pines" ? "normal" : "young";
  const type = action === "reach" ? "MEOW_BRIGHT" : "MEOW_SHORT_SOFT";
  const variant = (sightIdx % 2) + 1;
  const volume = action === "reach" ? 0.85 : action === "wait" ? 0.6 : 0.3;
  const text = action === "reach" ? "咪！" : action === "wait" ? "喵……" : "……喵。";
  return { assetId: `${type}_${timbre}_${variant}`, file: cdn(`/sounds/${type}/${timbre}-${variant}.mp3`), volume, text };
}

/** 北京时间时段 → 场景变体(与站点夜里的岛同一时钟) */
function sceneVariant(): "morning" | "dusk" | "night" {
  const h = (new Date().getUTCHours() + 8) % 24;
  if (h >= 19 || h < 6) return "night";
  if (h >= 15) return "dusk";
  return "morning";
}

type Beat = "fork" | "approach" | "encounter" | "refusal" | "return" | "sight" | "name" | "gift" | "register";

const D1_KEY = "d1-progress";
// 刷新续播(与 D0 同一纪律,心流单向):中间态(走近/拒绝/回来)回落到遭遇拍重演,
// 已收的选择(方向/动作/第一眼)不丢——正在登记的人刷新不用重走一遍岛
const RESUME_BEATS: Beat[] = ["fork", "encounter", "sight", "name", "gift", "register"];

export function D1Script({ ticket, skipped }: { ticket?: string; skipped?: boolean }) {
  const [beat, setBeat] = useState<Beat>("fork");
  const [route, setRoute] = useState<Route | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [sightIdx, setSightIdx] = useState<number | null>(null);
  const [meowPlayed, setMeowPlayed] = useState(false);
  // 恢复完成前不许持久化——否则挂载时的初始值(fork)会抢先把存档冲掉(StrictMode 双跑必现)
  const [restored, setRestored] = useState(false);
  const refusalT0 = useRef<number>(0);
  const refusalHidden = useRef(false);
  // 第一声用即建即播的 Audio(不挂 JSX:多拍共用,元素随拍卸载会哑掉)
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const variant = useMemo(sceneVariant, []);
  const night = variant === "night";

  const [state, formAction] = useActionState(createCat, null);
  const errRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (state?.err) errRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [state?.n, state?.err]);

  useEffect(() => {
    track("adopt_start", { skippedD0: Boolean(skipped) });
    // 刷新续播:恢复已收的选择;中间态回落到最近的稳定拍
    try {
      const p = JSON.parse(sessionStorage.getItem(D1_KEY) ?? "null");
      if (p) {
        const savedRoute = ROUTES.some((r) => r.key === p.route) ? (p.route as Route) : null;
        const savedAction = ACTIONS.some((a) => a.key === p.action) ? (p.action as Action) : null;
        const savedSight = typeof p.sightIdx === "number" && p.sightIdx >= 0 && p.sightIdx < FIRST_SIGHTS.length ? (p.sightIdx as number) : null;
        if (savedRoute) setRoute(savedRoute);
        if (savedAction) setAction(savedAction);
        if (savedSight !== null) setSightIdx(savedSight);
        if (p.meowPlayed) setMeowPlayed(true);
        // 想续到哪拍(中间态回落遭遇拍)× 数据实际支持到哪拍,取靠前者
        const wanted: Beat = RESUME_BEATS.includes(p.beat) ? p.beat : "encounter";
        const ceiling: Beat = !savedRoute ? "fork" : !savedAction ? "encounter" : savedSight === null ? "sight" : "register";
        const order = RESUME_BEATS;
        setBeat(order[Math.min(order.indexOf(wanted), order.indexOf(ceiling))]);
      }
    } catch {}
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    sessionStorage.setItem(D1_KEY, JSON.stringify({ beat, route, action, sightIdx, meowPlayed }));
  }, [restored, beat, route, action, sightIdx, meowPlayed]);

  const r = route ? ROUTES.find((x) => x.key === route)! : null;
  const sceneSrc = r ? optimizedImg(`/scenes/${r.scene}-${variant}.jpg`) : null;

  // 拒绝(拍3 情感核心):画面停住,不给任何按钮——D1 唯一"正确"的操作是不操作。
  // 3 秒起(§九⑥),它自己回来;refusal_wait 记等待与有没有切走。
  useEffect(() => {
    if (beat !== "refusal") return;
    refusalT0.current = Date.now();
    refusalHidden.current = false;
    const onVis = () => {
      if (document.hidden) refusalHidden.current = true;
    };
    document.addEventListener("visibilitychange", onVis);
    const t = setTimeout(() => {
      track("refusal_wait", { ms: Date.now() - refusalT0.current, left: refusalHidden.current });
      setBeat("return");
    }, 3200);
    return () => {
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [beat]);

  const chooseRoute = useCallback((key: Route) => {
    setRoute(key);
    track("island_step", { step: 2, choice: key });
    setBeat("approach");
  }, []);

  const chooseAction = useCallback((key: Action) => {
    setAction(key);
    track("island_step", { step: 3, choice: key });
    setBeat("refusal");
  }, []);

  const chooseSight = useCallback(
    (i: number) => {
      // 选过就不改了(不给重试,doc/21 §八):此时再点这四张牌 = 接着看,不是死区
      if (sightIdx !== null) {
        setBeat("name");
        return;
      }
      setSightIdx(i);
      // 第一声猫语(拍4):它停下的那一刻。自动播放被拦就静默跳过——允许不发声
      if (route && action) {
        const meow = firstMeow(route, action, i);
        if (!audioRef.current) audioRef.current = new Audio();
        const a = audioRef.current;
        a.src = meow.file;
        a.volume = meow.volume;
        a.play()
          .then(() => track("first_meow_play"))
          .catch(() => {});
        setMeowPlayed(true);
      }
    },
    [sightIdx, route, action],
  );

  const catName = useMemo(() => {
    if (!route || !action || sightIdx === null) return null;
    const ai = ACTIONS.findIndex((a) => a.key === action);
    return NAME_POOLS[route][(sightIdx * 3 + ai) % 4];
  }, [route, action, sightIdx]);

  const meow = route && action && sightIdx !== null ? firstMeow(route, action, sightIdx) : null;

  // 整拍可点:只需"点一下"的拍,热区是整个正文区(见 useTapAdvance)。
  // 选择拍(岔路/动作/第一眼)与登记拍不在此列——那些要落到具体那一项上;
  // 拒绝拍更不给点:画面停住,不操作才是它的内容(doc/21 §九⑥)。
  const tap = useMemo(() => {
    if (beat === "approach" && r)
      return () => {
        track("first_meet_view", { route: r.key });
        setBeat("encounter");
      };
    if (beat === "return") return () => setBeat("sight");
    if (beat === "sight" && sightIdx !== null) return () => setBeat("name");
    if (beat === "name" && catName)
      return () => {
        track("island_step", { step: 5, name: catName });
        setBeat("gift");
      };
    if (beat === "gift" && route)
      return () => {
        track("keepsake_received", { route });
        setBeat("register");
      };
    return null;
  }, [beat, r, sightIdx, catName, route]);
  useTapAdvance(tap);

  // —— 各拍画面 ——

  if (beat === "fork") {
    return (
      <div className="mx-auto max-w-lg">
        <p className="fx-rise font-diary mt-6 text-center text-[16px] leading-[2.2] text-ink">路在这里分开。</p>
        <div className="mt-6 space-y-3">
          {ROUTES.map((o, i) => {
            const Icon = o.icon;
            const hook = o.key === "lighthouse" && !night && o.hookDay ? o.hookDay : o.hook;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => chooseRoute(o.key)}
                className={`${i === 0 ? "fx-rise" : i === 1 ? "fx-rise-2" : "fx-rise-3"} note-slip block w-full px-4 py-3.5 text-left transition-colors hover:border-sea-deep`}
                style={{ transform: `rotate(${i === 1 ? "-0.4" : "0.35"}deg)` }}
              >
                <span className="flex items-center gap-2 text-sm font-medium text-ink">
                  <Icon size={17} className="text-sea-deep" />
                  {o.place}
                </span>
                <span className="font-diary mt-1 block text-[14px] leading-relaxed text-ink-soft">{hook}</span>
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (beat === "approach" && r && sceneSrc) {
    return (
      <div className="mx-auto max-w-lg cursor-pointer">
        <div className="mt-4 aspect-[1200/686] overflow-hidden rounded-lg border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sceneSrc} alt="" className="h-full w-full object-cover" draggable={false} />
        </div>
        <p className="fx-rise font-diary mt-6 text-center text-[16px] leading-[2.2] text-ink">你朝{r.place}走过去。</p>
        <p className="fx-rise-2 mt-4 text-center text-xs text-ink-faint">（点一下画面，走近些。）</p>
      </div>
    );
  }

  if ((beat === "encounter" || beat === "refusal" || beat === "return") && r && sceneSrc && route) {
    const lines = ENCOUNTERS[route];
    const act = action ? ACTIONS.find((a) => a.key === action)! : null;
    return (
      <div className="mx-auto max-w-lg">
        <div className="mt-4 aspect-[1200/686] overflow-hidden rounded-lg border border-line">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={sceneSrc} alt="" className="h-full w-full object-cover" draggable={false} />
        </div>
        <div className="mt-6 text-center">
          <p className="font-diary text-[16px] leading-[2.2] text-ink">
            {lines.map((l, i) => (
              <span key={i} className={`block ${beat === "encounter" ? (i === 0 ? "fx-rise" : i === 1 ? "fx-rise-2" : "fx-rise-3") : ""}`}>
                {l}
              </span>
            ))}
          </p>

          {beat === "encounter" && (
            <div className="fx-rise-3 mt-6 space-y-2">
              {ACTIONS.map((a) => (
                <button
                  key={a.key}
                  type="button"
                  onClick={() => chooseAction(a.key)}
                  className="block w-full border border-line px-4 py-2.5 text-sm text-ink transition-colors hover:border-sea-deep"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {beat === "refusal" && act && (
            <div className="mt-6">
              <p className="fx-rise font-diary text-[16px] text-ink">{act.reaction}</p>
              <p className="fx-rise-2 mt-8 text-sm text-ink-faint">（它没走远。）</p>
            </div>
          )}

          {beat === "return" && (
            <div className="mt-6 cursor-pointer">
              <p className="fx-rise font-diary text-[16px] leading-[2.2] text-ink">
                过了一会儿，它自己走了回来，
                <br />
                在离你两步远的地方停下。
              </p>
              <p className="fx-rise-2 mt-4 text-xs text-ink-faint">（点一下，接着看。）</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  if (beat === "sight") {
    return (
      <div className="mx-auto max-w-lg">
        <p className="fx-rise font-diary mt-8 text-center text-[16px] leading-[2.2] text-ink">它离得够近了。你最先看清的是——</p>
        <div className="fx-rise-2 mt-5 grid grid-cols-2 gap-2 text-sm">
          {FIRST_SIGHTS.map((o, i) => (
            <button
              key={o.v}
              type="button"
              onClick={() => chooseSight(i)}
              className={`border px-3 py-2.5 transition-colors ${sightIdx === i ? "border-sea-deep bg-paper-deep" : "border-line hover:border-sea-deep"}`}
            >
              {o.label}
            </button>
          ))}
        </div>
        {sightIdx !== null && meow && (
          <div className="mt-7 cursor-pointer text-center">
            <p className="fx-rise font-diary text-[17px] text-ink">「{meow.text}」</p>
            <p className="fx-rise mt-1 text-xs text-ink-faint">它朝你叫了一声——这是它对你说的第一声。</p>
            <p className="fx-rise-2 mt-4 text-xs text-ink-faint">（点一下，接着看。）</p>
          </div>
        )}
      </div>
    );
  }

  if (beat === "name" && catName) {
    return (
      <div className="mx-auto max-w-lg cursor-pointer">
        <div className="mt-8 text-center">
          <p className="font-diary text-[16px] leading-[2.2] text-ink">
            <span className="fx-rise block">它脖子上挂着一块褪色的小牌子。</span>
            <span className="fx-rise-2 block mt-2">
              上面写着：<span className="font-title text-[18px] font-bold">{catName}</span>。
            </span>
            <span className="fx-rise-3 block">岛上的居民也都这么叫它。</span>
          </p>
          <p className="fx-rise-3 mt-6 text-xs text-ink-faint">（点一下，接着看。）</p>
        </div>
      </div>
    );
  }

  if (beat === "gift" && route) {
    const gift = GIFTS[route];
    return (
      <div className="mx-auto max-w-lg cursor-pointer">
        <div className="mt-8 text-center">
          <p className="font-diary text-[16px] leading-[2.3] text-ink">
            {gift.arc.map((l, i) => (
              <span key={i} className={`block ${i <= 0 ? "fx-rise" : i <= 2 ? "fx-rise-2" : "fx-rise-3"}`}>
                {l}
              </span>
            ))}
          </p>
          <p className="fx-rise-3 mt-6 text-xs text-ink-faint">（点一下，跟上去。）</p>
        </div>
      </div>
    );
  }

  // register(拍7):它在小屋门口等一个称呼;登记走原 createCat,契约一个不少
  if (beat === "register" && route && action && sightIdx !== null && catName && meow) {
    const routeDef = ROUTES.find((x) => x.key === route)!;
    const actDef = ACTIONS.find((x) => x.key === action)!;
    const v = state?.v ?? {};
    const ticketErr = Boolean(state?.err && state.err.includes("船票"));
    const needTicket = !ticket;
    return (
      <div className="mx-auto max-w-lg">
        <p className="fx-rise font-diary mt-8 text-center text-[16px] leading-[2.2] text-ink">
          它在小屋门口停下，回头，
          <br />
          像在等一个称呼。
        </p>
        <form action={formAction} className="mt-7">
          <div key={state?.n ?? 0} className="space-y-6">
            {state?.err && (
              <div ref={errRef} className="note-slip -rotate-[0.4deg] border-l-4 border-l-brick p-4 text-sm leading-relaxed">
                <p className="font-title font-bold text-brick">登记处的老章翻了翻册子，有点抱歉地看着你：</p>
                <p className="font-diary mt-1.5 text-[15px] text-ink">「{state.err}」</p>
                <p className="mt-1.5 text-xs text-ink-soft">改一改，接着办就行——它还在门口等你。</p>
              </div>
            )}

            {/* adoptCat 契约字段(doc/21 §三 对照表):剧本里收齐,登记册上落定 */}
            <input type="hidden" name="name" value={catName} />
            <input type="hidden" name="firstSight" value={FIRST_SIGHTS[sightIdx].v} />
            <input type="hidden" name="appearance" value="" />
            <input type="hidden" name="bio" value={BIOS[route]} />
            <input type="hidden" name="tags" value={TAGS[route]} />
            <input type="hidden" name="impBold" value={routeDef.imp} />
            <input type="hidden" name="impSocial" value={actDef.imp} />
            <input type="hidden" name="impDiligent" value={routeDef.dil} />
            <input type="hidden" name="goal" value={deriveGoal(route, action)} />
            <input type="hidden" name="route" value={route} />
            <input type="hidden" name="meow" value={meowPlayed ? meow.assetId : ""} />
            <input type="hidden" name="meowText" value={meow.text} />
            {!needTicket && <input type="hidden" name="ticket" value={ticket} />}

            {needTicket && (
              <div className="note-slip rotate-[0.35deg] p-5">
                <p className="text-sm leading-relaxed text-ink-soft">上岛要有人带——找给你介绍猫啊岛的人要一张船票。</p>
                <input
                  name="ticket"
                  required
                  maxLength={19}
                  placeholder="BOAT-XXXX-XXXX-XXXX"
                  defaultValue={v.ticket}
                  aria-label="你的船票号"
                  aria-invalid={ticketErr}
                  className={`mt-3 w-full border-0 border-b bg-transparent px-1 py-2 uppercase focus:outline-none ${
                    ticketErr ? "border-brick text-brick focus:border-brick" : "border-line focus:border-sea-deep"
                  }`}
                />
                {ticketErr && <p className="mt-1 text-xs text-brick">↑ 换一张有效的船票号，其他都不用重填</p>}
              </div>
            )}

            <div className="note-slip -rotate-[0.4deg] p-5">
              <p className="font-title text-sm font-bold">「以后它该怎么叫你？」</p>
              <input
                name="ownerNick"
                maxLength={8}
                placeholder="铲屎官、老大、麻麻"
                defaultValue={v.ownerNick}
                aria-label="它对你的称呼"
                className="mt-3 w-full border-0 border-b border-line bg-transparent px-1 py-2 focus:border-sea-deep focus:outline-none"
              />
              <p className="mt-2 text-xs text-ink-faint">它会一直这么叫你。</p>
            </div>

            <div className="note-slip rotate-[0.4deg] p-5">
              <p className="font-title text-sm font-bold">第一次见面，你想对它说什么？</p>
              <textarea
                name="firstWords"
                maxLength={60}
                rows={2}
                placeholder="不要害怕，我会来看你的。"
                defaultValue={v.firstWords}
                className="mt-3 w-full border border-line bg-transparent px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
              />
              <p className="mt-2 text-xs text-ink-faint">这句话它会记一辈子。</p>
            </div>

            <div className="pt-1 text-center">
              <SubmitButton pendingText="它先进了屋，给你留着门……" className="stamp-btn w-full">
                跟它进屋 <IconPaw size={15} />
              </SubmitButton>
              <p className="mt-2 text-xs text-ink-faint">门口的{GIFTS[route].item}会摆在木箱上——它给你的第一件东西。</p>
            </div>
          </div>
        </form>
      </div>
    );
  }

  // 兜底(状态缺失,理论不可达):静默回岔路
  return <div className="mx-auto max-w-lg" />;
}
