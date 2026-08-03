import "./_env";
// L2 场景时段变体(doc/15):每个场景生成 清晨/黄昏/夜晚 三个时段(白天=现有基础图)。
// 一次性投入,合成器缺变体时回落"基础图+色调层",所以可以分批补。
// 用法:npx tsx scripts/scene-times.ts [--only=dock,home] [--time=dusk] [--force]
import fs from "node:fs";
import sharp from "sharp";
import { generateImage } from "../lib/imagegen";

const STYLE =
  "手绘绘本风格的海边小镇场景插画，横构图，柔和平光，中低饱和度，" +
  "扁平上色带水彩纸纹理，画面安静有生活痕迹，无人物无动物无文字无水印";

const TIME_DESC: Record<string, string> = {
  morning: "清晨:天刚亮,青蓝偏冷的晨光,薄薄的雾气,一切还很安静",
  dusk: "黄昏:橙粉色的晚霞,暖金色的低斜阳光,影子拉得很长",
  night: "夜晚:深蓝的夜色,月光和零星暖黄的灯光,大部分细节沉入暗部",
};

const SCENES = ["dock", "reef", "pines", "market", "lighthouse", "home", "boat", "farewell", "sailed"];
const ARCHIVE_DIR = "assets/scenes-raw";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? SCENES;
  const times = args.find((a) => a.startsWith("--time="))?.slice(7).split(",") ?? Object.keys(TIME_DESC);

  fs.mkdirSync(ARCHIVE_DIR, { recursive: true });
  for (const name of only) {
    const base = `public/scenes/${name}.jpg`;
    if (!fs.existsSync(base)) {
      console.log(`${name} 无基础图,跳过`);
      continue;
    }
    for (const time of times) {
      const out = `public/scenes/${name}-${time}.jpg`;
      if (!force && fs.existsSync(out)) {
        console.log(`${name}-${time} 已存在`);
        continue;
      }
      process.stdout.write(`${name}-${time} ... `);
      const raw = await generateImage({
        prompt:
          `把参考图里的场景画成${TIME_DESC[time]}。构图、建筑、物件位置必须与参考图完全一致,只改变光线、天色和氛围。${STYLE}`,
        size: "2688x1536",
        referenceImages: [{ data: fs.readFileSync(base), mime: "image/jpeg" }],
        model: process.env.SCENE_MODEL ?? process.env.PORTRAIT_MODEL,
      });
      if (!raw) {
        console.log("✗");
        continue;
      }
      fs.writeFileSync(`${ARCHIVE_DIR}/${name}-${time}.${raw[0] === 0x89 ? "png" : "jpg"}`, raw);
      await sharp(raw).resize(1200, 686, { fit: "cover" }).jpeg({ quality: 80 }).toFile(out);
      console.log("✓");
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
