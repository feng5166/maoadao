import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getViewerId } from "@/lib/identity";
import { Track } from "@/components/Track";
import { AdoptFlow } from "@/components/AdoptFlow";
import { readVisitState } from "@/lib/visit";

// 入岛(2.1 翻转,2026-08-09):D0 五幕(doc2.0/14 v3)→〔进院子〕→ claimYard → /yard。
// 路由名保留 /adopt——旧船票深链永不失效(README §十),语义已变为「来岛上拥有一个院子」。
// ?ticket= 船票深链;没票的落到院门口再登记。
// 已是岛民(hasYard)不重放,直接回院子(hasYard 是用户侧唯一主身份信号,14 §九 红线③)。

export default async function AdoptPage({ searchParams }: { searchParams: Promise<{ ticket?: string; d0?: string }> }) {
  const { ticket, d0 } = await searchParams;
  const validTicket = ticket && /^[A-Z0-9-]{4,24}$/i.test(ticket) ? ticket.toUpperCase() : undefined;
  const { d0: d0Disposition } = await readVisitState();

  const uid = await getViewerId();
  if (uid && d0 !== "1") {
    const home = await prisma.home.findUnique({ where: { userId: uid }, select: { yard: { select: { id: true } } } });
    if (home?.yard) redirect("/yard");
  }

  return (
    <div>
      <Track events={[{ name: "arrival_scene_view", props: { viaTicket: Boolean(validTicket) } }]} />
      <AdoptFlow ticket={validTicket} d0Disposition={d0Disposition} forceD0={d0 === "1"} />
    </div>
  );
}
