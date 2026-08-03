import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CatAvatar } from "@/components/CatAvatar";
import { SubmitButton } from "@/components/SubmitButton";
import { releaseCat } from "@/lib/account-actions";
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

      <form action={releaseCat} className="note-slip mx-auto mt-6 max-w-md p-4">
        <label className="flex items-start gap-2 text-sm font-bold text-ink">
          <input type="checkbox" name="confirmRelease" className="mt-1 accent-[#a8503c]" />
          <span>我想清楚了，送{cat.name}离开，它的一切都不保留</span>
        </label>
        <ul className="mt-3 space-y-1.5 border-t border-line pt-3 text-xs leading-relaxed text-ink-soft">
          <li>· 它的日记、照片和收到的信，会跟着船一起走</li>
          <li>· 它在岛上的痕迹，会被风和潮水慢慢带走</li>
          <li>· 这是一场告别，也是一个新的开始</li>
        </ul>
        <SubmitButton
          pendingText={`${cat.name}上船了，船正在慢慢驶远……`}
          className="stamp-btn mt-4 w-full"
        >
          送它上船
        </SubmitButton>
      </form>

      <p className="mt-4 text-center text-xs text-ink-faint">
        之后回到码头重新领养，需要一张新船票（你自己的票也可以用）。
      </p>
    </div>
  );
}
