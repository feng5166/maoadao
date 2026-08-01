import type {
  AffinityChange,
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
// 注意：不放"钥匙"类道具——首周主线纪念物是"门口的旧钥匙"，泛用池撞车会稀释唯一感
const FOUND_ITEMS = [
  "贝壳",
  "亮晶晶的玻璃珠",
  "半截毛线球",
  "旧怀表",
  "漂流瓶",
  "羽毛",
  "一颗被海水磨圆的绿玻璃",
  "半张看不清字的旧船票",
  "缠着水草的小木牌",
  "一小罐没开封的沙丁鱼",
  "褪色的红头绳",
  "一枚有猫爪印的旧硬币",
  "干透的海星",
  "一截雕着波浪纹的木头",
  "写着半句话的纸条",
  "一颗特别圆的鹅卵石",
  "掉了漆的小铃铛",
  "旧望远镜的镜片",
  "一撮不知道是谁的白毛",
  "空的漂亮墨水瓶",
];
const SNACKS = ["烤鱼串", "鱼糕", "小鱼干", "海苔卷", "虾饼", "鱼皮花生", "奶皮子", "烤墨鱼脚", "梅子水", "软乎乎的鱼松包"];
const SHOP_KINDS = ["烤鱼店", "杂货铺", "毛线咖啡馆", "贝壳纪念品店"];
const EXPLORE_MISHAPS = [
  "迷路绕了一大圈",
  "被突然的浪头浇成落汤猫",
  "追蝴蝶追进了刺丛",
  "踩空掉进了退潮的水洼",
  "被一只螃蟹夹住了尾巴尖",
  "钻树洞卡住了，退出来时一身树皮屑",
  "被松鼠从树上扔了一脑袋松果",
  "躲阵雨躲进了漏雨的破棚子",
  "追自己的影子撞上了栅栏",
  "爬上高处下不来，最后是闭着眼跳下来的",
];
const QUARREL_CAUSES = [
  "谁先占的晒太阳宝座",
  "上次借的小鱼干到底还没还",
  "谁的尾巴更好看",
  "钓鱼位的归属权",
  "打呼噜到底吵没吵到别人",
  "集市排队谁插了谁的队",
  "晾鱼干的绳子被谁家占满了",
  "半夜谁在屋顶跑酷",
  "借走的毛线球还回来时少了一半",
  "谁把水洼里的月亮踩碎了",
  "留言板上的字被谁蹭花了",
  "到底是先看见流星的算许愿还是先喊出来的算",
];
const STARGAZE_SKIES = [
  "满天星",
  "一弯月牙",
  "有流星划过",
  "云缝里漏出几颗星",
  "月亮又大又圆，照得沙滩发白",
  "星星少但特别亮的一夜",
  "银河淡淡地横在海面上",
  "一颗星星眨得特别起劲，像在打招呼",
];
const REST_POSES = [
  "蜷成一只完美的猫饼",
  "四脚朝天摊成一张饼",
  "把自己塞进了一个明显小一号的纸箱",
  "枕着自己的尾巴",
  "睡成了一个不可思议的麻花形状",
  "半个身子挂在窗台边缘，睡得纹丝不动",
  "脸埋进毛毯里只露出耳朵",
  "抱着毛线球，睡得像只小虾米",
];
const REST_DREAMS = [
  "梦见一条会发光的大鱼",
  "梦见自己会飞，翅膀是两片海苔",
  "梦见全岛的猫排队给它送小鱼干",
  "梦见在追一个滚来滚去的太阳",
  "梦见胡子变得特别长，能当钓鱼线用",
  "梦见灯塔跟它说话，声音像海浪",
  "梦见主人",
  "梦里一直在打喷嚏，醒来发现鼻尖沾着一根羽毛",
];

// 八卦池：常青的角色向传闻（不涉及具体数值/状态，不会与模拟事实矛盾）。
// 汤圆/将军/灯塔/冰粉相关的传闻不在这里——它们是事件线入口，见 gossip 模板的 resolve。
const GOSSIPS = [
  "橘子在集市吹牛，说自己钓到过一条比船还大的鱼，被将军当场戳穿",
  "馒头的鱼糕换了新配方，据说吃过的猫一整天都在哼歌",
  "斗斗又拉着糯米出海探险，船开出去十米他就吐了——他明明怕水",
  "铃铛黄昏在灯塔坡唱新歌，唱到一半忘了词，硬是哼完了整段",
  "糯米画了一张全岛的画像，谁去看她都害羞得用尾巴挡住画",
  "球球的杂货铺进了一批新毛线，棉花在门口排了整整一上午",
  "土豆修屋顶时在瓦片下发现一窝麻雀，愣是等雏鸟飞走才继续干活",
  "老怪收藏的贝壳摆满了一整面墙，据说每一颗都有名字",
  "乌鸦昨晚巡逻时对着月亮发了很久的呆，被路过的猫看了个正着",
  "小梅在为日报找新选题，见谁都问「你最近有没有什么大新闻」",
  "棉花答应帮三只猫带话，结果三句话全记串了，闹了一天乌龙",
  "将军把码头的缆绳重新盘了一遍，说是台风季前的老规矩",
  "冰粉给自己梳了个新造型，在溪流边照了一下午水面",
  "盐汽水修好了球球店里那台老挂钟，一分钱没收就走了",
  "汤圆睡觉的窗台挪到了馒头早点摊隔壁——大家都说他是闻着味儿挑的",
  "铃铛和糯米商量着合作：一个唱歌一个画画，办一场溪流边的小展览",
  "斗斗宣称在废弃渔船底下发现了「宝藏的线索」，可谁要跟他去看他又不肯带路",
  "老怪最近夜里点灯到很晚，松林深处的窗子亮到后半夜",
  "黑豆又在给猫讲他的开店大计，这次连店名都想好了",
  "馒头蒸坏了一屉鱼糕，特意摆在摊前免费送，一会儿就被抢光了",
];

// 同话题冷却（无状态版）：按天滑动窗口轮换可选八卦，同一条传闻只在窗口期内出现，
// 隔几天才会转回来——压住"逐字重复"的密度。彻底解法是动态八卦（P2）。
const GOSSIP_WINDOW = 8;
function gossipPick(rng: () => number, day: number): string {
  const start = (day * 3) % GOSSIPS.length;
  const windowed = Array.from({ length: Math.min(GOSSIP_WINDOW, GOSSIPS.length) }, (_, i) => GOSSIPS[(start + i) % GOSSIPS.length]);
  return pick(rng, windowed);
}

// 悬念事件线入口的可用性：无活跃同名线，且（快照里可见的）上一条开始至今超过冷却期。
// 生产快照只含 active 线，等价于"无活跃线"；干跑快照含历史线，额外获得冷却窗口。
const MYSTERY_COOLDOWN_DAYS = 40;
function threadFree(ctx: TemplateCtx, key: string): boolean {
  return !ctx.world.threads.some((t) => t.key === key && (t.status === "active" || ctx.world.day - t.startDay < MYSTERY_COOLDOWN_DAYS));
}

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
          data: { location, mishap: pick(ctx.rng, EXPLORE_MISHAPS) },
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
        { boss: "馒头", what: "帮早点摊看火蒸鱼糕" },
        { boss: "小梅", what: "帮日报挨家挨户送报" },
        { boss: "土豆", what: "帮忙给新栅栏刷漆" },
        { boss: "球球", what: "帮忙盘点仓库里的毛线" },
        { boss: "将军", what: "帮忙给缆绳上油" },
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
      // 睡姿必有、梦境偶得：让占比最高的补觉也有一句可写的细节
      data: {
        location: ctx.state.location,
        pose: pick(ctx.rng, REST_POSES),
        dream: ctx.rng() < 0.4 ? pick(ctx.rng, REST_DREAMS) : null,
      },
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
      data: { location: pick(ctx.rng, ["灯塔坡", "海边礁石"]), sky: pick(ctx.rng, STARGAZE_SKIES) },
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
      // 悬念传闻是事件线的入口：符合性格的猫听到会上钩（每次至多开一条线）。
      // 节奏间隔：距上一条悬念线开启不足 7 天不再开新线——否则全部挤在前三天，后半月又空了。
      const MYSTERY_KEYS = ["lighthouse", "tangyuan_secret", "general_past", "cafe"];
      const recentMystery = ctx.world.threads.some((t) => MYSTERY_KEYS.includes(t.key) && ctx.world.day - t.startDay < 7);
      const busyWithMystery = ctx.threadsOfCat.some((t) => t.status === "active" && MYSTERY_KEYS.includes(t.key));
      const entries: { rumor: string; thread: NewThread }[] = [];
      // 每条线的"当事 NPC"不能当主角，否则会出现自己调查自己的荒诞剧
      const LIGHTHOUSE_CAST = ["npc-yantai", "npc-laoguai", "npc-wuya", "npc-xiaomei"];
      const TANGYUAN_CAST = ["npc-tangyuan", "npc-laoguai", "npc-mianhua"];
      const GENERAL_CAST = ["npc-jiangjun", "npc-laoguai"];
      if (!recentMystery && !busyWithMystery) {
        if (ctx.cat.boldness > 55 && !LIGHTHOUSE_CAST.includes(ctx.cat.id) && threadFree(ctx, "lighthouse")) {
          entries.push({
            rumor: "灯塔最近半夜会发出奇怪的光，盐汽水却矢口否认",
            thread: { key: "lighthouse", catId: ctx.cat.id, step: 1, data: { rumorFrom: target.name, hasBell: false }, startDay: ctx.world.day },
          });
        }
        if (ctx.cat.sociability > 55 && !TANGYUAN_CAST.includes(ctx.cat.id) && ctx.catById.has("npc-tangyuan") && threadFree(ctx, "tangyuan_secret")) {
          entries.push({
            rumor: "汤圆从来不干活却顿顿有鱼吃，最近还总在后半夜往松林方向溜",
            thread: { key: "tangyuan_secret", catId: ctx.cat.id, step: 1, data: { rumorFrom: target.name }, startDay: ctx.world.day },
          });
        }
        if (ctx.cat.boldness > 45 && !GENERAL_CAST.includes(ctx.cat.id) && ctx.catById.has("npc-jiangjun") && threadFree(ctx, "general_past")) {
          entries.push({
            rumor: "将军年轻时在船上见过大风浪，可他从来不细说",
            thread: { key: "general_past", catId: ctx.cat.id, step: 1, data: { rumorFrom: target.name }, startDay: ctx.world.day },
          });
        }
        // 冰粉的咖啡馆：传闻属于打听的猫，事件线属于冰粉本人
        if (ctx.cat.id !== "npc-bingfen" && ctx.catById.has("npc-bingfen") && threadFree(ctx, "cafe")) {
          entries.push({
            rumor: "冰粉真的攒够钱了，据说已经在溪流边看中了一间旧棚屋",
            thread: { key: "cafe", catId: "npc-bingfen", step: 1, data: {}, startDay: ctx.world.day },
          });
        }
      }
      if (entries.length > 0 && ctx.rng() < 0.25) {
        const e = pick(ctx.rng, entries);
        return {
          outcome: "complication",
          data: { targetId: target.id, targetName: target.name, rumor: e.rumor },
          deltas: { energy: -8 },
          newThreads: [e.thread],
          affinityChanges: [{ catAId: ctx.cat.id, catBId: target.id, delta: 3, reason: "共享秘密" }],
          cvBonus: 4,
        };
      }
      return {
        outcome: "success",
        data: { targetId: target.id, targetName: target.name, rumor: gossipPick(ctx.rng, ctx.world.day) },
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
    cooldownDays: 5,
    baseWeight: 10,
    contentValue: 5,
    minEnergy: 10,
    // 真穷才借（<15）+ 冷却 5 天：防止后半月全岛退化成借贷公告板（30 天干跑教训）
    condition: (ctx) => ctx.state.coins < 15 && !ctx.threadsOfCat.some((t) => t.key === "debt" && t.status === "active"),
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
      const causes = QUARREL_CAUSES;
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
    // 门槛 75→55：30 天干跑鱼币均值 44、0 次开店——原门槛让开店线成了空头文案
    condition: (ctx) =>
      ctx.state.coins > 55 &&
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
