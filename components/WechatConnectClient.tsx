"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// 「让它找到你」交互层(iLink 版):点按钮 → 专属二维码 → 扫码 → 对它说第一句话 → 激活。
// 状态文案全部世界观内,不出现"绑定/授权/登录"。

type Phase = "idle" | "loading" | "qr" | "scanned" | "activated" | "error";

export function WechatConnectClient({ catName }: { catName: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [qrImg, setQrImg] = useState<string | null>(null);
  const qrcodeRef = useRef<string | null>(null);
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
      const r = await fetch("/api/wechat/qr").then((x) => x.json());
      if (r.bound) {
        setPhase("activated");
        return;
      }
      if (!r.ok || !r.qrImg) {
        setPhase("error");
        return;
      }
      qrcodeRef.current = r.qrcode;
      setQrImg(r.qrImg as string);
      setPhase("qr");
      timerRef.current = setInterval(async () => {
        if (!qrcodeRef.current) return;
        try {
          const s = await fetch(`/api/wechat/qr-status?qrcode=${encodeURIComponent(qrcodeRef.current)}`).then((x) => x.json());
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
    return <p className="mt-3 text-center text-sm text-ink">✓ 它找到你了。有事它会捎信给你。</p>;
  }

  return (
    <div className="mt-3 text-center">
      {phase === "idle" && (
        <button type="button" onClick={begin} className="stamp-btn px-6 py-2 text-sm">
          让它找到我
        </button>
      )}
      {phase === "loading" && <p className="text-sm text-ink-soft">它竖起了耳朵……</p>}
      {(phase === "qr" || phase === "scanned") && qrImg && (
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element -- 二维码由公共服务渲染(内容是微信认的 URL) */}
          <img
            src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(qrImg)}`}
            alt="用微信扫一扫"
            width={220}
            height={220}
            className="mx-auto border border-line"
          />
          {phase === "qr" ? (
            <p className="mt-2 text-xs text-ink-soft">用微信扫一下——扫完,对它说第一句话,它就找到你了。</p>
          ) : (
            <p className="mt-2 text-sm text-ink">
              扫到了。现在在微信里对{catName}说第一句话——
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
