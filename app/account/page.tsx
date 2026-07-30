import Link from "next/link";
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
      <h1 className="text-xl font-bold">账户与找回</h1>

      {cat ? (
        <div className="rounded-2xl border border-[#EADFCC] bg-white p-5 shadow-sm">
          <p className="text-sm text-[#6B5D48]">
            当前身份养着 <Link href="/my-cat" className="font-bold text-[#E08E0B]">{cat.name}</Link>。
            身份存在这台设备的浏览器里——换设备或清了缓存，就靠下面两种方式找回。
          </p>
        </div>
      ) : (
        <div className="rounded-2xl border border-[#EADFCC] bg-white p-5 text-sm text-[#6B5D48] shadow-sm">
          这台设备上还没有猫。如果你在别处养过，用下面的找回码或邮箱把它找回来；
          还没养过就去<Link href="/adopt" className="text-[#E08E0B]">领养一只</Link>。
        </div>
      )}

      {/* 找回码：零依赖，立即可用 */}
      <div className="rounded-2xl border border-[#EADFCC] bg-white p-5 shadow-sm">
        <h2 className="font-bold">🐾 找回码</h2>
        {recoveryCode ? (
          <>
            <p className="mt-1 text-xs text-[#A89B85]">抄下这串猫爪印，换设备时输入即可找回你的猫。别告诉别人——拿到码就等于拿到猫。</p>
            <p className="mt-2 rounded-lg bg-[#FFF9EE] px-4 py-3 text-center font-mono text-lg tracking-wider text-[#8A6D1B]">
              {recoveryCode}
            </p>
          </>
        ) : (
          <form action={recoverByCode} className="mt-2 flex gap-2">
            <input
              name="code" placeholder="MAO-XXXX-XXXX" maxLength={14}
              className="flex-1 rounded-lg border border-[#E0D5C0] px-3 py-2 font-mono text-sm uppercase focus:border-[#F5A623] focus:outline-none"
            />
            <SubmitButton pendingText="找回中…" className="rounded-full bg-[#F5A623] px-4 py-2 text-sm font-medium text-white hover:bg-[#E08E0B]">
              找回我的猫
            </SubmitButton>
          </form>
        )}
      </div>

      {/* 邮箱绑定 / 登录 */}
      <div className="rounded-2xl border border-[#EADFCC] bg-white p-5 shadow-sm">
        <h2 className="font-bold">📮 邮箱{user?.emailVerifiedAt ? "" : "绑定与找回"}</h2>
        {user?.emailVerifiedAt ? (
          <div className="mt-2 space-y-3 text-sm text-[#6B5D48]">
            <p>已绑定：{user.email}</p>
            <form action={toggleNotify}>
              <SubmitButton pendingText="…" className="rounded-full border border-[#E0D5C0] px-4 py-1.5 text-xs text-[#6B5D48] hover:border-[#F5A623]">
                {user.notifyDaily ? "🔔 每日故事邮件：开（点击关闭）" : "🔕 每日故事邮件：关（点击开启）"}
              </SubmitButton>
            </form>
          </div>
        ) : (
          <div className="mt-2 space-y-3">
            {!mailReady && (
              <p className="rounded-lg bg-[#FDEDEC] p-2 text-xs text-[#A05252]">
                邮件服务尚未配置（缺 RESEND_API_KEY），验证码暂时发不出去——先用上面的找回码。
              </p>
            )}
            <form action={requestEmailCode} className="flex gap-2">
              <input
                name="email" type="email" placeholder="你的邮箱"
                className="flex-1 rounded-lg border border-[#E0D5C0] px-3 py-2 text-sm focus:border-[#F5A623] focus:outline-none"
              />
              <SubmitButton pendingText="发送中…" className="rounded-full border border-[#F5A623] px-4 py-2 text-sm text-[#E08E0B] hover:bg-[#FFF9EE]">
                发验证码
              </SubmitButton>
            </form>
            <form action={verifyEmailCode} className="flex gap-2">
              <input
                name="email" type="email" placeholder="邮箱" required
                className="w-2/5 rounded-lg border border-[#E0D5C0] px-3 py-2 text-sm focus:border-[#F5A623] focus:outline-none"
              />
              <input
                name="code" placeholder="6 位验证码" maxLength={6} required
                className="flex-1 rounded-lg border border-[#E0D5C0] px-3 py-2 text-sm focus:border-[#F5A623] focus:outline-none"
              />
              <SubmitButton pendingText="验证中…" className="rounded-full bg-[#F5A623] px-4 py-2 text-sm font-medium text-white hover:bg-[#E08E0B]">
                绑定/登录
              </SubmitButton>
            </form>
            <p className="text-xs text-[#A89B85]">绑定后：换设备可用邮箱找回；猫有新故事时会收到一封「内容钩子」邮件（可随时关闭）。</p>
          </div>
        )}
      </div>
    </div>
  );
}
