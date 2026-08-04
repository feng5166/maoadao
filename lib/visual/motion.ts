import { hashSeed } from "../sim/rng";
import type { Pose, SceneTime } from "./assets";
import { MOTION_ASSETS, MOTION_CATALOG, type MotionImpl } from "./motion-catalog";

// 微动导演(doc/15 V1.5·P1):StaticFrame + 猫/场景事实 → MotionSpec。纯规则,不调 LLM。
// 硬原则:图片导演决定构图,微动层只在不改变事实、不改变姿态语义、不抢注意力的
// 前提下加低频生命信号——不改变事件、不新增行为、不表现未发生的情绪、不为动而动。

export interface MotionCue {
  type: string;
  implementation: MotionImpl;
  /** 有值 = 可执行的现成 CSS 实现;离散素材型 cue 走 assetId(素材层落地后) */
  cssClass?: string;
  assetId?: string;
  intensity: "low" | "mid";
  durationMs?: number;
  weight?: number;
  /** 连续型动画的相位错开(确定性,防整排猫同频呼吸) */
  delayMs?: number;
}

export interface MotionSpec {
  mode: "NONE" | "MICRO_LOOP" | "ONE_SHOT";
  idleMotions: MotionCue[];
  ambientMotions: MotionCue[];
  triggerPolicy: {
    initialDelayMs: [number, number];
    intervalMs: [number, number];
    maxConcurrent: number;
    cooldownMs: number;
  };
  animationSuitability: { score: number; reason: string };
}

export interface MotionInput {
  scene: string;
  time: SceneTime;
  /** null = 画面里没有猫(纯场景) */
  pose?: Pose | null;
  catId?: string;
  /** 自己的猫不做会动素材(2026-08-04 拍板):own cat 的猫体微动一律剥掉,只留环境 */
  isOwnCat?: boolean;
  raining?: boolean;
  /** 猫的画面占比(可动画性评分用;来自 SCENE_CAT_SCALE 或 override) */
  catScale?: number;
}

const DEFAULT_POLICY: MotionSpec["triggerPolicy"] = {
  initialDelayMs: [2000, 5000],
  intervalMs: [8000, 18000],
  maxConcurrent: 1,
  cooldownMs: 20000,
};

/** 可动画性评分:猫太小/姿态不明/夜里细节沉暗都扣分。
 *  ≥0.7 允许猫体微动;0.4~0.7 只做环境;<0.4 完全静态 */
function suitability(input: MotionInput): { score: number; reason: string } {
  let score = 1;
  const reasons: string[] = [];
  if (!input.pose) {
    score -= 0.5;
    reasons.push("画面无猫");
  }
  if ((input.catScale ?? 0.3) < 0.18) {
    score -= 0.35;
    reasons.push("猫占画面太小");
  }
  if (input.time === "night") {
    score -= 0.1;
    reasons.push("夜景细节沉暗");
  }
  return { score: Math.max(0, Math.round(score * 100) / 100), reason: reasons.join(";") || "清晰可动" };
}

/** cue 落地校验:CSS 有现成类 → 可执行;素材型查登记表,没有就丢(降级,绝不现做) */
function bindCue(def: (typeof MOTION_CATALOG)[number], catId?: string): MotionCue | null {
  if (def.impl === "CSS_LAYER" && def.cssClass) {
    return { type: def.id, implementation: def.impl, cssClass: def.cssClass, intensity: def.intensity, durationMs: def.durationMs };
  }
  const asset = catId ? MOTION_ASSETS[`${catId}_${def.id}`] : undefined;
  if (asset) {
    return { type: def.id, implementation: asset.impl, assetId: asset.assetId, intensity: def.intensity, durationMs: def.durationMs };
  }
  return null; // 素材缺失:自动降级
}

export function resolveMotion(input: MotionInput): MotionSpec {
  const suit = suitability(input);

  // 环境动作:场景+天气+时段规则(与首页 fx 层同一套口径:夜里不飘云影)
  const ambient: MotionCue[] = [];
  for (const def of MOTION_CATALOG) {
    if (def.kind !== "ambient") continue;
    if (def.scenes && !def.scenes.includes(input.scene)) continue;
    if (def.id.startsWith("cloud_drift") && input.time === "night") continue;
    if (def.id === "rain_fall" && !input.raining) continue;
    if (def.id === "lamp_flicker" && input.time !== "night") continue;
    const cue = bindCue(def);
    if (cue) ambient.push(cue);
  }
  // 一屏至多两种动效(doc/16):雨天雨丝优先,云影让位;cloud_drift 远近两层算一种
  if (input.raining) {
    const keep = ambient.filter((c) => !c.type.startsWith("cloud_drift"));
    ambient.length = 0;
    ambient.push(...keep);
  }

  // 猫体微动:own cat 一律不做(拍板);评分不够只留环境;NPC 按姿态从词表挑
  let idle: MotionCue[] = [];
  if (input.pose && !input.isOwnCat && suit.score >= 0.7) {
    for (const def of MOTION_CATALOG) {
      if (def.kind !== "body" && def.kind !== "pose") continue;
      if (def.poses && !def.poses.includes(input.pose)) continue;
      const cue = bindCue(def, input.catId);
      if (cue) idle.push(cue);
    }
    // 相位错开:同屏多只猫不同频呼吸(确定性,同猫恒定)
    const phase = input.catId ? hashSeed("motion-phase", input.catId) % 4600 : 0;
    idle = idle.map((c) => (c.cssClass?.includes("fx-cat-breathe") ? { ...c, delayMs: -phase } : c));
  }

  const empty = idle.length === 0 && ambient.length === 0;
  return {
    mode: suit.score < 0.4 || empty ? "NONE" : "MICRO_LOOP",
    idleMotions: suit.score >= 0.7 ? idle : [],
    ambientMotions: suit.score >= 0.4 ? ambient : [],
    triggerPolicy: DEFAULT_POLICY,
    animationSuitability: suit,
  };
}
