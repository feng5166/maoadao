"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";

/** 有效停留埋点：离开/切走时上报一次——停了多久、读到多深（读没读完日记） */
export function StayTrack({ page }: { page: string }) {
  useEffect(() => {
    const start = Date.now();
    let maxDepth = 0;
    let sent = false;
    const onScroll = () => {
      const el = document.documentElement;
      const depth = el.scrollHeight <= el.clientHeight ? 1 : Math.min(1, (el.scrollTop + el.clientHeight) / el.scrollHeight);
      if (depth > maxDepth) maxDepth = depth;
    };
    const flush = () => {
      if (sent) return;
      sent = true;
      track("stay", {
        page,
        seconds: Math.min(1800, Math.round((Date.now() - start) / 1000)),
        depth: Math.round(maxDepth * 100),
      });
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") flush();
    };
    onScroll();
    addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    addEventListener("pagehide", flush);
    return () => {
      removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
      removeEventListener("pagehide", flush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
