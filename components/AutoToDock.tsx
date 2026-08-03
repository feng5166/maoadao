"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** 过场页停留片刻后自然走向码头——不打断想多看一会儿海的人（页面上有手动入口） */
export function AutoToDock({ delayMs = 8000 }: { delayMs?: number }) {
  const router = useRouter();
  useEffect(() => {
    const t = setTimeout(() => router.push("/adopt"), delayMs);
    return () => clearTimeout(t);
  }, [router, delayMs]);
  return null;
}
