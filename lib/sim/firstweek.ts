// 首周体验导演（v0.8）：不写死每个人的故事，只约束七天的节奏骨架。
// 猫的"来岛第几天"（catDay）驱动：主题、内容形态、权重约束、必须发生的拍点。

export type WeekTheme = "相遇" | "记住" | "意外" | "关系" | "冲突" | "选择" | "回顾" | "日常";
export type ContentForm = "diary" | "dialogue" | "note" | "weekbook";

export interface FirstWeekPlan {
  catDay: number;
  theme: WeekTheme;
  form: ContentForm;
  /** 主人建议权重乘数（D3 刻意压低制造温和偏离） */
  suggestionMultiplier: number;
  /** 是否聚焦头号 NPC（D4 关系日：串门权重加成并偏向他） */
  focusTopNpc: boolean;
  /** 冲突倾向（D5：拌嘴/借钱权重加成） */
  conflictBoost: number;
}

const THEMES: WeekTheme[] = ["相遇", "记住", "意外", "关系", "冲突", "选择", "回顾"];
const FORMS: ContentForm[] = ["diary", "diary", "dialogue", "note", "diary", "dialogue", "weekbook"];

export function firstWeekPlan(catDay: number): FirstWeekPlan | null {
  if (catDay < 1 || catDay > 7) return null;
  return {
    catDay,
    theme: THEMES[catDay - 1],
    form: FORMS[catDay - 1],
    suggestionMultiplier: catDay === 3 ? 0.2 : 3, // D3：能影响，不能控制
    focusTopNpc: catDay === 4,
    conflictBoost: catDay === 5 ? 2.5 : 1,
  };
}

/** 各主题给叙事层的硬要求（进提示词） */
export const THEME_NARRATION_RULES: Record<WeekTheme, string> = {
  相遇: "这是它来岛第一天：写出初来乍到的新鲜和一点不安，明确提到迎接它的猫和门口的旧钥匙。",
  记住: "今天必须兑现记忆：至少做到一件——引用主人昨天留下的话、回应主人的建议（听了或没听都要说清）、用主人的称呼、或提到第一天捡到的旧钥匙。结尾可以带一句：它开始记住主人说话的方式了。",
  意外: "今天它没有完全按主人说的做（或计划被打断）：要写清它自己的理由（性格使然），并且偏离必须带来一个值得看的收获或相遇——不是惩罚。",
  关系: "今天聚焦它和一只猫的关系变深：第二次见面、提到早前的共同经历、称呼发生变化。日记结尾让它主动问主人一个和'朋友'有关的小问题。",
  冲突: "今天出了岔子（丢东西/被拒/闹别扭）：写情绪反应，但留出挽回空间，结尾抛出该怎么办的悬念。",
  选择: "今天要兑现主人昨天的选择，但结果=主人的选择×它自己的性格：写清'它为什么这样做'，比如'它记得你让它谨慎一点，但它还是没忍住'。",
  回顾: "今天回头看这一周：挑一两件最难忘的事说说，语气像一起生活了一周的家人。",
  日常: "",
};

/** 各形态的输出格式要求（进提示词） */
export const FORM_RULES: Record<ContentForm, string> = {
  diary: "输出普通第一人称日记。",
  dialogue: "narrative 字段改为写成对话片段：3-6 行对白，每行格式「名字：说的话」，可穿插一行旁白（用括号）。对白要口语、简短、有性格。",
  note: "narrative 字段改为写成它贴在门上留给主人的便条：更短（60-100 字），像随手写的，可以有涂改的痕迹（用'（划掉）'表示），落款是它的名字。",
  weekbook: "",
};

/** 主人关系四阶段：非数值，自然语言，不因缺席惩罚 */
export function bondStage(catDay: number, nudgeCount: number, visitDays: number): { stage: number; line: string } {
  if (catDay >= 7 && nudgeCount >= 4 && visitDays >= 4) return { stage: 4, line: "你已经成为它在岛上生活的一部分。" };
  if (catDay >= 4 && nudgeCount >= 3) return { stage: 3, line: "遇到事情的时候，它会先想到你。" };
  if (catDay >= 2 && nudgeCount >= 1) return { stage: 2, line: "它开始期待你留下的话。" };
  return { stage: 1, line: "它知道你是来接它的人。" };
}
