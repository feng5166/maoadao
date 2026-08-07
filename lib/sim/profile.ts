// Birth Canon 派生器（doc2.0/09 v2.1 §二）：分布给方向，采样给个体，身份给灵魂。
//
// 三条纪律：
// ① 确定性：same catId + same canon + same PROFILE_VERSION → byte-equivalent profile
//   （Gate A CI）。PROFILE_VERSION 与玩法侧规则版本生命周期分离——
//   调 Visit 权重不应导致"同一只猫重新出生"（本文件禁止 import 玩法配置，CI 静态看守）。
// ② 禁查表：三轴只改变各偏好维度的**采样概率**，不产生固定映射——
//   同三轴两只猫，种子不同结果就不同（09 反红线）。
// ③ 覆写必须有正典依据：每条 override 带 source（只认 canon.*）与 reason，
//   无 source 的覆写不合法（09 §二 审计）。
//
// Gate 流程（14 §九 后续拍板）：A 确定性 → B 构成检查（本文件 checkPoolComposition）
// → C 逐只人工终审（CatProfile.approvedAt）——**终审通过前不得替换 POOL_V0**。

import { NPC_CATS } from "./npcs";
import { hashSeed, mulberry32 } from "./rng";

export const PROFILE_VERSION = "profile-v0.1.0";

export type Rarity = "COMMON" | "UNCOMMON" | "RARE" | "VERY_RARE" | "SPECIAL";

export interface Override {
  path: string; // favor.<tag> | avoid.add:<tag> | windows | traceBias | stay | leave | eligibilityNote
  value: unknown;
  source: string; // canon.bio | canon.role | canon.persona | canon.quirk
  reason: string;
}

export interface DerivedProfile {
  catId: string;
  name: string;
  profileVersion: string;
  rarity: Rarity;
  corePreference: { favor: Record<string, number>; avoid: string[] };
  lifePatternSeed: { windows: number[]; routeNote: string; eligibilityNote?: string };
  discoveryTrait: { stayTendency: "short" | "mid" | "long"; traceBias: number };
  behaviorSignature: string[];
  socialSeed: { friends: string[]; avoids: string[]; note: string };
  leaveStyle: { freq: "high" | "mid" | "low"; min: number; max: number; material: boolean };
  overrides: Override[];
}

// ---------- 采样域 ----------
const FAVOR_TAGS = ["soft", "warm", "water", "height", "quiet", "social", "enclosed", "open", "sun", "shade", "playful", "old", "shelter"] as const;
const AVOID_TAGS = ["water", "social_visible", "open", "shade"] as const;

/** 三轴 → 各偏好维度的采样概率（分布，不是判决——09 §二·1） */
function favorP(tag: string, b: number, s: number, d: number): number {
  const up = (x: number, k: number) => Math.max(0, x) / k;
  switch (tag) {
    case "quiet": return 0.15 + up(60 - s, 120);
    case "social": return 0.1 + up(s - 50, 100);
    case "enclosed": return 0.15 + up(50 - b, 120);
    case "open": return 0.1 + up(b - 50, 120);
    case "height": return 0.1 + up(b - 50, 150);
    case "shelter": return 0.15 + up(40 - b, 200);
    case "playful": return 0.12 + up(60 - d, 200) + up(b - 50, 300);
    case "sun": return 0.25;
    case "soft": return 0.22;
    case "warm": return 0.18;
    case "shade": return 0.15;
    case "water": return 0.08;
    case "old": return 0.08;
    default: return 0.1;
  }
}

function avoidP(tag: string, b: number, s: number): number {
  switch (tag) {
    case "social_visible": return 0.08 + Math.max(0, 40 - s) / 100;
    case "water": return 0.15;
    case "open": return 0.05 + Math.max(0, 35 - b) / 150;
    case "shade": return 0.05;
    default: return 0.05;
  }
}

// ---------- 正典覆写与创作块（终审对象；source 只认 canon.*） ----------
interface CanonEntry {
  rarity: Rarity;
  overrides: Override[];
  signature: string[];
  socialSeed: DerivedProfile["socialSeed"];
  leaveStyle: DerivedProfile["leaveStyle"];
}

const ov = (path: string, value: unknown, source: string, reason: string): Override => ({ path, value, source, reason });

