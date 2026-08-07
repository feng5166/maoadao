"use client";

import { useEffect, useState } from "react";
import { track } from "@vercel/analytics";
import { D0Player, D0_RESUME_KEY } from "./D0Player";
import { FLOW_VERSION } from "@/lib/d0/script";
import { D1Script } from "./D1Script";

// 入岛心流总装(doc2.0/14 §四):D0(千人一面的认知跃迁)→〔去见它〕→ D1(千人千面的相遇)。
// S1 的"直接去见它"跳过口也落到 D1 岔路(doc/21 §九①:跳过者直进拍 2)。
// 刷新续播:D0 屏级续播在 D0Player 里;跨到 D1 后不再回 D0(心流单向)。
// 跨会话不重播(2026-08-06):看完或主动跳过的人,下次直接从 D1 开始——
// 心流单向不只在一次会话内成立。想再看一遍走 /adopt?d0=1(首页状态 3 给了低权重入口)。

const STAGE_KEY = "adopt-stage";

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
  const [stage, setStage] = useState<"d0" | "d1">(seenD0 ? "d1" : "d0");
  const [skipped, setSkipped] = useState(d0Disposition === "skipped");

  /* eslint-disable react-hooks/set-state-in-effect --
     storage 只在客户端存在:放进 useState 惰性初值会让服务端渲一屏、客户端渲另一屏
     (水合不一致)。挂载后再落座是这类"客户端专有初值"的正确位置,别改成初值读取。 */
  useEffect(() => {
    // 主动要求重看:先把上一轮的续播记号清掉,否则 adopt-stage=d1 会把 ?d0=1 盖回去
    if (forceD0) {
      sessionStorage.removeItem(STAGE_KEY);
      sessionStorage.removeItem(D0_RESUME_KEY);
      return;
    }
    if (seenD0) {
      track(d0Disposition === "skipped" ? "d1_enter_after_d0_skip" : "d1_enter_after_d0_complete", { flowVersion: FLOW_VERSION });
      return;
    }
    if (sessionStorage.getItem(STAGE_KEY) === "d1") setStage("d1");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  if (stage === "d0") {
    return (
      <D0Player
        ticket={ticket}
        replay={forceD0}
        onDone={(mode) => {
          setSkipped(mode === "skip");
          sessionStorage.setItem(STAGE_KEY, "d1");
          setStage("d1");
        }}
      />
    );
  }
  return <D1Script ticket={ticket} skipped={skipped} />;
}
