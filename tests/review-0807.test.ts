import { TEST_DB_READY, fx } from "./db-guard";
import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

// 2026-08-07 review 的回归。连库的部分走闸门;能静态判定的就静态判定——
// 这类"默认值/密钥回退/第三方外发"的问题,源码断言比跑一遍更抓得住。

describe("微信留言隐私(P1)", () => {
  const SRC = readFileSync("lib/wechat/service.ts", "utf8");

  it("留言默认私密:不许再出现 isPublic: true", () => {
    expect(/isPublic:\s*true/.test(SRC), "微信侧没有公开/私密选择,默认公开等于替用户做主").toBe(false);
    expect(/isPublic:\s*false/.test(SRC)).toBe(true);
  });

  it("飞书只收脱敏元数据:不带原文、不带主人 ID、不带猫名", () => {
    const call = SRC.slice(SRC.indexOf("sendFeishu("), SRC.indexOf("sendFeishu(") + 400);
    expect(call.includes("text.slice"), "原文被抄送到多人群了").toBe(false);
    expect(/userId\.slice/.test(call), "主人 ID 被抄送").toBe(false);
    expect(/\$\{catName/.test(call), "猫名被抄送").toBe(false);
  });
});

describe("绑定二维码不出服务端(P1)", () => {
  it("前端不再把绑定载荷发给第三方二维码服务", () => {
    const client = readFileSync("components/WechatConnectClient.tsx", "utf8");
    expect(client.includes("qrserver.com"), "绑定凭据被交给第三方渲染,谁先扫谁先绑").toBe(false);
    expect(client.includes("qrDataUrl")).toBe(true);
  });

  it("二维码在服务端渲成 data URI 下发,原始载荷不出现在响应里", () => {
    const route = readFileSync("app/api/wechat/qr/route.ts", "utf8");
    expect(route.includes("QRCode.toDataURL")).toBe(true);
    expect(/qrImg:\s*r\.qrImg/.test(route), "还在把载荷回给前端").toBe(false);
  });
});

describe("出站不重复发送(P1)", () => {
  const SRC = readFileSync("lib/wechat/daily.ts", "utf8");

  it("先原子领取成 sending 再发", () => {
    const claim = SRC.indexOf('status: "sending"');
    const send = SRC.indexOf("await sendWechat(");
    expect(claim).toBeGreaterThan(-1);
    expect(claim, "领取必须发生在发送之前").toBeLessThan(send);
    expect(/where:\s*\{[^}]*status:\s*"queued"/.test(SRC), "领取要带 status:queued 条件,否则不是原子的").toBe(true);
  });

  it("发送带幂等键(消息 id)", () => {
    expect(/sendWechat\([^)]*msg\.id/.test(SRC)).toBe(true);
  });

  it("卡单能回收:sending 超时放回队列", () => {
    expect(SRC.includes('status: "sending"') && SRC.includes('status: "queued", claimId: null')).toBe(true);
  });

  it("桥侧认幂等键并答 duplicate", () => {
    const bridge = readFileSync("wechat-bridge/server.mjs", "utf8");
    expect(bridge.includes("idempotencyKey")).toBe(true);
    expect(bridge.includes("duplicate: true")).toBe(true);
  });
});

describe("桥的入站不丢不重(P1)", () => {
  const SRC = readFileSync("wechat-bridge/server.mjs", "utf8");

  it("游标持久化,不只在内存", () => {
    expect(SRC.includes("cursors.json")).toBe(true);
    expect(/let buf = cursors\[openId\]/.test(SRC), "重启后要从落盘游标接着拉").toBe(true);
  });

  it("业务确认后才提交游标", () => {
    expect(SRC.includes("batchOk")).toBe(true);
    expect(/if \(batchOk\) \{[\s\S]{0,120}cursors\[openId\] = buf/.test(SRC), "游标必须在整批交付成功后才前进").toBe(true);
  });

  it("回调失败不吞消息(保留游标重试)", () => {
    expect(SRC.includes("保留游标")).toBe(true);
  });

  it("消息 id 幂等,重放不重复消费", () => {
    expect(SRC.includes("alreadyHandled") && SRC.includes("markHandled")).toBe(true);
  });

  it("凭据原子落盘(临时文件 + rename)", () => {
    expect(/renameSync\(tmp, CREDS_FILE\)/.test(SRC)).toBe(true);
  });
});

describe("密钥与限流(P2)", () => {
  it("生产上密钥缺失硬失败,不回退空串/固定常量", () => {
    const entry = readFileSync("lib/wechat/entry.ts", "utf8");
    const authcode = readFileSync("lib/authcode.ts", "utf8");
    for (const [name, src] of [["entry", entry], ["authcode", authcode]] as const) {
      expect(/NODE_ENV === "production"/.test(src), `${name} 没有生产环境硬校验`).toBe(true);
      expect(/throw new Error/.test(src), `${name} 缺失密钥时没有拒绝`).toBe(true);
    }
  });

  it("登录限流不挂在客户端 cookie 上", () => {
    const src = readFileSync("lib/account-actions.ts", "utf8");
    // 只看**未登录**的登录入口:改密码/改邮箱/看钥匙那几处的 uid 来自有效会话,
    // 不是攻击者能清掉重置的匿名 cookie,那些保持原样是对的
    const i = src.indexOf("export async function loginWithPassword");
    const body = src.slice(i, src.indexOf("\nexport async function", i + 10));
    expect(/failsInWindow\("login_fail", `\$\{uid\}/.test(body), "uid 来自客户端 cookie,清掉就重置窗口").toBe(false);
    expect(body.includes("`email:${email}`") && body.includes("`ip:${ip}`"), "应按账号 + 来源 IP 双闸").toBe(true);
  });

  it("/api/warm 要鉴权", () => {
    const src = readFileSync("app/api/warm/route.ts", "utf8");
    expect(src.includes("CRON_SECRET")).toBe(true);
  });

  it("桥的运行时状态不进版本库", () => {
    const gi = readFileSync(".gitignore", "utf8");
    for (const f of ["creds.json", "cursors.json", "seen.json"]) expect(gi.includes(`/wechat-bridge/${f}`)).toBe(true);
  });
});

describe.skipIf(!TEST_DB_READY)("一人一微信有库级约束(P2)", () => {
  const uids: string[] = [];
  afterAll(async () => {
    const { prisma } = await import("../lib/db");
    await prisma.channel.deleteMany({ where: { userId: { in: uids } } });
    await prisma.user.deleteMany({ where: { id: { in: uids } } });
    await prisma.$disconnect();
  });

  it("同一用户并发建两条微信通道,只有一条成立", async () => {
    const { prisma } = await import("../lib/db");
    const uid = fx("chan-user");
    uids.push(uid);
    await prisma.user.create({ data: { id: uid, name: "测试岛民", createdAt: new Date() } });
    const mk = (ext: string) =>
      prisma.channel.create({
        data: { id: randomUUID(), userId: uid, kind: "wechat_openclaw", externalId: ext, boundAt: new Date() },
      });
    const r = await Promise.allSettled([mk(fx("wx-a")), mk(fx("wx-b"))]);
    const ok = r.filter((x) => x.status === "fulfilled").length;
    expect(ok, "两条都建成了 = 同一个人会收到两份消息").toBe(1);
    expect(await prisma.channel.count({ where: { userId: uid } })).toBe(1);
  });
});
