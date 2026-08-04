import catalogJson from "./sound-catalog.json";

// 猫语声音引擎(doc/17):规则选择 + 资产池 + 参数微变。不接大模型做实时判断。
// 纯函数 + 调用方持有的会话状态——引擎跑在客户端,零往返;自动播放被浏览器拦截时
// 静默跳过(最重要的规则:允许不发声)。

export type VoiceContext = "ambient" | "user_enter" | "user_touch" | "gift_received" | "conch" | "reunion" | "departure" | "npc_event";
export type VoiceState = "sleeping" | "resting" | "eating" | "playing" | "waiting" | "exploring" | "alert";
export type VoiceEmotion = "neutral" | "content" | "happy" | "excited" | "sad" | "lonely" | "irritated" | "afraid";

export interface CatVoiceProfile {
  baseTimbre: "young" | "normal" | "deep";
  pitchOffset: number; // -0.05 ~ 0.05,叠进 playbackRate
  volumeOffset: number; // -0.1 ~ 0
  /** 爱不爱叫(0-1,随社交度):直接乘进发声概率 */
  vocalFrequency: number;
}

export interface CatVoiceRequest {
  catId: string;
  context: VoiceContext;
  state: VoiceState;
  emotion: VoiceEmotion;
  intensity: 1 | 2 | 3;
  relationLevel?: 0 | 1 | 2 | 3;
}

export interface CatVoiceResult {
  shouldPlay: boolean;
  voiceType?: string;
  assetId?: string;
  audioUrl?: string;
  volume?: number;
  playbackRate?: number;
  delayMs?: number;
  loop?: boolean;
}

/** 会话状态由调用方(客户端模块单例)持有:反重复/冷却/页面配额/连点阶梯 */
export interface VoiceSession {
  recentAssets: string[]; // 近 5 次
  recentTypes: string[]; // 近 3 次
  lastPlayedByType: Record<string, number>; // 冷却
  pagePlays: number; // 单页配额
  purrPlayed: boolean;
  touchTimes: number[]; // 连点时间戳
  mutedUntil: number; // 连点惩罚静默
}

export function newVoiceSession(): VoiceSession {
  return { recentAssets: [], recentTypes: [], lastPlayedByType: {}, pagePlays: 0, purrPlayed: false, touchTimes: [], mutedUntil: 0 };
}

interface CatalogEntry {
  assetId: string;
  voiceType: string;
  timbre: string;
  file: string;
  durationMs: number;
  loopable: boolean;
}
const CATALOG = catalogJson as CatalogEntry[];

/** 类型冷却(ms,doc/17 §七) */
const COOLDOWN: Record<string, number> = {
  MEOW_SHORT_SOFT: 8_000,
  MEOW_BRIGHT: 20_000,
  MEOW_LONG: 45_000,
  MEOW_SAD: 60_000,
  MEOW_IRRITATED: 30_000,
  TRILL: 30_000,
  WARNING: 60_000,
  PURR: 999_999_999, // 页面级:一页一次
};

/** 场景基础发声概率(doc/17 概率表) */
function baseProbability(req: CatVoiceRequest, s: VoiceSession, now: number): number {
  switch (req.context) {
    case "user_enter":
      return req.state === "sleeping" ? 0.3 : 0.25; // 睡觉页:呼噜段落
    case "reunion":
      return 0.7;
    case "conch":
      return 0.5;
    case "user_touch": {
      // 连点阶梯:10s 内 1 次 20%/2 次 10%/3 次 25%(不耐烦)/之后静默 15s
      const recent = s.touchTimes.filter((t) => now - t < 10_000).length;
      if (recent <= 1) return 0.2;
      if (recent === 2) return 0.1;
      if (recent === 3) return 0.25;
      return 0;
    }
    case "gift_received":
      return req.emotion === "happy" || req.emotion === "excited" ? 0.6 : 0.25;
    case "departure":
      return 0.3;
    case "ambient":
      return req.state === "sleeping" ? 0.2 : 0.05;
    default:
      return 0.1;
  }
}

