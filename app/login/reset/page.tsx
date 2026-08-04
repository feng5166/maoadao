import Link from "next/link";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { Track } from "@/components/Track";

export const dynamic = "force-dynamic";

// 用回岛钥匙回来(doc/20):邮箱未验证阶段,钥匙是忘记密码的唯一找回路。
export default function ResetPage() {
  return (
    <div className="mx-auto max-w-sm py-8">
      <Track events={[{ name: "reset_view" }]} />
      <div className="text-center">
        <p className="seal">用回岛钥匙回来</p>
        <p className="mt-3 text-sm leading-relaxed text-ink-soft">
          填上登录邮箱和当初抄下的回岛钥匙,设一个新密码。
        </p>
      </div>
      <div className="mt-6">
        <ResetPasswordForm />
      </div>
      <p className="mt-6 text-center text-xs leading-relaxed text-ink-faint">
        如果邮箱、密码和钥匙都找不到了,猫啊岛目前没有办法证明这段身份属于你——
        <br />
        这也是我们请你抄下钥匙的原因。
      </p>
      <p className="mt-4 text-center text-xs">
        <Link href="/login" className="text-sea-deep hover:text-brick">← 回登录</Link>
      </p>
    </div>
  );
}
