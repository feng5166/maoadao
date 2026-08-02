// 飞书自建应用机器人(参照 stocktell lib/feishu.ts):发文本 DM 给运营者本人。
// 需环境变量:FEISHU_BOT_APP_ID / FEISHU_BOT_APP_SECRET / FEISHU_USER_OPEN_ID
// 未配置则静默跳过,不影响主流程;全程 6s 超时——通知通道挂起不能拖死业务请求。

const FEISHU_TIMEOUT_MS = 6000;

async function feishuFetch<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(FEISHU_TIMEOUT_MS) });
  return (await res.json()) as T;
}

export async function sendFeishu(text: string): Promise<{ ok: boolean; error?: string }> {
  const appId = process.env.FEISHU_BOT_APP_ID;
  const appSecret = process.env.FEISHU_BOT_APP_SECRET;
  const openId = process.env.FEISHU_USER_OPEN_ID;
  if (!appId || !appSecret || !openId) return { ok: false, error: "missing-env" };

  try {
    const tokenData = await feishuFetch<{ code: number; tenant_access_token?: string }>(
      "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ app_id: appId, app_secret: appSecret }).toString(),
      },
    );
    if (tokenData.code !== 0 || !tokenData.tenant_access_token) {
      console.error("[feishu] token error:", tokenData.code);
      return { ok: false, error: `token:${tokenData.code}` };
    }
    const sendData = await feishuFetch<{ code: number; msg?: string }>(
      "https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=open_id",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${tokenData.tenant_access_token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({ receive_id: openId, msg_type: "text", content: JSON.stringify({ text }) }),
      },
    );
    if (sendData.code !== 0) {
      console.error("[feishu] send error:", sendData.code, sendData.msg);
      return { ok: false, error: `send:${sendData.code}` };
    }
    return { ok: true };
  } catch (e) {
    console.error("[feishu] exception:", e instanceof Error ? e.message.slice(0, 120) : e);
    return { ok: false, error: "exception" };
  }
}
