"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { track } from "@vercel/analytics/server";
import { prisma } from "./db";
import { moderateTexts } from "./moderation";
import { NPC_CATS } from "./sim/npcs";
import { generatePortrait } from "./portrait";
import { generateArrivalDay } from "./firstday";
import { ensureViewerId, getViewerId } from "./identity";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

const GOALS = new Set(["earn", "friends", "explore", "chill"]);

export async function createCat(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 12);
  const appearance = String(formData.get("appearance") ?? "").trim().slice(0, 60);
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 120);
  const tagsRaw = String(formData.get("tags") ?? "").trim().slice(0, 60);
  const ownerNick = String(formData.get("ownerNick") ?? "").trim().slice(0, 8);
  const goalRaw = String(formData.get("goal") ?? "chill");
  const goal = GOALS.has(goalRaw) ? goalRaw : "chill";
  const boldness = clamp(Number(formData.get("boldness") ?? 50));
  const sociability = clamp(Number(formData.get("sociability") ?? 50));
  const diligence = clamp(Number(formData.get("diligence") ?? 50));

  if (!name) throw new Error("猫得有个名字");

  // 身份：匿名 cookie，一浏览器一岛民；猫归属于创建者
  const uid = await ensureViewerId();
  await prisma.user.upsert({ where: { id: uid }, update: {}, create: { id: uid, name: "岛民", createdAt: new Date() } });

  // 防连点：2 分钟内刚建过猫 → 直接跳去那只猫（幂等）
  const recent = await prisma.cat.findFirst({
    where: { ownerId: uid, createdAt: { gte: new Date(Date.now() - 120_000) } },
    orderBy: { createdAt: "desc" },
  });
  if (recent) redirect(`/cats/${recent.id}`);

  // 一人一猫（v0.5）：无限重抽会毁掉归属感；"第二只猫"留作未来付费点
  const owned = await prisma.cat.findFirst({ where: { ownerId: uid } });
  if (owned) redirect(`/my-cat`);

  // 内容审核：所有用户可见文本
  const mod = await moderateTexts([name, appearance, bio, tagsRaw, ownerNick]);
  if (!mod.ok) throw new Error(mod.reason ?? "内容未通过审核，请修改后重试");

  const personaTags = tagsRaw
    ? tagsRaw.split(/[,，、\s]+/).filter(Boolean).slice(0, 5)
    : ["神秘"];

  const id = `cat-${randomUUID().slice(0, 8)}`;
  await prisma.cat.create({
    data: {
      id,
      name,
      isNpc: false,
      ownerId: uid,
      ownerNick: ownerNick || null,
      goal,
      boldness,
      sociability,
      diligence,
      personaTags,
      appearance: appearance || "一只还没被描述过的猫",
      bio: bio || `${name}刚刚搬来猫啊岛，一切都是新的。`,
      createdAt: new Date(),
      state: { create: {} },
    },
  });

  // 初始 NPC 关系：热心肠的棉花来打招呼 + 按性格再结识一只
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  const day = world?.day ?? 0;
  const second =
    sociability > 60 ? "npc-juzi" : boldness > 60 ? "npc-doudou" : diligence > 60 ? "npc-tudou" : "npc-tangyuan";
  for (const npcId of ["npc-mianhua", second]) {
    if (!NPC_CATS.some((n) => n.id === npcId)) continue;
    await prisma.relationship.create({
      data: { id: randomUUID(), catAId: id, catBId: npcId, affinity: 8 + Math.floor(Math.random() * 5), lastInteractionDay: day },
    });
  }

  // 异步：首日事件（领养后不能面对空白页）+ 立绘生成，都不阻塞领养流程
  after(async () => {
    await generateArrivalDay(id).catch((e) => console.error("[firstday]", e));
    await generatePortrait(id).catch((e) => console.error("[portrait]", e));
  });

  await track("adopt_complete", { goal });
  revalidatePath("/");
  redirect(`/my-cat`);
}

const SUGGESTIONS = new Set(["earn", "explore", "social", "rest"]);

/** 所有权守卫：非 NPC、有主、且当前访客就是主人 */
export async function assertOwnerCheck(
  cat: { isNpc: boolean; ownerId: string | null } | null,
  viewerId: string | null,
): Promise<void> {
  assertOwner(cat, viewerId);
}

function assertOwner(cat: { isNpc: boolean; ownerId: string | null } | null, viewerId: string | null): asserts cat {
  if (!cat || cat.isNpc) throw new Error("只能给自己领养的猫留言");
  if (!cat.ownerId || !viewerId || cat.ownerId !== viewerId) throw new Error("这不是你的猫哦");
}

export async function saveNudge(formData: FormData) {
  const catId = String(formData.get("catId") ?? "");
  const message = String(formData.get("message") ?? "").trim().slice(0, 60);
  const suggestionRaw = String(formData.get("suggestion") ?? "");
  const suggestion = SUGGESTIONS.has(suggestionRaw) ? suggestionRaw : null;
  const isPublic = formData.get("isPublic") === "on";

  if (!catId || (!message && !suggestion)) return;
  const cat = await prisma.cat.findUnique({ where: { id: catId } });
  const uid = await getViewerId();
  assertOwner(cat, uid);

  if (message) {
    const mod = await moderateTexts([message]);
    if (!mod.ok) throw new Error(mod.reason ?? "留言未通过审核");
  }

  // 未消费的旧干预直接覆盖（每天只认最新一条）
  await prisma.ownerNudge.deleteMany({ where: { catId, consumedDay: null } });
  await prisma.ownerNudge.create({
    data: {
      id: randomUUID(),
      catId,
      message: message || null,
      suggestion,
      isPublic,
      createdAt: new Date(),
    },
  });

  await track("nudge_saved", { hasMessage: Boolean(message), suggestion: suggestion ?? "none" });
  revalidatePath(`/cats/${catId}`);
}

export async function renameCat(formData: FormData) {
  const newName = String(formData.get("newName") ?? "").trim().slice(0, 12);
  if (!newName) return;
  const uid = await getViewerId();
  const cat = await prisma.cat.findFirst({ where: { ownerId: uid ?? "__none__" } });
  if (!cat) throw new Error("你还没有猫");
  if (cat.renamedAt) throw new Error("改名机会只有一次，已经用过了");
  const mod = await moderateTexts([newName]);
  if (!mod.ok) throw new Error(mod.reason ?? "名字未通过审核");
  await prisma.cat.update({ where: { id: cat.id }, data: { name: newName, renamedAt: new Date() } });
  revalidatePath("/my-cat");
}
