"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { track } from "@vercel/analytics/server";
import { prisma } from "./db";
import { moderateTexts } from "./moderation";
import { adoptCat } from "./adoption";
import { generatePortrait } from "./portrait";
import { generateArrivalDay } from "./firstday";
import { ensureViewerId, getViewerId } from "./identity";
import { cookies } from "next/headers";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

const GOALS = new Set(["earn", "friends", "explore", "chill"]);

export async function createCat(formData: FormData) {
  const input = {
    name: String(formData.get("name") ?? "").trim().slice(0, 12),
    appearance: String(formData.get("appearance") ?? "").trim().slice(0, 60),
    bio: String(formData.get("bio") ?? "").trim().slice(0, 120),
    tagsRaw: String(formData.get("tags") ?? "").trim().slice(0, 60),
    ownerNick: String(formData.get("ownerNick") ?? "").trim().slice(0, 8),
    goal: GOALS.has(String(formData.get("goal") ?? "")) ? String(formData.get("goal")) : "chill",
    boldness: clamp(Number(formData.get("boldness") ?? 50)),
    sociability: clamp(Number(formData.get("sociability") ?? 50)),
    diligence: clamp(Number(formData.get("diligence") ?? 50)),
    ticket: String(formData.get("ticket") ?? "").trim().toUpperCase(),
  };
  if (!input.name) throw new Error("猫得有个名字");
  if (!input.ticket) throw new Error("需要一张船票（邀请码）才能上岛");

  const uid = await ensureViewerId();
  const result = await adoptCat(uid, input);
  if (!result.ok) redirect(`/my-cat`);

  // 异步：首日事件（领养后不能面对空白页）+ 立绘生成，都不阻塞领养流程
  after(async () => {
    await generateArrivalDay(result.catId).catch((e) => console.error("[firstday]", e));
    await generatePortrait(result.catId).catch((e) => console.error("[portrait]", e));
  });

  const user = await prisma.user.findUnique({ where: { id: uid }, select: { inviteBatch: true } });
  const ref = (await cookies()).get("maoadao_ref")?.value ?? null;
  await track("adopt_complete", { goal: input.goal, referred: ref === "share_card", batch: user?.inviteBatch ?? "unknown" });
  if (ref === "share_card") await track("referred_adopt_complete", {});
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
  const suggestion = SUGGESTIONS.has(suggestionRaw) || /^story:[a-z_]+$/.test(suggestionRaw) ? suggestionRaw : null;
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

  const priorCount = await prisma.ownerNudge.count({ where: { catId, consumedDay: { not: null } } });
  await track("intervention_submit", { hasMessage: Boolean(message), suggestion: suggestion ?? "none", first: priorCount === 0 });
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
