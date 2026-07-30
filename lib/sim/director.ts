import type { DayTone, DirectorPlan, Fact, WorldSnapshot } from "./types";
import { TEMPLATES } from "./templates";
import { mulberry32, hashSeed } from "./rng";

// 岛屿导演：不直接编剧情，只调事件权重和挑今日主内容。
// 这是猫啊岛区别于普通 Agent 模拟实验的关键系统。

const TONE_BOOSTS: Record<DayTone, Record<string, number>> = {
  calm: {},
  warm: { visit: 1.6, gossip: 1.3, quarrel: 0.3, borrow_money: 0.6 },
  conflict: { quarrel: 2.2, borrow_money: 1.6, visit: 0.8 },
  mystery: { explore: 1.5, stargaze: 1.5, gossip: 1.4 },
};

/** 赛前：根据近况定基调、调权重 */
export function planDay(world: WorldSnapshot): DirectorPlan {
  const rng = mulberry32(hashSeed("director", world.day));
  const notes: string[] = [];

  // 1. 定今日基调
  const totalBad = [...world.recentBadOutcomes.values()].reduce((a, b) => a + b, 0);
  const avgBad = totalBad / Math.max(1, world.cats.length);
  let tone: DayTone;
  if (avgBad > 0.8) {
    tone = "warm"; // 连败补偿：昨天大家过得都不顺，今天来点温暖
    notes.push(`昨日负面事件偏多（均值 ${avgBad.toFixed(2)}），今日基调转暖`);
  } else if (avgBad < 0.2 && rng() < 0.4) {
    tone = rng() < 0.5 ? "conflict" : "mystery"; // 太平淡了，制造点波澜
    notes.push(`近期过于平淡，今日基调：${tone === "conflict" ? "冲突" : "悬疑"}`);
  } else {
    tone = "calm";
  }

  // 2. 组装权重乘数
  const weightMultipliers = new Map<string, number>();

  for (const cat of world.cats) {
    // 重复惩罚：昨天刚做过的事，今天权重减半（冷却是硬约束，这是软约束）
    for (const t of TEMPLATES) {
      const last = world.lastUsedDay.get(`${cat.id}:${t.key}`);
      let mult = 1;
      if (last !== undefined && world.day - last === 1) mult *= 0.5;
      const toneBoost = TONE_BOOSTS[tone][t.key];
      if (toneBoost) mult *= toneBoost;
      if (mult !== 1) weightMultipliers.set(`${cat.id}:${t.key}`, mult);
    }
  }

  // 3. 事件线推进加权：停滞越久越该动一动
  for (const thread of world.threads) {
    if (thread.status !== "active") continue;
    const stale = world.day - thread.lastAdvanceDay;
    const boost = stale >= 2 ? 3 : 1.5;
    weightMultipliers.set(`${thread.catId}:thread:${thread.id}`, boost);
    if (stale >= 2) notes.push(`事件线「${thread.key}」已停滞 ${stale} 天，给主角推进加权 ×${boost}`);
  }

  return { tone, weightMultipliers, notes };
}

/** 赛后：给每猫选今日主事件，选全岛动态（内容价值评分） */
export function scoreDay(world: WorldSnapshot, facts: Fact[]) {
  const mainFactIndexByCat = new Map<string, number>();
  const bestScore = new Map<string, number>();

  facts.forEach((f, i) => {
    // contentValue 已含模板基础值 + 结果加成；再加结果类型的戏剧分
    const outcomeBonus = f.outcome === "complication" ? 2 : f.outcome === "fail" ? 1 : 0;
    const threadBonus = f.threadKey ? 2 : 0;
    const score = f.contentValue + outcomeBonus + threadBonus;
    if (score > (bestScore.get(f.catId) ?? -1)) {
      bestScore.set(f.catId, score);
      mainFactIndexByCat.set(f.catId, i);
    }
  });

  // 全岛动态：分数最高的两条，且不重复取同一只猫
  const candidates = facts
    .map((f, i) => ({ f, i, score: f.contentValue + (f.threadKey ? 3 : 0) }))
    .filter((x) => x.score >= 6)
    // 普通营业流水不算新闻，只有开张/关店/里程碑才值得上报
    .filter((x) => !(x.f.type === "shop_day" && !x.f.data.closed && !x.f.data.milestone))
    .sort((a, b) => b.score - a.score);
  const islandNewsFactIndexes: number[] = [];
  const usedCats = new Set<string>();
  for (const c of candidates) {
    if (usedCats.has(c.f.catId)) continue;
    islandNewsFactIndexes.push(c.i);
    usedCats.add(c.f.catId);
    if (islandNewsFactIndexes.length >= 2) break;
  }

  return { mainFactIndexByCat, islandNewsFactIndexes };
}
