"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// 「让它找到你」交互层(iLink 版):点按钮 → 专属二维码 → 扫码 → 对它说第一句话 → 激活。
// 状态文案全部世界观内,不出现"绑定/授权/登录"。
// again=true 是换海螺(换了微信/这只不响了):同一条链路,只是发码时不被"已连上"挡回,
// 且轮询带 since——旧通道还在,不带 since 会被兜底逻辑当场误判成换好了。

type Phase = "idle" | "loading" | "qr" | "scanned" | "activated" | "error";

export function WechatConnectClient({ catName, again = false }: { catName: string; again?: boolean }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  // 存的是服务端渲好的 data URI,不是二维码载荷——绑定凭据不出服务端
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const qrcodeRef = useRef<string | null>(null);
  const sinceRef = useRef<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);
  useEffect(() => stopPolling, [stopPolling]);

  async function begin() {
    setPhase("loading");
    try {
      const r = await fetch(again ? "/api/wechat/qr?again=1" : "/api/wechat/qr").then((x) => x.json());
      if (r.bound) {
        setPhase("activated");
        return;
      }
      if (!r.ok || !r.qrDataUrl) {
        setPhase("error");
        return;
      }
      qrcodeRef.current = r.qrcode;
      sinceRef.current = typeof r.since === "string" ? r.since : null;
      setQrDataUrl(r.qrDataUrl as string);
      setPhase("qr");
      timerRef.current = setInterval(async () => {
        if (!qrcodeRef.current) return;
        try {
          const since = again && sinceRef.current ? `&since=${encodeURIComponent(sinceRef.current)}` : "";
          const s = await fetch(`/api/wechat/qr-status?qrcode=${encodeURIComponent(qrcodeRef.current)}${since}`).then((x) => x.json());
          if (s.state === "scanned") setPhase("scanned");
          if (s.state === "activated") {
            stopPolling();
            setPhase("activated");
            setTimeout(() => router.refresh(), 1200);
          }
          if (s.state === "expired") {
            stopPolling();
            setPhase("error");
          }
        } catch {
          /* 单次轮询失败忽略 */
        }
      }, 2500);
    } catch {
      setPhase("error");
    }
  }

  if (phase === "activated") {
    return (
      <p className="mt-3 text-center text-sm text-ink">
        {again ? "✓ 换好了。往后它捎信到这只海螺。" : "✓ 它找到你了。有事它会捎信给你。"}
      </p>
    );
  }

  return (
    <div className="mt-3 text-center">
      {phase === "idle" &&
        (again ? (
          <button type="button" onClick={begin} className="text-xs text-sea-deep hover:text-brick">
            换一只海螺
          </button>
        ) : (
          <button type="button" onClick={begin} className="stamp-btn px-6 py-2 text-sm">
            让它找到我
          </button>
        ))}
      {phase === "loading" && <p className="text-sm text-ink-soft">它竖起了耳朵……</p>}
      {(phase === "qr" || phase === "scanned") && qrDataUrl && (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- data URI,不走图片优化管线 */}
          <img
            src={qrDataUrl}
            alt="用海螺(微信)扫一扫"
            width={220}
            height={220}
            className="mx-auto border border-line"
          />
          {phase === "qr" ? (
            <p className="mt-2 text-xs text-ink-soft">
              {again
                ? "用你现在在用的海螺(微信)扫一下——扫完对它说句话，它就改捎到这只了。"
                : "用海螺(微信)扫一下——扫完，对它说第一句话，它就找到你了。"}
            </p>
          ) : (
            <p className="mt-2 text-sm text-ink">
              扫到了。海螺通了——对{catName}说第一句话，
              <br />
              说什么都行,它等着呢。
            </p>
          )}
        </div>
      )}
      {phase === "error" && (
        <p className="text-xs text-ink-faint">
          码过期了或者没连上——
          <button type="button" onClick={begin} className="text-sea-deep hover:text-brick">再试一次</button>
        </p>
      )}
    </div>
  );
}
