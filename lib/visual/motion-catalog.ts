import type { Pose } from "./assets";

// 微动作词表(doc/15 V1.5·P0):微动导演只允许从这里选动作——不存在"临时发明的动作"。
// 四类:身体基础(全猫通用)/姿态限定/场景动作/环境动作。
// 审美护栏对齐 doc/16 微生命规范:周期≥6s(雨丝例外)/一屏≤2种动效/reduced-motion 全退。
// ⚠️ blink/ear_twitch 等"表情帧"类条目与 doc/16 禁项冲突——收录进词表但素材未登记=永远降级,
// 启用前需要产品拍板解禁(doc/15 V1.5 备注)。
// impl 说明技术实现;cssClass 存在 = 已有现成实现;需要素材(APNG/雪碧图/带 alpha 视频)
// 而素材未登记的,Resolver 一律自动降级丢弃——严禁临时调用生成模型现做素材。

export type MotionImpl = "CSS_LAYER" | "APNG" | "WEBM_ALPHA" | "SPRITESHEET";

export interface MotionDef {
  id: string;
  kind: "body" | "pose" | "action" | "ambient";
  /** 姿态限定(kind=pose/body 时生效;缺省=全部姿态可用) */
  poses?: Pose[];
  /** 场景限定(kind=ambient/action 时生效) */
  scenes?: string[];
  impl: MotionImpl;
  /** CSS_LAYER 的现成类名;没有 = 该实现还没落地,等素材层 */
  cssClass?: string;
  intensity: "low" | "mid";
  durationMs?: number;
  mobileOk: boolean;
}

export const MOTION_CATALOG: MotionDef[] = [
  // ---- 身体基础(全猫通用) ----
  { id: "breathing", kind: "body", impl: "CSS_LAYER", cssClass: "fx-cat-breathe", intensity: "low", mobileOk: true },
  { id: "blink", kind: "body", impl: "SPRITESHEET", intensity: "low", durationMs: 300, mobileOk: true },
  { id: "ear_twitch", kind: "body", impl: "SPRITESHEET", intensity: "low", durationMs: 450, mobileOk: true },
  { id: "head_turn", kind: "body", impl: "SPRITESHEET", intensity: "mid", durationMs: 800, mobileOk: true },
  // ---- 姿态限定 ----
  { id: "tail_sway", kind: "pose", poses: ["sit", "lookout", "walk"], impl: "SPRITESHEET", intensity: "low", durationMs: 1200, mobileOk: true },
  { id: "lick_paw", kind: "pose", poses: ["sit"], impl: "SPRITESHEET", intensity: "mid", durationMs: 1500, mobileOk: true },
  { id: "belly_rise", kind: "pose", poses: ["sleep"], impl: "CSS_LAYER", cssClass: "fx-cat-breathe", intensity: "low", mobileOk: true },
  { id: "tail_tip", kind: "pose", poses: ["sleep"], impl: "SPRITESHEET", intensity: "low", durationMs: 900, mobileOk: true },
  { id: "stretch", kind: "pose", poses: ["walk", "play"], impl: "SPRITESHEET", intensity: "mid", durationMs: 1600, mobileOk: false },
  // ---- 场景动作(事件/道具绑定,素材层落地后启用) ----
  { id: "rod_sway", kind: "action", scenes: ["reef"], impl: "WEBM_ALPHA", intensity: "low", mobileOk: true },
  { id: "float_bob", kind: "action", scenes: ["reef"], impl: "WEBM_ALPHA", intensity: "low", mobileOk: true },
  // ---- 环境动作(场景绑定;fx-* 与 app/globals.css 同源) ----
  { id: "cloud_drift", kind: "ambient", scenes: ["dock", "reef", "lighthouse", "boat", "farewell", "sailed", "market", "pines"], impl: "CSS_LAYER", cssClass: "fx-cloud", intensity: "low", mobileOk: true },
  { id: "cloud_drift_far", kind: "ambient", scenes: ["dock", "reef", "lighthouse", "boat", "farewell", "sailed"], impl: "CSS_LAYER", cssClass: "fx-cloud fx-cloud--far", intensity: "low", mobileOk: true },
  { id: "sea_wave", kind: "ambient", scenes: ["dock", "reef", "lighthouse", "boat", "farewell", "sailed"], impl: "CSS_LAYER", cssClass: "fx-shimmer", intensity: "low", mobileOk: true },
  { id: "rain_fall", kind: "ambient", scenes: ["dock", "reef", "lighthouse", "boat", "farewell", "sailed", "market", "pines"], impl: "CSS_LAYER", cssClass: "fx-rain", intensity: "mid", mobileOk: true },
  { id: "grass_sway", kind: "ambient", scenes: ["lighthouse", "pines"], impl: "WEBM_ALPHA", intensity: "low", mobileOk: true },
  { id: "lamp_flicker", kind: "ambient", scenes: ["home", "market"], impl: "WEBM_ALPHA", intensity: "low", mobileOk: true },
  { id: "boat_bob", kind: "ambient", scenes: ["dock"], impl: "WEBM_ALPHA", intensity: "low", mobileOk: true },
];

/** 每猫会动素材登记表(blink/ear_twitch 等雪碧图):key = `${catId}_${motionId}`。
 *  现在为空——自己的猫不做会动素材(2026-08-04 拍板,按需再议),NPC 素材待排期。
 *  素材不存在 = Resolver 自动降级,绝不现做。 */
export const MOTION_ASSETS: Record<string, { impl: MotionImpl; assetId: string }> = {};
