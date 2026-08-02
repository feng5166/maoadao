// 口癖与自称：每只猫固定的说话习惯（doc/09 §6）。
// 冯威赫："对话轮次多了就会有角色不一致。"——猫每天写第一人称日记，声线漂移是真实风险。
// 方案：由 catId 确定性派生（不落库、永不变），写进叙事约束；性格标签影响候选池。
// 秃秃的参照：自称"菇"（「菇的帽子在飘」）——第三人称自称萌感强、自带表情包体质，但只给少数猫。

import { hashSeed, mulberry32, pick } from "../sim/rng";

export interface VoiceCat {
  id: string;
  name: string;
  personaTags: string[];
  boldness?: number;
  sociability?: number;
}

interface Quirk {
  desc: string; // 给 LLM 的说话习惯描述
  tags?: string[]; // 更适配这些性格标签（命中则进优先池）
}

// 口癖池：写法/语气层面的小习惯——足够轻，一篇日记体现一两处就好
const QUIRKS: Quirk[] = [
  { desc: "句子短，能三个字说完不用五个字，收尾干脆不解释", tags: ["高冷", "独", "傲"] },
  { desc: "爱在句尾加一声「哼」，尤其是嘴硬的时候", tags: ["傲", "高冷", "别扭"] },
  { desc: "兴奋起来爱用感叹号，一句话里能出现两个", tags: ["莽", "社牛", "活泼", "爱凑热闹"] },
  { desc: "爱用「……」，很多话说一半就咽回去", tags: ["害羞", "内向", "胆小"] },
  { desc: "爱打比方，什么都能比成吃的", tags: ["馋", "爱吃"] },
  { desc: "记性好到具体：写日子爱带数字（三片叶子、第四趟、两个来回）", tags: ["认真", "勤快"] },
  { desc: "偶尔在日记结尾写一句和正文无关的小观察，像是顺手记的" },
  { desc: "对自己嘴很硬，写到丢脸的事会找一个不太站得住的借口" },
  { desc: "爱用「大概」「可能」「说不定」，对什么都留三分余地", tags: ["谨慎", "胆小"] },
  { desc: "写到高兴的事会突然冒出一句语气词（「嘿。」「哇哦。」）单独成句" },
  { desc: "爱把天气当开场白，好像天气是它的老朋友" },
  { desc: "写别的猫时爱加一句自己的小评价，藏不住态度", tags: ["爱八卦", "社牛"] },
  { desc: "困了累了的时候句子会越写越短，最后一句经常没写完" },
  { desc: "爱在心里跟东西说话（跟鱼竿、跟月亮、跟没吃完的鱼糕）", tags: ["独", "内向", "爱幻想"] },
];

/** 每猫固定声线：自称 + 口癖。同一只猫永远返回同一组合。 */
export function voiceFor(cat: VoiceCat): { selfRef: string; quirk: string } {
  const rng = mulberry32(hashSeed("voice", cat.id));
  // 自称：大多数猫用「我」（全岛都怪腔会腻），约 1/5 的猫用名字自称（秃秃式「菇的帽子在飘」）；长名字不适合当自称
  const selfRef = rng() < 0.2 && cat.name.length <= 3 ? cat.name : "我";
  // 口癖：性格标签命中的优先，否则全池
  const matched = QUIRKS.filter((q) => q.tags?.some((t) => cat.personaTags.some((p) => p.includes(t) || t.includes(p))));
  const quirk = pick(rng, matched.length > 0 ? matched : QUIRKS).desc;
  return { selfRef, quirk };
}

/** 拼给提示词的一行说话习惯约束 */
export function voiceLine(cat: VoiceCat): string {
  const v = voiceFor(cat);
  const refPart = v.selfRef === "我" ? "" : `自称「${v.selfRef}」（不用"我"）；`;
  return `你的说话习惯（每篇自然体现一两处，不要刻意堆砌）：${refPart}${v.quirk}。`;
}
