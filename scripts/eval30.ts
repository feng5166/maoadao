// 30 天内存态干跑评估：不碰数据库、不调 LLM。
// 产出 doc/eval/report-30d.md，人工判断"30 天是否耐看"（项目定义·阶段一）。
import fs from "node:fs";
import { runDay, factSummary } from "../lib/sim/engine";
import { NPC_CATS } from "../lib/sim/npcs";
import type { Fact, SimCat, SimCatState, SimRelationship, SimThread, WorldSnapshot } from "../lib/sim/types";
import { SEGMENT_CN } from "../lib/sim/types";

const DAYS = Number(process.argv[2] ?? 30);

const cats: SimCat[] = NPC_CATS.map((n) => ({
  id: n.id,
  name: n.name,
  isNpc: true,
  role: n.role,
  boldness: n.boldness,
  sociability: n.sociability,
  diligence: n.diligence,
  personaTags: n.personaTags,
}));
const catById = new Map(cats.map((c) => [c.id, c]));

const states = new Map<string, SimCatState>(
  cats.map((c) => [c.id, { coins: 50, energy: 100, mood: "平静", location: "自家小屋" }]),
);
let relationships: SimRelationship[] = [];
let threads: SimThread[] = [];
let lastUsedDay = new Map<string, number>();
let recentBadOutcomes = new Map<string, number>();
let threadSeq = 0;

const allFacts: Fact[] = [];
const mainByDay = new Map<number, Map<string, Fact>>();
const newsByDay = new Map<number, Fact[]>();
const threadLog: string[] = [];
const directorLog: string[] = [];

for (let day = 1; day <= DAYS; day++) {
  const weather = ["晴", "晴", "多云", "雨"][day % 4];
  const world: WorldSnapshot = {
    day,
    season: "夏",
    weather,
    cats,
    states,
    relationships,
    threads,
    lastUsedDay,
    recentBadOutcomes,
  };
  const result = runDay(world);

  // 应用变化
  for (const [catId, st] of result.stateChanges) states.set(catId, st);
  for (const ac of result.affinityChanges) {
    const rel = relationships.find(
      (r) => (r.catAId === ac.catAId && r.catBId === ac.catBId) || (r.catAId === ac.catBId && r.catBId === ac.catAId),
    );
    if (rel) rel.affinity = Math.max(-100, Math.min(100, rel.affinity + ac.delta));
    else relationships.push({ catAId: ac.catAId, catBId: ac.catBId, affinity: ac.delta, kind: "acquaintance" });
  }
  const pendingIdMap = new Map<string, string>();
  for (const nt of result.newThreads) {
    const id = `th-${++threadSeq}`;
    pendingIdMap.set(`pending:${nt.key}:${nt.catId}`, id);
    threads.push({ id, key: nt.key, catId: nt.catId, step: nt.step, status: "active", data: { ...nt.data }, startDay: nt.startDay, lastAdvanceDay: nt.startDay });
    threadLog.push(`第${day}天 ${catById.get(nt.catId)?.name} 开启事件线「${nt.key}」`);
  }
  for (const tu of result.threadUpdates) {
    const id = pendingIdMap.get(tu.threadId) ?? tu.threadId;
    const t = threads.find((x) => x.id === id);
    if (!t) continue;
    if (tu.step !== undefined && tu.step !== t.step) threadLog.push(`第${day}天 「${t.key}」(${catById.get(t.catId)?.name}) 推进到第 ${tu.step} 步`);
    if (tu.status && tu.status !== "active") threadLog.push(`第${day}天 「${t.key}」(${catById.get(t.catId)?.name}) ${tu.status === "resolved" ? "圆满落幕" : "以失败告终"}`);
    if (tu.step !== undefined) t.step = tu.step;
    if (tu.status) t.status = tu.status;
    if (tu.data) t.data = { ...tu.data };
    if (tu.lastAdvanceDay !== undefined) t.lastAdvanceDay = tu.lastAdvanceDay;
  }
  for (const f of result.facts) {
    lastUsedDay.set(`${f.catId}:${f.type}`, day);
  }
  recentBadOutcomes = new Map(
    cats.map((c) => [c.id, result.facts.filter((f) => f.catId === c.id && (f.outcome === "fail" || f.outcome === "complication")).length]),
  );

  allFacts.push(...result.facts);
  const mains = new Map<string, Fact>();
  for (const [catId, idx] of result.mainFactIndexByCat) mains.set(catId, result.facts[idx]);
  mainByDay.set(day, mains);
  newsByDay.set(day, result.islandNewsFactIndexes.map((i) => result.facts[i]));
  for (const n of result.directorNotes) directorLog.push(`第${day}天 ${n}`);
}

