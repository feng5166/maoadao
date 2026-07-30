"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { track } from "@vercel/analytics/server";
import { prisma } from "./db";
import { moderateTexts } from "./moderation";
import { NPC_CATS } from "./sim/npcs";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

const GOALS = new Set(["earn", "friends", "explore", "chill"]);

export async function createCat(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 12);
  const appearance = String(formData.get("appearance") ?? "").trim().slice(0, 60);
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 120);
  const tagsRaw = String(formData.get("tags") ?? "").trim().slice(0, 60);
  const goalRaw = String(formData.get("goal") ?? "chill");
  const goal = GOALS.has(goalRaw) ? goalRaw : "chill";
  const boldness = clamp(Number(formData.get("boldness") ?? 50));
  const sociability = clamp(Number(formData.get("sociability") ?? 50));
  const diligence = clamp(Number(formData.get("diligence") ?? 50));

  if (!name) throw new Error("猫得有个名字");

  // 内容审核：所有用户可见文本
  const mod = await moderateTexts([name, appearance, bio, tagsRaw]);
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

  await track("adopt_complete", { goal });
  revalidatePath("/");
  redirect(`/cats/${id}`);
}

const SUGGESTIONS = new Set(["earn", "explore", "social", "rest"]);

export async function saveNudge(formData: FormData) {
  const catId = String(formData.get("catId") ?? "");
  const message = String(formData.get("message") ?? "").trim().slice(0, 60);
  const suggestionRaw = String(formData.get("suggestion") ?? "");
  const suggestion = SUGGESTIONS.has(suggestionRaw) ? suggestionRaw : null;
  const isPublic = formData.get("isPublic") === "on";

  if (!catId || (!message && !suggestion)) return;
  const cat = await prisma.cat.findUnique({ where: { id: catId } });
  if (!cat || cat.isNpc) throw new Error("只能给自己领养的猫留言");

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
