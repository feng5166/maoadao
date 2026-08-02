import Image from "next/image";
import Link from "next/link";
import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { Track } from "@/components/Track";
import { WechatConnect } from "@/components/WechatConnect";
import { getViewerId } from "@/lib/identity";
import { beijingHour } from "@/lib/moments";
import { getViewerCat } from "@/lib/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// 夜晚离开仪式（doc/10 §8）：D1 留完话不直接结束。
// 这一页只建立一个认知——"你离开后，它会继续生活"。
// 第五瞬间"放手"(doc/12 §八.1)：不新增任何 UI，只落一条 first_departure 事实——
// 主人第一次离开并答应明天回来。未连微信的用户同样生成（信任 ≠ 渠道授权）。

export default async function GoodnightPage() {
  const viewerId = await getViewerId();
  const cat = await getViewerCat(viewerId);
  if (!cat) redirect("/adopt");

  // 深夜变体（doc/12 §五）：现实时间只影响离岛文案
  const hour = beijingHour();
  const lateNight = hour >= 23 || hour < 5;

  // first_departure：幂等落一次
  after(async () => {
    const exists = await prisma.memoryEntry.findFirst({ where: { catId: cat.id, kind: "first_departure" } });
    if (exists) return;
    const world = await prisma.worldState.findUnique({ where: { id: 1 } });
    await prisma.memoryEntry
      .create({
        data: {
          id: randomUUID(),
          catId: cat.id,
          day: world?.day ?? 0,
          kind: "first_departure",
          content: `${cat.ownerNick || "主人"}第一次离开，答应明天回来`,
          importance: 10,
          visibility: "public",
        },
      })
      .catch(() => {});
  });

  return (
    <div className="mx-auto max-w-lg">
      <Track events={[{ name: "leave_for_tomorrow" }, { name: "first_departure_created" }]} />

      <div className="relative mt-8 overflow-hidden rounded-lg border border-line">
        <Image src="/scenes/home.jpg" alt="" width={1200} height={686} priority className="w-full" />
        {/* 夜色：入夜的滤镜盖在白天的小屋上 */}
        <div className="absolute inset-0 bg-[#1c2733]/55" />
        <p className="absolute bottom-3 left-0 right-0 text-center text-xs tracking-widest text-[#fdf9f2]/80">
          猫啊岛的夜，安静下来了
        </p>
      </div>

      <div className="mt-10 text-center">
        {lateNight ? (
          <p className="font-diary text-[16px] leading-[2.2] text-ink">
            今天太晚了，{cat.name}已经先睡下了。
            <br />
            你的话，它明早醒来第一眼就会看到。
          </p>
        ) : (
          <p className="font-diary text-[16px] leading-[2.2] text-ink">
            你离开后，{cat.name}把那张纸放在了床边。
            <br />
            它说，明天早上会告诉你今天发生的事。
          </p>
        )}
      </div>

      {/* 让它找到你:离岛页的第二次曝光(doc/11 §四,时态用将来时) */}
      <WechatConnect userId={viewerId!} catName={cat.name} catId={cat.id} variant="compact" />

      <div className="mt-10 text-center">
        <Link href="/my-cat" className="stamp-btn inline-block px-8 py-2.5">
          明天来看它
        </Link>
        <p className="mt-3 text-xs text-ink-faint">明早八点，它的第一篇日记会准时写好。</p>
      </div>
    </div>
  );
}