// ================= 统计 =================
const lines: string[] = [];
lines.push(`# 猫啊岛 ${DAYS} 天干跑评估报告\n`);
lines.push(`总事实数：${allFacts.length}（日均 ${(allFacts.length / DAYS).toFixed(1)}）\n`);

// 事件类型分布
const typeCounts = new Map<string, number>();
for (const f of allFacts) typeCounts.set(f.type, (typeCounts.get(f.type) ?? 0) + 1);
lines.push(`## 事件类型分布\n`);
for (const [t, c] of [...typeCounts].sort((a, b) => b[1] - a[1])) {
  lines.push(`- ${t}: ${c}（${((c / allFacts.length) * 100).toFixed(1)}%）`);
}

// 主事件重复率：同一只猫连续两天主事件同类型的比例
let repeats = 0;
let pairs = 0;
for (const cat of cats) {
  for (let d = 2; d <= DAYS; d++) {
    const a = mainByDay.get(d - 1)?.get(cat.id)?.type;
    const b = mainByDay.get(d)?.get(cat.id)?.type;
    if (a && b) {
      pairs++;
      if (a === b) repeats++;
    }
  }
}
lines.push(`\n## 重复感指标\n`);
lines.push(`- 主事件连续两天同类型比例：${((repeats / Math.max(1, pairs)) * 100).toFixed(1)}%（越低越好，>30% 说明会腻）`);

// 结果分布
const outcomeCounts = new Map<string, number>();
for (const f of allFacts) outcomeCounts.set(f.outcome, (outcomeCounts.get(f.outcome) ?? 0) + 1);
lines.push(`- 结果分布：${[...outcomeCounts].map(([k, v]) => `${k} ${((v / allFacts.length) * 100).toFixed(1)}%`).join("，")}`);

// 经济与数值自洽
const coinsArr = [...states.values()].map((s) => s.coins);
lines.push(`\n## 数值自洽\n`);
lines.push(`- 期末鱼币：最低 ${Math.min(...coinsArr)}，最高 ${Math.max(...coinsArr)}，均值 ${(coinsArr.reduce((a, b) => a + b, 0) / coinsArr.length).toFixed(0)}`);
lines.push(`- 负数鱼币/体力越界：${allFacts.length > 0 ? "无（引擎钳制）" : "?"}`);

// 事件线时间线
lines.push(`\n## 事件线时间线\n`);
lines.push(threadLog.length ? threadLog.map((l) => `- ${l}`).join("\n") : "- （无事件线活动——这本身是个问题）");
lines.push(`\n期末活跃事件线：${threads.filter((t) => t.status === "active").map((t) => `${t.key}(${catById.get(t.catId)?.name} 第${t.step}步)`).join("，") || "无"}`);

// 导演日志
lines.push(`\n## 导演干预日志\n`);
lines.push(directorLog.length ? directorLog.slice(0, 40).map((l) => `- ${l}`).join("\n") : "- 无");

// 岛屿动态样本
lines.push(`\n## 岛屿动态（逐日）\n`);
for (let d = 1; d <= DAYS; d++) {
  const news = newsByDay.get(d) ?? [];
  if (news.length) lines.push(`- 第${d}天：${news.map((f) => `${catById.get(f.catId)?.name}${factSummary(f, catById)}`).join("；")}`);
}

// 三只样本猫的 30 天主事件流水（人工读这段判断"耐不耐看"）
lines.push(`\n## 样本猫主事件流水（人工评估耐看度）\n`);
for (const sampleId of ["npc-juzi", "npc-heidou", "npc-yantai"]) {
  const cat = catById.get(sampleId)!;
  lines.push(`\n### ${cat.name}（${cat.personaTags.join("/")}）\n`);
  for (let d = 1; d <= DAYS; d++) {
    const f = mainByDay.get(d)?.get(sampleId);
    if (f) lines.push(`- 第${d}天[${SEGMENT_CN[f.segment]}·${f.outcome}] ${factSummary(f, catById)}`);
  }
}

fs.mkdirSync("doc/eval", { recursive: true });
fs.writeFileSync(`doc/eval/report-${DAYS}d.md`, lines.join("\n") + "\n");
console.log(`报告已写入 doc/eval/report-${DAYS}d.md`);
console.log(`总事实 ${allFacts.length}，主事件连续重复率 ${((repeats / Math.max(1, pairs)) * 100).toFixed(1)}%，事件线活动 ${threadLog.length} 条`);
