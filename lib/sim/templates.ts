import type {
  AffinityChange,
  Fact,
  Intent,
  NewThread,
  Outcome,
  Segment,
  SimCat,
  SimCatState,
  SimThread,
  ThreadUpdate,
  WorldSnapshot,
} from "./types";
import { pick } from "./rng";

export interface TemplateCtx {
  world: WorldSnapshot;
  cat: SimCat;
  state: SimCatState;
  rng: () => number;
  catById: Map<string, SimCat>;
  affinityWith: (otherId: string) => number;
  threadsOfCat: SimThread[];
  weightMultiplier: (templateKey: string) => number; // 导演给的乘数
}

export interface ResolveResult {
  outcome: Outcome;
  data: Record<string, unknown>;
  deltas: { coins?: number; energy?: number };
  affinityChanges?: AffinityChange[];
  newThreads?: NewThread[];
  threadUpdates?: ThreadUpdate[];
  cvBonus?: number; // 结果带来的内容价值加成（意外/戏剧性）
}

export interface EventTemplate {
  key: string;
  label: string;
  category: "action" | "social" | "thread";
  segments: Segment[];
  cooldownDays: number; // 同一只猫再次使用的最小间隔
  baseWeight: number;
  contentValue: number; // 1-10：这类事件天然多有戏
  minEnergy: number;
  condition?: (ctx: TemplateCtx) => boolean;
  personalityFit: (cat: SimCat) => number; // 0.2 ~ 2.5
  propose?: (ctx: TemplateCtx) => Partial<Intent> | null; // 补充意图细节（如社交对象）
  resolve: (ctx: TemplateCtx, intent: Intent) => ResolveResult;
}

export const LOCATIONS = ["海边礁石", "松林小径", "集市广场", "灯塔坡", "溪流浅滩", "废弃渔船"];
const FOUND_ITEMS = ["贝壳", "亮晶晶的玻璃珠", "半截毛线球", "旧怀表", "漂流瓶", "羽毛", "一枚生锈的钥匙"];
const SNACKS = ["烤鱼串", "鱼糕", "小鱼干", "海苔卷"];
const SHOP_KINDS = ["烤鱼店", "杂货铺", "毛线咖啡馆", "贝壳纪念品店"];

function socialTarget(ctx: TemplateCtx, prefer: "friend" | "rival" | "any"): string | null {
  const others = ctx.world.cats.filter((c) => c.id !== ctx.cat.id);
  if (others.length === 0) return null;
  const scored = others.map((c) => {
    const aff = ctx.affinityWith(c.id);
    let w = 1 + c.sociability / 100;
    if (prefer === "friend") w *= aff > 0 ? 1 + aff / 40 : 0.4;
    if (prefer === "rival") w *= aff < 0 ? 1 + -aff / 30 : 0.15;
    return w;
  });
  const total = scored.reduce((a, b) => a + b, 0);
  let r = ctx.rng() * total;
  for (let i = 0; i < others.length; i++) {
    r -= scored[i];
    if (r <= 0) return others[i].id;
  }
  return others[others.length - 1].id;
}

