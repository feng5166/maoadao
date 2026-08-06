import Link from "next/link";
import { CatAvatar } from "@/components/CatAvatar";
import { ReturnEmailForm } from "@/components/ReturnEmailForm";
import { ReturnKey } from "@/components/ReturnKey";
import { SubmitButton } from "@/components/SubmitButton";
import { TicketWallet } from "@/components/TicketWallet";
import { IconBoat, IconKey, IconMailbox, IconShell, IconTicket } from "@/components/icons";
import { WechatConnect } from "@/components/WechatConnect";
import { ensureRecoveryCode, logout, recoverByCode, toggleNotify } from "@/lib/account-actions";
import { CredentialsForm } from "@/components/CredentialsForm";
import { ChangeEmailForm, ChangePasswordForm } from "@/components/AccountSecurityForms";
import { emailEnabled } from "@/lib/email";
import { getSessionId, getViewerId } from "@/lib/identity";
import { listSessions } from "@/lib/session";
import { SessionList } from "@/components/SessionList";
import { getViewerCat, getWorld } from "@/lib/queries";
import { catDayOf } from "@/lib/sim/lifecycle";
import { SITE_URL } from "@/lib/site";
import { ensureBoatTickets } from "@/lib/tickets";
import { wechatEnabled } from "@/lib/wechat/bridge";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

/** 钥匙脱敏:留头尾两组,中间遮住。完整串只在验过身份后由 action 取回。 */
function maskKey(code: string): string {
  const parts = code.split("-");
  return parts.length > 3
    ? [parts[0], parts[1], ...parts.slice(2, -1).map(() => "••••"), parts[parts.length - 1]].join("-")
    : code;
}

// 岛民册(账户页世界观翻译):不是管理账号,是保管你在猫啊岛的身份、船票和回来的路。
// 结构:岛民身份卡 → 可以寄出的船票 → 回岛钥匙 → 留一个回岛地址 → 离岛与重新开始。
// 底层功能(找回码/邀请码/邮箱验证码)不变,只换语言和物件感。

