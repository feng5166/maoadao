"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db, schema } from "./db";

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export async function createCat(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim().slice(0, 12);
  const appearance = String(formData.get("appearance") ?? "").trim().slice(0, 60);
  const bio = String(formData.get("bio") ?? "").trim().slice(0, 120);
  const tagsRaw = String(formData.get("tags") ?? "").trim();
  const boldness = clamp(Number(formData.get("boldness") ?? 50));
  const sociability = clamp(Number(formData.get("sociability") ?? 50));
  const diligence = clamp(Number(formData.get("diligence") ?? 50));

  if (!name) throw new Error("猫得有个名字");

  const personaTags = tagsRaw
    ? tagsRaw.split(/[,，、\s]+/).filter(Boolean).slice(0, 5)
    : ["神秘"];

  const id = `cat-${randomUUID().slice(0, 8)}`;
  await db.insert(schema.cats)
    .values({
      id,
      name,
      isNpc: false,
      boldness,
      sociability,
      diligence,
      personaTags,
      appearance: appearance || "一只还没被描述过的猫",
      bio: bio || `${name}刚刚搬来猫啊岛，一切都是新的。`,
      createdAt: new Date(),
    })
    .run();
  await db.insert(schema.catStates).values({ catId: id }).run();

  revalidatePath("/");
  redirect(`/cats/${id}`);
}