export const TEMPLATES: EventTemplate[] = [
  // ============ 行动类 ============
  {
    key: "fish",
    label: "钓鱼",
    category: "action",
    segments: ["morning", "afternoon"],
    cooldownDays: 1,
    baseWeight: 30,
    contentValue: 2,
    minEnergy: 25,
    personalityFit: (c) => 0.5 + c.diligence / 80,
    resolve: (ctx) => {
      const skill = ctx.cat.diligence / 100;
      const weatherPenalty = ctx.world.weather === "雨" ? 0.5 : 1;
      const catchCount = Math.max(0, Math.round(ctx.rng() * 4 * (skill + 0.4) * weatherPenalty));
      const coins = catchCount * (3 + Math.floor(ctx.rng() * 3));
      // 并发症：钓上怪东西（旧铜铃是灯塔线的钥匙道具）
      if (ctx.rng() < 0.11) {
        const lighthouseActive = ctx.world.threads.some((t) => t.key === "lighthouse" && t.status === "active");
        const item = lighthouseActive && ctx.rng() < 0.5 ? "旧铜铃" : pick(ctx.rng, FOUND_ITEMS);
        return {
          outcome: "complication",
          data: { location: "海边礁石", catchCount: 0, strangeItem: item },
          deltas: { energy: -15 },
          cvBonus: 3,
        };
      }
      return {
        outcome: catchCount === 0 ? "fail" : "success",
        data: { location: "海边礁石", catchCount, coins, weather: ctx.world.weather },
        deltas: { coins, energy: -15 },
        cvBonus: catchCount === 0 ? 1 : 0,
      };
    },
  },
  {
    key: "explore",
    label: "探险",
    category: "action",
    segments: ["morning", "afternoon"],
    cooldownDays: 1,
    baseWeight: 25,
    contentValue: 3,
    minEnergy: 30,
    personalityFit: (c) => 0.4 + c.boldness / 70,
    resolve: (ctx) => {
      const location = pick(ctx.rng, LOCATIONS);
      const r = ctx.rng();
      if (r < 0.12) {
        // 迷路/被困——失败也是故事
        return {
          outcome: "fail",
          data: { location, mishap: pick(ctx.rng, ["迷路绕了一大圈", "被突然的浪头浇成落汤猫", "追蝴蝶追进了刺丛"]) },
          deltas: { energy: -30 },
          cvBonus: 2,
        };
      }
      if (r < 0.12 + 0.28 + ctx.cat.boldness / 500) {
        const item = pick(ctx.rng, FOUND_ITEMS);
        return {
          outcome: "success",
          data: { location, found: item },
          deltas: { energy: -20, coins: ctx.rng() < 0.25 ? 5 : 0 },
          cvBonus: 1,
        };
      }
      return { outcome: "partial", data: { location, found: null }, deltas: { energy: -20 } };
    },
  },
  {
    key: "odd_job",
    label: "打零工",
    category: "action",
    segments: ["morning", "afternoon"],
    cooldownDays: 2,
    baseWeight: 18,
    contentValue: 2,
    minEnergy: 30,
    personalityFit: (c) => 0.3 + c.diligence / 60,
    resolve: (ctx) => {
      const jobs = [
        { boss: "土豆", what: "帮忙搬木料修屋顶" },
        { boss: "球球", what: "帮杂货铺理货" },
        { boss: "将军", what: "帮码头清点渔获" },
      ];
      const job = pick(ctx.rng, jobs);
      const pay = 8 + Math.floor(ctx.rng() * 8 * (ctx.cat.diligence / 100 + 0.5));
      const sloppy = ctx.rng() < (100 - ctx.cat.diligence) / 300;
      return {
        outcome: sloppy ? "partial" : "success",
        data: { ...job, pay: sloppy ? Math.floor(pay / 2) : pay, sloppy },
        deltas: { coins: sloppy ? Math.floor(pay / 2) : pay, energy: -25 },
        cvBonus: sloppy ? 1 : 0,
      };
    },
  },
  {
    key: "market",
    label: "赶集",
    category: "action",
    segments: ["afternoon"],
    cooldownDays: 2,
    baseWeight: 15,
    contentValue: 2,
    minEnergy: 15,
    condition: (ctx) => ctx.state.coins >= 8,
    personalityFit: (c) => 0.5 + c.sociability / 120,
    resolve: (ctx) => {
      const snack = pick(ctx.rng, SNACKS);
      const cost = 5 + Math.floor(ctx.rng() * 6);
      const overspend = ctx.rng() < 0.2 && ctx.state.coins > cost * 3;
      return {
        outcome: overspend ? "complication" : "success",
        data: { location: "集市广场", bought: snack, cost: overspend ? cost * 3 : cost, overspend },
        deltas: { coins: -(overspend ? cost * 3 : cost), energy: -10 },
        cvBonus: overspend ? 2 : 0,
      };
    },
  },
  {
    key: "rest",
    label: "补觉",
    category: "action",
    segments: ["morning", "afternoon", "evening"],
    cooldownDays: 0,
    baseWeight: 12,
    contentValue: 1,
    minEnergy: 0,
    personalityFit: (c) => 0.6 + (100 - c.diligence) / 100,
    resolve: (ctx) => ({
      outcome: "success",
      data: { location: ctx.state.location },
      deltas: { energy: 40 },
    }),
  },
  {
    key: "stargaze",
    label: "看星星",
    category: "action",
    segments: ["evening"],
    cooldownDays: 2,
    baseWeight: 12,
    contentValue: 2,
    minEnergy: 10,
    condition: (ctx) => ctx.world.weather !== "雨",
    personalityFit: (c) => 0.5 + (100 - c.sociability) / 150,
    resolve: (ctx) => ({
      outcome: "success",
      data: { location: pick(ctx.rng, ["灯塔坡", "海边礁石"]), sky: pick(ctx.rng, ["满天星", "一弯月牙", "有流星划过"]) },
      deltas: { energy: -5 },
      cvBonus: ctx.rng() < 0.2 ? 1 : 0,
    }),
  },

  // ============ 社交类 ============
  {
    key: "visit",
    label: "串门",
    category: "social",
    segments: ["morning", "afternoon", "evening"],
    cooldownDays: 1,
    baseWeight: 25,
    contentValue: 2,
    minEnergy: 15,
    personalityFit: (c) => 0.3 + c.sociability / 60,
    propose: (ctx) => {
      const targetId = socialTarget(ctx, "friend");
      return targetId ? { targetId } : null;
    },
    resolve: (ctx, intent) => {
      const target = ctx.catById.get(intent.targetId!)!;
      const aff = ctx.affinityWith(target.id);
      const wentWell = ctx.rng() < 0.45 + aff / 250 + (ctx.cat.sociability + target.sociability) / 500;
      const delta = wentWell ? 5 + Math.floor(ctx.rng() * 7) : -(3 + Math.floor(ctx.rng() * 5));
      return {
        outcome: wentWell ? "success" : "fail",
        data: { targetId: target.id, targetName: target.name, wentWell },
        deltas: { energy: -10 },
        affinityChanges: [{ catAId: ctx.cat.id, catBId: target.id, delta, reason: wentWell ? "愉快的串门" : "话不投机" }],
        cvBonus: wentWell ? 0 : 1,
      };
    },
  },
  {
    key: "gossip",
    label: "打听八卦",
    category: "social",
    segments: ["morning", "afternoon"],
    cooldownDays: 1,
    baseWeight: 14,
    contentValue: 3,
    minEnergy: 10,
    personalityFit: (c) => 0.4 + c.sociability / 90,
    propose: (ctx) => {
      // 八卦源：小梅（岛报主编）和棉花（谁都跟她聊）
      const sources = ["npc-xiaomei", "npc-mianhua"].filter((id) => id !== ctx.cat.id && ctx.catById.has(id));
      if (sources.length === 0) return null;
      return { targetId: pick(ctx.rng, sources) };
    },
    resolve: (ctx, intent) => {
      const target = ctx.catById.get(intent.targetId!)!;
      // 灯塔传闻是灯塔线的入口：胆大的猫听到会上钩
      const lighthouseExists = ctx.world.threads.some((t) => t.key === "lighthouse");
      if (!lighthouseExists && ctx.cat.boldness > 55 && ctx.rng() < 0.35) {
        return {
          outcome: "complication",
          data: { targetId: target.id, targetName: target.name, rumor: "灯塔最近半夜会发出奇怪的光，盐汽水却矢口否认" },
          deltas: { energy: -8 },
          newThreads: [
            {
              key: "lighthouse",
              catId: ctx.cat.id,
              step: 1,
              data: { rumorFrom: target.name, hasBell: false },
              startDay: ctx.world.day,
            },
          ],
          affinityChanges: [{ catAId: ctx.cat.id, catBId: target.id, delta: 3, reason: "共享秘密" }],
          cvBonus: 4,
        };
      }
      const gossips = [
        "汤圆从来不干活却顿顿有鱼吃，岛上未解之谜又添一笔",
        "黑豆好像又在筹备新店了，这次说是第八家",
        "冰粉在攒钱，说要开全岛最气派的咖啡馆",
        "将军年轻时在船上见过大风浪，可他从来不细说",
      ];
      return {
        outcome: "success",
        data: { targetId: target.id, targetName: target.name, rumor: pick(ctx.rng, gossips) },
        deltas: { energy: -8 },
        affinityChanges: [{ catAId: ctx.cat.id, catBId: target.id, delta: 2, reason: "聊八卦" }],
      };
    },
  },
  {
    key: "borrow_money",
    label: "借钱",
    category: "social",
    segments: ["morning", "afternoon"],
    cooldownDays: 3,
    baseWeight: 10,
    contentValue: 5,
    minEnergy: 10,
    condition: (ctx) => ctx.state.coins < 25 && !ctx.threadsOfCat.some((t) => t.key === "debt" && t.status === "active"),
    personalityFit: (c) => 0.3 + c.boldness / 90,
    propose: (ctx) => {
      // 找岛上有钱又不算太熟的猫借：球球（杂货铺）最常见
      const richIds = ctx.world.cats
        .filter((c) => c.id !== ctx.cat.id)
        .filter((c) => (ctx.world.states.get(c.id)?.coins ?? 0) > 60)
        .map((c) => c.id);
      if (richIds.length === 0) return null;
      return { targetId: pick(ctx.rng, richIds) };
    },
    resolve: (ctx, intent) => {
      const target = ctx.catById.get(intent.targetId!)!;
      const aff = ctx.affinityWith(target.id);
      const ask = 20 + Math.floor(ctx.rng() * 15);
      const r = ctx.rng() + aff / 200;
      // 非二元结果：全借/借一半/被拒/附条件
      if (r > 0.75) {
        return {
          outcome: "success",
          data: { targetId: target.id, targetName: target.name, asked: ask, got: ask },
          deltas: { coins: ask, energy: -8 },
          newThreads: [{ key: "debt", catId: ctx.cat.id, step: 1, data: { creditorId: target.id, creditorName: target.name, amount: ask }, startDay: ctx.world.day }],
          affinityChanges: [{ catAId: ctx.cat.id, catBId: target.id, delta: 4, reason: "慷慨相助" }],
          cvBonus: 1,
        };
      }
      if (r > 0.5) {
        const got = Math.floor(ask / 2);
        return {
          outcome: "partial",
          data: { targetId: target.id, targetName: target.name, asked: ask, got },
          deltas: { coins: got, energy: -8 },
          newThreads: [{ key: "debt", catId: ctx.cat.id, step: 1, data: { creditorId: target.id, creditorName: target.name, amount: got }, startDay: ctx.world.day }],
          cvBonus: 2,
        };
      }
      if (r > 0.3) {
        return {
          outcome: "complication",
          data: { targetId: target.id, targetName: target.name, asked: ask, got: 0, condition: `${target.name}要求先帮忙干三天活再谈` },
          deltas: { energy: -8 },
          affinityChanges: [{ catAId: ctx.cat.id, catBId: target.id, delta: -2, reason: "谈钱伤感情" }],
          cvBonus: 3,
        };
      }
      return {
        outcome: "fail",
        data: { targetId: target.id, targetName: target.name, asked: ask, got: 0 },
        deltas: { energy: -8 },
        affinityChanges: [{ catAId: ctx.cat.id, catBId: target.id, delta: -4, reason: "被一口回绝" }],
        cvBonus: 2,
      };
    },
  },
  {
    key: "quarrel",
    label: "拌嘴",
    category: "social",
    segments: ["afternoon", "evening"],
    cooldownDays: 2,
    baseWeight: 6,
    contentValue: 4,
    minEnergy: 15,
    condition: (ctx) => ctx.world.relationships.some((r) => (r.catAId === ctx.cat.id || r.catBId === ctx.cat.id) && r.affinity < -10),
    personalityFit: (c) => 0.3 + c.boldness / 120,
    propose: (ctx) => {
      const targetId = socialTarget(ctx, "rival");
      return targetId ? { targetId } : null;
    },
    resolve: (ctx, intent) => {
      const target = ctx.catById.get(intent.targetId!)!;
      const causes = ["谁先占的晒太阳宝座", "上次借的小鱼干到底还没还", "谁的尾巴更好看", "钓鱼位的归属权"];
      const reconciled = ctx.rng() < 0.25;
      return {
        outcome: reconciled ? "complication" : "fail",
        data: { targetId: target.id, targetName: target.name, cause: pick(ctx.rng, causes), reconciled },
        deltas: { energy: -12 },
        affinityChanges: [
          { catAId: ctx.cat.id, catBId: target.id, delta: reconciled ? 8 : -6, reason: reconciled ? "不打不相识" : "吵得更僵了" },
        ],
        cvBonus: reconciled ? 3 : 2,
      };
    },
  },

  // ============ 事件线类（店铺经营在 threads.ts 里推进，这里是开店入口） ============
  {
    key: "shop_open",
    label: "开店",
    category: "thread",
    segments: ["morning"],
    cooldownDays: 7,
    baseWeight: 22,
    contentValue: 6,
    minEnergy: 40,
    condition: (ctx) =>
      ctx.state.coins > 75 &&
      ctx.cat.boldness > 60 &&
      !ctx.threadsOfCat.some((t) => t.key === "shop" && t.status === "active") &&
      // 全岛同时最多两家店：稀缺性本身就是戏
      ctx.world.threads.filter((t) => t.key === "shop" && t.status === "active").length < 2,
    personalityFit: (c) => 0.3 + c.boldness / 100,
    resolve: (ctx) => {
      const kind = pick(ctx.rng, SHOP_KINDS);
      const name = `${ctx.cat.name}的${kind}`;
      return {
        outcome: "success",
        data: { shopName: name, kind, cost: 50 },
        deltas: { coins: -50, energy: -20 },
        newThreads: [{ key: "shop", catId: ctx.cat.id, step: 1, data: { name, kind, totalProfit: 0 }, startDay: ctx.world.day }],
        cvBonus: 2,
      };
    },
  },
];

export const TEMPLATE_BY_KEY = new Map(TEMPLATES.map((t) => [t.key, t]));
