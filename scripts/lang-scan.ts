// 语言防火墙扫描(doc2.0/04 §六负面词典 + §八合回清单"词表进 eval 脚本自动 grep")。
// 只扫字符串字面量里的中文文案(注释与代码标识符不算用户侧);命中即列出,人工裁决。
// 用法:npx tsx scripts/lang-scan.ts [文件...](缺省扫用户侧组件/页面/文案配置)
import fs from "node:fs";
import path from "node:path";

// doc2.0/04 §六 五词系 + doc/05 用户侧禁系统词(AGENTS.md §4)
const BANNED: [string, string][] = [
  ...["任务", "成就", "等级", "积分", "签到", "奖励", "解锁", "VIP", "存档", "读档"].map((w): [string, string] => [w, "系统/游戏词"]),
  ...["活动", "福利", "限时", "错过", "立即", "点击领取", "新版本", "更新公告", "上新"].map((w): [string, string] => [w, "运营/FOMO 词"]),
  ...["CP", "搭档", "官宣", "粉丝", "人设", "塌房"].map((w): [string, string] => [w, "人类社交词"]),
  ...["优化", "提升", "管理", "打卡", "复盘"].map((w): [string, string] => [w, "效率词"]),
  ...["想你了", "等你好久", "你怎么才来"].map((w): [string, string] => [w, "情感绑架词"]),
  ...["AI", "Agent", "智能体", "大模型", "算法"].map((w): [string, string] => [w, "系统词(doc/05)"]),
];
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