/** 类型选择(doc/17 §四映射;MVP 5 族) */
function pickType(req: CatVoiceRequest, s: VoiceSession, now: number): string | null {
  const touches = s.touchTimes.filter((t) => now - t < 10_000).length;
  if (req.context === "user_touch" && touches >= 3) return "MEOW_IRRITATED";
  if (req.state === "sleeping") return "PURR";
  if (req.emotion === "irritated") return "MEOW_IRRITATED";
  if (req.emotion === "sad" || req.emotion === "lonely") return "MEOW_SAD";
  if (req.emotion === "happy" || req.emotion === "excited") {
    return (req.relationLevel ?? 0) >= 2 ? "MEOW_BRIGHT" : "MEOW_SHORT_SOFT";
  }
  return "MEOW_SHORT_SOFT";
}

export function resolveCatVoice(
  req: CatVoiceRequest,
  profile: CatVoiceProfile,
  session: VoiceSession,
  rng: () => number = Math.random,
  now: number = Date.now(),
): CatVoiceResult {
  if (req.context === "user_touch") session.touchTimes.push(now);
  if (now < session.mutedUntil) return { shouldPlay: false };
  if (session.pagePlays >= 3) return { shouldPlay: false }; // 单页最多 3 次

  // ① 是否发声:场景概率 × 爱叫程度 × 关系加成。允许不发声。
  let p = baseProbability(req, session, now);
  p *= 0.6 + profile.vocalFrequency * 0.8;
  p *= 0.85 + (req.relationLevel ?? 0) * 0.08;
  if (req.emotion === "sad") p *= 0.7; // 忧伤再降,避免过度表演
  if (rng() >= p) {
    // 连点第 4 次起进入静默期
    if (req.context === "user_touch" && session.touchTimes.filter((t) => now - t < 10_000).length >= 4) {
      session.mutedUntil = now + 15_000;
    }
    return { shouldPlay: false };
  }

  // ② 类型
  const type = pickType(req, session, now);
  if (!type) return { shouldPlay: false };
  if (type === "PURR" && session.purrPlayed) return { shouldPlay: false };
  const last = session.lastPlayedByType[type] ?? 0;
  if (type !== "PURR" && now - last < (COOLDOWN[type] ?? 10_000)) return { shouldPlay: false };
  // 近 3 次不允许完全相同类型连发(呼噜除外)
  if (type !== "PURR" && session.recentTypes.slice(-3).every((t) => t === type) && session.recentTypes.length >= 3) {
    return { shouldPlay: false };
  }

  // ③ 资产:先本音色池,空了退全池;反重复(近 5 次不同资产)
  let pool = CATALOG.filter((c) => c.voiceType === type && c.timbre === profile.baseTimbre);
  if (pool.length === 0) pool = CATALOG.filter((c) => c.voiceType === type);
  const fresh = pool.filter((c) => !session.recentAssets.includes(c.assetId));
  const pickFrom = fresh.length > 0 ? fresh : pool;
  if (pickFrom.length === 0) return { shouldPlay: false };
  const asset = pickFrom[Math.floor(rng() * pickFrom.length)];

  // ④ 参数微变:音高±3%/音量±8%/延迟 100-800ms(海螺 500-2000ms 且更远更轻)
  const conch = req.context === "conch";
  const rate = 1 + profile.pitchOffset + (rng() * 0.06 - 0.03);
  const volume = Math.min(1, Math.max(0.2, (conch ? 0.45 : 0.75) * (1 + profile.volumeOffset) * (1 + rng() * 0.16 - 0.08)));
  const delayMs = conch ? 500 + Math.round(rng() * 1500) : 100 + Math.round(rng() * 700);

  // 记账
  session.recentAssets = [...session.recentAssets.slice(-4), asset.assetId];
  session.recentTypes = [...session.recentTypes.slice(-2), type];
  session.lastPlayedByType[type] = now;
  session.pagePlays++;
  if (type === "PURR") session.purrPlayed = true;

  return {
    shouldPlay: true,
    voiceType: type,
    assetId: asset.assetId,
    audioUrl: asset.file,
    volume: Math.round(volume * 100) / 100,
    playbackRate: Math.round(rate * 1000) / 1000,
    delayMs,
    loop: asset.loopable,
  };
}
