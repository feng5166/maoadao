"use client";

import { useEffect, useRef } from "react";

// 整拍可点(2026-08-06):推进下一拍的热区 = 一整屏,不再是画面那一小块。
// 拇指(或鼠标)落在哪儿都能接着看——原先只有画面和旁白那两块能点,四周留白全是死区,
// 够那行小字太费劲。让开三样:页头页脚(那儿的灯、海螺、备案号点了该干原来的事)、
// 真正的交互件(按钮/输入/链接)、正在选的文字。
// video 不排除(2026-08-09 走查修正):D0 的视频是无控件装饰循环,占满画面——
// 排除它会让"点一下画面,接着走"的提示变成谎话(点画面死区,只有下方文字区能点)
const INTERACTIVE = "a,button,input,textarea,select,label,summary,[role=button],[contenteditable=true]";

// 连点保护:热区变大之后,一次手抖的双击会整拍跳过去(故事拍是不可回退的)
const COOLDOWN_MS = 350;

/**
 * 点正文区任意空白 → 推进。传 null 表示这一拍不给点(如 D1 的拒绝拍:
 * 唯一正确的操作是不操作,doc/21 §九⑥)。
 */
export function useTapAdvance(advance: (() => void) | null | undefined) {
  const fnRef = useRef(advance);
  const lastRef = useRef(0);
  const enabled = Boolean(advance);

  // 换拍不重挂监听:回调放 ref,监听只随"给不给点"开关一次
  useEffect(() => {
    fnRef.current = advance;
  }, [advance]);

  useEffect(() => {
    if (!enabled) return;
    const onClick = (e: MouseEvent) => {
      const el = e.target instanceof Element ? e.target : null;
      if (!el || el.closest("header,footer") || el.closest(INTERACTIVE)) return;
      if (window.getSelection()?.toString()) return; // 在选字,不是在点
      const now = Date.now();
      if (now - lastRef.current < COOLDOWN_MS) return;
      lastRef.current = now;
      fnRef.current?.();
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [enabled]);
}
