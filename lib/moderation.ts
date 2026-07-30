import Anthropic from "@anthropic-ai/sdk";

// 用户输入审核：LLM 主审（便宜的 haiku）+ 词表兜底。
// 审核对象：创建猫的名字/外形/故事/标签、主人留言。

const client = new Anthropic();
const MODERATION_MODEL = process.env.MODERATION_MODEL ?? "claude-haiku-4-5-20251001";

// 最小兜底词表：LLM 不可用时的硬拦截
const BLOCKLIST = ["习近平", "共产党", "法轮", "porn", "fuck", "操你", "傻逼", "身份证号", "银行卡号"];

export async function moderateTexts(texts: string[]): Promise<{ ok: boolean; reason?: string }> {
  const combined = texts.filter(Boolean).join("\n");
  if (!combined.trim()) return { ok: true };

  for (const w of BLOCKLIST) {
    if (combined.toLowerCase().includes(w.toLowerCase())) {
      return { ok: false, reason: "内容包含不适合展示的词语" };
    }
  }

  try {
    const response = await client.messages.create({
      model: MODERATION_MODEL,
      max_tokens: 50,
      system:
        "你是内容审核员。判断用户输入是否包含：政治敏感、色情、暴力、辱骂、真实个人隐私信息（电话/住址/证件号）、广告导流。只回答 PASS 或 BLOCK:原因（10字内）。拿不准时回答 PASS。",
      messages: [{ role: "user", content: combined.slice(0, 500) }],
    });
    if (response.stop_reason === "refusal") return { ok: false, reason: "内容未通过审核" };
    const text = response.content.find((b) => b.type === "text")?.text.trim() ?? "PASS";
    if (text.startsWith("BLOCK")) {
      return { ok: false, reason: text.split(":")[1]?.trim() || "内容未通过审核" };
    }
    return { ok: true };
  } catch (err) {
    // LLM 挂了不拦好人：词表已兜底，放行
    console.error("[moderation] LLM 审核失败，词表兜底放行:", err instanceof Error ? err.message.slice(0, 120) : err);
    return { ok: true };
  }
}
