"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 头部主行动按钮：唯一一颗砖红印章，指向"你现在该去的地方"。
// 已经站在码头上（/adopt 流程里）就不再喊人去码头——重复的路牌比没有路牌更迷路。
// 2.1 翻转:唯一主身份信号 = hasYard(14 §九 红线③)。
export function HeaderCta({ hasYard }: { hasYard: boolean }) {
  const pathname = usePathname();

  if (hasYard) {
    if (pathname.startsWith("/yard")) return null;
    return (
      <Link href="/yard" className="stamp-btn px-4 py-1.5 text-sm">
        回院子
      </Link>
    );
  }
  if (pathname.startsWith("/adopt")) return null;
  return (
    <Link href="/adopt" className="stamp-btn px-4 py-1.5 text-sm">
      上岛看看
    </Link>
  );
}
