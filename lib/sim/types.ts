export interface SimCat {
  id: string;
  name: string;
  isNpc: boolean;
  boldness: number;
  sociability: number;
  diligence: number;
  personaTags: string[];
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
  affinity: number;
  kind: string;
}

export interface SimStoryline {
  id: string;
  catId: string;
  kind: string;
  status: string;
  data: Record<string, unknown>;
  startDay: number;
}

// 模拟器产出的事实：type + data 描述发生了什么，deltas 描述状态如何变化
export interface SimEvent {
  catId: string;
  type: string;
  data: Record<string, unknown>;
  deltas: Record<string, number>; // 如 { coins: -38, energy: -10 }
}

export interface TickResult {
  events: SimEvent[];
  stateChanges: Map<string, Partial<SimCatState>>;
  affinityChanges: { catAId: string; catBId: string; delta: number }[];
  newStorylines: Omit<SimStoryline, "id">[];
  resolvedStorylineIds: string[];
}

export interface WorldContext {
  day: number;
  season: string;
  weather: string;
}
