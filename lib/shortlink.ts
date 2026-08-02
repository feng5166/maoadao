// 站内短链:微信里的深链太长(HMAC 令牌 ~150 字符),压成 SITE_URL/s/{7位码}。
// 只存站内相对路径(以 / 开头),/s 路由跳转前再校验一次——不做开放跳转器。

import { randomBytes } from "node:crypto";
import { prisma } from "./db";
import { SITE_URL } from "./site";

const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";

function makeCode(len = 7): string {
  return Array.from(randomBytes(len))
    .map((b) => ALPHABET[b % ALPHABET.length])
    .join("");
}

/** 建短链并返回完整短地址。target 必须是站内相对路径。 */
export async function createShortLink(target: string, ttlMs?: number): Promise<string> {
  if (!target.startsWith("/")) throw new Error("短链只收站内相对路径");
  for (let i = 0; i < 5; i++) {
    const code = makeCode();
    try {
      await prisma.shortLink.create({
        data: { code, target, expiresAt: ttlMs ? new Date(Date.now() + ttlMs) : null, createdAt: new Date() },
      });
      return `${SITE_URL}/s/${code}`;
    } catch {
      // 撞码重试
    }
  }
  // 极小概率连撞:退回长链,不阻塞发消息
  return `${SITE_URL}${target}`;
}
