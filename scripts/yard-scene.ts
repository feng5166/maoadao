import "./_env";
// Yard 母场景 Base（doc2.0/11 §12.9 定稿口径；v2 构图修正版，2026-08-08 三测后）。
// 用法：npx tsx scripts/yard-scene.ts [--force]
//
// v1 三测：A 空院子 PASS · B 单猫 PASS WITH RISK · C 小痕迹 HOLD。
// v2 只改四处（创始人拍板，其余全部不动）：
// ① 前景门压低（镜头往院内推进半步——门槛感保留，门不做每天的第二主角）；
// ② 檐下空间打开（完整容纳一只猫+一个中型物件+一条小 Trace）；
// ③ 中央泥地减斑驳噪声约两成（Base 必须替 Trace 预留低噪声表面）；
// ④ 树下前方留一块平静可用区（生活的树，不是景观树）。
// 验收第四句：院子不能为了显得有生活而画得太满，
// 因为真正的生活还要后来发生在上面。
import fs from "node:fs";
import sharp from "sharp";
import { generateImage } from "../lib/imagegen";

const STYLE =
  "手绘水彩绘本风格的场景插画，竖构图，柔和平光，中低饱和度的偏灰自然色，" +
  "以奶油白、灰蓝、鼠尾草绿、暖黄为主，扁平上色带水彩纸纹理，克制的线稿，" +
  "画面安静、有空气感和年月感，无人物无动物无文字无水印，" +
  "不要发光效果、不要光粒子、不要花海、不要魔法感装饰，画面里不要出现调色板、色卡、颜色样块";

const STYLE_NOTE =
  "前几张参考图只规定画风（线条、上色、纸纹、配色、光线），必须与参考图画风完全一致。";

const V1_NOTE =
  "最后一张参考图是这座院子的上一版：保持同一座院子——同样的小屋、老树、海平线、" +
  "白墙、旧木门、轻俯视视角、水彩画风——只按文字描述调整构图与各部分占比。";

const CONTENT =
  "海边小镇的一座居民小院，轻微俯视的四分之三视角。镜头已经完全站在院子里面往院内看，" +
  "视野开阔，院子本身占据画面的绝大部分。" +
  "画面最底部边缘只露出脚边的一级旧石阶和一小截矮门柱，暗示身后是院门——" +
  "不要画完整的门扇，不要打开的门。" +
  "重要：画面左右两侧不要被高墙夹住视线，不要形成走廊或门洞的构图；" +
  "院子的白色矮围墙很矮，只在画面边缘露出低低的一段。" +
  "左边是一间小木屋，离得比较近，带一段木屋檐：屋檐下那块空地在画面里完整可见、开阔，" +
  "足够睡下一只猫、摆下一件东西。" +
  "右后方一棵老树，树荫落在地上，树根把石板微微顶起一点；树的前方留出一块平整安静的空地。" +
  "院子中央是一大片什么都没摆的空地：平整安静的泥土和石板，颜色柔和均匀，" +
  "只有淡淡的深浅变化，不要密集的斑驳、噪点和碎石——这片地要留给以后的生活痕迹。" +
  "远处是海平线。这座院子有人住过：木头边缘磨得发白，石阶有旧划痕，墙角长着一小簇草，" +
  "屋檐木头有风吹日晒的色差；墙线略微不正，草长得不均匀，带一点不完美的生活感，但地面干净安静。" +
  "白天，普通的晴天。院子里没有猫、没有任何动物、没有人，没有脚印、没有散落的物品、" +
  "没有食盆玩具，空地就是空的。";

// ============ Base LOCK（2026-08-08 创始人 Gate：A/B/C 全过）============
// 母场景已锁定。用户要形成空间记忆——木屋一直在那里,树一直在那里,门口一直
// 在那里。后续问题先从 Renderer/VisualConfig/anchor/footprint/overlay 解,
// 不重画 Base。解锁重生成需创始人拍板:YARD_BASE_UNLOCK=1 + --force 同时给。
const BASE_LOCKED = true;

async function main() {
  const force = process.argv.includes("--force");
  const out = "public/scenes/yard.jpg";
  if (BASE_LOCKED && !(force && process.env.YARD_BASE_UNLOCK === "1")) {
    console.log("Base 已锁定(2026-08-08 Gate)。重生成需创始人拍板:YARD_BASE_UNLOCK=1 npx tsx scripts/yard-scene.ts --force");
    return;
  }
  if (!force && fs.existsSync(out)) {
    console.log("yard 已存在（--force 重生成；三测通过锁定后永不轻易重生成）");
    return;
  }
  const styleAnchors = ["dock", "home", "lighthouse"]
    .map((n) => `public/scenes/${n}.jpg`)
    .filter((p) => fs.existsSync(p))
    .map((p) => ({ data: fs.readFileSync(p), mime: "image/jpeg" }));
  // v1 作为"同一座院子"的构图参考（画风锚在前，v1 在最后）
  const v1Path = "assets/scenes-raw/yard-v1.jpg";
  const refs = fs.existsSync(v1Path)
    ? [...styleAnchors, { data: fs.readFileSync(v1Path), mime: "image/jpeg" }]
    : styleAnchors;

  process.stdout.write("yard base v2 ... ");
  const raw = await generateImage({
    prompt: `${CONTENT}。${STYLE}。${STYLE_NOTE}${fs.existsSync(v1Path) ? ` ${V1_NOTE}` : ""}`,
    size: "1728x2304", // 竖 3:4——390px 第一视口的母场景比例
    referenceImages: refs,
    model: process.env.SCENE_MODEL ?? process.env.PORTRAIT_MODEL,
  });
  if (!raw) {
    console.log("✗ 生成失败");
    process.exit(1);
  }
  fs.mkdirSync("assets/scenes-raw", { recursive: true });
  const ext = raw[0] === 0x89 ? "png" : "jpg";
  const stamp = fs.readdirSync("assets/scenes-raw").filter((f) => f.startsWith("yard-v2")).length;
  fs.writeFileSync(`assets/scenes-raw/yard-v2${stamp > 0 ? `-${stamp}` : ""}.${ext}`, raw);
  await sharp(raw).resize(900, 1200, { fit: "cover" }).jpeg({ quality: 82 }).toFile(out);
  console.log(`✓ ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
