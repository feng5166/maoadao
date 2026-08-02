import { WechatConnectClient } from "./WechatConnectClient";
import { wechatEnabled } from "@/lib/wechat/bridge";
import { getBoundChannel } from "@/lib/wechat/service";

// 「让它找到你」(doc/11 §四、doc/12 §二.3)外壳:通道关闭整体隐藏;已连上给确认行。
// iLink 模型:每用户专属二维码,扫码 → 对它说第一句话 → 激活(口令已退役)。
// 两处曝光:亮相屏(prominent)+ 离岛页(compact)。

export async function WechatConnect({
  userId,
  catName,
  variant,
}: {
  userId: string;
  catName: string;
  variant: "prominent" | "compact";
}) {
  if (!wechatEnabled()) return null;
  const bound = await getBoundChannel(userId);

  if (bound) {
    if (variant === "compact") return null; // 离岛页对已连上的不重复出现
    return <p className="mt-4 text-center text-xs text-ink-soft">✓ 它找到你了。有事它会捎信给你。</p>;
  }

  return (
    <div
      className={variant === "prominent" ? "note-slip mt-5 p-4" : "mt-6 border border-line bg-paper-deep/40 p-4"}
      style={variant === "prominent" ? { transform: "rotate(-0.4deg)" } : undefined}
    >
      <p className="font-diary text-center text-[15px] leading-[2] text-ink">
        明天{catName}醒来的时候，可能会想告诉你一些事情。
        <br />
        你愿意让它找到你吗？
      </p>
      <WechatConnectClient catName={catName} />
    </div>
  );
}
