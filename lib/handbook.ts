// 手账页的展示辅助：系统数据 → 生活语言（v0.7 术语产品化）

import { hashSeed, mulberry32, pick } from "./sim/rng";

/** 地点 → 固定场景图（5-8 幅固定背景，避免头像漂浮） */
export function sceneFor(location: string | undefined): string {
  const map: [string, string][] = [
    ["码头", "/scenes/dock.jpg"],
    ["海边礁石", "/scenes/reef.jpg"],
    ["溪流浅滩", "/scenes/reef.jpg"],
    ["松林小径", "/scenes/pines.jpg"],
    ["集市广场", "/scenes/market.jpg"],
    ["灯塔坡", "/scenes/lighthouse.jpg"],
    ["废弃渔船", "/scenes/boat.jpg"],
    ["自家小屋", "/scenes/home.jpg"],
  ];
  for (const [key, img] of map) if (location?.includes(key)) return img;
  return "/scenes/home.jpg";
}

export function todayLabel(): string {
  const d = new Date();
  return `${d.getMonth() + 1} 月 ${d.getDate()} 日`;
}

/** 状态变化标签 → 页边批注散文（"鱼币 +12" → "今天赚了 12 枚鱼币。"） */
export function marginNotes(
  stateChanges: { label: string; delta: string }[],
  threadProgress: { label: string; step: number; total?: number; done?: boolean }[],
): string[] {
  const notes: string[] = [];
  for (const c of stateChanges) {
    if (c.label === "鱼币") {
      const n = parseInt(c.delta, 10);
      if (n > 0) notes.push(`今天赚了 ${n} 枚鱼币。`);
      else if (n < 0) notes.push(`今天花掉了 ${-n} 枚鱼币。`);
    } else if (c.label.startsWith("与")) {
      const who = c.label.slice(1);
      const positive = c.delta.trim().startsWith("+");
      const reason = c.delta.replace(/^[+\-\d\s]+/, "");
      notes.push(positive ? `${who}似乎没那么防着它了${reason ? `（${reason}）` : ""}。` : `它和${who}闹了点小别扭${reason ? `（${reason}）` : ""}。`);
    }
  }
  for (const t of threadProgress) {
    if (t.done) continue; // 落幕线不进页边批注：页面有专门的收束时刻
    notes.push(`「${t.label}」${threadStage(t.step, t.total)}。`);
  }
  return notes;
}

// ============ 摸摸它：每天一句确定性反应（状态+日期哈希，不调 LLM） ============
const PET_HAPPY = [
  "它把脑袋顶进你手心里蹭了蹭，呼噜开得很大声。",
  "它就势翻了个肚皮——这待遇可不常有。",
  "它眯着眼接受了，尾巴尖愉快地打了个卷。",
  "它蹭完你的手，还顺势舔了一下你的指尖。",
];
const PET_TIRED = [
  "它睡眼惺忪地抬了下头，又把自己缩回去了。",
  "它含糊地哼了一声，算是回应过了。",
  "它任你摸，眼睛都没睁开。",
  "它打了个大哈欠，把下巴搁回爪子上。",
];
const PET_DOWN = [
  "它往后缩了缩，今天不太想被摸。",
  "它让你摸了，但尾巴一直没抬起来。",
  "它把脸埋起来，只留一只耳朵给你。",
  "它轻轻拱了下你的手，像是想说点什么，又没说。",
];
const PET_BUSY = [
  "它心不在焉地接受了，眼睛一直盯着窗外。",
  "它耳朵动了动，思绪明显在别的事上。",
  "它匆匆蹭了一下就走开了，像有什么要紧事。",
  "它看了你一眼，那眼神像是在说：回头再说。",
];
const PET_CALM = [
  "它眯起眼睛，喉咙里滚出细小的呼噜。",
  "它歪头看了你一会儿，轻轻蹭了下你的手背。",
  "它抬头顶了顶你的掌心，然后继续看它的海。",
  "它用尾巴在你手腕上绕了半圈。",
];

export function petLine(catId: string, day: number, mood?: string | null): string {
  const rng = mulberry32(hashSeed(day, "pet", catId));
  const m = mood ?? "";
  const pool = ["得意", "眉开眼笑"].includes(m)
    ? PET_HAPPY
    : ["疲惫", "犯困"].includes(m)
      ? PET_TIRED
      : ["郁闷", "有点丧", "饿肚子", "愁钱"].includes(m)
        ? PET_DOWN
        : ["心事重重", "按捺不住好奇"].includes(m)
          ? PET_BUSY
          : PET_CALM;
  return pick(rng, pool);
}

// "留下"的小物(按地点派生,隔天出现):猫不制造悬念,只留下痕迹。
// 小屋生活册与主人生活册共用一套池子,同一天同一只猫两边看到的是同一件。
const LEFT_BEHIND: Record<string, string[]> = {
  reef: ["半枚白色的小贝壳", "一颗被海水磨圆的玻璃珠", "爪印一排,朝着退潮的方向"],
  lighthouse: ["一根灰色的羽毛", "一小段旧绳头", "草叶上蹭下来的一撮毛"],
  market: ["一张皱巴巴的价签", "半张烤鱼的油纸", "摊子底下滚出来的小硬币"],
  dock: ["一小截缆绳须", "一片剥落的船漆", "木板上晒干的一个湿爪印"],
  pines: ["一颗完整的松果", "一片还带着露水的松针", "树皮上新添的一道磨爪印"],
  home: ["窗台上的一小撮猫毛", "一团玩剩的毛线", "垫子上一个睡出来的窝"],
  boat: ["一小块生锈的铁环", "一片藤蔓的叶子", "船板缝里抠出来的小螺壳"],
  farewell: ["一枚黄昏色的小石子", "码头尽头的一个坐印"],
  sailed: ["一枚黄昏色的小石子", "码头尽头的一个坐印"],
};

/** 这一天留下了什么:场景图路径 → 小物;隔天出现一次,别机械到每页都有 */
export function leftBehindFor(catId: string, day: number, sceneImg: string | null): string | null {
  const key = sceneImg?.match(/\/scenes\/(\w+)\.jpg/)?.[1];
  const pool = key ? LEFT_BEHIND[key] : undefined;
  if (!pool) return null;
  if (hashSeed(day, "left-gate", catId) % 2 !== 0) return null;
  return pick(mulberry32(hashSeed(day, "left", catId)), pool);
}

/** 鱼币/体力 → 生活语言(猫主页 P1:数值感降权,精确数字收进"细账") */
export function coinsLine(coins: number): string {
  if (coins <= 0) return "口袋空空,正琢磨去哪儿赚点鱼币。";
  if (coins < 20) return "兜里揣着几枚鱼币,省着花。";
  if (coins < 60) return "攒了一小罐鱼币,心里有底。";
  return "私房钱攒得厚厚的,最近手头很宽裕。";
}
export function energyLine(energy: number): string {
  if (energy >= 80) return "精神头很足,走路带风。";
  if (energy >= 50) return "还算有劲,慢悠悠地过日子。";
  if (energy >= 25) return "有点乏了,想找个地方眯一会儿。";
  return "累得不轻,今天多半要早睡。";
}

/** 事件线进度 → 阶段语（精确数字进档案页） */
export function threadStage(step: number, total?: number): string {
  if (!total) return step <= 1 ? "才刚起头" : "还在继续";
  const ratio = step / total;
  if (ratio <= 0.3) return "才刚起头";
  if (ratio <= 0.7) return "越来越近了";
  return "已经接近真相";
}
