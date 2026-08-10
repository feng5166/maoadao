"use client";

import { useEffect, useRef, useState } from "react";
import { track } from "@vercel/analytics";
import { D0Player, D0_RESUME_KEY } from "./D0Player";
import { FLOW_VERSION } from "@/lib/d0/script";
import { enterYardAction } from "@/app/adopt/actions";

// 入岛心流总装(doc2.0/14 v3):D0(千人一面的认知跃迁)→〔进院子〕→ 真实 Yard。
// 旧 D1 七拍剧本流已随 2.1 翻转下线归档(doc/21 正典存档不删)。
// skip 与完整 D0 汇入同一结果:claimYard → /yard(跳过的只是电影,不是身份建立)。
// 跨会话不重播:看完或主动跳过的人,下次直接进院子;想再看一遍走 /adopt?d0=1。

export function AdoptFlow({
  ticket,
  d0Disposition,
  forceD0 = false,
}: {
  ticket?: string;
  /** 服务端从 cookie 读:completed | skipped | null */
  d0Disposition?: "completed" | "skipped" | null;
  /** ?d0=1:主动要求重看一遍引路 */
  forceD0?: boolean;
}) {
  const seenD0 = Boolean(d0Disposition) && !forceD0;
  const entering = useRef(false);
  const [going, setGoing] = useState(false);

  const goYard = () => {
    if (entering.current) return;
    entering.current = true;
    setGoing(true);
    track("d0_to_yard", { flowVersion: FLOW_VERSION });
    void enterYardAction(ticket ?? null);
  };

  useEffect(() => {
    if (forceD0) {
      sessionStorage.removeItem(D0_RESUME_KEY);
      return;
    }
    // 看过的人不重播,直接进院子(身份仍由 claimYard 幂等兜底)
    if (seenD0) goYard();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 去院子的路上:安静的一句,不是加载动画(跨境往返有两三秒,不能黑屏干等)
  if (going || seenD0) {
    return <p className="py-28 text-center font-diary text-ink-soft">往院子去……</p>;
  }

  return <D0Player ticket={ticket} replay={forceD0} onDone={goYard} />;
}
