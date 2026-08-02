// openclaw 微信网关客户端(doc/11 §八):哑管道——出站只发叙事层产物,入站原样回传。
// openclaw 侧必须关闭自带的 LLM 自动回复;任何一句猫的话都不允许由通道层生成。
//
// 环境变量(未配齐 = 通道整体关闭,所有 UI 入口隐藏):
//   OPENCLAW_API_URL        发送接口,POST JSON { to, message }
//   OPENCLAW_TOKEN          Bearer 鉴权
//   OPENCLAW_WEBHOOK_SECRET 入站 webhook 校验(x-openclaw-secret 头)
//   WECHAT_QR_URL           绑定二维码图片地址(可选,缺省显示联系名)
//   WECHAT_CONTACT_NAME     微信号搜索名(可选)

export function wechatEnabled(): boolean {
  return Boolean(process.env.OPENCLAW_API_URL && process.env.OPENCLAW_TOKEN);
}

export interface SendResult {
  ok: boolean;
  detail?: string;
}

/** 发一条文本给指定 wxid。失败不抛——由调用方按 OutboundMessage 状态机处理。 */
export async function sendWechat(externalId: string, text: string): Promise<SendResult> {
  if (!wechatEnabled()) return { ok: false, detail: "channel_disabled" };
  try {
    const res = await fetch(process.env.OPENCLAW_API_URL!, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${process.env.OPENCLAW_TOKEN}`,
      },
      body: JSON.stringify({ to: externalId, message: text }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { ok: false, detail: `http_${res.status}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message.slice(0, 120) : "unknown" };
  }
}

/** 入站 webhook 鉴权 */
export function verifyWebhookSecret(req: Request): boolean {
  const secret = process.env.OPENCLAW_WEBHOOK_SECRET;
  if (!secret) return false;
  return req.headers.get("x-openclaw-secret") === secret;
}
