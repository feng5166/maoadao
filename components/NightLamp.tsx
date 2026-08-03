"use client";

import { useState } from "react";
import { IconLamp } from "./icons";

// 夜灯开关(只在夜间时段出现):夜里全站默认换夜色纸,点灯切回纸张白。
// 偏好写 cookie(服务端渲染时读,无闪白),半年有效。
export function NightLamp({ initialLit }: { initialLit: boolean }) {
  const [lit, setLit] = useState(initialLit);
  function toggle() {
    const next = !lit;
    setLit(next);
    document.documentElement.setAttribute("data-theme", next ? "day" : "night");
    document.cookie = `lamp=${next ? "on" : "off"}; path=/; max-age=15552000; samesite=lax`;
  }
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={lit ? "熄灯，让岛入夜" : "点灯，切回纸张色"}
      title={lit ? "熄灯" : "点灯"}
      className={lit ? "text-lamp transition-colors hover:text-ink-soft" : "text-ink-faint transition-colors hover:text-lamp"}
    >
      <IconLamp size={19} />
    </button>
  );
}
