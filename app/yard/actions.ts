"use server";

// 院子 Server Actions（flag 内，14 §九 护栏③）：薄壳——校验身份与 flag，
// 逻辑全在 lib/yard/*（可单测）。旧 /adopt 链路不受影响，D0 尾部未翻。

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { ensureViewerId, getViewerId } from "@/lib/identity";
import { claimYard } from "@/lib/yard/claim";
import { collectVisit, placeItem, removeItem } from "@/lib/yard/commands";
import { yardGameplayEnabled } from "@/lib/yard/flags";

async function assertFlag(uid: string | null): Promise<string> {
  if (!uid) throw new Error("先回到岛上");
  const user = await prisma.user.findUnique({ where: { id: uid }, select: { yardAccess: true } });
  if (!yardGameplayEnabled(user)) throw new Error("这条小路还没有开放");
  return uid;
}

export async function claimYardAction(formData: FormData) {
  const uid = await ensureViewerId();
  await assertFlag(uid);
  const ticket = String(formData.get("ticket") ?? "").trim().toUpperCase();
  await claimYard(uid, ticket);
  revalidatePath("/yard");
}

export async function placeItemAction(formData: FormData) {
  const uid = await assertFlag(await getViewerId());
  const slotKey = String(formData.get("slotKey") ?? "");
  const itemKey = String(formData.get("itemKey") ?? "");
  if (!itemKey) return;
  await placeItem(uid, slotKey, itemKey);
  revalidatePath("/yard");
}

export async function removeItemAction(formData: FormData) {
  const uid = await assertFlag(await getViewerId());
  await removeItem(uid, String(formData.get("slotKey") ?? ""));
  revalidatePath("/yard");
}

export async function collectVisitAction(formData: FormData) {
  const uid = await assertFlag(await getViewerId());
  await collectVisit(uid, String(formData.get("visitId") ?? ""));
  revalidatePath("/yard");
}
