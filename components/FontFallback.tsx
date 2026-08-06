"use client";

import { useEffect } from "react";
import { cdn } from "@/lib/assets";

// 中文 webfont 按需兜底(2026-08-06 性能治理)。
//
// 设计(AGENTS.md §3):标题/报纸体先用系统宋体、日记体先用系统楷体,自托管 webfont
// 只是缺字库时的兜底。但 CJK 字体按 unicode-range 切成上百片、每片一条 @font-face,
// 三份声明合起来约 106KB(gz)——原先随 layout 的 CSS import 进了每一页的**渲染阻塞**
// 样式表:Apple/Windows 用户一个字体文件都不下,却要先等这 106KB 下完才看得到画面
//(跨境链路高峰期实测 31KB/s,约 3.4 秒纯等待)。
//
// 现在:首屏零字体成本;挂载后探测系统字体,缺哪套才 <link> 哪套进来。
//
// 探测判据用 canvas 量**拉丁串**宽度 —— 两条更直觉的路都实测废了(2026-08-06):
//   · document.fonts.check():对压根不存在的字体也返回 true,分辨不了;
//   · 用中文串量宽度:macOS 的 monospace 本身就回落到同一套中文字体,
//     真有 Songti SC 也测出"宽度相同"= 假阴性(会给所有人白塞 100KB)。
// 宋体/楷体都自带拉丁字形,与 monospace/sans-serif 的字宽差异稳定可测。

// 走 cdn():字体分片对缺字库的设备是几百 KB 起步,最该走国内直连。
// CSS 里的 url(./files/...) 是相对路径,跟着 CSS 所在域一起走,不用另行改写
const CSS = {
  serif: [cdn("/fonts/noto-serif-sc-400.css"), cdn("/fonts/noto-serif-sc-700.css")],
  kai: [cdn("/fonts/lxgw-wenkai-lite.css")],
};

/** 系统里是否装着这个字体族 */
function hasFont(family: string): boolean {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return true; // 量不了就当有——宁可不加载,也不给所有人塞 100KB
  const text = "mmmmmmmmmmlliWWWW"; // 拉丁串:字宽差异最大的一组
  const widthOf = (stack: string) => {
    ctx.font = `72px ${stack}`;
    return ctx.measureText(text).width;
  };
  // 两个基准都比过:字体缺失时回落到基准,宽度会与基准完全一致
  return ["monospace", "sans-serif"].some((base) => widthOf(`"${family}", ${base}`) !== widthOf(base));
}

function load(hrefs: string[]) {
  for (const href of hrefs) {
    if (document.querySelector(`link[href="${href}"]`)) continue;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.appendChild(link);
  }
}

export function FontFallback() {
  useEffect(() => {
    // globals.css 的字体栈:宋体系 = Songti SC / SimSun;楷体系 = Kaiti SC / STKaiti / KaiTi
    try {
      if (!["Songti SC", "SimSun"].some(hasFont)) load(CSS.serif);
      if (!["Kaiti SC", "STKaiti", "KaiTi"].some(hasFont)) load(CSS.kai);
    } catch {
      // 探测失败不兜底:系统字体栈本身就是可读的,不值得为此赌 100KB
    }
  }, []);
  return null;
}
