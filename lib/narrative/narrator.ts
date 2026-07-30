import Anthropic from "@anthropic-ai/sdk";
import type { Fact, SimCat } from "../sim/types";
import { SEGMENT_CN } from "../sim/types";
import { factSummary } from "../sim/engine";

const client = new Anthropic();
const MODEL = process.env.NARRATOR_MODEL ?? "claude-opus-5";
// 拒答兜底（fallbacks）是官方 Claude API 上 opus-5 的特性；走中转或其他模型时用普通调用
const useFallbacks = MODEL === "claude-opus-5" && !process.env.ANTHROPIC_BASE_URL;

async function callLLM(system: string, user: string, maxTokens = 400): Promise<string | null> {
  try {
    const base = {
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user" as const, content: user }],
    };
    const response = useFallbacks
      ? await client.beta.messages.create({ ...base, betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" })
      : await client.messages.create(base);
    if (response.stop_reason === "refusal") return null;
    return response.content.find((b) => b.type === "text")?.text.trim() ?? null;
  } catch (err) {
    console.error("[narrator] LLM 调用失败:", err instanceof Error ? err.message.slice(0, 200) : err);
    return null;
  }
}

export interface DiaryInput {
  cat: SimCat;
  day: number;
  season: string;
  weather: string;
  mood: string;
  facts: Fact[]; // 当日全部事实（按时段有序）
  mainFact?: Fact; // 导演选出的主事件
  memories: string[]; // 检索出的历史记忆（已按重要性排序）
  relationHints: string[]; // 如 "和老怪是好朋友（好感 52）"
  ownerMessage?: string; // 主人今天的留言（已允许公开才会传入）
  ownerVisited?: boolean; // 主人来看过但留言不公开：只提"主人来过"，不引用内容
  catById: Map<string, { name: string }>;
}

export async function narrateDiary(input: DiaryInput): Promise<{ content: string; generatedBy: "llm" | "fallback" }> {
  const factLines = input.facts
    .map((f) => `- [${SEGMENT_CN[f.segment]}] ${factSummary(f, input.catById)}${f === input.mainFact ? "（今天最重要的事）" : ""}`)
    .join("\n");
  const memoryBlock = input.memories.length ? `\n你记得的事（可以自然地联系起来，但别逐条罗列）：\n${input.memories.map((m) => `- ${m}`).join("\n")}` : "";
  const ownerBlock = input.ownerMessage
    ? `\n主人今天给你留了话：「${input.ownerMessage}」——在日记里自然地回应一下主人。`
    : input.ownerVisited
      ? "\n主人今天来看过你、给你留了悄悄话——日记里可以提到主人来过、心里暖暖的，但不要编造留言内容。"
      : "";
  const relationBlock = input.relationHints.length ? `\n你的关系：${input.relationHints.join("；")}` : "";

  const system = `你是猫啊岛上的一只猫，正在写自己的日记。规则：
1. 只能基于「今日事实」写，绝对不能编造事实里没有的事件、角色或数字。
2. 第一人称，120 字左右的中文，口语化，符合你的性格。
3. 「今天最重要的事」要作为日记的重心，其他事一笔带过或不提。
4. 「你记得的事」是你的记忆，可以用来产生连续感（比如提到昨天的事、和某只猫的过节），但不能当成今天发生的事写。
5. 直接输出日记正文，不要标题、日期或任何额外说明。`;

  const user = `你的资料：
名字：${input.cat.name}
性格：${input.cat.personaTags.join("、")}
今天是猫啊岛的第 ${input.day} 天，${input.season}天，天气${input.weather}，你现在的心情：${input.mood}
${relationBlock}
今日事实：
${factLines}
${memoryBlock}${ownerBlock}`;

  const text = await callLLM(system, user);
  if (!text) {
    return {
      content: `第 ${input.day} 天，天气${input.weather}。今天：\n${factLines}`,
      generatedBy: "fallback",
    };
  }
  return { content: text, generatedBy: "llm" };
}

export interface NewsInput {
  day: number;
  items: { catName: string; summary: string }[];
  catById: Map<string, { name: string }>;
}

/** 岛屿动态：《猫啊岛日报》口吻，一次调用生成全部条目 */
export async function narrateIslandNews(input: NewsInput): Promise<string[]> {
  if (input.items.length === 0) return [];
  const factLines = input.items.map((x, i) => `${i + 1}. ${x.catName}：${x.summary}`).join("\n");
  const system = `你是《猫啊岛日报》的编辑小梅（一只爱八卦的三花猫）。把每条事实改写成一句 30 字以内的岛屿动态，像小报标题一样有趣但不夸大事实。规则：
1. 严格基于事实，不编造。
2. 每条一行，行首不带序号或符号。
3. 输出行数与输入条数一致。`;
  const text = await callLLM(system, `第 ${input.day} 天的岛屿见闻：\n${factLines}`, 300);
  if (!text) return input.items.map((x) => `${x.catName}${x.summary}`);
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines.slice(0, input.items.length) : input.items.map((x) => `${x.catName}${x.summary}`);
}

/** 关键节点反思：把近期记忆浓缩成一句长期认知（语义记忆） */
export async function reflect(cat: SimCat, recentMemories: string[]): Promise<string | null> {
  if (recentMemories.length === 0) return null;
  const system = `你是猫啊岛上的一只猫，性格：${cat.personaTags.join("、")}。根据你最近的经历，总结一条你对生活/朋友/自己的新认识。要求：第一人称、30 字以内、像猫会有的朴素感悟、必须基于经历不能编造。直接输出这一句话。`;
  return callLLM(system, `你最近的经历：\n${recentMemories.map((m) => `- ${m}`).join("\n")}`, 100);
}
