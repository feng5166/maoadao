"use client";

import type { MotionSpec } from "@/lib/visual/motion";

// 统一微动播放器(doc/15 V1.5·P2):MotionSpec → 画面轻轻活起来。
// 当前全部 cue 是 CSS 连续型(呼吸/云影/波光/雨丝),由浏览器调度:
// prefers-reduced-motion 在 globals.css 统一关停,后台标签页浏览器自动节流。
// 离散 cue(眨眼/耳动等素材型)的随机触发/冷却/同屏并发引擎等素材层落地后在这里补,
// triggerPolicy 字段已就位。

export function LivingImage({
  motion,
  className,
  inline = false,
  children,
}: {
  motion: MotionSpec;
  className?: string;
  /** 小卡片/头像用:按内容收缩 */
  inline?: boolean;
  children: React.ReactNode;
}) {
  if (motion.mode === "NONE") {
    return <div className={className}>{children}</div>;
  }

  const breathe = motion.idleMotions.find((c) => c.cssClass?.includes("fx-cat-breathe"));
  const body = breathe ? (
    <div
      className={`${inline ? "inline-block" : ""} ${breathe.cssClass}`}
      style={breathe.delayMs ? ({ animationDelay: `${breathe.delayMs}ms` } as React.CSSProperties) : undefined}
    >
      {children}
    </div>
  ) : (
    children
  );

  return (
    <div className={className}>
      {/* 环境层在前:绝对定位盖过底图,而猫等绝对定位子元素在 DOM 更后、画在环境层之上 */}
      {motion.ambientMotions.map((c) => (
        <div key={c.type} className={c.cssClass} />
      ))}
      {body}
    </div>
  );
}
