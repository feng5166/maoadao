import Anthropic from "@anthropic-ai/sdk";
import type { Fact, SimCat } from "../sim/types";
import { SEGMENT_CN } from "../sim/types";
import { factSummary } from "../sim/engine";
import { FORM_RULES, THEME_NARRATION_RULES, type ContentForm, type WeekTheme } from "../sim/firstweek";
import { voiceLine } from "./voice";

const client = new Anthropic();
const MODEL = process.env.NARRATOR_MODEL ?? "claude-opus-4-8";
// 拒答兜底（fallbacks）是官方 Claude API 上 Fable 5 的特性；走中转或其他模型时用普通调用
const useFallbacks = MODEL === "claude-fable-5" && !process.env.ANTHROPIC_BASE_URL;

async function callLLM(system: string, user: string, maxTokens = 400): Promise<string | null> {
  try {
    const base = {
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user" as const, content: user }],
    };
    const response = useFallbacks
      ? await client.beta.messages.create({ ...base, betas: ["server-side-fallback-2026-06-01"], fallbacks: [{ model: "claude-opus-4-8" }] })
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
2. 第一人称，60-120 字，口语化，符合你的性格。
3. 「今天最重要的事」是重心，其他事一笔带过或干脆不提。
4. 「你记得的事」可以产生连续感，但不能当成今天发生的事写。
5. 像真的日记，不像文章：允许半句话、没解释的细节、突然停住的想法；不必起承转合，不要每篇都有工整的结尾和感悟。大多数日子就是普通日子，把普通写得具体就好。
6. 禁止出现"系统""建议""事件""进度"这类词。
7. 直接输出日记正文，不要标题、日期或任何额外说明。`;

  const user = `你的资料：
名字：${input.cat.name}
性格：${input.cat.personaTags.join("、")}
${voiceLine(input.cat)}
今天是猫啊岛的第 ${input.day} 天，${input.season}天，天气${input.weather}，你现在的心情：${input.mood}
${relationBlock}
今日事实：
${factLines}
${memoryBlock}${ownerBlock}`;

  const text = await callLLM(system, user);
  if (!text) {
    return {
      content: `今天${input.cat.name}没来得及写日记，不过它这一天是这么过的：\n${factLines}`,
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
  const system = `你是猫啊岛上的一只猫，性格：${cat.personaTags.join("、")}。${voiceLine(cat)}根据你最近的经历，总结一条你对生活/朋友/自己的新认识。要求：第一人称、30 字以内、像猫会有的朴素感悟、必须基于经历不能编造。直接输出这一句话。`;
  return callLLM(system, `你最近的经历：\n${recentMemories.map((m) => `- ${m}`).join("\n")}`, 100);
}

export interface OwnerDayInput extends DiaryInput {
  ownerNick?: string; // 猫怎么称呼主人
  suggestion?: { label: string; followed: boolean } | null; // 今天消费的主人建议 + 是否有行动采纳
  activeThreads: { label: string; step: number; total?: number }[];
  weekTheme?: WeekTheme; // 首周节奏主题（进提示词的硬要求）
  form?: ContentForm; // 内容形态：diary | dialogue | note
  bondLine?: string; // 主人关系阶段的自然语言（供语气参考）
}

export interface OwnerDaySummary {
  headline: string;
  narrative: string;
  interventionResponse: string | null;
  tomorrowHook: string | null;
}

/** 主人猫的一天：一次调用产出 标题/日记/建议回执/明日悬念（结构化 JSON） */
export async function narrateOwnerDay(input: OwnerDayInput): Promise<{ summary: OwnerDaySummary; generatedBy: "llm" | "fallback" }> {
  const factLines = input.facts
    .map((f) => `- [${SEGMENT_CN[f.segment]}] ${factSummary(f, input.catById)}${f === input.mainFact ? "（今天最重要的事）" : ""}`)
    .join("\n");
  const memoryBlock = input.memories.length ? `\n你记得的事：\n${input.memories.map((m) => `- ${m}`).join("\n")}` : "";
  const nick = input.ownerNick || "主人";
  const suggestionBlock = input.suggestion
    ? `\n${nick}昨天建议你「${input.suggestion.label}」，从今天的事实看你${input.suggestion.followed ? "照做了" : "没有照做（猫有自己的主意）"}。`
    : "";
  const ownerBlock = input.ownerMessage
    ? `\n${nick}今天给你留了话：「${input.ownerMessage}」——在日记里自然地回应。`
    : input.ownerVisited
      ? `\n${nick}今天来看过你、留了悄悄话——可以提到${nick}来过、心里暖暖的，但不要编内容。`
      : "";
  const threadBlock = input.activeThreads.length
    ? `\n你正在经历的事：${input.activeThreads.map((t) => `${t.label}（第 ${t.step}${t.total ? `/${t.total}` : ""} 步）`).join("；")}`
    : "";

  const system = `你是猫啊岛上的一只猫。根据今天的事实，输出严格的 JSON（不要多余文字），字段：
{
  "headline": "今日标题，10 字内，像日记本上随手写的一行，不要'第N集'式命名",
  "narrative": "第一人称日记，80-150 字；以「今天最重要的事」为重心；只能基于事实绝不编造。像真的日记不像文章：允许半句话、没解释的细节、突然停住的想法（'……先别告诉他。'这种）；不要每篇都有工整结尾和人生感悟，普通的日子就把普通写具体",
  "interventionResponse": ${input.suggestion ? `"用你自己的话回应${nick}昨天说的（第二人称，像'你让我去交个朋友。我本来没想听的，不过棉花带我去吃了烤鱼'）。禁止'建议''采纳''影响'这类词"` : "null"},
  "tomorrowHook": "给${nick}留的一句念想：基于还没完的事（没讲完的故事/今天留下的疑问），像随口说的，不要刻意钩子腔。实在没有就写一句对明天的小盼头"
}
全程禁止出现：系统、建议、事件线、进度、根据你的、由于它的性格。
${input.weekTheme && THEME_NARRATION_RULES[input.weekTheme] ? `今天的写法要求：${THEME_NARRATION_RULES[input.weekTheme]}` : ""}
${input.form && FORM_RULES[input.form] ? FORM_RULES[input.form] : ""}
${input.bondLine ? `你和${nick}现在的关系：${input.bondLine}用相称的语气。` : ""}`;

  const user = `你的资料：名字 ${input.cat.name}，性格 ${input.cat.personaTags.join("、")}，你叫主人「${nick}」
${voiceLine(input.cat)}
今天是猫啊岛第 ${input.day} 天，${input.weather}，你的心情：${input.mood}
今日事实：
${factLines}
${suggestionBlock}${ownerBlock}${threadBlock}${memoryBlock}`;

  const text = await callLLM(system, user, 600);
  if (text) {
    try {
      const jsonStr = text.replace(/^```json?\s*/i, "").replace(/```\s*$/, "");
      const parsed = JSON.parse(jsonStr) as OwnerDaySummary;
      if (parsed.narrative && parsed.headline) {
        return { summary: { ...parsed, interventionResponse: parsed.interventionResponse || null, tomorrowHook: parsed.tomorrowHook || null }, generatedBy: "llm" };
      }
    } catch {
      // fall through
    }
  }
  return {
    summary: {
      headline: `第 ${input.day} 天`,
      narrative: `第 ${input.day} 天，天气${input.weather}。今天：\n${factLines}`,
      interventionResponse: input.suggestion ? `你建议「${input.suggestion.label}」，它${input.suggestion.followed ? "照做了" : "这次没听"}。` : null,
      tomorrowHook: input.activeThreads.length ? `${input.activeThreads[0].label}还在继续。` : null,
    },
    generatedBy: "fallback",
  };
}

export interface WeekBookInput {
  cat: SimCat;
  ownerNick?: string;
  visitDays: number;
  messageCount: number;
  weekSummaries: { day: number; headline: string; narrative: string }[];
  bestFriendName: string | null;
  keepsakes: string[];
  suggestionStory: string | null; // 建议被采纳/拒绝的代表事件素材
}

export interface WeekBookContent {
  topMoments: string[]; // 本周最重要的 3 件事（各一句）
  catLine: string; // 猫对主人的个性化总结
  nextWeekWish: string; // 下周想做的事（钩子）
}

/** 第一周纪念册：一次调用产出结构化内容 */
export async function narrateWeekBook(input: WeekBookInput): Promise<{ content: WeekBookContent; generatedBy: "llm" | "fallback" }> {
  const nick = input.ownerNick || "主人";
  const system = `你是猫啊岛上的一只猫，性格：${input.cat.personaTags.join("、")}。${voiceLine(input.cat)}回顾你来岛的第一周，输出严格 JSON：
{
  "topMoments": ["本周最难忘的 3 件事，各一句话，第一人称，必须来自提供的真实经历"],
  "catLine": "对${nick}说的一句总结：个性化、有性格，能体现你们这一周的相处（比如'你总让我小心一点。虽然我不一定都听，但我知道你不是觉得我胆小'）",
  "nextWeekWish": "下周想做的一件事：基于没做完的事，一句话"
}
禁止：系统词、空泛抒情。`;
  const user = `这一周${nick}来看过你 ${input.visitDays} 次，给你留过 ${input.messageCount} 句话。
${input.suggestionStory ? `关于${nick}的建议：${input.suggestionStory}` : ""}
${input.bestFriendName ? `这周你和${input.bestFriendName}走得最近。` : ""}
你的一周：
${input.weekSummaries.map((s2) => `第${s2.day}天「${s2.headline}」：${s2.narrative.slice(0, 60)}…`).join("\n")}
纪念物：${input.keepsakes.join("、") || "无"}`;

  const text = await callLLM(system, user, 500);
  if (text) {
    try {
      const parsed = JSON.parse(text.replace(/^```json?\s*/i, "").replace(/```\s*$/, "")) as WeekBookContent;
      if (parsed.topMoments?.length && parsed.catLine) return { content: parsed, generatedBy: "llm" };
    } catch {
      // fall through
    }
  }
  return {
    content: {
      topMoments: input.weekSummaries.slice(0, 3).map((s2) => s2.headline),
      catLine: `${nick}，这一周谢谢你来看我。`,
      nextWeekWish: "下周想去更远的地方看看。",
    },
    generatedBy: "fallback",
  };
}
