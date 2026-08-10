import "./_env";
// 物件小图（Yard Renderer 物件层资产；11 §12.8）。贴纸路线与猫姿势同源：
// 米白平涂底 + 深棕描边 → 合成时 makeCutout 抠图入画（不要透明底生成，不稳）。
// 用法：npx tsx scripts/items-art.ts [--force] [--only=<key>]
// 逐步补产：v1 先做初始三件；新物件上架前跑一遍本脚本补图。
import fs from "node:fs";
import sharp from "sharp";
import { generateImage } from "../lib/imagegen";
import { ITEMS } from "../lib/yard/config";

const STYLE =
  "手绘绘本贴纸风格，粗深棕描边，扁平上色带一点水彩纹理，中低饱和度自然色，" +
  "单个物件居中，微俯视角度，纯米白色背景，无阴影、无地面、无文字、无水印、无其他物品";

/** 物件的画面描述（词面=config 中文名的视觉版；仅生成用，不入用户侧） */
const ITEM_PROMPTS: Record<string, string> = {
  cardboard_box: "一个旧纸箱，开口朝上，箱沿有点压塌，纸板色，侧面有磨损",
  old_cushion: "一个旧旧的圆形软布垫，暖米色带浅浅的织纹，边缘被睡得有点扁",
  water_basin: "一个浅浅的陶土水盆，盛着清水，盆沿有些用旧的痕迹",
  yarn_ball: "一团毛线球，暖橘红色，线头松松地拖出来一截",
  shallow_tub: "一个浅浅的旧木盆，木板色泽深浅不一，箍着一圈旧铁环",
  hay_nest: "一个干草窝，草秆蓬松地盘成一圈，中间被压出浅浅的窝",
  clay_pot: "一只侧倒的陶罐，罐口朝向侧前方，土陶色，罐身有细小的磕痕",
  long_bench: "一条旧木长凳，凳面被坐得发亮，凳脚略微不齐",
  rope_post: "一根缠着麻绳的木柱，绳圈有抓挠起毛的痕迹，底座是一块木墩",
  wood_perch: "一个小小的木架高台，两层横板，木色发旧，边角磨圆",
  old_crate: "一个旧木箱，侧放开口朝前，板条有裂纹和旧漆残迹",
  old_umbrella: "一把撑开斜插在地上的旧雨伞，伞面是褪色的靛蓝，伞骨有点歪",
};

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.filter((a) => a.startsWith("--only=")).map((a) => a.slice(7));
  fs.mkdirSync("public/items", { recursive: true });

  const keys = only.length > 0 ? only : Object.keys(ITEM_PROMPTS);
  for (const key of keys) {
    const desc = ITEM_PROMPTS[key];
    if (!desc) {
      console.log(`${key}: 未登记画面描述（先补 ITEM_PROMPTS）`);
      continue;
    }
    if (!ITEMS.some((i) => i.key === key)) {
      console.log(`${key}: 不在 config.ITEMS`);
      continue;
    }
    const out = `public/items/${key}.jpg`;
    if (!force && fs.existsSync(out)) {
      console.log(`${key} 已存在`);
      continue;
    }
    process.stdout.write(`${key} ... `);
    const raw = await generateImage({ prompt: `${desc}。${STYLE}`, size: "2048x2048" }); // API 下限 ~3.7MP
    if (!raw) {
      console.log("✗");
      continue;
    }
    await sharp(raw).resize(512, 512, { fit: "cover" }).jpeg({ quality: 86 }).toFile(out);
    console.log("✓");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
