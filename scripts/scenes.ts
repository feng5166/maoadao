import "./_env";
// 固定场景背景（v0.7 P0-10）：一次生成入库到 public/scenes，前台按地点复用。
// 用法：npx tsx scripts/scenes.ts [--force] [--only=<name>]
// 走 lib/imagegen 统一通道（watermark 永远关）；API 原图归档到 assets/scenes-raw/。
// 画风锚点：已有场景图当参考图，新场景/重绘和老场景是同一本绘本。
import fs from "node:fs";
import sharp from "sharp";
import { generateImage } from "../lib/imagegen";

const STYLE =
  "手绘绘本风格的海边小镇场景插画，横构图，柔和平光，中低饱和度，" +
  "奶油白/灰蓝/鼠尾草绿/暖黄为主的色板，扁平上色带水彩纸纹理，" +
  "画面安静有生活痕迹，无人物无动物无文字无水印";

const ANCHOR_NOTE =
  "参考图只规定画风（线条、上色、纸纹、色板、光线），必须与参考图画风完全一致；构图内容以文字描述为准。";

// 画风锚点：挑三幅色调跨度大的定稿场景（白天海边/室内暖光/黄昏），锚画风不锚内容
const ANCHOR_SCENES = ["dock", "home", "farewell"];

const SCENES: [string, string][] = [
  ["dock", "小岛的木质码头，停着一艘小小的快递船，几只木箱和缆绳"],
  ["reef", "海边的礁石滩，浅浅的潮水，一根插在石缝里的钓鱼竿"],
  ["pines", "松林间的小径，光斑洒在落满松针的路上"],
  ["market", "小镇集市广场，几个遮阳棚小摊，挂着小灯串"],
  ["lighthouse", "山坡上的旧灯塔，白墙红顶，坡上长着野草"],
  ["home", "一间温馨的小木屋内部，窗边有软垫和毛线球，桌上一盏小灯"],
  ["boat", "搁浅在沙滩上的废弃旧渔船，船身斑驳爬着藤蔓"],
  // 送别页（/account/farewell）：不画猫——用户的猫用自己的立绘叠加
  ["farewell", "黄昏的木质码头尽头，一艘小船正朝海平线驶去，海面上留着长长的航迹，天空是温柔的橙粉色，晚霞映在水面上"],
  // 送别过场页（/account/farewell/sailed）：船已远去
  ["sailed", "黄昏渐深的海面，从木质码头望出去，海平线上只剩一个远得快看不见的小船影，天空橙粉色正在转成暮蓝，海面很安静，码头一角有一卷缆绳"],
];

const ARCHIVE_DIR = "assets/scenes-raw";

function sceneAnchors(excludeName: string): { data: Buffer; mime: string }[] {
  return ANCHOR_SCENES.filter((n) => n !== excludeName)
    .map((n) => `public/scenes/${n}.jpg`)
    .filter((p) => fs.existsSync(p))
    .map((p) => ({ data: fs.readFileSync(p), mime: "image/jpeg" }));
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.filter((a) => a.startsWith("--only=")).map((a) => a.slice(7));

  fs.mkdirSync("public/scenes", { recursive: true });
  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });

  const list = only.length > 0 ? SCENES.filter(([n]) => only.includes(n)) : SCENES;
  for (const [name, desc] of list) {
    if (!force && fs.existsSync(`public/scenes/${name}.jpg`)) {
      console.log(`${name} 已存在`);
      continue;
    }
    process.stdout.write(`${name} ... `);
    const anchors = sceneAnchors(name);
    const raw = await generateImage({
      prompt: `${desc}。${STYLE}${anchors.length > 0 ? `。${ANCHOR_NOTE}` : ""}`,
      size: "2688x1536",
      referenceImages: anchors,
      model: process.env.SCENE_MODEL ?? process.env.PORTRAIT_MODEL,
    });
    if (!raw) {
      console.log("✗");
      continue;
    }
    const ext = raw[0] === 0x89 ? "png" : "jpg";
    fs.writeFileSync(`${ARCHIVE_DIR}/${name}.${ext}`, raw);
    await sharp(raw).resize(1200, 686, { fit: "cover" }).jpeg({ quality: 80 }).toFile(`public/scenes/${name}.jpg`);
    console.log("✓");
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