export default async function AccountPage() {
  const viewerId = await getViewerId();
  const [user, cat, world] = await Promise.all([
    viewerId ? prisma.user.findUnique({ where: { id: viewerId } }) : null,
    getViewerCat(viewerId),
    getWorld(),
  ]);
  const [recoveryCode, tickets] = cat
    ? await Promise.all([ensureRecoveryCode(), viewerId ? ensureBoatTickets(viewerId) : []])
    : [null, [] as Awaited<ReturnType<typeof ensureBoatTickets>>];
  const mailReady = emailEnabled();

  // 在用的设备(doc/20 §八):只有设过凭证的账户才有会话可管
  const sessions = user?.passwordHash && viewerId
    ? (await listSessions(viewerId, await getSessionId())).map((s) => ({
        id: s.id,
        label: s.label,
        lastSeen: s.lastSeenAt.toISOString().slice(5, 16).replace("T", " "),
        current: s.current,
      }))
    : [];

  // 来岛天数(与我的猫同口径):firstTickDay 未回填的老数据退回首事件倒推
  let daysOnIsland = 0;
  if (cat) {
    const firstTickDay =
      cat.firstTickDay > 0
        ? cat.firstTickDay
        : ((await prisma.event.findFirst({ where: { catId: cat.id }, orderBy: { day: "asc" }, select: { day: true } }))?.day ?? world.day) + 1;
    daysOnIsland = catDayOf(world.day, firstTickDay);
  }

  // 海螺(微信通道)状态:功能开关关着就不提
  const shellConnected =
    cat && wechatEnabled() && viewerId
      ? Boolean(await prisma.channel.findFirst({ where: { userId: viewerId, kind: "wechat_openclaw" }, select: { id: true } }))
      : null;

  // 船票分堆 + 已用票的去向:谁用这张票上的岛、接了哪只猫(还没接到猫 = 未知喵)
  const available = tickets.filter((t) => !t.disabled && t.usedCount < t.maxUses);
  const spent = tickets.filter((t) => t.disabled || t.usedCount >= t.maxUses);
  const claimedBy = new Map<string, string | null>(); // code -> 猫名(null = 已上岛但还没接到猫)
  if (spent.length > 0) {
    const claimers = await prisma.user.findMany({
      where: { inviteCode: { in: spent.map((t) => t.code) } },
      select: { id: true, inviteCode: true },
    });
    const claimerCats = claimers.length
      ? await prisma.cat.findMany({ where: { ownerId: { in: claimers.map((c) => c.id) } }, select: { ownerId: true, name: true } })
      : [];
    const catByOwner = new Map(claimerCats.map((c) => [c.ownerId, c.name]));
    for (const c of claimers) if (c.inviteCode) claimedBy.set(c.inviteCode, catByOwner.get(c.id) ?? null);
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-title text-xl font-bold">我的岛民册</h1>
        <p className="mt-1 text-xs text-ink-faint">这里收着你在猫啊岛留下的身份、船票，以及回来时需要的凭证。</p>
      </div>

      {/* 岛民身份卡:先"我是谁、为什么属于这里",再谈怎么找回 */}
      {cat ? (
        <div>
          <div className="note-slip p-4" style={{ transform: "rotate(-0.4deg)" }}>
            <div className="flex items-center gap-3.5">
              {cat.arrivalPhotoUrl ? (
                // 相遇照片当证件照:比单独的猫头像更"我为什么属于这里"
                // eslint-disable-next-line @next/next/no-img-element -- 动态合成图走自有 API，长缓存
                <img
                  src={`${cat.arrivalPhotoUrl}${cat.arrivalPhotoUrl.includes("?") ? "&" : "?"}s=480`}
                  alt="" width={84} height={58}
                  className="h-[58px] w-[84px] shrink-0 rounded-sm border border-line object-cover"
                />
              ) : (
                <CatAvatar id={cat.id} size={52} portraitUrl={cat.portraitUrl} crop="head" />
              )}
              <div className="min-w-0">
                <p className="text-[10px] tracking-[0.2em] text-ink-faint">
                  猫啊岛 · 岛民{viewerId && <> · 登记号 {viewerId.replace(/[^a-z0-9]/gi, "").slice(-6).toUpperCase()}</>}
                </p>
                <p className="font-title mt-0.5 text-lg font-bold leading-tight text-ink">
                  <Link href="/my-cat" className="hover:text-brick">{cat.name}</Link>的主人
                </p>
                <p className="mt-1 text-xs text-ink-soft">
                  来到猫啊岛第 {daysOnIsland} 天
                  {shellConnected != null && <> · 海螺{shellConnected ? "已连接" : "还没连接"}</>}
                  {" · "}
                  {user?.passwordHash
                    ? user.emailVerifiedAt
                      ? "邮箱已确认"
                      : "可邮箱登录 · 邮箱未确认"
                    : "身份仅存于本设备"}
                </p>
              </div>
              <span className="ml-auto inline-block shrink-0 -rotate-2 rounded-[4px] border border-line px-1.5 text-[11px] leading-relaxed text-ink-faint">
                仍住在岛上
              </span>
            </div>
            {cat.firstWords && (
              <p className="font-diary mt-3 border-t border-dashed border-line pt-2.5 text-[13px] leading-relaxed text-ink-soft">
                它第一次见到你时，你说：「{cat.firstWords}」
              </p>
            )}
          </div>
          <p className="mt-2 text-xs leading-relaxed text-ink-faint">
            {user?.passwordHash
              ? "这段身份已收进岛民册——换设备时,用登录邮箱和密码就能回来。"
              : "你现在的岛民身份暂存在这台设备上。把它存进岛民册(设置登录邮箱和密码),换设备也能回来。"}
          </p>
        </div>
      ) : (
        <div className="border-t border-line pt-4 text-sm leading-relaxed text-ink">
          这台设备上还没有岛民身份。在别处上过岛的话，
          <Link href="/login" className="text-sea-deep hover:text-brick">用登录邮箱和密码回来</Link>，
          或用下面的回岛钥匙开门；还没上过岛，就<Link href="/adopt" className="text-brick">去码头接一只猫</Link>。
        </div>
      )}

      {/* 可以寄出的船票:默认只亮 3 张,其余收起;已寄出的看得到去向 */}
      {tickets.length > 0 && (
        <div id="tickets">
          <h2 className="font-title flex items-center gap-1.5 font-bold"><IconTicket size={15} /> 可以寄出的船票</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            每张船票只能带一位新岛民上岛，寄出去后就离开你的行囊。
            {available.length > 0 && <>你还有 {available.length} 张。</>}
          </p>
          {available.length > 0 && (
            <TicketWallet tickets={available.map((t) => ({ code: t.code, shareUrl: `${SITE_URL}/adopt?ticket=${t.code}` }))} />
          )}
          {spent.length > 0 && (
            <div className="mt-3 space-y-1.5">
              <p className="text-[11px] tracking-widest text-ink-faint">已有人凭这些票登岛</p>
              {spent.map((t) => (
                <div key={t.code} className="flex items-center justify-between gap-2 border border-line bg-paper-deep/40 px-3 py-2 text-xs">
                  <span className="font-mono text-ink-faint line-through">{t.code}</span>
                  <span className="shrink-0 text-ink-soft">
                    {t.disabled
                      ? "这张票停用了"
                      : claimedBy.has(t.code)
                        ? claimedBy.get(t.code)
                          ? `凭这张票登岛的岛民，接走了${claimedBy.get(t.code)}`
                          : "已登岛 · 还没接到猫（未知喵）"
                        : "已被用掉"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 登录邮箱与密码(doc/20):注册即用;验证是能力升级,不是使用门槛 */}
      {cat && (
        <div>
          <h2 className="font-title flex items-center gap-1.5 font-bold"><IconMailbox size={15} /> 登录邮箱与密码</h2>
          {user?.passwordHash ? (
            <div className="mt-2 space-y-2 text-sm text-ink">
              <p>
                登录邮箱:<span className="text-ink-soft">{user.email}</span>
                {user.emailVerifiedAt ? (
                  <span className="ml-2 text-xs text-sea-deep">已确认</span>
                ) : (
                  <span className="ml-2 text-xs text-ink-faint">尚未确认归属</span>
                )}
              </p>
              {!user.emailVerifiedAt && (
                <p className="text-xs leading-relaxed text-ink-faint">
                  目前它只用于登录。想让它也能在忘记密码时救你,去下面「确认邮箱」——确认前请保管好回岛钥匙。
                </p>
              )}
              <ChangeEmailForm currentEmail={user.email ?? ""} />
              <ChangePasswordForm />
              {sessions.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-xs text-ink-faint hover:text-ink-soft">在用的设备({sessions.length})</summary>
                  <SessionList sessions={sessions} />
                </details>
              )}
              <form action={logout}>
                <SubmitButton pendingText="…" className="border border-line px-4 py-1.5 text-xs text-ink-soft hover:border-sea-deep">
                  退出这台设备的登录
                </SubmitButton>
              </form>
            </div>
          ) : (
            <>
              <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                把这段相遇存进岛民册:设置登录邮箱和密码,以后换一台设备也能回到它身边。
              </p>
              <CredentialsForm />
            </>
          )}
        </div>
      )}

      {/* 海螺(doc/11 微信通道):岛民册这处是唯一常驻入口——亮相屏那处过了头两天就收起来。
          已连上给「换一只海螺」(换了微信/这只不响了);没连上的在这儿还能补上。 */}
      {cat && shellConnected != null && (
        <div>
          <h2 className="font-title flex items-center gap-1.5 font-bold"><IconShell size={15} /> 它捎信的那只海螺</h2>
          <p className="mt-1 text-xs leading-relaxed text-ink-faint">
            {shellConnected
              ? `${cat.name}要说什么，会捎到这只海螺上。换了微信，或者这只不响了，就在这儿换一只——扫成之前，旧的照常响。`
              : `${cat.name}有话想说的时候，还没有地方能找到你。`}
          </p>
          <div className="mt-3">
            <WechatConnect userId={viewerId!} catName={cat.name} variant="settle" />
          </div>
        </div>
      )}

      {/* 回岛钥匙(原找回码):有猫 = 展示要收好的钥匙;没猫 = 掏出钥匙开门 */}
      <div>
        <h2 className="font-title flex items-center gap-1.5 font-bold"><IconKey size={15} /> 回岛钥匙</h2>
        {recoveryCode ? (
          <>
            <p className="mt-1 text-xs leading-relaxed text-ink-faint">
              这串钥匙能帮你在新的设备上找回岛民身份。请把它放在只有自己知道的地方——拿到钥匙，就等于拿到猫。
            </p>
            <div className="mt-3">
              <ReturnKey masked={maskKey(recoveryCode)} needsPassword={Boolean(user?.passwordHash)} />
            </div>
          </>
        ) : (
          <>
            <p className="mt-1 text-xs text-ink-faint">在别的设备上抄过回岛钥匙？在这里用它开门。</p>
            <form action={recoverByCode} className="mt-2 flex gap-2">
              <input
                name="code" placeholder="MAO-XXXX-XXXX-…" maxLength={34}
                className="min-w-0 flex-1 border border-line bg-paper px-3 py-2 font-mono text-sm uppercase focus:border-sea-deep focus:outline-none"
              />
              <SubmitButton pendingText="开门中…" className="stamp-btn shrink-0 px-4 py-2 text-sm">
                回到岛上
              </SubmitButton>
            </form>
          </>
        )}
      </div>

      {/* 确认邮箱(doc/20):验证是能力升级门槛,不是使用门槛;验证的永远是账户自己的登录邮箱 */}
      {user?.passwordHash && user.email && (
        <div>
          <h2 className="font-title flex items-center gap-1.5 font-bold"><IconMailbox size={15} /> 确认邮箱</h2>
          {user.emailVerifiedAt ? (
            <div className="mt-2 space-y-3 text-sm text-ink">
              <p>
                这条回岛地址已经确认:<span className="text-ink-soft">{user.email}</span>
                <span className="ml-2 text-xs text-sea-deep">✓</span>
              </p>
              <ul className="space-y-0.5 text-xs text-ink-soft">
                <li>✓ 忘记密码可以用邮件重置</li>
                <li>✓ 每日故事信寄到这里</li>
                <li>✓ 海螺失联时,还有一条能找到你的路</li>
              </ul>
              <form action={toggleNotify}>
                <SubmitButton pendingText="…" className="border border-line px-4 py-1.5 text-xs text-ink-soft hover:border-sea-deep">
                  {user.notifyDaily ? "每日故事信：寄（点击停寄）" : "每日故事信：停（点击恢复）"}
                </SubmitButton>
              </form>
            </div>
          ) : (
            <>
              <p className="mt-1 text-xs leading-relaxed text-ink-faint">
                确认这个邮箱确实属于你之后,它就升级成一条可靠的回岛路:忘记密码能靠它救回,每日故事信也寄到这里。
              </p>
              <ReturnEmailForm email={user.email} mailReady={mailReady} />
            </>
          )}
        </div>
      )}

      {/* 离岛与重新开始:高风险不可逆,默认折叠、低饱和按钮,不用主 CTA 色 */}
      {cat && (
        <details className="border-t border-line pt-4">
          <summary className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-faint hover:text-ink-soft">
            <IconBoat size={15} /> 离岛与重新开始
          </summary>
          <div className="mt-3 space-y-3 text-sm leading-relaxed text-ink-soft">
            <p>
              平常不需要打开这里。
              重新领养之前，需要先送{cat.name}离开——它的日记、照片、朋友和这些天的记忆，都会跟船一起走，这趟船开出去就不回头了。
            </p>
            <Link href="/account/farewell" className="inline-block border border-line px-4 py-2 text-sm text-ink-soft transition-colors hover:border-sea-deep">
              去码头送别
            </Link>
          </div>
        </details>
      )}
    </div>
  );
}
