"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 头部主行动按钮：唯一一颗砖红印章，指向"你现在该去的地方"。
// 已经站在码头上（/adopt 流程里）就不再喊人去码头——重复的路牌比没有路牌更迷路。
// 2.1 翻转:唯一主身份信号 = hasYard(14 §九 红线③)。
export function HeaderCta({ hasYard }: { hasYard: boolean }) {
  const pathname = usePathname();

  // 路径判定放最前:layout 跨软导航不重取,hasYard 可能是进门前的旧值——
  // 站在院子里/码头上时,无论身份信号新旧都不出路牌(走查修正 2026-08-09)
  if (pathname.startsWith("/yard") || pathname.startsWith("/adopt")) return null;
  if (hasYard) {
    return (
      <Link href="/yard" className="stamp-btn px-4 py-1.5 text-sm">
        回院子
      </Link>
    );
  }
  return (
    <Link href="/adopt" className="stamp-btn px-4 py-1.5 text-sm">
      上岛看看
    </Link>
  );
}
