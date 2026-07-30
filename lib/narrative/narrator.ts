import Anthropic from "@anthropic-ai/sdk";
import type { SimCat, SimEvent } from "../sim/types";

const client = new Anthropic();

export interface DiaryInput {
  cat: SimCat;
  day: number;
  season: string;
  weather: string;
  mood: string;
  events: SimEvent[];
}

// 事实先转成中文短句，LLM 只允许基于这些短句叙事，杜绝自由编造
function eventToFact(ev: SimEvent, catName: string): string {
  const d = ev.data;
  switch (ev.type) {
    case "fish":
      return `去${d.location}钓鱼，钓到 ${d.catchCount} 条，赚了 ${ev.deltas.coins ?? 0} 鱼币`;
    case "shop_day": {
      const rev = Number(d.revenue);
      return `照看自己的「${d.shopName}」（开业第 ${d.daysOpen} 天），今天${rev >= 0 ? `赚了 ${rev}` : `亏了 ${-rev}`} 鱼币`;
    }
    case "shop_open":
      return `花 ${d.cost} 鱼币开了一家新店「${d.shopName}」`;
    case "shop_close":
      return `把「${d.shopName}」关掉了，总共亏了 ${-Number(d.totalProfit)} 鱼币`;
    case "visit":
      return `去找${d.targetName}玩，${d.wentWell ? "聊得很开心" : "闹得不太愉快"}`;
    case "explore":
      return d.found ? `去${d.location}探险，捡到了${d.found}` : `去${d.location}探险，什么也没找到`;
    case "rest":
      return `在${d.location}睡了一整个下午`;
    default:
      return `${catName}做了一件事：${JSON.stringify(d)}`;
  }
}

export async function narrateDiary(input: DiaryInput): Promise<{ content: string; generatedBy: "llm" | "fallback" }> {
  const facts = input.events.map((ev) => `- ${eventToFact(ev, input.cat.name)}`).join("\n");

  const system = `你是猫啊岛上的一只猫，正在写自己的日记。规则：
1. 只能基于「今日事实」写，绝对不能编造事实里没有的事件、角色或数字。
2. 第一人称，100 字左右的中文，口语化，符合你的性格。
3. 可以有情绪、吐槽和小心思，但情节必须与事实一一对应。
4. 直接输出日记正文，不要标题、日期或任何额外说明。`;

  const user = `你的资料：
名字：${input.cat.name}
性格：${input.cat.personaTags.join("、")}
今天是猫啊岛的第 ${input.day} 天，${input.season}天，天气${input.weather}，你现在的心情：${input.mood}

今日事实：
${facts}`;

  try {
    const response = await client.beta.messages.create({
      model: "claude-opus-5",
      max_tokens: 400,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      system,
      messages: [{ role: "user", content: user }],
    });

    if (response.stop_reason === "refusal") {
      return { content: fallbackDiary(input, facts), generatedBy: "fallback" };
    }
    const text = response.content.find((b) => b.type === "text")?.text.trim();
    if (!text) return { content: fallbackDiary(input, facts), generatedBy: "fallback" };
    return { content: text, generatedBy: "llm" };
  } catch (err) {
    console.error(`[narrator] ${input.cat.name} day ${input.day} 叙事失败:`, err);
    return { content: fallbackDiary(input, facts), generatedBy: "fallback" };
  }
}

// LLM 不可用时的兜底：直接罗列事实，保证日记链不断
function fallbackDiary(input: DiaryInput, facts: string): string {
  return `第 ${input.day} 天，天气${input.weather}。今天：\n${facts}`;
}
