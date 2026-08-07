// 语言防火墙扫描(doc2.0/04 §六负面词典 + §八合回清单"词表进 eval 脚本自动 grep")。
// 只扫字符串字面量里的中文文案(注释与代码标识符不算用户侧);命中即列出,人工裁决。
// 用法:npx tsx scripts/lang-scan.ts [文件...](缺省扫用户侧组件/页面/文案配置)
import fs from "node:fs";
import path from "node:path";
import { BANNED_WORDS } from "../lib/narrative/lexicon";

// doc2.0/04 §六 五词系 + doc/05 用户侧禁系统词(AGENTS.md §4)
// 词表已抽到 lib/narrative/lexicon.ts —— 构建期扫源码与运行期校验 LLM 产出共用一份,
// 免得两边各维护一张、慢慢长歪(2026-08-07)
const BANNED: [string, string][] = BANNED_WORDS.map((b) => [b.word, b.family]);
// 「开启」在词典里属产品发布语系;白名单场景词(听海开启时=设置态描述,非运营话术)单独裁决

const DEFAULT_TARGETS = [
  "lib/d0/script.ts",
  "components/D0Player.tsx",
  "components/D1Script.tsx",
  "components/AdoptFlow.tsx",
  "app/adopt/page.tsx",
  "app/page.tsx",
  "lib/actions.ts",
  "data/qizai-archive.json",
];

/** 抽出字符串字面量(含模板串),行号保留——注释里的词不报 */
function literalsOf(src: string): { line: number; text: string }[] {
  const out: { line: number; text: string }[] = [];
  const re = /(["'`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  const lines = src.split("\n");
  lines.forEach((ln, i) => {
    // 去掉行内注释再抽(粗粒度足够:文案都在字面量里)
    const code = ln.replace(/^\s*\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(code))) out.push({ line: i + 1, text: m[2] });
  });
  return out;
}

function main() {
  const targets = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_TARGETS;
  let hits = 0;
  for (const file of targets) {
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, "utf8");
    const literals = path.extname(file) === ".json" ? src.split("\n").map((text, i) => ({ line: i + 1, text })) : literalsOf(src);
    for (const { line, text } of literals) {
      for (const [word, family] of BANNED) {
        // 纯拉丁词(AI/VIP/CP…)按词边界匹配——否则 QIZAI/COMPANY 这类标识符全是误报
        const hit = /^[A-Za-z]+$/.test(word)
          ? new RegExp(`(?<![A-Za-z0-9_])${word}(?![A-Za-z0-9_])`).test(text)
          : text.includes(word);
        if (hit) {
          console.log(`✗ ${file}:${line} [${family}]「${word}」 ${text.slice(0, 60)}`);
          hits++;
        }
      }
    }
  }
  console.log(hits ? `\n共 ${hits} 处命中,人工裁决` : "✓ 负面词典零命中");
  process.exit(hits ? 1 : 0);
}
main();
