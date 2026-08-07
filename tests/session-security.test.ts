import { config } from "dotenv";
config({ path: [".env.local", ".env"], override: true });

import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";

// 2026-08-06 review P1 的回归:凭证换了,旧令牌就必须失效。
// 三条重置路径(改密码/邮件验证码/回岛钥匙)共用 revokeAllSessions,这里直接测它的语义——
// Server Action 本体依赖 cookies()/headers() 请求上下文,单测里不可用。
// 用真库(自清理);跑不到库时整体跳过。
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("密码变更后旧会话失效(review P1)", () => {
  const users: string[] = [];

  afterAll(async () => {
    const { prisma } = await import("../lib/db");
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  });

  async function makeUserWithSessions(n: number) {
    const { prisma } = await import("../lib/db");
    const { hashToken } = await import("../lib/session");
    const uid = `u-sess-test-${randomUUID()}`;
    users.push(uid);
    await prisma.user.create({ data: { id: uid, name: "测试岛民", status: "registered", createdAt: new Date() } });
    const ids: string[] = [];
    for (let i = 0; i < n; i++) {
      const id = randomUUID();
      ids.push(id);
      await prisma.session.create({
        data: { id, userId: uid, tokenHash: hashToken(`token-${id}`), label: `设备${i}`, createdAt: new Date(), lastSeenAt: new Date() },
      });
    }
    return { uid, ids };
  }

  it("全部作废:改密码后所有设备掉线", async () => {
    const { prisma } = await import("../lib/db");
    const { revokeAllSessions } = await import("../lib/session");
    const { uid } = await makeUserWithSessions(3);

    const count = await revokeAllSessions(uid);
    expect(count).toBe(3);
    const alive = await prisma.session.count({ where: { userId: uid, revokedAt: null } });
    expect(alive).toBe(0);
  });

  it("留一个:本机换发后,别处(含被盗令牌)全掉线", async () => {
    const { prisma } = await import("../lib/db");
    const { revokeAllSessions } = await import("../lib/session");
    const { uid, ids } = await makeUserWithSessions(3);
    const keep = ids[0];

    const count = await revokeAllSessions(uid, keep);
    expect(count).toBe(2);
    const alive = await prisma.session.findMany({ where: { userId: uid, revokedAt: null }, select: { id: true } });
    expect(alive.map((s) => s.id)).toEqual([keep]);
  });

  it("作废后的令牌解析不出会话(revokedAt 是硬闸)", async () => {
    const { prisma } = await import("../lib/db");
    const { revokeAllSessions, hashToken } = await import("../lib/session");
    const { uid, ids } = await makeUserWithSessions(1);
    await revokeAllSessions(uid);

    // resolveSession 依赖 cookies(),这里直接验它读的那张表:令牌还在,但已带 revokedAt
    const row = await prisma.session.findUnique({ where: { tokenHash: hashToken(`token-${ids[0]}`) } });
    expect(row).not.toBeNull();
    expect(row!.revokedAt).not.toBeNull();
  });

  it("不误伤别人:只作废本账户的会话", async () => {
    const { prisma } = await import("../lib/db");
    const { revokeAllSessions } = await import("../lib/session");
    const mine = await makeUserWithSessions(2);
    const other = await makeUserWithSessions(2);

    await revokeAllSessions(mine.uid);
    expect(await prisma.session.count({ where: { userId: other.uid, revokedAt: null } })).toBe(2);
  });
});
