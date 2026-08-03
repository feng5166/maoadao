"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 头部主行动按钮：唯一一颗砖红印章，指向"你现在该去的地方"。
// 已经站在码头上（/adopt 流程里）就不再喊人去码头——重复的路牌比没有路牌更迷路。
export function HeaderCta({ hasCat }: { hasCat: boolean }) {
  const pathname = usePathname();

  if (hasCat) {
    return (
      <Link href="/my-cat" className="stamp-btn px-4 py-1.5 text-sm">
        我的猫
      </Link>
    );
  }
  if (pathname.startsWith("/adopt")) return null;
  return (
    <Link href="/adopt" className="stamp-btn px-4 py-1.5 text-sm">
      去码头接它
    </Link>
  );
}
