"use client";

import { useEffect } from "react";
import { track } from "@vercel/analytics";

/** 页面浏览类漏斗事件：挂载时上报一次 */
export function Track({ events }: { events: { name: string; props?: Record<string, string | number | boolean> }[] }) {
  useEffect(() => {
    for (const e of events) track(e.name, e.props);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
