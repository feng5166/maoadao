"use client";

import { useEffect } from "react";

// 无 UI:挂载后打一次 /api/visit,给这台浏览器留下"来过"的痕迹。
// 脚印是增强体验,失败静默——首页照常能用。
export function MarkIslandVisit() {
  useEffect(() => {
    const ctrl = new AbortController();
    void fetch("/api/visit", {
      method: "POST",
      credentials: "same-origin",
      keepalive: true,
      signal: ctrl.signal,
    }).catch(() => {});
    return () => ctrl.abort();
  }, []);
  return null;
}
