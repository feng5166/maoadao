import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getViewerId } from "@/lib/identity";
import { Track } from "@/components/Track";
import { AdoptFlow } from "@/components/AdoptFlow";
import { readVisitState } from "@/lib/visit";

export const maxDuration = 300; // 领养后 after() 里异步生成首日内容、立绘、相遇照片与姿势集(doc/15,姿势 5 张约 100s)

// 入岛(2026-08-05 改版):表单没了——D0 五幕(doc2.0/14)先让人看懂这座岛,
// 再进 D1 相遇剧本(doc/21 七拍):不是"创建一只猫",是"遇见一只猫"。
// ?ticket= 船票深链(岛民寄出的邀请):S0 船票已在纸面上;没票的走到登记那一步才被问起。
// 老用户不重放(doc/21 §九②):有猫身份直接回它身边。

export default async function AdoptPage({ searchParams }: { searchParams: Promise<{ ticket?: string; d0?: string }> }) {
  const { ticket, d0 } = await searchParams;
  const validTicket = ticket && /^[A-Z0-9-]{4,24}$/i.test(ticket) ? ticket.toUpperCase() : undefined;
  // 看完/跳过 D0 的人不再重播(心流单向跨会话也成立);?d0=1 是主动要求再看一遍
  const { d0: d0Disposition } = await readVisitState();

  const uid = await getViewerId();
  if (uid) {
    const owned = await prisma.cat.findFirst({ where: { ownerId: uid }, select: { id: true } });
    if (owned) redirect("/my-cat");
  }

  return (
    <div>
      <Track events={[{ name: "arrival_scene_view", props: { viaTicket: Boolean(validTicket) } }]} />
      <AdoptFlow ticket={validTicket} d0Disposition={d0Disposition} forceD0={d0 === "1"} />
    </div>
  );
}
