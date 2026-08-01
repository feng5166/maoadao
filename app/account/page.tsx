import Link from "next/link";
import { CopyCode } from "@/components/CopyCode";
import { SubmitButton } from "@/components/SubmitButton";
import {
  ensureRecoveryCode,
  recoverByCode,
  requestEmailCode,
  toggleNotify,
  verifyEmailCode,
} from "@/lib/account-actions";
import { emailEnabled } from "@/lib/email";
import { getViewerId } from "@/lib/identity";
import { getViewerCat } from "@/lib/queries";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

// /account：找回与通知。匿名 Cookie 支撑单设备，这里补跨设备找回（定义 v0.6·P0-1）

export default async function AccountPage() {
  const viewerId = await getViewerId();
  const user = viewerId ? await prisma.user.findUnique({ where: { id: viewerId } }) : null;
  const cat = await getViewerCat(viewerId);
  const recoveryCode = cat ? await ensureRecoveryCode() : null;
  const mailReady = emailEnabled();

  return (
    <div className="space-y-5">
      <h1 className="font-title text-xl font-bold">账户与找回</h1>

      {cat ? (
        <div className="border-t border-line pt-4">
          <p className="text-sm text-ink">
            当前身份养着 <Link href="/my-cat" className="font-bold text-brick">{cat.name}</Link>。
            身份存在这台设备的浏览器里——换设备或清了缓存，就靠下面两种方式找回。
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#EADFCC] bg-white p-5 text-sm text-ink shadow-sm">
          这台设备上还没有猫。如果你在别处养过，用下面的找回码或邮箱把它找回来；
          还没养过就去<Link href="/adopt" className="text-brick">领养一只</Link>。
        </div>
      )}

      {/* 找回码：零依赖，立即可用 */}
      <div className="border-t border-line pt-4">
        <h2 className="font-title font-bold">🐾 找回码</h2>
        {recoveryCode ? (
          <>
            <p className="mt-1 text-xs text-ink-faint">抄下这串猫爪印，换设备时输入即可找回你的猫。别告诉别人——拿到码就等于拿到猫。</p>
            <CopyCode code={recoveryCode} />
          </>
        ) : (
          <form action={recoverByCode} className="mt-2 flex gap-2">
            <input
              name="code" placeholder="MAO-XXXX-XXXX" maxLength={14}
              className="flex-1 border border-line bg-paper px-3 py-2 font-mono text-sm uppercase focus:border-sea-deep focus:outline-none"
            />
            <SubmitButton pendingText="找回中…" className="stamp-btn px-4 py-2 text-sm">
              找回我的猫
            </SubmitButton>
          </form>
        )}
      </div>

      {/* 邮箱绑定 / 登录 */}
      <div className="border-t border-line pt-4">
        <h2 className="font-title font-bold">📮 邮箱{user?.emailVerifiedAt ? "" : "绑定与找回"}</h2>
        {user?.emailVerifiedAt ? (
          <div className="mt-2 space-y-3 text-sm text-ink">
            <p>已绑定：{user.email}</p>
            <form action={toggleNotify}>
              <SubmitButton pendingText="…" className="border border-line px-4 py-1.5 text-xs text-ink-soft hover:border-sea-deep">
                {user.notifyDaily ? "🔔 每日故事邮件：开（点击关闭）" : "🔕 每日故事邮件：关（点击开启）"}
              </SubmitButton>
            </form>
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {!mailReady && (
              <p className="border-l-2 border-brick pl-2 text-xs text-brick">
                邮件服务尚未配置（缺 RESEND_API_KEY），验证码暂时发不出去——先用上面的找回码。
              </p>
            )}
            <form action={requestEmailCode} className="flex gap-2">
              <input
                name="email" type="email" placeholder="你的邮箱"
                className="flex-1 border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
              />
              <SubmitButton pendingText="发送中…" className="border border-line px-4 py-2 text-sm text-sea-deep hover:border-sea-deep">
                发验证码
              </SubmitButton>
            </form>
            <form action={verifyEmailCode} className="space-y-2">
              <div className="flex gap-2">
              <input
                name="email" type="email" placeholder="邮箱" required
                className="w-2/5 border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
              />
              <input
                name="code" placeholder="6 位验证码" maxLength={6} required
                className="flex-1 border border-line bg-paper px-3 py-2 text-sm focus:border-sea-deep focus:outline-none"
              />
              <SubmitButton pendingText="验证中…" className="stamp-btn px-4 py-2 text-sm">
                绑定/登录
              </SubmitButton>
              </div>
              <label className="flex items-center gap-2 text-xs text-ink-faint">
                <input type="checkbox" name="confirmSwitch" className="accent-[#5c7382]" />
                我知道，切换账户（仅当邮箱已绑定别的猫、且要放弃当前浏览器身份时勾选）
              </label>
            </form>
            <p className="text-xs text-ink-faint">绑定后：换设备可用邮箱找回；猫有新故事时会收到一封「内容钩子」邮件（可随时关闭）。</p>
          </div>
        )}
      </div>
    </div>
  );
}
