import { hashSeed, mulberry32, pick } from "../sim/rng";
import { POSES, sceneNameFor, type Pose, type SceneTime } from "./assets";

// 视觉导演(doc/15):事件 → 组合谱。纯规则 + 确定性随机(同猫同天同谱),
// 输出只有资产 ID——这里绝不调用生成,生成只发生在资产生产脚本里。

export interface DirectorInput {
  catId: string;
  day: number;
  location?: string;
  /** 北京时 0-23;不传按下午处理 */
  hour?: number;
  mood?: string;
  /** 事实/事件类型或摘要关键词(walk/explore/social/work/rest…或中文摘要) */
  eventHint?: string;
}

export interface CompositionSpec {
  scene: string; // 场景资产名
  time: SceneTime;
  pose: Pose;
  /** 贴纸落位与微旋转(手账拼贴感;确定性) */
  stickerSide: "left" | "right";
  rotateDeg: number;
}

/** 北京时 → 时段桶(页面拼缓存参数用,与 direct 内部同一套) */
export function timeBucket(hour: number | undefined): SceneTime {
  return timeOf(hour);
}

function timeOf(hour: number | undefined): SceneTime {
  if (hour == null) return "day";
  if (hour >= 5 && hour < 10) return "morning";
  if (hour >= 10 && hour < 16) return "day";
  if (hour >= 16 && hour < 19) return "dusk";
  return "night";
}

/** 事件/心情 → 姿势倾向;没有强信号时按确定性随机挑(允许重复——意义来自状态,doc/15·一) */
function poseOf(input: DirectorInput, rng: () => number): Pose {
  const hint = `${input.eventHint ?? ""}`;
  const mood = input.mood ?? "";
  if (/睡|困|休息|rest|sleep/.test(hint + mood)) return "sleep";
  if (/走|探|逛|巡|walk|explore/.test(hint)) return "walk";
  if (/玩|闹|扑|追|play/.test(hint) || /开心|兴奋/.test(mood)) return "play";
  if (/海|看|望|发呆|等|lookout/.test(hint) || /平静|想家|失落/.test(mood)) return "lookout";
  return pick(rng, [...POSES]);
}

export function direct(input: DirectorInput): CompositionSpec {
  const rng = mulberry32(hashSeed("visual", input.catId, input.day));
  return {
    scene: sceneNameFor(input.location),
    time: timeOf(input.hour),
    pose: poseOf(input, rng),
    stickerSide: rng() < 0.5 ? "left" : "right",
    rotateDeg: Math.round((rng() * 4 - 2) * 10) / 10, // -2° ~ +2°
  };
}
