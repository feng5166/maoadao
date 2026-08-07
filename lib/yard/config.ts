// 2.1 院子玩法·配置单一数据源（doc2.0/22 v0.1 落码）。
// 本文件是 22 数值账本的代码镜像：实现层禁止出现不在此登记的 magic number；
// 改数值 = 改这里 + 在 22 §八 留实验记录。任何数值/规则变更必须递增 RULES_VERSION——
// 历史结算事实带着当时的版本（14 §九 护栏②），昨天的世界永不被今天的数值重算。

export const RULES_VERSION = "yard-v0.3.0"; // v0.3.0：活跃窗近似退役→行程派生器 Eligibility（Whereabouts/可达性，01 §九；22 §八 已留记录）

// ---------- 时间结构（22 §一）：13 窗/日 ----------
// 06:00 起每 90 分钟 ×12（index 0-11）+ 深夜长窗 00:00–06:00（index 12，夜行猫主场）
export interface VisitWindowDef {
  index: number;
  startMin: number; // 北京时分钟
  endMin: number;
}
export const WINDOWS: VisitWindowDef[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ index: i, startMin: 360 + i * 90, endMin: 360 + (i + 1) * 90 })),
  { index: 12, startMin: 0, endMin: 360 },
];

// ---------- 槽位（22 §三）：院子实景位置，不是抽象格子（16 §二） ----------
export interface SlotDef {
  key: string;
  name: string;
  tags: string[];
}
export const SLOTS: SlotDef[] = [
  { key: "eaves", name: "屋檐下", tags: ["shelter", "shade", "near_door"] },
  { key: "tree", name: "老树旁", tags: ["shade", "cool", "quiet"] },
  { key: "clearing", name: "空地中央", tags: ["open", "sun", "social_visible"] },
];

// ---------- 物件（22 §三；中文为工作名，词面过 04 终审后定稿） ----------
export interface ItemDef {
  key: string;
  name: string;
  price: number | null; // null = 初始赠件
  tags: Record<string, number>; // 标签×强度（+~+++ → 1~3）
}
export const ITEMS: ItemDef[] = [
  { key: "cardboard_box", name: "纸箱", price: null, tags: { enclosed: 3, quiet: 2, soft: 1, shelter: 2 } },
  { key: "old_cushion", name: "旧垫子", price: null, tags: { soft: 2, warm: 1, open: 1 } },
  { key: "water_basin", name: "水盆", price: null, tags: { water: 2, open: 1 } },
  { key: "yarn_ball", name: "毛线球", price: 25, tags: { playful: 2 } },
  { key: "shallow_tub", name: "浅木盆", price: 35, tags: { water: 1, playful: 1 } },
  { key: "hay_nest", name: "干草窝", price: 40, tags: { warm: 2, soft: 2, enclosed: 1 } },
  { key: "clay_pot", name: "陶罐", price: 45, tags: { enclosed: 2, cool: 1, quiet: 1 } },
  { key: "long_bench", name: "长凳", price: 50, tags: { sun: 2, open: 1, social: 1 } },
  { key: "rope_post", name: "麻绳柱", price: 55, tags: { height: 1, playful: 1, scratch: 1 } },
  { key: "wood_perch", name: "木架高台", price: 60, tags: { height: 2, sun: 1 } },
  { key: "old_crate", name: "旧木箱", price: 65, tags: { enclosed: 2, old: 2, quiet: 1 } },
  { key: "old_umbrella", name: "旧雨伞", price: 80, tags: { shelter: 2, shade: 1 } },
];
export const INITIAL_ITEMS = ["cardboard_box", "old_cushion", "water_basin"]; // 初始三件（14 §九②）
export const INITIAL_GRANT_BATCH = "initial";

// ---------- Preference 合成初值（22 §四） ----------
export const PREF = {
  base: 1.0,
  favorPerPoint: 0.5, // 每命中一个偏好强度点 +0.5（22 域 0.5~1.5/tag 的 v0 取法）
  avoidWeakMult: 0.1, // 弱冲突 ×0.1；强冲突（≥2 项 avoid 命中）= 硬 0（17 红线）
  stackMults: [1, 0.5, 0.25] as const, // 同类标签第 1/2/3 件（堆叠不线性叠加）
  jitter: 0.2, // 权重 ±20%
  surpriseP: 0.05, // 域内惊喜采样（仅 NEUTRAL/LOW；永不触 AVOID）
  baseVisitP: 0.22, // 每窗基础来访概率系数（校准目标：期望 0.5-0.8 次/窗，22 §一）
  maxVisitsPerWindow: 2,
  passByP: 0.15, // 来了但只是路过（不用任何物件）的概率
  trace: { base: 0.2, shortStay: 0.25, longStay: -0.15, cap: 0.75 }, // Disclosure；稀缺档不得进入本公式（22 修订②）
};

// ---------- 结算运维参数 ----------
export const SETTLEMENT = {
  // 单次页面加载最多补算多少个窗（长离线防一次补数百窗；最旧优先，余量下次加载续补——
  // 确定性种子保证晚补结果不变）。实施参数，登记于此（22 §零：禁散落 magic number）。
  maxBackfillWindowsPerLoad: 64,
};

// ---------- 天气（22 §六 WorldScenarioProfile 的 v0）----------
// v0 由 dayKey 确定性派生（保证结算可复现）；批次二接世界模拟的天气史后替换。
export const WEATHER_DIST: Array<{ key: string; p: number }> = [
  { key: "晴", p: 0.55 },
  { key: "阴", p: 0.25 },
  { key: "雨", p: 0.2 },
];

// ---------- 痕迹表达（04 环境语言的 v0 素材位；表达终审归 04/10） ----------
export const ITEM_TRACES: Record<string, string> = {
  cardboard_box: "纸箱边角被压出了新的褶子",
  old_cushion: "垫子上多了一个浅浅的窝",
  water_basin: "水少了一点",
  hay_nest: "干草被拨乱了一小片",
  long_bench: "长凳上留了几根毛",
  wood_perch: "高台的木沿被蹭得发亮",
};
export const DEFAULT_TRACE = "地上留了一串浅浅的爪印";

// L3 无用层（16 §五 红线：behaviors 必须允许无用行为——结算之外的生命）
export const IDLE_BEHAVIORS = ["打了个哈欠", "对着墙角发了会儿呆", "把院里的东西轻轻挪歪了一点", "盯着一片叶子看了很久"];

// ---------- 猫池：POOL_V0 已退役（2026-08-08 Gate C 过审）——正式池见 lib/yard/pool.ts ----------
