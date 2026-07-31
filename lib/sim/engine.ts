import type {
  AffinityChange,
  DayResult,
  Fact,
  Intent,
  MemoryItem,
  NewThread,
  SimCatState,
  SimRelationship,
  SimThread,
  ThreadUpdate,
  WorldSnapshot,
} from "./types";
import { SEGMENTS } from "./types";
import { TEMPLATES, type EventTemplate, type ResolveResult, type TemplateCtx } from "./templates";
import { THREAD_SYSTEMS } from "./threads";
import { planDay, scoreDay } from "./director";
import { mulberry32, hashSeed, pick, weightedPick } from "./rng";

const THREAD_AUTO_TYPE: Record<string, string> = { shop: "shop_day", debt: "debt_collect" };

// 长期目标 → 行为温和倾斜；主人建议 → 当日强倾斜
const GOAL_BOOSTS: Record<string, Record<string, number>> = {
  earn: { fish: 1.5, odd_job: 1.5, shop_open: 1.6 },
  friends: { visit: 1.5, gossip: 1.4 },
  explore: { explore: 1.6, stargaze: 1.3 },
  chill: { rest: 1.4, market: 1.2 },
};
const SUGGESTION_BOOSTS: Record<string, string[]> = {
  earn: ["fish", "odd_job"],
  explore: ["explore"],
  social: ["visit", "gossip"],
  rest: ["rest"],
};

