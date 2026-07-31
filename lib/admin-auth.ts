"use server";

import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

// 后台鉴权：密钥只在登录表单 POST 一次，之后凭 httpOnly 签名会话 cookie（12 小时）。
// 密钥绝不出现在 URL（避免浏览器历史/日志/Referer 泄漏）。

const COOKIE = "maoadao_admin";
const TTL = 60 * 60 * 12;

function sessionToken(): string {
  const secret = process.env.AUTH_SECRET ?? "dev-secret";
  const key = process.env.ADMIN_KEY ?? "";
  return createHmac("sha256", secret).update(`admin:${key}`).digest("hex");
}

export async function isAdmin(): Promise<boolean> {
  if (!process.env.ADMIN_KEY) return false;
  const jar = await cookies();
  const got = jar.get(COOKIE)?.value;
  if (!got) return false;
  const expect = sessionToken();
  const a = Buffer.from(got);
  const b = Buffer.from(expect);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function adminLogin(formData: FormData) {
  const key = String(formData.get("key") ?? "");
  const expect = process.env.ADMIN_KEY ?? "";
  const a = Buffer.from(key);
  const b = Buffer.from(expect);
  if (!expect || a.length !== b.length || !timingSafeEqual(a, b)) {
    throw new Error("密钥不对");
  }
  const jar = await cookies();
  jar.set(COOKIE, sessionToken(), { httpOnly: true, sameSite: "strict", secure: true, maxAge: TTL, path: "/admin" });
  redirect("/admin");
}
