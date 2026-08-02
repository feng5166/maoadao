"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// 相遇等待(doc/12 §八.9):把生成延迟解释为世界过程,不显示"加载中/生成中"。
// 世界观修正(2026-08-02):相遇页它已蹲在码头行李堆旁——等待不是"等船",
// 是"你们在互相看清对方"。stage=boat:立绘未定稿;stage=photo:合影在冲洗。
// 超时不阻塞:文案切到"晚点洗出来",继续慢速轮询,资产随后补齐。

const BOAT_LINES = ["它从行李堆后面探出头,朝你这边看。", "棉花小声说:它认生,先让它闻闻你。", "它绕着你走了半圈,尾巴慢慢竖了起来。"];
const BOAT_LATE = "它还在慢慢凑近——你先别动,快了。";
const PHOTO_LINE = "码头的合影正在冲洗。";
const PHOTO_LATE = "照片晚点洗出来——洗好第一时间给你看。";
const TIMEOUT_MS = 90_000;

export function BoatArriving({ stage }: { stage: "boat" | "photo" }) {
  const router = useRouter();
  const [i, setI] = useState(0);
  const [late, setLate] = useState(false);
  const startRef = useRef(Date.now());

  useEffect(() => {
    const textTimer = setInterval(() => setI((x) => x + 1), 6000);
    const lateTimer = setTimeout(() => setLate(true), TIMEOUT_MS);
    let pollTimer: ReturnType<typeof setInterval> | null = setInterval(() => {
      // 超时后降频轮询,资产随后补齐(不向用户暴露任何重试概念)
      if (Date.now() - startRef.current > TIMEOUT_MS * 4 && pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
        return;
      }
      router.refresh();
    }, 8000);
    return () => {
      clearInterval(textTimer);
      clearTimeout(lateTimer);
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [router]);

  const text =
    stage === "photo"
      ? late
        ? PHOTO_LATE
        : PHOTO_LINE
      : late
        ? BOAT_LATE
        : BOAT_LINES[Math.min(i, BOAT_LINES.length - 1)];

  return (
    <p className="font-diary mt-3 animate-pulse text-center text-[15px] text-ink-soft" style={{ animationDuration: "3s" }}>
      {text}
    </p>
  );
}