/** 跑完一整天（三时段）。纯函数：输入世界快照，输出全部变化，不碰任何存储。 */
export function runDay(world: WorldSnapshot): DayResult {
  const plan = planDay(world);

  const facts: Fact[] = [];
  const affinityChanges: AffinityChange[] = [];
  const newThreads: NewThread[] = [];
  const threadUpdates: ThreadUpdate[] = [];
  const memories: MemoryItem[] = [];

  // 工作副本：时段之间要能看到彼此的变化
  const states = new Map<string, SimCatState>([...world.states].map(([k, v]) => [k, { ...v }]));
  const threads: SimThread[] = world.threads.map((t) => ({ ...t, data: { ...t.data } }));
  const relationships: SimRelationship[] = world.relationships.map((r) => ({ ...r }));
  const lastUsed = new Map(world.lastUsedDay);
  const catById = new Map(world.cats.map((c) => [c.id, c]));

  function affinityBetween(a: string, b: string): number {
    const rel = relationships.find(
      (r) => (r.catAId === a && r.catBId === b) || (r.catAId === b && r.catBId === a),
    );
    return rel?.affinity ?? 0;
  }

  function applyResult(catId: string, res: ResolveResult) {
    const st = states.get(catId)!;
    st.coins = Math.max(0, st.coins + (res.deltas.coins ?? 0));
    st.energy = Math.max(0, Math.min(100, st.energy + (res.deltas.energy ?? 0)));
    for (const ac of res.affinityChanges ?? []) {
      affinityChanges.push(ac);
      const rel = relationships.find(
        (r) =>
          (r.catAId === ac.catAId && r.catBId === ac.catBId) ||
          (r.catAId === ac.catBId && r.catBId === ac.catAId),
      );
      if (rel) rel.affinity = Math.max(-100, Math.min(100, rel.affinity + ac.delta));
      else relationships.push({ catAId: ac.catAId, catBId: ac.catBId, affinity: ac.delta, kind: "acquaintance" });
    }
    for (const nt of res.newThreads ?? []) {
      newThreads.push(nt);
      threads.push({
        id: `pending:${nt.key}:${nt.catId}`, // 落库前的临时 id，本日内可被引用
        key: nt.key,
        catId: nt.catId,
        step: nt.step,
        status: "active",
        data: { ...nt.data },
        startDay: nt.startDay,
        lastAdvanceDay: nt.startDay,
      });
    }
    for (const tu of res.threadUpdates ?? []) {
      threadUpdates.push(tu);
      const t = threads.find((x) => x.id === tu.threadId);
      if (t) {
        if (tu.step !== undefined) t.step = tu.step;
        if (tu.status) t.status = tu.status;
        if (tu.data) t.data = { ...tu.data };
        if (tu.lastAdvanceDay !== undefined) t.lastAdvanceDay = tu.lastAdvanceDay;
      }
    }
  }

  function buildCtx(catId: string, rng: () => number): TemplateCtx {
    const cat = catById.get(catId)!;
    return {
      world: { ...world, states, relationships, threads },
      cat,
      state: states.get(catId)!,
      rng,
      catById,
      affinityWith: (other) => affinityBetween(catId, other),
      threadsOfCat: threads.filter((t) => t.catId === catId && t.status === "active"),
      weightMultiplier: (key) => plan.weightMultipliers.get(`${catId}:${key}`) ?? 1,
    };
  }

  function pushFact(catId: string, segment: (typeof SEGMENTS)[number], type: string, template: EventTemplate | null, res: ResolveResult, targetId?: string, threadKey?: string, threadStep?: number) {
    facts.push({
      catId,
      day: world.day,
      segment,
      type,
      outcome: res.outcome,
      data: res.data,
      deltas: res.deltas,
      targetId,
      threadKey,
      threadStep,
      contentValue: (template?.contentValue ?? 4) + (res.cvBonus ?? 0),
    });
  }

  // ============ 事件线自动事实（营业、催债）：算作上午发生 ============
  for (const thread of threads.filter((t) => t.status === "active")) {
    const system = THREAD_SYSTEMS[thread.key];
    if (!system?.autoDaily) continue;
    const rng = mulberry32(hashSeed(world.day, "auto", thread.id));
    const res = system.autoDaily(buildCtx(thread.catId, rng), thread);
    if (res) {
      applyResult(thread.catId, res);
      pushFact(thread.catId, "morning", THREAD_AUTO_TYPE[thread.key] ?? `${thread.key}_auto`, null, res, undefined, thread.key, thread.step);
    }
  }

  // ============ 三时段主循环 ============
  for (const segment of SEGMENTS) {
    for (const cat of world.cats) {
      const state = states.get(cat.id);
      if (!state) continue;
      const rng = mulberry32(hashSeed(world.day, segment, cat.id));
      const ctx = buildCtx(cat.id, rng);

      // ---- 候选意图：普通模板 + 事件线推进 ----
      type Candidate = { template: EventTemplate; weight: number; thread?: SimThread };
      const candidates: Candidate[] = [];

      for (const t of TEMPLATES) {
        if (!t.segments.includes(segment)) continue;
        if (state.energy < t.minEnergy) continue;
        if (t.condition && !t.condition(ctx)) continue;
        const last = lastUsed.get(`${cat.id}:${t.key}`);
        if (last !== undefined && world.day - last <= t.cooldownDays) continue;
        let weight = t.baseWeight * t.personalityFit(cat) * ctx.weightMultiplier(t.key);
        // 需求驱动：累了想睡、穷了想赚
        if (state.energy < 30 && t.key === "rest") weight *= 3;
        if (state.coins < 15 && (t.key === "fish" || t.key === "odd_job")) weight *= 1.8;
        // 长期目标温和倾斜
        if (cat.goal) weight *= GOAL_BOOSTS[cat.goal]?.[t.key] ?? 1;
        // 主人建议：当日强倾斜（影响但不完全控制）
        const suggestion = world.suggestions?.get(cat.id);
        if (suggestion && SUGGESTION_BOOSTS[suggestion]?.includes(t.key)) weight *= 3;
        candidates.push({ template: t, weight });
      }

      for (const thread of ctx.threadsOfCat) {
        const system = THREAD_SYSTEMS[thread.key];
        const tpl = system?.intentFor?.(ctx, thread);
        if (!tpl) continue;
        if (!tpl.segments.includes(segment)) continue;
        if (state.energy < tpl.minEnergy) continue;
        if (world.day - thread.lastAdvanceDay < 1) continue; // 每天最多推进一步
        const boost = plan.weightMultipliers.get(`${cat.id}:thread:${thread.id}`) ?? 1.5;
        candidates.push({ template: tpl, weight: tpl.baseWeight * boost, thread });
      }

      if (candidates.length === 0) continue;

      // ---- 主行动：加权抽样一个意图 → 校验解析 ----
      const main = weightedPick(rng, candidates, candidates.map((c) => c.weight));
      const intent: Intent = {
        templateKey: main.template.key,
        catId: cat.id,
        segment,
        threadId: main.thread?.id,
        score: main.weight,
        meta: {},
      };
      if (main.template.propose) {
        const extra = main.template.propose(ctx);
        if (!extra) continue; // 找不到对象等，本时段发呆
        Object.assign(intent, extra);
      }
      const res = main.template.resolve(ctx, intent);
      const suggestionNow = world.suggestions?.get(cat.id);
      if (suggestionNow && SUGGESTION_BOOSTS[suggestionNow]?.includes(main.template.key)) {
        res.data = { ...res.data, nudged: true };
      }
      applyResult(cat.id, res);
      pushFact(cat.id, segment, main.template.key, main.template, res, intent.targetId, main.thread?.key, main.thread?.step);
      lastUsed.set(`${cat.id}:${main.template.key}`, world.day);

      // ---- 社交插曲：0-1 次（主行动不是社交时才有机会） ----
      if (main.template.category !== "social" && states.get(cat.id)!.energy > 15) {
        const socialChance = 0.15 + cat.sociability / 400;
        if (rng() < socialChance) {
          const socials = TEMPLATES.filter((t) => {
            if (t.category !== "social" || !t.segments.includes(segment)) return false;
            if (states.get(cat.id)!.energy < t.minEnergy) return false;
            if (t.condition && !t.condition(ctx)) return false;
            const last = lastUsed.get(`${cat.id}:${t.key}`);
            return last === undefined || world.day - last > t.cooldownDays;
          });
          if (socials.length > 0) {
            const s = weightedPick(rng, socials, socials.map((t) => t.baseWeight * t.personalityFit(cat) * ctx.weightMultiplier(t.key)));
            const sIntent: Intent = { templateKey: s.key, catId: cat.id, segment, score: 0, meta: {} };
            const extra = s.propose?.(ctx);
            if (extra !== null) {
              Object.assign(sIntent, extra ?? {});
              const sRes = s.resolve(ctx, sIntent);
              applyResult(cat.id, sRes);
              pushFact(cat.id, segment, s.key, s, sRes, sIntent.targetId);
              lastUsed.set(`${cat.id}:${s.key}`, world.day);
            }
          }
        }
      }
    }
  }

  // ============ 心情结算 ============
  const stateChanges = new Map<string, SimCatState>();
  for (const cat of world.cats) {
    const st = states.get(cat.id);
    if (!st) continue;
    const myFacts = facts.filter((f) => f.catId === cat.id);
    const bad = myFacts.filter((f) => f.outcome === "fail").length;
    const drama = myFacts.filter((f) => f.outcome === "complication").length;
    const coinGain = myFacts.reduce((a, f) => a + (f.deltas.coins ?? 0), 0);
    const rng = mulberry32(hashSeed(world.day, "mood", cat.id));
    let mood: string;
    if (myFacts.some((f) => f.threadKey === "lighthouse")) mood = pick(rng, ["心事重重", "按捺不住好奇"]);
    else if (st.energy < 25) mood = pick(rng, ["疲惫", "犯困"]);
    else if (bad >= 2) mood = pick(rng, ["郁闷", "有点丧"]);
    else if (drama > 0) mood = pick(rng, ["五味杂陈", "哭笑不得"]);
    else if (coinGain > 15) mood = pick(rng, ["得意", "眉开眼笑"]);
    else mood = pick(rng, ["平静", "若有所思", "松弛"]);
    st.mood = mood;
    // 位置：当天最后一个有地点的事实
    const lastLoc = [...myFacts].reverse().find((f) => typeof f.data.location === "string");
    if (lastLoc) st.location = String(lastLoc.data.location);
    // 过夜恢复 + 每日伙食开销（经济的下水道，不然全岛通胀人人开店）
    st.energy = Math.min(100, st.energy + 30);
    st.coins = Math.max(0, st.coins - 4);
    if (st.coins <= 2) st.mood = pick(rng, ["饿肚子", "愁钱"]);
    stateChanges.set(cat.id, st);
  }

  // ============ 记忆生成（规则化，不花 LLM 钱） ============
  for (const f of facts) {
    // 观察记忆：内容价值高的事
    if (f.contentValue >= 5 && !f.threadKey) {
      memories.push({
        catId: f.catId,
        day: world.day,
        kind: "observation",
        content: factSummary(f, catById),
        importance: Math.min(9, f.contentValue),
      });
    }
    // 关系记忆：社交起伏
    if (f.targetId) {
      const targetName = catById.get(f.targetId)?.name ?? "";
      const delta = affinityChanges.filter((a) => a.catAId === f.catId && a.catBId === f.targetId).reduce((s, a) => s + a.delta, 0);
      if (Math.abs(delta) >= 4) {
        memories.push({
          catId: f.catId,
          day: world.day,
          kind: "relation",
          content: delta > 0 ? `和${targetName}的关系更近了（${factSummary(f, catById)}）` : `和${targetName}闹得不愉快（${factSummary(f, catById)}）`,
          refId: f.targetId,
          importance: Math.min(8, Math.abs(delta)),
        });
      }
    }
    // 情节记忆：事件线推进
    if (f.threadKey && f.contentValue >= 5) {
      memories.push({
        catId: f.catId,
        day: world.day,
        kind: "thread",
        content: factSummary(f, catById),
        refId: f.threadKey,
        importance: Math.min(9, f.contentValue),
      });
    }
  }
  // 语义记忆：事件线落幕时的长期认知
  for (const tu of threadUpdates) {
    const t = threads.find((x) => x.id === tu.threadId);
    if (!t || (tu.status !== "resolved" && tu.status !== "failed")) continue;
    const semantic: Record<string, string> = {
      arrival_key: "我的小屋曾属于一位没回来的老船长——这座岛比我想的更有故事",
      shop: "我大概真的不适合开店……至少现在还不适合",
      debt: "欠债的滋味不好受，以后花钱得有数",
      lighthouse:
        t.data.choice === "keep"
          ? "有些秘密不必说破，陪着就够了"
          : "好故事就该被讲出来——但要用善意的讲法",
    };
    const content = semantic[t.key];
    if (content) {
      memories.push({ catId: t.catId, day: world.day, kind: "semantic", content, refId: t.key, importance: 9 });
    }
  }

  const { mainFactIndexByCat, islandNewsFactIndexes } = scoreDay(world, facts);

  return {
    facts,
    stateChanges,
    affinityChanges,
    newThreads,
    threadUpdates,
    memories,
    mainFactIndexByCat,
    islandNewsFactIndexes,
    directorNotes: plan.notes,
  };
}

