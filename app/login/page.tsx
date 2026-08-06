import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Track } from "@/components/Track";
import { recoverByCode } from "@/lib/account-actions";
import { getViewerId } from "@/lib/identity";
import { getViewerCat } from "@/lib/queries";

export const dynamic = "force-dynamic";

// 回到猫啊岛(doc/20):邮箱+密码跨设备登录。已有猫的设备直接回 /my-cat。
export default async function LoginPage() {
  const viewerId = await getViewerId();
  const cat = await getViewerCat(viewerId);
  if (cat) redirect("/my-cat");

  return (
    <div className="mx-auto max-w-sm py-8">
      <Track events={[{ name: "login_view" }]} />
      <div className="text-center">
        <p className="seal">回到猫啊岛</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">它还记得你。用登录邮箱和密码回来。</p>
      </div>
      <div className="mt-6">
        <LoginForm />
      </div>
      {/* 回岛钥匙就地开门(2026-08-06):此前只给一个指向岛民册的链接,而钥匙表单埋在
          岛民册内部——没设过密码的老岛民(大多数)在"回来"这条路上等于没有入口。
          真正的双路在这一页给全:上面邮箱密码,下面钥匙。 */}
      <div className="mt-8">
        <hr className="paper-rule" />
        <p className="mt-6 text-center text-sm text-ink-soft">没设过登录邮箱和密码?</p>
        <p className="mt-1 text-center text-xs leading-relaxed text-ink-faint">
          用你抄下来的回岛钥匙开门——拿到钥匙，就等于拿到猫。
        </p>
        <form action={recoverByCode} className="mt-3 flex gap-2">
          <input
            name="code"
            placeholder="MAO-XXXX-XXXX-…"
            maxLength={34}
            aria-label="你的回岛钥匙"
            className="min-w-0 flex-1 border border-line bg-paper px-3 py-2 font-mono text-sm uppercase focus:border-sea-deep focus:outline-none"
          />
          <SubmitButton pendingText="开门中…" className="stamp-btn shrink-0 px-4 py-2 text-sm">
            回到岛上
          </SubmitButton>
        </form>
      </div>

      <div className="mt-8 space-y-2 text-center text-xs text-ink-faint">
        <p>
          忘记密码?<Link href="/login/reset" className="text-sea-deep hover:text-brick">用确认过的邮箱或回岛钥匙重置</Link>
        </p>
        <p>
          第一次来?<Link href="/adopt" className="text-sea-deep hover:text-brick">我有一张船票</Link>
        </p>
      </div>
    </div>
  );
}
