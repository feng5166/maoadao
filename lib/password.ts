// 密码哈希:node 内置 scrypt(零依赖,serverless 友好)。
// 参数 N=2^15(32MiB), r=8, p=1——交互式登录的强度/延迟折中(~50ms)。
// 格式:scrypt$<logN>$<r>$<p>$<saltB64>$<hashB64>,参数写进存储,未来升级可平滑迁移。
// 策略(NIST SP800-63B 风格):只限最短长度,允许空格/中文/任意 Unicode,不搞组合规则,不静默截断。

import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const LOG_N = 15;
const R = 8;
const P = 1;
const KEYLEN = 32;
const MAX_LEN = 200; // 防 DoS,不是策略

const COMMON = new Set([
  "12345678", "123456789", "1234567890", "password", "password1", "qwertyuiop",
  "11111111", "88888888", "66666666", "abc12345", "asdfghjkl", "qwer1234", "iloveyou",
]);

export function passwordPolicyError(pw: string): string | null {
  if (pw.length < 8) return "密码至少 8 个字符——一句话、一行诗都行,空格和中文也可以";
  if (pw.length > MAX_LEN) return `密码太长了(最多 ${MAX_LEN} 字符)`;
  if (COMMON.has(pw.toLowerCase())) return "这个密码太常见了,换一个只有你知道的";
  return null;
}

export function hashPassword(pw: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(pw, salt, KEYLEN, { N: 1 << LOG_N, r: R, p: P, maxmem: 128 * 1024 * 1024 });
  return `scrypt$${LOG_N}$${R}$${P}$${salt.toString("base64url")}$${hash.toString("base64url")}`;
}

export function verifyPassword(pw: string, stored: string): boolean {
  try {
    const [scheme, logN, r, p, saltB64, hashB64] = stored.split("$");
    if (scheme !== "scrypt") return false;
    const salt = Buffer.from(saltB64, "base64url");
    const expect = Buffer.from(hashB64, "base64url");
    const got = scryptSync(pw, salt, expect.length, {
      N: 1 << Number(logN), r: Number(r), p: Number(p), maxmem: 128 * 1024 * 1024,
    });
    return got.length === expect.length && timingSafeEqual(got, expect);
  } catch {
    return false;
  }
}
