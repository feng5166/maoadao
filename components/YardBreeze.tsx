"use client";

import { useSyncExternalStore } from "react";

// 首摆可发现性·最轻一档(W01 第二轮,创始人预案唯一授权形态):
// 用户第一次进入 Yard(院子从未有过任何生活)时,一片叶子被风吹过中央空地,
// 落在能摆东西的位置附近——一次,很短,然后就没有了。
// 红线:仍然是"环境在动",不是系统在喊"点这里"——禁发光/手势/箭头(11 §12.4 边界内,
// 创始人特批的一次性环境微动);减少动效偏好下不出现;每会话至多一次。

const KEY = "yard-breeze-done";

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia("(prefers-reduced-motion: reduce)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => true,
  );
}

function useSeenOnce(): boolean {
  // 首渲染读一次;渲染后立即记号(同会话刷新不再吹)
  return useSyncExternalStore(
    () => () => {},
    () => {
      if (sessionStorage.getItem(KEY)) return true;
      sessionStorage.setItem(KEY, "1");
      return false;
    },
    () => true,
  );
}

export function YardBreeze({ x, y }: { x: number; y: number }) {
  const reduced = useReducedMotion();
  const seen = useSeenOnce();
  if (reduced || seen) return null;
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, animation: "yard-breeze 3.2s ease-in-out 1.4s 1 both" }}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" style={{ animation: "yard-breeze-spin 3.2s ease-in-out 1.4s 1 both" }}>
        <path
          d="M4.5 14.5 C7 8.5, 14 5.5, 19.5 6.5 C18.5 12.5, 13 16.5, 7 15.5 Z"
          fill="rgba(126,138,104,0.65)"
          stroke="rgba(88,96,72,0.5)"
          strokeWidth="1"
        />
        <path d="M6.5 14 C10 11, 14 8.5, 18 7.5" fill="none" stroke="rgba(88,96,72,0.4)" strokeWidth="0.9" />
      </svg>
      <style>{`
        @keyframes yard-breeze {
          0% { transform: translate(-160px, -60px); opacity: 0; }
          12% { opacity: 0.9; }
          55% { transform: translate(-46px, -6px); opacity: 0.9; }
          78% { transform: translate(-8px, 4px); opacity: 0.85; }
          100% { transform: translate(4px, 8px); opacity: 0; }
        }
        @keyframes yard-breeze-spin {
          0% { transform: rotate(-30deg); }
          55% { transform: rotate(40deg); }
          100% { transform: rotate(65deg); }
        }
      `}</style>
    </div>
  );
}
