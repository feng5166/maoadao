import type {
  SimCat,
  SimCatState,
  SimEvent,
  SimRelationship,
  SimStoryline,
  TickResult,
  WorldContext,
} from "./types";

// 确定性随机：同一天同一只猫的行为可复现，便于调试与回放
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(...parts: (string | number)[]): number {
  let h = 2166136261;
  for (const ch of parts.join(":")) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const LOCATIONS = ["海边礁石", "松林小径", "集市广场", "灯塔坡", "溪流浅滩", "废弃渔船"];
const FOUND_ITEMS = ["贝壳", "亮晶晶的玻璃珠", "半截毛线球", "旧怀表", "漂流瓶", "羽毛"];

interface CatContext {
  cat: SimCat;
  state: SimCatState;
  relationships: SimRelationship[];
  storylines: SimStoryline[];
  world: WorldContext;
  rng: () => number;
  allCats: Map<string, SimCat>;
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function doFish(ctx: CatContext): SimEvent {
  const { rng, cat, world } = ctx;
  const skill = cat.diligence / 100;
  const weatherBonus = world.weather === "雨" ? -0.2 : 0;
  const catchCount = Math.max(0, Math.round(rng() * 4 * (skill + 0.3 + weatherBonus)));
  const coins = catchCount * (3 + Math.floor(rng() * 3));
  return {
    catId: cat.id,
    type: "fish",
    data: { location: "海边礁石", catchCount, weather: world.weather },
    deltas: { coins, energy: -15 },
  };
}

function doShopDay(ctx: CatContext, shop: SimStoryline): SimEvent {
  const { rng, cat } = ctx;
  const shopName = String(shop.data.name ?? "小店");
  const daysOpen = ctx.world.day - shop.startDay;
  // 新店头几天客源不稳，亏损概率高；经营越久越稳定
  const stability = Math.min(0.7, 0.25 + daysOpen * 0.08);
  const revenue = Math.round((rng() - (0.5 - stability * 0.4)) * 60);
  return {
    catId: cat.id,
    type: "shop_day",
    data: { shopName, kind: shop.data.kind, revenue, daysOpen, storylineId: shop.id },
    deltas: { coins: revenue, energy: -20 },
  };
}

function doVisit(ctx: CatContext): { event: SimEvent; affinity: { catAId: string; catBId: string; delta: number } } | null {
  const { rng, cat, relationships, allCats } = ctx;
  const candidates = relationships.filter((r) => r.catAId === cat.id || r.catBId === cat.id);
  let targetId: string | undefined;
  if (candidates.length > 0 && rng() < 0.7) {
    const rel = pick(rng, candidates);
    targetId = rel.catAId === cat.id ? rel.catBId : rel.catAId;
  } else {
    const others = [...allCats.keys()].filter((id) => id !== cat.id);
    if (others.length === 0) return null;
    targetId = pick(rng, others);
  }
  const target = allCats.get(targetId);
  if (!target) return null;
  const wentWell = rng() < 0.5 + cat.sociability / 400 + target.sociability / 400;
  const delta = wentWell ? 5 + Math.floor(rng() * 8) : -(3 + Math.floor(rng() * 5));
  return {
    event: {
      catId: cat.id,
      type: "visit",
      data: { targetId, targetName: target.name, wentWell },
      deltas: { energy: -10 },
    },
    affinity: { catAId: cat.id, catBId: targetId, delta },
  };
}

function doExplore(ctx: CatContext): SimEvent {
  const { rng, cat } = ctx;
  const location = pick(rng, LOCATIONS);
  const foundSomething = rng() < 0.3 + cat.boldness / 250;
  return {
    catId: cat.id,
    type: "explore",
    data: {
      location,
      found: foundSomething ? pick(rng, FOUND_ITEMS) : null,
    },
    deltas: { energy: -20, coins: foundSomething && rng() < 0.3 ? 5 : 0 },
  };
}

function doRest(ctx: CatContext): SimEvent {
  return {
    catId: ctx.cat.id,
    type: "rest",
    data: { location: ctx.state.location },
    deltas: { energy: 40 },
  };
}

const SHOP_KINDS = ["烤鱼店", "杂货铺", "毛线咖啡馆", "贝壳纪念品店"];

/** 对全岛所有猫跑一次每日模拟，产出事实（events）与状态变化。纯函数，不碰数据库。 */
export function runDailyTick(
  world: WorldContext,
  cats: SimCat[],
  states: Map<string, SimCatState>,
  relationships: SimRelationship[],
  storylines: SimStoryline[],
): TickResult {
  const result: TickResult = {
    events: [],
    stateChanges: new Map(),
    affinityChanges: [],
    newStorylines: [],
    resolvedStorylineIds: [],
  };
  const allCats = new Map(cats.map((c) => [c.id, c]));

  for (const cat of cats) {
    const state = states.get(cat.id);
    if (!state) continue;
    const rng = mulberry32(hashSeed(world.day, cat.id));
    const ctx: CatContext = {
      cat,
      state,
      relationships,
      storylines: storylines.filter((s) => s.catId === cat.id && s.status === "active"),
      world,
      rng,
      allCats,
    };

    const events: SimEvent[] = [];
    let energy = state.energy;
    let coins = state.coins;

    // 事件线优先：开着店就得看店
    const shop = ctx.storylines.find((s) => s.kind === "shop");
    if (shop && energy >= 20) {
      const ev = doShopDay(ctx, shop);
      events.push(ev);
      // 连亏三天以上且鱼币见底 → 关店（事件线落幕，本身就是故事）
      const totalProfit = Number(shop.data.totalProfit ?? 0) + Number(ev.data.revenue);
      shop.data.totalProfit = totalProfit;
      if (world.day - shop.startDay >= 3 && totalProfit < -60) {
        result.resolvedStorylineIds.push(shop.id);
        events.push({
          catId: cat.id,
          type: "shop_close",
          data: { shopName: shop.data.name, totalProfit, storylineId: shop.id },
          deltas: {},
        });
      }
    }

    // 每日 1~2 个自主行动，按性格加权
    const actionCount = energy < 30 ? 1 : 1 + (ctx.rng() < 0.6 ? 1 : 0);
    for (let i = 0; i < actionCount; i++) {
      const roll = ctx.rng() * 100;
      if (energy < 25) {
        events.push(doRest(ctx));
      } else if (roll < cat.diligence * 0.4) {
        events.push(doFish(ctx));
      } else if (roll < cat.diligence * 0.4 + cat.sociability * 0.35) {
        const visit = doVisit(ctx);
        if (visit) {
          events.push(visit.event);
          result.affinityChanges.push(visit.affinity);
        }
      } else if (roll < cat.diligence * 0.4 + cat.sociability * 0.35 + cat.boldness * 0.3) {
        events.push(doExplore(ctx));
      } else {
        events.push(doRest(ctx));
      }
      for (const ev of events.slice(-1)) {
        energy = Math.max(0, Math.min(100, energy + (ev.deltas.energy ?? 0)));
        coins = Math.max(0, coins + (ev.deltas.coins ?? 0));
      }
    }

    // 胆大且有积蓄的猫可能开店（新事件线的来源）
    if (!shop && coins > 80 && cat.boldness > 60 && ctx.rng() < 0.15) {
      const kind = pick(ctx.rng, SHOP_KINDS);
      const name = `${cat.name}的${kind}`;
      coins -= 50;
      result.newStorylines.push({
        catId: cat.id,
        kind: "shop",
        status: "active",
        data: { name, kind, totalProfit: 0 },
        startDay: world.day,
      });
      events.push({
        catId: cat.id,
        type: "shop_open",
        data: { shopName: name, kind, cost: 50 },
        deltas: { coins: -50 },
      });
    }

    const moods = energy < 30 ? ["疲惫", "犯困"] : coins > state.coins ? ["得意", "开心"] : ["平静", "若有所思"];
    result.events.push(...events);
    result.stateChanges.set(cat.id, {
      coins,
      energy,
      mood: pick(ctx.rng, moods),
      location: String(events[events.length - 1]?.data.location ?? state.location),
    });
  }

  return result;
}
