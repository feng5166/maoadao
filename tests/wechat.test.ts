import { config } from "dotenv";
config({ path: [".env.local", ".env"], override: true });
// 审核 LLM 快速失败走词表兜底——测试关注通道协议,不是文案
process.env.ANTHROPIC_AUTH_TOKEN = "invalid-for-test";
process.env.ANTHROPIC_BASE_URL = "http://127.0.0.1:1";

import { afterAll, describe, expect, it } from "vitest";

const T = 60_000;
const hasDb = Boolean(process.env.DATABASE_URL);

const U = "u-test-wx-1";
const WXID = "wxid-test-0001"; // iLink 侧 openId

describe.skipIf(!hasDb)("微信通道(iLink):激活绑定/窗口/频控/留言合并(真实数据库,自清理)", () => {
  afterAll(async () => {
    const { prisma } = await import("../lib/db");
    const cats = await prisma.cat.findMany({ where: { ownerId: U }, select: { id: true } });
    const catIds = cats.map((c) => c.id);
    await prisma.$transaction([
      prisma.outboundMessage.deleteMany({ where: { userId: U } }),
      prisma.channel.deleteMany({ where: { userId: U } }),
      prisma.ownerNudge.deleteMany({ where: { catId: { in: catIds } } }),
      prisma.memoryEntry.deleteMany({ where: { catId: { in: catIds } } }),
      prisma.event.deleteMany({ where: { catId: { in: catIds } } }),
      prisma.catState.deleteMany({ where: { catId: { in: catIds } } }),
      prisma.cat.deleteMany({ where: { id: { in: catIds } } }),
      prisma.user.deleteMany({ where: { id: U } }),
    ]);
    await prisma.$disconnect();
  }, T);

  async function setup() {
    const { prisma } = await import("../lib/db");
    await prisma.user.upsert({ where: { id: U }, update: {}, create: { id: U, name: "测试岛民", createdAt: new Date() } });
    let cat = await prisma.cat.findFirst({ where: { ownerId: U } });
    if (!cat) {
      cat = await prisma.cat.create({
        data: {
          id: `cat-wxtest1`,
          ownerId: U,
          name: "测试煤球",
          boldness: 30,
          sociability: 50,
          diligence: 50,
          personaTags: ["胆小"],
          appearance: "测试",
          bio: "",
          firstWords: "不要害怕,我会来看你",
          createdAt: new Date(),
        },
      });
    }
    return { prisma, cat };
  }

  it("激活绑定:建通道+开窗+握手引用领养时的第一句话;首条消息落为留言", async () => {
    const { prisma, cat } = await setup();
    const { bindChannel } = await import("../lib/wechat/service");

    const { replyText } = await bindChannel(U, WXID, "我来啦,以后每天都来看你");
    expect(replyText).toContain("测试煤球");
    expect(replyText).toContain("不要害怕"); // 引用 firstWords

    const ch = await prisma.channel.findFirst({ where: { userId: U } });
    expect(ch).not.toBeNull();
    expect(ch!.externalId).toBe(WXID);
    expect(ch!.windowOpenUntil!.getTime()).toBeGreaterThan(Date.now());

    // 激活的第一句话 = 留言
    const pending = await prisma.ownerNudge.findMany({ where: { catId: cat.id, consumedDay: null } });
    expect(pending.length).toBe(1);
    expect(pending[0].message).toBe("我来啦,以后每天都来看你");
  }, T);

  it("换绑幂等:同一用户再次激活(换微信)只保留一条通道", async () => {
    const { prisma } = await setup();
    const { bindChannel } = await import("../lib/wechat/service");
    await bindChannel(U, "wxid-test-0002", "");
    const chs = await prisma.channel.findMany({ where: { userId: U } });
    expect(chs.length).toBe(1);
    expect(chs[0].externalId).toBe("wxid-test-0002");
    // 换回来,保持后续用例用 WXID
    await bindChannel(U, WXID, "");
  }, T);

  it("回信即留言:确定性 ACK;连发合并为最新一条;未知 openId 引导回岛", async () => {
    const { prisma, cat } = await setup();
    const { handleInbound } = await import("../lib/wechat/service");

    const r1 = await handleInbound(WXID, "今天去海边玩玩吧");
    expect(r1.matched).toBe("nudge");
    expect(r1.replyText).toContain("测试煤球");

    const r2 = await handleInbound(WXID, "还有,记得吃饭");
    expect(r2.matched).toBe("nudge");
    expect(r2.replyText).toContain("一天捎一句"); // 重复提示

    const pending = await prisma.ownerNudge.findMany({ where: { catId: cat.id, consumedDay: null } });
    expect(pending.length).toBe(1); // 合并为最新
    expect(pending[0].message).toBe("还有,记得吃饭");
    expect(pending[0].isPublic).toBe(true);

    const stranger = await handleInbound("wxid-nobody", "你好");
    expect(stranger.matched).toBe("unknown");
  }, T);

  it("退订与说话即续订", async () => {
    const { prisma } = await setup();
    const { handleInbound } = await import("../lib/wechat/service");

    const off = await handleInbound(WXID, "别再捎信");
    expect(off.matched).toBe("unsubscribed");
    expect((await prisma.channel.findFirst({ where: { userId: U } }))!.mutedAt).not.toBeNull();

    await handleInbound(WXID, "算了还是想听你说话");
    expect((await prisma.channel.findFirst({ where: { userId: U } }))!.mutedAt).toBeNull();
  }, T);

  it("D2 兑现排队幂等 + 24h 窗口关闭 → 未寄出的信(不硬发)", async () => {
    const { prisma, cat } = await setup();
    const { enqueueDailyWechat, dispatchOutbound } = await import("../lib/wechat/daily");

    const world = await prisma.worldState.findUnique({ where: { id: 1 } });
    const day = world?.day ?? 1;
    // 伪造首日事件让 catDay=2
    await prisma.event.deleteMany({ where: { catId: cat.id } });
    await prisma.event.create({
      data: {
        id: `evt-wxtest-arrival`,
        day: day - 1,
        segment: "afternoon",
        catId: cat.id,
        type: "arrival",
        outcome: "success",
        data: { scene: "测试到岛" },
        deltas: {},
        contentValue: 5,
      },
    });
    await prisma.outboundMessage.deleteMany({ where: { userId: U } });

    const q1 = await enqueueDailyWechat(day);
    expect(q1.queued).toBeGreaterThanOrEqual(1);
    const q2 = await enqueueDailyWechat(day); // 频控:每人每天 ≤1
    expect(q2.queued).toBe(0);

    const msg = await prisma.outboundMessage.findFirst({ where: { userId: U, day } });
    expect(msg!.kind).toBe("d2_promise");
    expect(msg!.content).toContain("测试煤球");

    // 把窗口拨到过去 + 消息到期 → dispatch 必须落 window_closed,绝不硬发
    await prisma.channel.updateMany({ where: { userId: U }, data: { windowOpenUntil: new Date(Date.now() - 1000) } });
    await prisma.outboundMessage.update({ where: { id: msg!.id }, data: { sendAfter: new Date(Date.now() - 1000) } });
    const d = await dispatchOutbound();
    expect(d.windowClosed).toBeGreaterThanOrEqual(1);
    const after = await prisma.outboundMessage.findUnique({ where: { id: msg!.id } });
    expect(after!.status).toBe("window_closed");
    // 熔断不应因窗口关闭触发
    const w = await prisma.worldState.findUnique({ where: { id: 1 } });
    expect(w!.wechatPaused).toBe(false);
  }, T);
});
