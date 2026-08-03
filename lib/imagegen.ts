// 生图客户端（seedream via modelverse 中转，OpenAI 兼容）：立绘与场景共用这一条通道。
// 铁律：watermark 永远 false——默认值是 true，会在右下角烙半透明"AI生成"，直接违反去 AI 化（doc/05）。
// response_format 固定 b64_json：url 形式 24 小时过期，还要多一次下载往返。

type GenerateImageOptions = {
  prompt: string;
  /** "2048x2048" 这类像素值，或 "2K"/"4K" 档位 */
  size?: string;
  /** 参考图（最多 14 张）：Buffer 会按 mime 转成 data URI；string 视为 URL 或现成的 data URI 直接透传 */
  referenceImages?: { data: Buffer; mime: string }[] | string[];
  model?: string;
  timeoutMs?: number;
};

const DEFAULT_MODEL = "doubao-seedream-4.5";
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 2000;

export function toDataUri(data: Buffer, mime: string): string {
  return `data:${mime};base64,${data.toString("base64")}`;
}

/** 生成一张图，返回原始字节；失败返回 null（内部已重试并打日志，调用方不必再包 try）。 */
export async function generateImage(opts: GenerateImageOptions): Promise<Buffer | null> {
  const base = process.env.IMAGE_API_BASE ?? "https://api.modelverse.cn";
  const key = process.env.IMAGE_API_KEY;
  if (!key) {
    console.error("[imagegen] 缺少 IMAGE_API_KEY，跳过生成");
    return null;
  }

  const images = (opts.referenceImages ?? []).map((r) =>
    typeof r === "string" ? r : toDataUri(r.data, r.mime),
  );
  const body = JSON.stringify({
    model: opts.model ?? process.env.PORTRAIT_MODEL ?? DEFAULT_MODEL,
    prompt: opts.prompt,
    size: opts.size ?? "2048x2048",
    n: 1,
    ...(images.length > 0 ? { images } : {}),
    watermark: false,
    response_format: "b64_json",
  });

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(`${base}/v1/images/generations`, {
        method: "POST",
        headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? 120_000),
      });
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        // 4xx 是请求本身的问题（prompt 违规/参数错），重试无意义；429/5xx 才值得再试
        if (res.status !== 429 && res.status < 500) {
          console.error(`[imagegen] 生成失败 ${res.status}:`, detail);
          return null;
        }
        throw new Error(`HTTP ${res.status}: ${detail}`);
      }
      const json = (await res.json()) as { data?: { url?: string; b64_json?: string }[] };
      const item = json.data?.[0];
      if (item?.b64_json) return Buffer.from(item.b64_json, "base64");
      if (item?.url) {
        // 个别中转实现忽略 response_format——兜底走 URL 下载
        const imgRes = await fetch(item.url, { signal: AbortSignal.timeout(60_000) });
        if (!imgRes.ok) throw new Error(`下载图片失败 ${imgRes.status}`);
        return Buffer.from(await imgRes.arrayBuffer());
      }
      console.error("[imagegen] 响应里没有图片:", JSON.stringify(json).slice(0, 200));
      return null;
    } catch (err) {
      const msg = err instanceof Error ? err.message.slice(0, 200) : String(err);
      if (attempt === MAX_ATTEMPTS) {
        console.error(`[imagegen] 生成异常（已试 ${attempt} 次）:`, msg);
        return null;
      }
      console.warn(`[imagegen] 第 ${attempt} 次失败，${RETRY_DELAY_MS}ms 后重试:`, msg);
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
    }
  }
  return null;
}
