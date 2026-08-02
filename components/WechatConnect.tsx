import { CopyCode } from "./CopyCode";
import { Track } from "./Track";
import { wechatEnabled } from "@/lib/wechat/openclaw";
import { getBoundChannel, getOrCreatePairingCode } from "@/lib/wechat/service";

// 「让它找到你」(doc/11 §四、doc/12 §二.3):微信绑定的世界观包装。
// 口径红线:用户可见文案不出现"绑定/授权/通知/微信绑定"。
// 两处曝光:亮相屏(prominent)+ 离岛页(再见一次);已连上显示"它找到你了"。

export async function WechatConnect({
  userId,
  catName,
  catId,
  variant,
}: {
  userId: string;
  catName: string;
  catId: string;
  variant: "prominent" | "compact";
}) {
  if (!wechatEnabled()) return null;
  const bound = await getBoundChannel(userId);

  if (bound) {
    if (variant === "compact") return null; // 离岛页对已连上的不重复出现
    return (
      <p className="mt-4 text-center text-xs text-ink-soft">
        ✓ 它找到你了。有事它会捎信给你。
      </p>
    );
  }

  const code = await getOrCreatePairingCode(userId, catId);
  const qr = process.env.WECHAT_QR_URL;
  const contact = process.env.WECHAT_CONTACT_NAME;

  return (
    <div className={variant === "prominent" ? "note-slip mt-5 p-4" : "mt-6 border border-line bg-paper-deep/40 p-4"} style={variant === "prominent" ? { transform: "rotate(-0.4deg)" } : undefined}>
      <p className="font-diary text-center text-[15px] leading-[2] text-ink">
        明天{catName}醒来的时候，可能会想告诉你一些事情。
        <br />
        你愿意让它找到你吗？
      </p>
      <details className="mt-3">
        <summary className="stamp-btn mx-auto block w-fit cursor-pointer list-none px-6 py-2 text-center text-sm">
          让它找到我
        </summary>
        <div className="mt-4 text-center">
          <Track events={[{ name: "wechat_cta_click" }]} />
          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element -- 运维配置的静态二维码
            <img src={qr} alt="它的微信" width={180} height={180} className="mx-auto h-44 w-44 border border-line" />
          ) : contact ? (
            <p className="text-sm text-ink">微信搜「{contact}」</p>
          ) : null}
          <p className="mt-3 text-xs text-ink-soft">加上它的微信，把这个口令念给它：</p>
          <div className="mx-auto mt-1 max-w-[240px]">
            <CopyCode code={code} />
          </div>
          <p className="mt-2 text-xs text-ink-faint">它认出口令，就找到你了。</p>
        </div>
      </details>
    </div>
  );
}
