import "./_env";
// 中文 webfont 发布(2026-08-06 性能治理):把三个字体包的分片 CSS + 被引用的 woff2
// 搬到 public/fonts/,让它们脱离 Next 的渲染阻塞 CSS 包。
//
// 背景:CJK 字体按 unicode-range 切成上百片,每片一条 @font-face —— 三个包合计
// 约 106KB(gz)的纯声明,原先随 layout 的 import 进了每一页的阻塞样式表。
// 而按设计它们只是兜底(Apple 有 Songti/Kaiti、Windows 有 SimSun/KaiTi),
// 绝大多数用户一个字节的字体文件都不会下 —— 却先被这 106KB 挡住首屏。
// 现在改由 components/FontFallback.tsx 探测系统字体后按需 <link> 进来。
//
// 幂等可重跑;升级字体包后重跑一次。用法:npx tsx scripts/fonts-publish.ts
import fs from "node:fs";
import path from "node:path";

const OUT = path.join("public", "fonts");
const SOURCES = [
  { css: "node_modules/@fontsource/noto-serif-sc/400.css", out: "noto-serif-sc-400.css", files: "node_modules/@fontsource/noto-serif-sc/files" },
  { css: "node_modules/@fontsource/noto-serif-sc/700.css", out: "noto-serif-sc-700.css", files: "node_modules/@fontsource/noto-serif-sc/files" },
  { css: "node_modules/lxgw-wenkai-lite-webfont/lxgwwenkailite-regular.css", out: "lxgw-wenkai-lite.css", files: "node_modules/lxgw-wenkai-lite-webfont/files" },
];

function main() {
  fs.mkdirSync(path.join(OUT, "files"), { recursive: true });
  let copied = 0;
  let bytes = 0;
  for (const src of SOURCES) {
    // 先剥掉 .woff 旧回退:woff2 从 2016 年起全平台支持(iOS 10+/Chrome 36+),
    // 留着等于把 9MB 死资产搬进仓库。剥完再抽引用,免得拷了没人要的文件
    const css = fs
      .readFileSync(src.css, "utf8")
      .replace(/,\s*url\(\s*['"]?[^'")]+\.woff['"]?\s*\)\s*format\(\s*['"]woff['"]\s*\)/g, "");
    // url(./files/x.woff2) / url('../files/x.woff2') → url(./files/x.woff2)。
    // 引号可有可无(@fontsource 不带、lxgw 带单引号)——早期漏了引号那版会静默 0 片
    const URL_RE = /url\(\s*['"]?([^'")]*?\/)?([^/'")]+\.woff2)['"]?\s*\)/g;
    const refs = [...css.matchAll(URL_RE)].map((m) => m[2]);
    for (const f of new Set(refs)) {
      const from = path.join(src.files, f);
      const to = path.join(OUT, "files", f);
      if (!fs.existsSync(from)) {
        console.warn(`[warn] 缺分片 ${from}`);
        continue;
      }
      if (!fs.existsSync(to)) {
        fs.copyFileSync(from, to);
        copied++;
      }
      bytes += fs.statSync(to).size;
    }
    const rewritten = css.replace(URL_RE, "url(./files/$2)");
    fs.writeFileSync(path.join(OUT, src.out), rewritten);
    const n = new Set(refs).size;
    if (n === 0) throw new Error(`${src.out} 一片都没解析到——url 格式变了,别发一份空引用的 CSS 上线`);
    console.log(`✓ ${src.out}  ${Math.round(rewritten.length / 1024)}KB CSS / ${n} 片`);
  }
  console.log(`分片新拷 ${copied} 个,public/fonts/files 合计 ${Math.round(bytes / 1024 / 1024)}MB`);
}
main();
