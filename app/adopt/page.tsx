import Image from "next/image";
import Link from "next/link";
import { Track } from "@/components/Track";

// 码头相遇页（doc/10 §1）：填表之前先"遇见"。
// 这 10 秒只做一件事——把用户从"产品用户"切换成"主人"。
// 刻意不出猫的脸：立绘的首次亮相留到登记完成后（doc/10 修订 3）。
// ?ticket= 船票深链(岛民寄出的邀请):透传到登记页,票号自动填好。

export default async function ArrivalScenePage({ searchParams }: { searchParams: Promise<{ ticket?: string }> }) {
  const { ticket } = await searchParams;
  const hasTicket = Boolean(ticket && /^[A-Z0-9-]{4,24}$/i.test(ticket));

  return (
    <div className="mx-auto max-w-lg">
      <Track events={[{ name: "arrival_scene_view", props: { viaTicket: hasTicket } }]} />

      <div className="relative mt-6 overflow-hidden rounded-lg border border-line">
        <Image src="/scenes/dock.jpg" alt="猫啊岛的码头" width={1200} height={686} priority className="w-full" />
      </div>

      <div className="mt-10 text-center">
        <p className="font-diary text-[17px] leading-[2.2] text-ink">
          船到了。
          <br />
          猫啊岛每天都会迎来新的居民。
          <br />
          今天，有一只猫刚刚来到这里——
          <br />
          它蹲在码头的行李堆旁边，等一个属于它的人。
        </p>
      </div>

      <div className="mt-10 text-center">
        <Link
          href={hasTicket ? `/adopt/register?ticket=${encodeURIComponent(ticket!.toUpperCase())}` : "/adopt/register"}
          className="stamp-btn inline-block px-8 py-2.5"
        >
          去看看它
        </Link>
        <p className="mt-3 text-xs text-ink-faint">
          {hasTicket ? "你手里的船票有效——检票的已经在等你了。" : "需要一张船票（找给你介绍猫啊岛的人要一张）"}
        </p>
      </div>
    </div>
  );
}
