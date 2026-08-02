// 猫啊岛微信桥客户端(iLink,doc/11 §八):对接 wechat-bridge/server.mjs。
// 桥是明文 HTTP 的单点 VPS——调用必带 10s 超时(stocktell 血泪注释:半死桥会把
// serverless 函数吊死到被平台硬杀 = 静默丢批),失败返回 null/false 交给上层熔断。
//
// 环境变量(未配齐 = 通道整体关闭,所有绑定 UI 自动隐藏):
//   WECHAT_BRIDGE_URL     桥公网地址(nginx 反代后,如 https://bridge.maoadao.com)
//   WECHAT_BRIDGE_SECRET  双向密钥:Vercel 调桥 / 桥回调 Vercel 都走 x-bridge-secret 头

import { timingSafeEqual } from "node:crypto";

const TIMEOUT_MS = 10_000;

export function wechatEnabled(): boolean {
  return Boolean(process.env.WECHAT_BRIDGE_URL && process.env.WECHAT_BRIDGE_SECRET);
}

async function bridgeCall<T>(path: string, body?: unknown): Promise<T | null> {
  if (!wechatEnabled()) return null;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const r = await fetch(`${process.env.WECHAT_BRIDGE_URL!.replace(/\/$/, "")}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-bridge-secret": process.env.WECHAT_BRIDGE_SECRET! },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: ctrl.signal,
    });
    return (await r.json().catch(() => null)) as T;
  } catch (e) {
    console.error("[wechat-bridge] 调桥失败:", path, e instanceof Error ? e.message.slice(0, 120) : e);
    return null;
  } finally {
    clearTimeout(t);
  }
}

export interface SendResult {
  ok: boolean;
  detail?: string;
}

/** 发一条文本(typing=true 时桥先发"正在输入"600ms——猫在想) */
export async function sendWechat(openId: string, text: string, typing = false): Promise<SendResult> {
  const r = await bridgeCall<{ ok?: boolean; ret?: number; http?: number }>("/send", { openId, text, typing });
  if (!r) return { ok: false, detail: "bridge_unreachable" };
  return { ok: !!r.ok, detail: r.ok ? undefined : `ret=${r.ret} http=${r.http}` };
}

/** 给用户出专属绑定二维码(iLink 模型:扫码者即会话对话方,不需要口令) */
export async function startBind(userId: string): Promise<{ qrcode: string; qrImg: string } | null> {
  const r = await bridgeCall<{ ok: boolean; qrcode: string; qrImg: string }>("/bind/start", { userId });
  return r?.ok ? { qrcode: r.qrcode, qrImg: r.qrImg } : null;
}

export type BindState = "pending" | "scanned" | "activated" | "expired";

/** 轮询扫码状态:待扫 → 已扫(等第一句话) → 激活 */
export async function pollBind(qrcode: string): Promise<{ state: BindState; openId: string | null }> {
  const r = await bridgeCall<{ ok: boolean; state: BindState; openId: string | null }>("/bind/poll", { qrcode });
  return r?.ok ? { state: r.state, openId: r.openId } : { state: "expired", openId: null };
}

/** 桥回调鉴权(常量时间比较) */
export function verifyBridgeSecret(req: Request): boolean {
  const secret = process.env.WECHAT_BRIDGE_SECRET;
  const got = req.headers.get("x-bridge-secret");
  if (!secret || !got) return false;
  const a = Buffer.from(got);
  const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