/** 首发 16 只 = 全体 NPC 减老章（登记处正典驻点）。终审归创始人（09a 卡片）。 */
export const CANON: Record<string, CanonEntry> = {
  "npc-mianhua": {
    rarity: "COMMON",
    overrides: [
      ov("favor.soft", 3, "canon.bio", "蓬松的白色长毛猫，像一朵云——软的地方是她的"),
      ov("traceBias", -0.1, "canon.persona", "治愈系常驻，来了就窝着，一眼认出"),
      ov("windows", [1, 2, 3, 4, 5, 6, 7], "canon.persona", "白天的猫"),
    ],
    signature: ["睡成一朵云，尾巴盖住鼻子", "把下巴搁在别的猫背上打盹"],
    socialSeed: { friends: ["npc-tangyuan", "npc-juzi"], avoids: [], note: "谁都熟；记性差所以不记仇" },
    leaveStyle: { freq: "high", min: 2, max: 4, material: false },
  },
  "npc-tangyuan": {
    rarity: "COMMON",
    overrides: [
      ov("leave", { freq: "high", min: 3, max: 5 }, "canon.bio", "从没干过活但从没饿过肚子——她总有多的（常见且大方）"),
      ov("favor.warm", 2, "canon.persona", "懒和撒娇都需要暖和的地方"),
    ],
    signature: ["把吃的分一半留在原地", "翻个身，换个方向继续睡"],
    socialSeed: { friends: ["npc-mianhua"], avoids: [], note: "运气好的猫身边总有人" },
    leaveStyle: { freq: "high", min: 3, max: 5, material: false },
  },
  "npc-juzi": {
    rarity: "COMMON",
    overrides: [
      ov("favor.social", 2, "canon.bio", "消息最灵通、什么都想掺一脚"),
      ov("traceBias", -0.05, "canon.persona", "自来熟，从不躲人"),
    ],
    signature: ["凑过来看你在干什么", "把听来的事讲给院里别的猫"],
    socialSeed: { friends: ["npc-mianhua", "npc-bingfen", "npc-heidou"], avoids: [], note: "社交枢纽；他来过，全岛都会知道你院子" },
    leaveStyle: { freq: "mid", min: 2, max: 4, material: false },
  },
  "npc-nuomi": {
    rarity: "COMMON",
    overrides: [
      ov("favor.quiet", 2, "canon.persona", "害羞、细心"),
      ov("traceBias", 0.15, "canon.persona", "害羞——常常你只看到她画过的痕迹"),
      ov("windows", [3, 4, 5, 6], "canon.bio", "在溪流边写生的下午猫"),
    ],
    signature: ["蹲在角落把一样东西看很久", "爪子蘸了水，在石板上画着什么"],
    socialSeed: { friends: ["npc-lingdang"], avoids: ["npc-juzi"], note: "怕吵；和铃铛互相安静地待着" },
    leaveStyle: { freq: "mid", min: 1, max: 3, material: false },
  },
  "npc-lingdang": {
    rarity: "COMMON",
    overrides: [
      ov("windows", [7, 8, 9], "canon.bio", "每天黄昏在灯塔坡唱歌——黄昏后才有空"),
      ov("favor.sun", 2, "canon.persona", "浪漫的猫喜欢晚霞的方向"),
      ov("traceBias", -0.05, "canon.bio", "唱着歌来的，听得见"),
    ],
    signature: ["黄昏时小声哼哼", "对着晚霞的方向坐很久"],
    socialSeed: { friends: ["npc-nuomi"], avoids: [], note: "听众时多时少，不介意" },
    leaveStyle: { freq: "mid", min: 1, max: 3, material: false },
  },
  "npc-tudou": {
    rarity: "COMMON",
    overrides: [
      ov("leave", { freq: "low", min: 2, max: 6 }, "canon.bio", "岛上一半的房子是他搭的——不常来，来了偶尔留下好木料（不起眼但偶有好东西）"),
      ov("leave.material", true, "canon.bio", "木匠猫的谢礼是木料"),
      ov("favor.quiet", 1, "canon.persona", "闷声干活"),
    ],
    signature: ["把院里最重的东西搬正", "蹲着不动，像一截木桩"],
    socialSeed: { friends: ["npc-mantou"], avoids: [], note: "话少；谁家有活谁知道他好" },
    leaveStyle: { freq: "low", min: 2, max: 6, material: true },
  },
  "npc-bingfen": {
    rarity: "COMMON",
    overrides: [
      ov("favor.open", 2, "canon.persona", "爱凑热闹、人来疯——要显眼的位置"),
      ov("traceBias", -0.1, "canon.persona", "时髦的猫不屑于没被看见"),
      ov("windows", [4, 5, 6, 7, 8], "canon.persona", "下午与傍晚的社交时段"),
    ],
    signature: ["理毛理得一丝不苟", "挑全院最显眼的地方坐下"],
    socialSeed: { friends: ["npc-juzi", "npc-heidou"], avoids: ["npc-laoguai"], note: "梦想开咖啡馆——爱一切新东西" },
    leaveStyle: { freq: "mid", min: 2, max: 4, material: false },
  },
  "npc-heidou": {
    rarity: "UNCOMMON",
    overrides: [
      ov("favor.playful", 2, "canon.persona", "赌性坚强——什么都想试两下"),
      ov("windows", [5, 6, 7, 8, 9], "canon.bio", "筹备第八家店的猫，白天在忙"),
    ],
    signature: ["盯着两样东西比划半天", "把小石子排成一行，又自己推倒"],
    socialSeed: { friends: ["npc-juzi", "npc-bingfen"], avoids: [], note: "口才好；输了也乐观" },
    leaveStyle: { freq: "mid", min: 2, max: 5, material: false },
  },
  "npc-mantou": {
    rarity: "UNCOMMON",
    overrides: [
      ov("windows", [4, 5, 6, 7], "canon.role", "早点摊晨忙——收摊后的下午才得闲（职务=时间约束，不是禁令）"),
      ov("favor.warm", 2, "canon.persona", "温柔胆小的猫恋暖"),
      ov("traceBias", 0.1, "canon.persona", "胆小——有动静就先走"),
    ],
    signature: ["把每样东西都闻一闻", "爪子收在身子底下，眯着眼打盹"],
    socialSeed: { friends: ["npc-tudou"], avoids: ["npc-doudou"], note: "怕莽撞的" },
    leaveStyle: { freq: "mid", min: 2, max: 4, material: false },
  },
  "npc-jiangjun": {
    rarity: "UNCOMMON",
    overrides: [
      ov("windows", [8, 9, 10, 11], "canon.role", "白天管码头进出——下班后才巡到你院子（职务=时间约束）"),
      ov("favor.open", 2, "canon.persona", "站岗的猫要视野"),
    ],
    signature: ["端端正正巡一圈才肯坐下", "对着海的方向站一会儿岗"],
    socialSeed: { friends: [], avoids: [], note: "严肃但热心肠；守时——来的窗口出奇地准" },
    leaveStyle: { freq: "mid", min: 2, max: 5, material: false },
  },
  "npc-doudou": {
    rarity: "UNCOMMON",
    overrides: [
      ov("avoid.add", "water", "canon.bio", "怕水却爱出海——矛盾即性格，正典优先于统计"),
      ov("favor.height", 2, "canon.persona", "探险家要制高点"),
      ov("leave.material", true, "canon.bio", "废弃渔船的秘密基地里全是叫不上名字的东西"),
    ],
    signature: ["从高处一跃而下", "叼来一样叫不上名字的东西"],
    socialSeed: { friends: ["npc-heidou"], avoids: ["npc-mantou"], note: "讲义气；嫌胆小的猫磨叽" },
    leaveStyle: { freq: "low", min: 1, max: 4, material: true },
  },
  "npc-qiuqiu": {
    rarity: "RARE",
    overrides: [
      ov("windows", [9, 10, 11], "canon.role", "杂货铺打烊后才出门（职务=时间约束）"),
      ov("leave", { freq: "low", min: 1, max: 2 }, "canon.persona", "精打细算——不乱给（稀有且少留）"),
      ov("traceBias", 0.1, "canon.persona", "看一圈就走，不多停"),
    ],
    signature: ["把院里东西的位置默默记一遍", "用爪子拨拉两下，像在算什么"],
    socialSeed: { friends: [], avoids: [], note: "刀子嘴；全岛的账她心里都有一本" },
    leaveStyle: { freq: "low", min: 1, max: 2, material: false },
  },
  "npc-yantai": {
    rarity: "RARE",
    overrides: [
      ov("windows", [10, 11, 12], "canon.persona", "夜猫子——灯塔管理员的作息"),
      ov("favor.old", 2, "canon.bio", "修得好一切会转的东西——旧物件对他是待办"),
      ov("leave", { freq: "low", min: 0, max: 2 }, "canon.persona", "沉默的猫不留客套（稀有且少留）"),
      ov("leave.material", true, "canon.bio", "偶尔留下一个上了油的小零件"),
      ov("traceBias", 0.2, "canon.persona", "夜里来，多数时候只有零件证明他来过"),
    ],
    signature: ["把坏了的东西翻过来看底面", "留下一个上了油的小零件"],
    socialSeed: { friends: [], avoids: ["npc-juzi"], note: "嫌吵；灯塔坡唱歌的那位他倒不赶" },
    leaveStyle: { freq: "low", min: 0, max: 2, material: true },
  },
  "npc-wuya": {
    rarity: "RARE",
    overrides: [
      ov("windows", [10, 11, 12], "canon.bio", "夜里在屋顶巡逻——他的职务本身就是移动"),
      ov("favor.height", 2, "canon.bio", "屋顶巡逻官走高处"),
      ov("avoid.add", "social_visible", "canon.persona", "独行侠不进热闹地"),
      ov("traceBias", 0.35, "canon.persona", "傲娇+身手好——你多半只看到他来过（难确认型）"),
    ],
    signature: ["只在墙头停一停", "暗处亮一下金蓝两色的眼睛"],
    socialSeed: { friends: [], avoids: ["npc-bingfen"], note: "自封治安官；谁都不理但谁家都巡" },
    leaveStyle: { freq: "low", min: 1, max: 3, material: false },
  },
  "npc-xiaomei": {
    rarity: "VERY_RARE",
    overrides: [
      ov("windows", [8, 9], "canon.role", "日报主编几乎全天在报社——极偶尔傍晚出来transit（职务=时间约束的极端档）"),
      ov("favor.social", 2, "canon.persona", "八卦热心嗓门大"),
      ov("traceBias", -0.15, "canon.persona", "嗓门大——她来了，整个院子都知道（稀有但显眼）"),
      ov("leave.material", true, "canon.role", "走前把一份卷起来的旧日报压在石头下"),
    ],
    signature: ["嗓门大得像在念头条", "走之前把一张纸压在石头底下"],
    socialSeed: { friends: ["npc-juzi"], avoids: [], note: "全岛线人网络的中心；来一次=你院子上头条的机会" },
    leaveStyle: { freq: "mid", min: 2, max: 4, material: true },
  },
  "npc-laoguai": {
    rarity: "SPECIAL",
    overrides: [
      ov("windows", [9, 10, 11, 12], "canon.bio", "住松林深处，夜里才远行"),
      ov("favor.old", 3, "canon.persona", "收藏癖——只有旧东西请得动他"),
      ov("avoid.add", "social_visible", "canon.persona", "古怪独居"),
      ov("avoid.add", "open", "canon.bio", "松林深处的猫不喜欢空旷"),
      ov("leave", { freq: "low", min: 0, max: 1 }, "canon.persona", "他的价值不在鱼干——在行为与他留下的谜（特殊猫主价值=行为/信息/记忆）"),
      ov("traceBias", 0.25, "canon.persona", "见过的人不多，说法不一"),
      ov("eligibilityNote", "院内需有 old 标签物件在场（旧木箱/旧雨伞类）", "canon.persona", "收藏癖的硬条件——谜面走岛闻投放（17）"),
    ],
    signature: ["把每样东西看很久，像在鉴定", "他碰过的东西会被摆成奇怪的角度"],
    socialSeed: { friends: [], avoids: ["npc-bingfen", "npc-juzi"], note: "据说见过岛的第一天——OpenMystery，档案只记'据说'" },
    leaveStyle: { freq: "low", min: 0, max: 1, material: false },
  },
};

