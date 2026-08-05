import "./_env";
// 七仔母版候选批产（doc/22 §三 外形拍板 + doc2.0/10 M0 首铲）。
// 用法：npx tsx scripts/qizai-master.ts [--n=4]
// 产出：assets/qizai-master-raw/candidate-N.png（gitignore 外的本机归档，定稿前不入库不进 git）。
// 定稿流程：人工从候选里挑一张 → 锁为母版 → 此后姿势/场景/周边全部从母版派生，不再重生成（doc/22）。
// 不连数据库：风格锚点直接读本机归档（assets/portraits-raw/），避开本地 DATABASE_URL 指旧库的坑。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateImage } from "../lib/imagegen";

const OUT_DIR = "assets/qizai-master-raw";

// 与 lib/portrait.ts 的 STYLE 逐字一致——七仔必须和 18 张 NPC 立绘像同一本绘本。
const STYLE =
  "手绘绘本风格角色设计。严格遵守：全身站姿，正面微侧45度，平视视角；" +
  "均匀柔和的平光，无投影无高光渲染；粗细一致的深棕色手绘轮廓线；" +
  "整只猫最多使用6种颜色，色彩中低饱和；纯米白色背景（#FAF6EE），无任何环境和道具；" +
  "扁平上色带轻微水彩纸纹理和铅笔瑕疵感；不要写实毛发细节，不要摄影感，不要3D渲染，无文字无水印";

const ANCHOR_NOTE =
  "参考图只规定画风（线条、上色、纸纹、光线、轮廓处理），必须与参考图画风完全一致；" +
  "但不要模仿参考图里猫的花色、品种、体型和姿势——这是另一只完全不同的猫。";

// 外形（2026-08-05 创始人改判：中华田园猫异瞳大橘，替代原奶牛猫方案；定稿后同步 doc/22 §三）。
// 识别三件套：异瞳（近景）、短尾（剪影）、叼东西（剪影+动作即形象）。
// 短尾是模型最容易画错的地方（默认爱画长尾），用双重强调钉死。
const QIZAI =
  "一只猫的角色立绘：中华田园猫大橘——橘色虎斑猫，白色的肚子、胸口和爪子，体格圆润可爱。" +
  "三个必须严格遵守的特征：" +
  "1. 异瞳——两只眼睛颜色不同，一只琥珀黄色、一只浅蓝色，两只眼睛都睁开，清澈明亮；" +
  "2. 尾巴极短，只有短短的一小截绒球，像被截过一样——绝对不能画成正常长度的尾巴；" +
  "3. 嘴里轻轻叼着一枚小小的贝壳。" +
  "神态自在放松，好奇地微微歪头，不讨好不怯懦。";

async function loadAnchors(): Promise<{ data: Buffer; mime: string }[]> {
  // 与 lib/portrait.ts ANCHOR_IDS 一致：白长毛/黑短毛/三花，花色跨度大，模型学画风不学花色
  const ids = ["npc-mianhua", "npc-heidou", "npc-xiaomei"];
  const anchors: { data: Buffer; mime: string }[] = [];
  for (const id of ids) {
    const p = path.join("assets", "portraits-raw", `${id}.jpg`);
    anchors.push({ data: await readFile(p), mime: "image/jpeg" });
  }
  return anchors;
}

async function main() {
  const nArg = process.argv.find((a) => a.startsWith("--n="));
  const n = nArg ? Math.max(1, Math.min(8, Number(nArg.slice(4)) || 4)) : 4;

  const anchors = await loadAnchors();
  const prompt = `${QIZAI}${STYLE}。${ANCHOR_NOTE}`;
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`七仔母版候选 x${n}（锚点 ${anchors.length} 张）`);

  let ok = 0;
  for (let i = 1; i <= n; i++) {
    process.stdout.write(`candidate-${i} ... `);
    const raw = await generateImage({ prompt, size: "2048x2048", referenceImages: anchors });
    if (!raw) {
      console.log("✗");
      continue;
    }
    const ext = raw[0] === 0x89 ? "png" : "jpg";
    await writeFile(path.join(OUT_DIR, `candidate-${i}.${ext}`), raw);
    console.log("✓");
    ok++;
  }
  console.log(`完成：${ok}/${n}，候选在 ${OUT_DIR}/ ——人工定稿后锁母版。`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
