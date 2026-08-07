// 正式来访池（Gate C 已过，2026-08-08 创始人终审：12 只直通 + 4 只调整后通过）。
// 数据源 = Birth Canon 派生器（lib/sim/profile.ts @ PROFILE_VERSION）——
// POOL_V0 手写占位自此退役；结算所需的池形状在此从 DerivedProfile 映射。
// leaveChance 映射登记于此（本文件与 config.ts 同为 22 账本的代码镜像）。

import { NPC_CATS } from "../sim/npcs";
import { deriveAllCandidates, type DerivedProfile } from "../sim/profile";
import { IDLE_BEHAVIORS } from "./config";

export interface VisitPoolCat {
  catId: string;
  name: string;
  favor: Record<string, number>;
  avoid: string[];
  windows: number[]; // v0 行程近似：活跃窗（01 §九 行程派生器接管后替换）
  requiresItemTag?: string; // Eligibility 硬条件（YardWorldFacts，01 §九）
  leaveChance: number;
  leaveMin: number;
  leaveMax: number;
  traceBias: number;
  solitary: boolean;
  behaviors: string[];
  /** 毛色痕（06 §九·9.4：TraceView 可带可推理线索，永不带身份答案）——由 appearance 正典派生 */
  furTrace: string;
}

/** 留下频度 → 概率（22 账本登记：high/mid/low = 0.8 / 0.55 / 0.3） */
const LEAVE_FREQ_CHANCE: Record<DerivedProfile["leaveStyle"]["freq"], number> = {
  high: 0.8,
  mid: 0.55,
  low: 0.3,
};

/** appearance → 毛色痕（确定性文本派生；顺序敏感：组合色在单色前） */
export function furTraceOf(appearance: string): string {
  const rules: Array<[string, string]> = [
    ["奶牛", "黑白相间的毛"], ["黑白", "黑白相间的毛"], ["三花", "三色的毛"],
    ["橘白", "橘白相间的毛"], ["银", "银灰色的毛"], ["奶白", "奶白色的毛"],
    ["雪白", "雪白的毛"], ["白色", "白色的毛"], ["纯黑", "深黑色的毛"],
    ["黑猫", "黑色的毛"], ["黑色", "黑色的毛"], ["橘", "橘色的毛"],
    ["浅灰", "浅灰色的毛"], ["灰色", "灰色的毛"], ["棕色", "棕色的毛"],
    ["狸花", "带斑纹的毛"], ["虎斑", "虎斑纹的毛"],
  ];
  for (const [k, v] of rules) if (appearance.includes(k)) return `落了一撮${v}`;
  return "落了一撮说不上颜色的毛";
}

function toPoolCat(p: DerivedProfile): VisitPoolCat {
  const appearance = NPC_CATS.find((n) => n.id === p.catId)?.appearance ?? "";
  return {
    catId: p.catId,
    name: p.name,
    favor: p.corePreference.favor,
    avoid: p.corePreference.avoid,
    windows: p.lifePatternSeed.windows,
    requiresItemTag: p.requiresItemTag,
    leaveChance: LEAVE_FREQ_CHANCE[p.leaveStyle.freq],
    leaveMin: p.leaveStyle.min,
    leaveMax: p.leaveStyle.max,
    traceBias: p.discoveryTrait.traceBias,
    solitary: p.solitary,
    behaviors: [...p.behaviorSignature, ...IDLE_BEHAVIORS.slice(0, 2)],
    furTrace: furTraceOf(appearance),
  };
}

/** 模块级派生（确定性：同代码同版本同输出，Gate A 保证） */
export const VISIT_POOL: VisitPoolCat[] = deriveAllCandidates().map(toPoolCat);
