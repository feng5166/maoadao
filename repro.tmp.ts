import { prisma } from "./lib/db";
import { adoptCat } from "./lib/adoption";
import { generateArrivalDay } from "./lib/firstday";
import { moderateTexts } from "./lib/moderation";

async function t<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const s = Date.now();
  try { return await fn(); } finally { console.log(label, Date.now() - s, "ms"); }
}

async function main() {
  const ticket = await prisma.inviteCode.findFirst({ where: { usedCount: 0, disabled: false } });
  if (!ticket) { console.log("没有可用票"); return; }
  console.log("用票", ticket.code, ticket.batch);
  const uid = `u-repro-${Date.now()}`;

  await t("moderation(6texts)", () => moderateTexts(["测试猫", "圆圆的大眼睛", "", "馋", "老大", "别害怕"]));

  const r = await t("adoptCat", () => adoptCat(uid, {
    name: "复现测试猫", appearance: "一条毛茸茸的大尾巴", bio: "", tagsRaw: "馋",
    ownerNick: "老大", goal: "chill", boldness: 52, sociability: 50, diligence: 52,
    ticket: ticket.code, firstWords: "别害怕，我会来看你。",
  })).catch((e) => { console.error("adoptCat 抛错:", e?.message); return null; });

  if (r && r.ok) {
    await t("generateArrivalDay", () => generateArrivalDay(r.catId));
    // 清理
    const catId = r.catId;
    await prisma.$transaction([
      prisma.catDailySummary.deleteMany({ where: { catId } }),
      prisma.event.deleteMany({ where: { catId } }),
      prisma.memoryEntry.deleteMany({ where: { catId } }),
      prisma.relationship.deleteMany({ where: { OR: [{ catAId: catId }, { catBId: catId }] } }),
      prisma.storyline.deleteMany({ where: { catId } }),
      prisma.diaryEntry.deleteMany({ where: { catId } }),
      prisma.catState.deleteMany({ where: { catId } }),
      prisma.cat.deleteMany({ where: { id: catId } }),
      prisma.inviteCode.deleteMany({ where: { issuedTo: uid } }),
      prisma.user.deleteMany({ where: { id: uid } }),
      prisma.inviteCode.update({ where: { code: ticket.code }, data: { usedCount: 0 } }),
    ]);
    console.log("已清理测试数据");
  }
}
main().finally(() => prisma.$disconnect());