/** 把事实压成一句给记忆/评估用的中文短句（叙事层的事实转写在 narrator 里更详细） */
export function factSummary(f: Fact, catById: Map<string, { name: string }>): string {
  const d = f.data;
  const target = f.targetId ? catById.get(f.targetId)?.name ?? "" : "";
  switch (f.type) {
    case "fish":
      return d.strangeItem ? `钓鱼钓上来一个${d.strangeItem}` : `钓鱼${d.catchCount ? `钓到 ${d.catchCount} 条` : "空手而归"}`;
    case "explore":
      return d.mishap ? `探险出了岔子：${d.mishap}` : d.found ? `在${d.location}捡到${d.found}` : `去${d.location}转了一圈`;
    case "odd_job":
      return `给${d.boss}${d.what}${d.sloppy ? "，干得毛毛躁躁只拿了一半工钱" : `，挣了 ${d.pay} 鱼币`}`;
    case "market":
      return d.overspend ? `赶集买${d.bought}一激动花超了` : `赶集买了${d.bought}`;
    case "rest":
      return "睡了一觉";
    case "stargaze":
      return `看星星，${d.sky}`;
    case "visit":
      return d.wentWell ? `去找${target}玩得很开心` : `和${target}话不投机`;
    case "gossip":
      return `从${target}那听说：${d.rumor}`;
    case "borrow_money":
      return d.got ? `向${target}开口借钱，借到 ${d.got} 鱼币` : d.condition ? `向${target}借钱，对方开了条件` : `向${target}借钱被拒`;
    case "quarrel":
      return d.reconciled ? `和${target}为了${d.cause}吵了一架，吵着吵着和好了` : `和${target}为了${d.cause}吵翻了`;
    case "shop_open":
      return `花 50 鱼币开了「${d.shopName}」`;
    case "shop_day": {
      if (d.closed) return `「${d.shopName}」撑不下去关门了，总共亏 ${-Number(d.totalProfit)} 鱼币`;
      if (d.milestone) return `「${d.shopName}」${d.milestone}！`;
      const rev = Number(d.revenue);
      return `「${d.shopName}」今天${rev >= 0 ? `赚 ${rev}` : `亏 ${-rev}`} 鱼币`;
    }
    case "debt_collect":
      return `${d.creditorName}上门催债了（欠 ${d.amount} 鱼币）`;
    case "debt_repay":
      return `把欠${d.creditorName}的 ${d.amount} 鱼币还清了`;
    default:
      // 灯塔线等：直接取场景描述
      return String(d.scene ?? d.clue ?? d.discovery ?? d.note ?? d.rumor ?? `${f.type}`);
  }
}
