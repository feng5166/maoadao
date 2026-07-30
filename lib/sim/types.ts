// v0.2 核心类型：Agent 产生意图 → 模拟器产生事实 → LLM 产生表达 → 导演控制节奏

export type Segment = "morning" | "afternoon" | "evening";
export const SEGMENTS: Segment[] = ["morning", "afternoon", "evening"];
export const SEGMENT_CN: Record<Segment, string> = { morning: "上午", afternoon: "下午", evening: "晚上" };

export type NpcRole = "function" | "story" | "social" | "background";

export interface SimCat {
  id: string;
  name: string;
  isNpc: boolean;
  boldness: number;
  sociability: number;
  diligence: number;
  personaTags: string[];
  role?: NpcRole; // NPC 分级：不同复杂度，控制成本
  goal?: string; // earn | friends | explore | chill：长期目标，温和影响行为倾向
}

export interface SimCatState {
  coins: number;
  energy: number;
  mood: string;
  location: string;
}

export interface SimRelationship {
  catAId: string;
  catBId: string;
  affinity: number; // -100 ~ 100
  kind: string;
}

// 持续事件线：店、债、灯塔之谜——连续性与追更感的来源
export interface SimThread {
  id: string;
  key: string; // shop | debt | lighthouse
  catId: string; // 主角
  step: number;
  status: "active" | "resolved" | "failed";
  data: Record<string, unknown>;
  startDay: number;
  lastAdvanceDay: number;
}

// Agent 只能提出意图，不能决定结果
export interface Intent {
  templateKey: string;
  catId: string;
  segment: Segment;
  targetId?: string;
  threadId?: string;
  score: number;
  meta: Record<string, unknown>;
}

export type Outcome = "success" | "partial" | "fail" | "complication";

// 模拟器产出的事实（唯一事实来源）
export interface Fact {
  catId: string;
  day: number;
  segment: Segment;
  type: string;
  outcome: Outcome;
  data: Record<string, unknown>;
  deltas: { coins?: number; energy?: number };
  targetId?: string;
  threadKey?: string;
  threadStep?: number;
  contentValue: number; // 导演选主事件的输入
}

export interface AffinityChange {
  catAId: string;
  catBId: string;
  delta: number;
  reason: string;
}

export type MemoryKind = "observation" | "relation" | "emotion" | "thread" | "semantic";

export interface MemoryItem {
  catId: string;
  day: number;
  kind: MemoryKind;
  content: string;
  refId?: string; // 关联对象：另一只猫 / 事件线 key
  importance: number; // 1-10
}

export type DayTone = "calm" | "warm" | "conflict" | "mystery";

// 导演的赛前计划：只调权重，不编剧情
export interface DirectorPlan {
  tone: DayTone;
  // catId:templateKey → 权重乘数（重复惩罚 <1，推进加成 >1）
  weightMultipliers: Map<string, number>;
  notes: string[];
}

export interface ThreadUpdate {
  threadId: string;
  step?: number;
  status?: "active" | "resolved" | "failed";
  data?: Record<string, unknown>;
  lastAdvanceDay?: number;
}

export interface NewThread {
  key: string;
  catId: string;
  step: number;
  data: Record<string, unknown>;
  startDay: number;
}

export interface DayResult {
  facts: Fact[];
  stateChanges: Map<string, SimCatState>;
  affinityChanges: AffinityChange[];
  newThreads: NewThread[];
  threadUpdates: ThreadUpdate[];
  memories: MemoryItem[];
  mainFactIndexByCat: Map<string, number>; // 每猫今日主事件（facts 下标）
  islandNewsFactIndexes: number[]; // 全岛动态候选（facts 下标，最多 2 条）
  directorNotes: string[];
}

// 引擎输入快照（纯数据，与存储无关——评估脚本可全内存构造）
export interface WorldSnapshot {
  day: number;
  season: string;
  weather: string;
  cats: SimCat[];
  states: Map<string, SimCatState>;
  relationships: SimRelationship[];
  threads: SimThread[];
  // catId:templateKey → 最近一次使用的 day（冷却与重复惩罚用，从近期事实推导）
  lastUsedDay: Map<string, number>;
  // catId → 昨天 fail/complication 的数量（负面连败补偿用）
  recentBadOutcomes: Map<string, number>;
  // catId → 主人的明日建议（earn | explore | social | rest），当天生效
  suggestions?: Map<string, string>;
}