// ---------- 派生 ----------
function applyOverrides(p: DerivedProfile, entry: CanonEntry): void {
  for (const o of entry.overrides) {
    if (!o.source.startsWith("canon.")) throw new Error(`override 无正典依据: ${o.path}`);
    if (o.path.startsWith("favor.")) {
      const tag = o.path.slice(6);
      p.corePreference.favor[tag] = o.value as number;
      // 正典优先于统计：采样出的同名 AVOID 让位（favor/avoid 永不重合）
      p.corePreference.avoid = p.corePreference.avoid.filter((t) => t !== tag);
    }
    else if (o.path === "avoid.add") { const t = o.value as string; if (!p.corePreference.avoid.includes(t)) p.corePreference.avoid.push(t); delete p.corePreference.favor[t]; }
    else if (o.path === "windows") p.lifePatternSeed.windows = o.value as number[];
    else if (o.path === "traceBias") p.discoveryTrait.traceBias = o.value as number;
    else if (o.path === "leave") p.leaveStyle = { ...p.leaveStyle, ...(o.value as object) } as DerivedProfile["leaveStyle"];
    else if (o.path === "leave.material") p.leaveStyle.material = o.value as boolean;
    else if (o.path === "eligibilityNote") p.lifePatternSeed.eligibilityNote = o.value as string;
  }
}

