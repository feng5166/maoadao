// 行程派生器（doc2.0/01 §九 冻结的世界侧落码）：把"活跃窗近似"换成
// Whereabouts / CurrentActivity / 可达性。
//
// 四条验收（14 §九 后续拍板，全部有 CI）：
// ① 同 WorldDay + 同猫 + 同世界输入（rulesVersion 计入）可重放一致；
// ② 职务时间段不可离开（role=时间地点约束，canLeave=false）；
// ③ 可达性检查能抓时间重叠 / 瞬移（auditVisitAgainstItinerary）；
// ④ 行程输出与 CatVisit / 岛闻共用同一事实引用——itineraryFor 是唯一事实源，
//   结算的 eligibilityAt 与叙事未来读的是同一函数（同输入必同输出）。
//
// 01 冻结口径落点：
// - Eligibility 只读世界侧（本文件不 import 偏好/affinity/用户数据）；
// - 任一 Ineligible 有 reasonCode；Eligible 未命中不补理由（理由只在这里产生）；
// - 一致性 = 不可时间重叠与不可达位移，非同窗地点互斥（travel 分钟建模）。

import { hashSeed, mulberry32, pick } from "./rng";
import { CANON, deriveProfile } from "./profile";

export const HOME_AREA = "村口"; // 用户院子所在地带（v0：单院子世界）

/** 地带 → 到村口的路程分钟（22 账本镜像：行程数值登记于此） */
export const TRAVEL_MIN: Record<string, number> = {
  村口: 0, 集市: 8, 屋顶一带: 8, 杂货铺: 10, 早点摊: 10, 自家: 10,
  报社: 12, 码头: 15, 溪流: 15, 灯塔坡: 20, 松林: 25,
};

/** 职务时刻（canLeave=false 的世界理由）：role 产生时间与地点约束，不是黑名单（01 §九·9.3） */
const DUTY: Record<string, { area: string; activity: string }> = {
  "npc-xiaomei": { area: "报社", activity: "在编明天的日报" },
  "npc-qiuqiu": { area: "杂货铺", activity: "守着铺子" },
  "npc-mantou": { area: "早点摊", activity: "看着蒸笼" },
  "npc-jiangjun": { area: "码头", activity: "管着码头的进出" },
  "npc-yantai": { area: "灯塔坡", activity: "守着灯塔补觉" },
};

/** 自由窗里各自常去的地带（bio 派生，终审随 09a） */
const HAUNTS: Record<string, string[]> = {
  "npc-mianhua": ["集市", "村口"],
  "npc-tangyuan": ["集市", "自家"],
  "npc-juzi": ["集市", "码头", "村口"],
  "npc-nuomi": ["溪流", "村口"],
  "npc-lingdang": ["灯塔坡", "村口"],
  "npc-tudou": ["集市", "松林"],
  "npc-bingfen": ["集市", "村口"],
  "npc-heidou": ["集市", "码头"],
  "npc-mantou": ["集市", "村口"],
  "npc-jiangjun": ["码头", "村口"],
  "npc-doudou": ["码头", "松林", "屋顶一带"],
  "npc-qiuqiu": ["集市", "村口"],
  "npc-yantai": ["灯塔坡", "屋顶一带"],
  "npc-wuya": ["屋顶一带", "松林", "村口"],
  "npc-xiaomei": ["集市", "村口"],
  "npc-laoguai": ["松林", "村口"],
};

export interface ItineraryBlock {
  windowIndex: number;
  area: string;
  activity: string;
  canLeave: boolean;
  /** 窗内先被占住的分钟数（正在做的事收尾）——影响最早可达时刻 */
  occupiedFirstMin: number;
}
export interface WindowEligibility {
  eligible: boolean;
  reasonCode?: "on_duty" | "resting" | "too_far_this_window";
  /** 相对窗口起点的最早可到分钟（occupied + travel） */
  earliestArriveMin: number;
  area: string;
  activity: string;
}

const MAX_OCCUPIED_MIN = 25; // 自由窗内"手头的事"最多占 25 分钟（22 镜像）
const LATE_ARRIVE_GUARD = 15; // 最早可达已晚于窗尾 15 分钟内 → 本窗来不及

/** 某猫某窗的行程块（确定性：catId × dayKey × rulesVersion × windowIndex） */
export function itineraryBlockAt(catId: string, dayKey: string, rulesVersion: string, windowIndex: number): ItineraryBlock {
  const canon = CANON[catId];
  if (!canon) throw new Error(`不在池内: ${catId}`);
  const windows = deriveProfile(catId).lifePatternSeed.windows;
  const rng = mulberry32(hashSeed("itinerary", catId, dayKey, rulesVersion, windowIndex));

  if (!windows.includes(windowIndex)) {
    const duty = DUTY[catId];
    if (duty) {
      return { windowIndex, area: duty.area, activity: duty.activity, canLeave: false, occupiedFirstMin: 0 };
    }
    return { windowIndex, area: "自家", activity: windowIndex === 12 || windowIndex >= 10 ? "睡熟了" : "在家歇着", canLeave: false, occupiedFirstMin: 0 };
  }

  const area = pick(rng, HAUNTS[catId] ?? [HOME_AREA]);
  const occupiedFirstMin = Math.floor(rng() * (MAX_OCCUPIED_MIN + 1));
  return { windowIndex, area, activity: "在外面转悠", canLeave: true, occupiedFirstMin };
}

/** 全天行程（13 窗）——岛闻/叙事与结算共用的唯一事实源（验收④） */
export function itineraryFor(catId: string, dayKey: string, rulesVersion: string): ItineraryBlock[] {
  return Array.from({ length: 13 }, (_, i) => itineraryBlockAt(catId, dayKey, rulesVersion, i));
}

/** 窗口 Eligibility 裁决（世界侧；Ineligible 才有理由——01 冻结） */
export function eligibilityAt(catId: string, dayKey: string, rulesVersion: string, windowIndex: number, windowLenMin: number): WindowEligibility {
  const block = itineraryBlockAt(catId, dayKey, rulesVersion, windowIndex);
  const base = { area: block.area, activity: block.activity };
  if (!block.canLeave) {
    const reasonCode = DUTY[catId] && block.area === DUTY[catId].area ? ("on_duty" as const) : ("resting" as const);
    return { eligible: false, reasonCode, earliestArriveMin: Infinity, ...base };
  }
  const earliestArriveMin = block.occupiedFirstMin + (TRAVEL_MIN[block.area] ?? 15);
  if (earliestArriveMin > windowLenMin - LATE_ARRIVE_GUARD) {
    return { eligible: false, reasonCode: "too_far_this_window", earliestArriveMin, ...base };
  }
  return { eligible: true, earliestArriveMin, ...base };
}

/** 验收③：可达性/时间重叠审计——任一 CatVisit 都不得与行程矛盾 */
export function auditVisitAgainstItinerary(
  catId: string, dayKey: string, rulesVersion: string, windowIndex: number, arriveMin: number, windowLenMin: number,
): { ok: boolean; violation?: "overlap_unleavable" | "teleport_too_early" } {
  const el = eligibilityAt(catId, dayKey, rulesVersion, windowIndex, windowLenMin);
  if (!el.eligible) return { ok: false, violation: "overlap_unleavable" }; // 时间重叠：走不开的时段出现了来访
  if (arriveMin < el.earliestArriveMin) return { ok: false, violation: "teleport_too_early" }; // 瞬移：早于最早可达
  return { ok: true };
}
