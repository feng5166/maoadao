"use server";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// 后台鉴权：密钥只在登录表单 POST 一次，换 12 小时带过期时间的签名会话。
// token = base64url(payload{iat,exp,nonce}) . HMAC —— 被窃取的 token 过期即失效。

const COOKIE = "maoadao_admin";
const TTL_MS = 12 * 3600_000;

function secret(): string | null {
  const s = process.env.AUTH_SECRET;
  if (s) return s;
  // 生产环境缺 AUTH_SECRET 直接拒绝，绝不退回公开默认值
  return process.env.NODE_ENV === "production" ? null : "dev-secret";
}

function sign(payload: string, key: string): string {
  return createHmac("sha256", key).update(payload).digest("base64url");
}

export async function isAdmin(): Promise<boolean> {
  const key = secret();
  if (!key || !process.env.ADMIN_KEY) return false;
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return false;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return false;
  const payload = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expect = sign(payload, key);
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString()) as { exp?: number };
    return typeof data.exp === "number" && Date.now() < data.exp;
  } catch {
    return false;
  }
}

export async function adminLogin(formData: FormData) {
  const key = secret();
  if (!key) throw new Error("服务端未配置 AUTH_SECRET，拒绝登录");
  const input = String(formData.get("key") ?? "");
  const expect = process.env.ADMIN_KEY ?? "";
  const a = Buffer.from(input);
  const b = Buffer.from(expect);
  if (!expect || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("密钥不对");
  }
  const payload = Buffer.from(
    JSON.stringify({ iat: Date.now(), exp: Date.now() + TTL_MS, nonce: randomBytes(8).toString("hex") }),
  ).toString("base64url");
  const jar = await cookies();
  jar.set(COOKIE, `${payload}.${sign(payload, key)}`, {
    httpOnly: true,
    sameSite: "strict",
    secure: true,
    maxAge: TTL_MS / 1000,
    path: "/admin",
  });
  redirect("/admin");
}

export async function adminLogout() {
  const jar = await cookies();
  jar.delete("maoadao_admin");
  redirect("/admin");
}