export function deriveProfile(catId: string, version: string = PROFILE_VERSION): DerivedProfile {
  const npc = NPC_CATS.find((n) => n.id === catId);
  const canon = CANON[catId];
  if (!npc || !canon) throw new Error(`不在首发候选内: ${catId}`);
  const rng = mulberry32(hashSeed(catId, version)); // 个体种子：同 canon 同版本 → byte-equivalent
  const { boldness: b, sociability: s, diligence: d } = npc;

  // 1) 分布采样 favor（09 §二·1/2）
  const favor: Record<string, number> = {};
  const scored: Array<{ tag: string; strength: number; tie: number }> = [];
  for (const tag of FAVOR_TAGS) {
    const roll = rng();
    if (roll < favorP(tag, b, s, d)) scored.push({ tag, strength: 1 + Math.floor(rng() * 3), tie: rng() });
    else rng(); // 保持消耗数恒定，确定性不受分支影响
  }
  scored.sort((x, y) => y.strength - x.strength || y.tie - x.tie);
  for (const it of scored.slice(0, 3)) favor[it.tag] = it.strength;

  // 2) 分布采样 avoid（不与 favor 重合）
  const avoid: string[] = [];
  for (const tag of AVOID_TAGS) {
    const roll = rng();
    if (roll < avoidP(tag, b, s) && !(tag in favor) && avoid.length < 2) avoid.push(tag);
  }

  // 3) 活跃窗基线：勤快→早，懒→午后，默认白天块
  const windows = d >= 70 ? [0, 1, 2, 3, 4, 5] : d <= 35 ? [4, 5, 6, 7, 8] : [2, 3, 4, 5, 6, 7];

  const p: DerivedProfile = {
    catId,
    name: npc.name,
    profileVersion: version,
    rarity: canon.rarity,
    corePreference: { favor, avoid },
    lifePatternSeed: { windows, routeNote: npc.bio },
    discoveryTrait: { stayTendency: s >= 70 ? "long" : s >= 40 ? "mid" : "short", traceBias: Math.round((rng() * 0.2 - 0.05) * 100) / 100 },
    behaviorSignature: canon.signature,
    socialSeed: canon.socialSeed,
    leaveStyle: { ...canon.leaveStyle },
    overrides: canon.overrides,
  };

  // 4) 正典覆写（最强派生源，带审计——09 §二·3）
  applyOverrides(p, canon);
  return p;
}

