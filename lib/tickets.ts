import { randomBytes } from "node:crypto";
import type { InviteCode, Prisma } from "@prisma/client";
import { prisma } from "./db";

// 船票：领养成功即发 5 张可转赠的单次票（上岛靠邀请，裂变靠岛民）。
// 发放时机在领养事务内；功能上线前的老岛民由 ensureBoatTickets 首次查看时补发。

export const TICKETS_PER_ISLANDER = 5;

export function makeTicketCode(): string {
  // 12 位随机（~59 bit）：船票兼作成本闸门，空间必须够大
  const alphabet = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
  const body = Array.from(randomBytes(12))
    .map((b) => alphabet[b % alphabet.length])
    .join("");
  return `BOAT-${body.slice(0, 4)}-${body.slice(4, 8)}-${body.slice(8, 12)}`;
}

/** 在领养事务内给新岛民发 5 张船票（createMany 单次往返：跨洋链路下别撑爆事务超时） */
export async function grantBoatTickets(tx: Prisma.TransactionClient, uid: string): Promise<void> {
  await tx.inviteCode.createMany({
    data: Array.from({ length: TICKETS_PER_ISLANDER }, () => ({
      code: makeTicketCode(),
      batch: "islander",
      maxUses: 1,
      issuedTo: uid,
      createdAt: new Date(),
    })),
  });
}

export type TicketLook =
  | { state: "none" }
  /** 有效票：inviter = 寄票岛民的猫名（官方票为 null——没有邀请人就不编一个）。
   *  fromIslander 独立于 inviter：岛民票的寄票人可能已经没有猫，那时报不出名字，
   *  但它仍然是一张岛民票，埋点不能把它算成官方票。 */
  | { state: "valid"; code: string; inviter: string | null; fromIslander: boolean }
  | { state: "spent"; code: string }
  | { state: "unknown" };

/** 首页/深链的船票查验（只读，不消费）：带票来的人和陌生访客是两种人，首屏要认得出。
 *  真正的核销仍在 adoptCat 的事务里（updateMany 条件更新），这里的结果只用于表达。 */
export async function lookupTicket(raw: string | undefined | null): Promise<TicketLook> {
  const code = String(raw ?? "").trim().toUpperCase();
  if (!code) return { state: "none" };
  if (!/^[A-Z0-9-]{4,24}$/.test(code)) return { state: "unknown" };

  const row = await prisma.inviteCode.findUnique({ where: { code } }).catch(() => null);
  if (!row) return { state: "unknown" };
  if (row.disabled || row.usedCount >= row.maxUses) return { state: "spent", code };

  // 谁寄的：岛民票记着 issuedTo，取他猫的名字；官方票没有邀请人，返回 null
  let inviter: string | null = null;
  if (row.issuedTo) {
    const cat = await prisma.cat.findFirst({ where: { ownerId: row.issuedTo }, select: { name: true } }).catch(() => null);
    inviter = cat?.name ?? null;
  }
  return { state: "valid", code, inviter, fromIslander: Boolean(row.issuedTo) };
}

/** 读取岛民的船票；老岛民（发票功能上线前领养）第一次查看时补发 */
export async function ensureBoatTickets(uid: string): Promise<InviteCode[]> {
  const cat = await prisma.cat.findFirst({ where: { ownerId: uid }, select: { id: true } });
  if (!cat) return [];

  const existing = await prisma.inviteCode.findMany({ where: { issuedTo: uid }, orderBy: { code: "asc" } });
  if (existing.length > 0) return existing;

  // Serializable 防并发双发；输家吞掉冲突后统一重读
  await prisma
    .$transaction(
      async (tx) => {
        if ((await tx.inviteCode.count({ where: { issuedTo: uid } })) > 0) return;
        await grantBoatTickets(tx, uid);
      },
      { isolationLevel: "Serializable" },
    )
    .catch(() => {});

  return prisma.inviteCode.findMany({ where: { issuedTo: uid }, orderBy: { code: "asc" } });
}
