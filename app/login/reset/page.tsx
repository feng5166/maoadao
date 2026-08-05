import Link from "next/link";
import { EmailResetForm } from "@/components/EmailResetForm";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { Track } from "@/components/Track";

export const dynamic = "force-dynamic";

// 忘记密码(doc/20 §六 找回分层):
// 邮箱已确认归属 → 邮件重置为主;未确认 → 只有回岛钥匙(钥匙永远保留,是离线灾备)。
export default function ResetPage() {
  return (
    <div className="mx-auto max-w-sm py-8">
      <Track events={[{ name: "reset_view" }]} />
      <div className="text-center">
        <p className="seal">忘记密码</p>
      </div>

      <div className="mt-6">
        <h2 className="font-title text-sm font-bold">用确认过的邮箱</h2>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-ink-faint">
          邮箱确认过归属才能走这条路。没确认过的话,下面用回岛钥匙。
        </p>
        <EmailResetForm />
      </div>

      <div className="mt-8 border-t border-line pt-5">
        <h2 className="font-title text-sm font-bold">用回岛钥匙</h2>
        <p className="mb-3 mt-1 text-xs leading-relaxed text-ink-faint">
          填上登录邮箱和当初抄下的回岛钥匙,设一个新密码。旧钥匙会作废,新钥匙当场给你一次。
        </p>
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