export function deriveAllCandidates(version: string = PROFILE_VERSION): DerivedProfile[] {
  return Object.keys(CANON).map((catId) => deriveProfile(catId, version));
}

// ---------- Gate B：构成检查（22 §二 六项正交 + 配比） ----------
export interface CompositionReport {
  ok: boolean;
  missing: string[];
  rarityCounts: Record<string, number>;
}

export function checkPoolComposition(profiles: DerivedProfile[]): CompositionReport {
  const rarityCounts: Record<string, number> = {};
  for (const p of profiles) rarityCounts[p.rarity] = (rarityCounts[p.rarity] ?? 0) + 1;
  const missing: string[] = [];
  const expect: Record<Rarity, number> = { COMMON: 7, UNCOMMON: 4, RARE: 3, VERY_RARE: 1, SPECIAL: 1 };
  for (const [r, n] of Object.entries(expect)) if ((rarityCounts[r] ?? 0) !== n) missing.push(`配比 ${r} 应为 ${n}，实为 ${rarityCounts[r] ?? 0}`);

  const rarePlus = (p: DerivedProfile) => p.rarity === "RARE" || p.rarity === "VERY_RARE" || p.rarity === "SPECIAL";
  const checks: Array<[string, (ps: DerivedProfile[]) => boolean]> = [
    ["常见且大方", (ps) => ps.some((p) => p.rarity === "COMMON" && p.leaveStyle.freq === "high" && p.leaveStyle.max >= 4)],
    ["稀有且少留", (ps) => ps.some((p) => rarePlus(p) && p.leaveStyle.max <= 3)],
    ["特殊猫主价值在行为", (ps) => ps.some((p) => p.rarity === "SPECIAL" && p.leaveStyle.max <= 1)],
    ["不起眼但偶留好东西", (ps) => ps.some((p) => (p.rarity === "COMMON" || p.rarity === "UNCOMMON") && p.leaveStyle.freq === "low" && p.leaveStyle.material)],
    ["不稀有但难确认", (ps) => ps.some((p) => !rarePlus(p) && p.discoveryTrait.traceBias >= 0.1) || ps.some((p) => p.discoveryTrait.traceBias >= 0.3)],
    ["稀有但显眼", (ps) => ps.some((p) => rarePlus(p) && p.discoveryTrait.traceBias <= -0.05)],
  ];
  for (const [name, fn] of checks) if (!fn(profiles)) missing.push(`正交缺位：${name}`);

  return { ok: missing.length === 0, missing, rarityCounts };
}
