import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CatAvatar } from "@/components/CatAvatar";
import { FarewellConfirm } from "@/components/FarewellConfirm";
import { getViewerId } from "@/lib/identity";
import { getViewerCat } from "@/lib/queries";

export const dynamic = "force-dynamic";

// 送别页：重新领养前的告别仪式。从码头接它来，也从码头送它走。
// 不是弹窗确认，是一页完整的黄昏——决定要在看得见船的地方做。

export default async function FarewellPage() {
  const cat = await getViewerCat(await getViewerId());
  if (!cat) redirect("/account");

  return (
    <div className="mx-auto max-w-lg">
      <div className="flex items-center justify-between">
        <h1 className="font-title text-xl font-bold">想重新领养一只？</h1>
        <Link href="/account" className="shrink-0 border border-line px-3 py-1 text-xs text-ink-soft hover:border-sea-deep">
          先不了，回去
        </Link>
      </div>

      <div className="relative mt-4 overflow-hidden rounded-lg border border-line">
        <Image
          src="/scenes/farewell.jpg"
          alt="黄昏的码头，一艘小船正驶向海平线"
          width={1200} height={686} priority className="w-full"
        />
        {/* 它坐在码头这头，和你一起看着那艘船 */}
        <div className="absolute bottom-2 left-2 rounded-full border-2 border-paper">
          <CatAvatar id={cat.id} size={64} portraitUrl={cat.portraitUrl} />
        </div>
      </div>

      <h2 className="font-title mt-8 text-center text-lg font-bold">
        重新领养，得先送{cat.name}离开小岛。
      </h2>
      <p className="mt-2 text-center text-sm leading-relaxed text-ink">
        它的日记、照片、朋友和这些天的记忆，都会跟着船一起走——<b>没有找回的办法</b>。
      </p>

      <FarewellConfirm catName={cat.name} />

      <p className="mt-4 text-center text-xs text-ink-faint">
        之后回到码头重新领养，需要一张新船票（你自己的票也可以用）。
      </p>
    </div>
  );
}
