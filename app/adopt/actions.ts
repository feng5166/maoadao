"use server";

// D0 尾声动作(14 §九/v3 冻结):〔进院子〕→ claimYard → /yard。
// skip 与完整走完汇入同一结果——跳过的只是电影,不是身份建立。
// 票有问题不在这里拦:落到 /yard 院门口,那里有登记的位置(世界语言报错)。

import { redirect } from "next/navigation";
import { ensureViewerId } from "@/lib/identity";
import { claimYard, ClaimError } from "@/lib/yard/claim";

export async function enterYardAction(ticket?: string | null): Promise<void> {
  const uid = await ensureViewerId();
  const clean = ticket && /^[A-Z0-9-]{4,24}$/i.test(ticket) ? ticket.toUpperCase() : null;
  if (uid && clean) {
    try {
      await claimYard(uid, clean);
    } catch (err) {
      if (!(err instanceof ClaimError)) throw err; // 票的问题去院门口再说;系统错误照常抛
    }
  }
  redirect("/yard");
}
