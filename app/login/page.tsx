import Link from "next/link";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/LoginForm";
import { Track } from "@/components/Track";
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
      <div className="mt-6 space-y-2 text-center text-xs text-ink-faint">
        <p>
          忘记密码?<Link href="/login/reset" className="text-sea-deep hover:text-brick">用回岛钥匙回来</Link>
        </p>
        <p>
          第一次来?<Link href="/adopt" className="text-sea-deep hover:text-brick">我有一张船票</Link>
        </p>
        <p>
          没设过密码?<Link href="/account" className="text-sea-deep hover:text-brick">用回岛钥匙或邮箱验证码开门</Link>
        </p>
      </div>
    </div>
  );
}
