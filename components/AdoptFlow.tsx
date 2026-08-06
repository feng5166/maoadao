"use client";

import { useEffect, useState } from "react";
import { D0Player } from "./D0Player";
import { D1Script } from "./D1Script";

// 入岛心流总装(doc2.0/14 §四):D0(千人一面的认知跃迁)→〔去见它〕→ D1(千人千面的相遇)。
// S1 的"直接去见它"跳过口也落到 D1 岔路(doc/21 §九①:跳过者直进拍 2)。
// 刷新续播:D0 屏级续播在 D0Player 里;跨到 D1 后不再回 D0(心流单向)。

const STAGE_KEY = "adopt-stage";

export function AdoptFlow({ ticket }: { ticket?: string }) {
  const [stage, setStage] = useState<"d0" | "d1">("d0");
  const [skipped, setSkipped] = useState(false);

  useEffect(() => {
    if (sessionStorage.getItem(STAGE_KEY) === "d1") setStage("d1");
  }, []);

  if (stage === "d0") {
    return (
      <D0Player
        ticket={ticket}
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
