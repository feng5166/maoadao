import "./_env";
// Yard 母场景 Base 首版（doc2.0/11 §12.9 定稿口径，2026-08-08 创始人拍板）。
// 用法：npx tsx scripts/yard-scene.ts [--force]
//
// 范围铁律：只做 Base + 白天普通天气，零动态事实——不画猫/物件/痕迹/脚印/毛。
// Base 要证明这里有年月，Trace 才证明这里刚发生过生活（Static Canon 分界）。
// 构图：轻俯视 3/4 绘本视角，竖构图（390px 第一视口）；小屋左后、老树右后、
// 中央大片留白；前景是门口石阶。三自然位（檐下/老树边/中央空地）长在环境里，
// 不是发光 Slot。验收走 §12.9 三极端测试（A 空院子最重要）。
import fs from "node:fs";
import sharp from "sharp";
import { generateImage } from "../lib/imagegen";

const STYLE =
  "手绘水彩绘本风格的场景插画，竖构图，柔和平光，中低饱和度的偏灰自然色，" +
  "以奶油白、灰蓝、鼠尾草绿、暖黄为主，扁平上色带水彩纸纹理，克制的线稿，" +
  "画面安静、有空气感和年月感，无人物无动物无文字无水印，" +
  "不要发光效果、不要光粒子、不要花海、不要魔法感装饰，画面里不要出现调色板、色卡、颜色样块";

const ANCHOR_NOTE =
  "参考图只规定画风（线条、上色、纸纹、配色、光线），必须与参考图画风完全一致；构图内容以文字描述为准。";

const CONTENT =
  "海边小镇的一座居民小院，轻微俯视的四分之三视角。" +
  "左后方是一间小木屋的一角，带一段木屋檐，屋檐下有一小块能放东西的空地；" +
  "右后方一棵老树，树荫落在地上，树根把石板微微顶起一点；" +
  "院子中央是一大片什么都没摆的空地，石板和泥土，留白要足；" +
  "画面前景最下方是院门口的旧石阶和一截矮木门或矮栅栏。" +
  "这座院子有人住过：石板颜色深浅不均，木门边缘磨得发白，台阶上有旧划痕，" +
  "墙角长着一小簇草，屋檐木头有风吹日晒的色差；墙线略微不正，草长得不均匀，" +
  "石头大小不一，带一点不完美的生活感。" +
  "白天，普通的晴天。院子里没有猫、没有任何动物、没有人，" +
  "没有脚印、没有散落的物品、没有食盆玩具，空地就是空的。";

async function main() {
  const force = process.argv.includes("--force");
  const out = "public/scenes/yard.jpg";
  if (!force && fs.existsSync(out)) {
    console.log("yard 已存在（--force 重生成，注意：Base 定稿后永不轻易重生成）");
    return;
  }
  // 画风锚点：与全岛同一本绘本（挑色调跨度大的定稿场景，锚画风不锚内容）
  const anchors = ["dock", "home", "lighthouse"]
    .map((n) => `public/scenes/${n}.jpg`)
    .filter((p) => fs.existsSync(p))
    .map((p) => ({ data: fs.readFileSync(p), mime: "image/jpeg" }));

  process.stdout.write("yard base ... ");
  const raw = await generateImage({
    prompt: `${CONTENT}。${STYLE}${anchors.length > 0 ? `。${ANCHOR_NOTE}` : ""}`,
    size: "1728x2304", // 竖 3:4——390px 第一视口的母场景比例
    referenceImages: anchors,
    model: process.env.SCENE_MODEL ?? process.env.PORTRAIT_MODEL,
  });
  if (!raw) {
    console.log("✗ 生成失败");
    process.exit(1);
  }
  fs.mkdirSync("assets/scenes-raw", { recursive: true });
  const ext = raw[0] === 0x89 ? "png" : "jpg";
  fs.writeFileSync(`assets/scenes-raw/yard.${ext}`, raw);
  await sharp(raw).resize(900, 1200, { fit: "cover" }).jpeg({ quality: 82 }).toFile(out);
  console.log(`✓ ${out}（原图归档 assets/scenes-raw/yard.${ext}）`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
