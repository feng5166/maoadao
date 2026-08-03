import "./_env";
// 猫的生活照(猫主页 P0):立绘 + 场景多图融合,"它在岛上生活的一个安静瞬间"。
// 一次性资产:NPC 固定入库 public/cats-life/;运行时新领养的猫走页面兜底(相遇照片/立绘)。
// 用法:npx tsx scripts/lifephotos.ts [--force] [--only=<catId>]
import fs from "node:fs";
import sharp from "sharp";
import { generateImage } from "../lib/imagegen";

// 每只猫的场景与动作:从 bio/人设里挑一个最像"它的日常"的瞬间
const MOMENTS: Record<string, { scene: string; action: string }> = {
  "npc-juzi": { scene: "market", action: "它在集市的摊位之间踱步张望,一副什么都想掺一脚的样子" },
  "npc-yantai": { scene: "lighthouse", action: "它安静地蹲在灯塔坡的草地上,望着远处的海" },
  "npc-mantou": { scene: "market", action: "它眯着眼守在集市一角的小摊边,像刚蒸完一笼鱼糕在歇气" },
  "npc-doudou": { scene: "boat", action: "它神气地站在搁浅旧渔船的船头,尾巴翘着,像在宣布这是它的秘密基地" },
  "npc-xiaomei": { scene: "dock", action: "它站在木码头上,好奇地看着停泊的小船,脖子上的红铃铛清晰可见" },
  "npc-laoguai": { scene: "pines", action: "它走在松林小径深处,微微回头,神情像知道很多旧事" },
  "npc-tangyuan": { scene: "home", action: "它四脚朝天摊在窗边的软垫上睡得正香" },
  "npc-qiuqiu": { scene: "market", action: "它站在集市摊位后面,神情认真,像在清点自己的货" },
  "npc-wuya": { scene: "lighthouse", action: "它站在灯塔坡的高处眺望全岛,姿态挺拔警觉" },
  "npc-nuomi": { scene: "reef", action: "它安静地蹲在浅滩边的礁石上,低头看水里的倒影出神" },
  "npc-jiangjun": { scene: "dock", action: "它端端正正地坐在码头入口,像在值班,目光笔直" },
  "npc-bingfen": { scene: "market", action: "它从集市的灯串下昂首走过,毛梳得一丝不苟" },
  "npc-tudou": { scene: "market", action: "它在集市边上帮着搬一只木箱,埋头出力不吭声" },
  "npc-lingdang": { scene: "farewell", action: "黄昏里它坐在码头尽头望着海,像正在轻轻唱歌" },
  "npc-heidou": { scene: "market", action: "它站在集市一间小铺面门口来回打量,像在盘算第八家店开在哪" },
  "npc-mianhua": { scene: "reef", action: "它蓬松的白毛被海风轻轻吹起,惬意地眯着眼蹲在礁石滩上" },
  "npc-maoadao": { scene: "dock", action: "上了年纪的它安静地坐在码头边望海,背影有点驼,很安稳" },
  "cat-meiqiu": { scene: "home", action: "它蜷在小屋窗边的软垫上,尾巴搭在鼻尖,睡得很沉" },
  "cat-d3d8bbdd": { scene: "home", action: "它趴在小屋桌边的灯下,眼睛亮亮地盯着毛线球" },
  "cat-f92c7c1c": { scene: "reef", action: "它在浅滩边小心地伸出爪子碰了碰潮水" },
};

const OUT_DIR = "public/cats-life";
const RAW_DIR = "assets/lifephotos-raw";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.filter((a) => a.startsWith("--only=")).map((a) => a.slice(7));
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(RAW_DIR, { recursive: true });

  const ids = (only.length ? only : Object.keys(MOMENTS)).filter((id) => MOMENTS[id]);
  for (const id of ids) {
    const out = `${OUT_DIR}/${id}.jpg`;
    if (!force && fs.existsSync(out)) { console.log(`${id} 已存在`); continue; }
    const portraitPath = `assets/portraits-raw/${id}.jpg`;
    if (!fs.existsSync(portraitPath)) { console.log(`${id} 缺立绘原图,跳过`); continue; }
    const { scene, action } = MOMENTS[id];
    process.stdout.write(`${id}(${scene}) ... `);
    const raw = await generateImage({
      prompt:
        `把参考图1里的这只猫,自然地画进参考图2的场景里:${action}。` +
        "这是它日常生活里的一个安静瞬间,像绘本里的一页。" +
        "猫的花色、五官、体型必须和参考图1完全一致;场景的构图、配色、水彩纸纹必须和参考图2完全一致;" +
        "猫在画面中的比例自然(约占画面高度三分之一),光线与场景统一。" +
        "画面里只有这一只猫,无其他动物无人物无文字无水印,不要出现飞鸟和凭空漂浮的元素",
      size: "2304x1728",
      referenceImages: [
        { data: fs.readFileSync(portraitPath), mime: "image/jpeg" },
        { data: fs.readFileSync(`public/scenes/${scene}.jpg`), mime: "image/jpeg" },
      ],
    });
    if (!raw) { console.log("✗"); continue; }
    fs.writeFileSync(`${RAW_DIR}/${id}.jpg`, raw);
    await sharp(raw).resize(1200, 900, { fit: "cover" }).jpeg({ quality: 82 }).toFile(out);
    console.log("✓");
  }
  // 静态清单:页面 build 时 import,避免 serverless 运行时摸 public/ 文件系统。
  // 带上照片的拍摄地(中文):照片说明必须跟照片场景走,不能用猫的实时位置(会跟画面矛盾)
  const SCENE_PLACE: Record<string, string> = {
    dock: "码头", reef: "海边礁石", pines: "松林小径", market: "集市广场",
    lighthouse: "灯塔坡", home: "自家小屋", boat: "废弃渔船", farewell: "码头尽头", sailed: "码头尽头",
  };
  const have = fs.readdirSync(OUT_DIR).filter((f) => f.endsWith(".jpg")).map((f) => f.replace(/\.jpg$/, "")).sort();
  const places = Object.fromEntries(have.map((id) => [id, SCENE_PLACE[MOMENTS[id]?.scene] ?? ""]));
  fs.writeFileSync(
    "lib/cats-life.ts",
    `// 由 scripts/lifephotos.ts 生成,手改无效\n` +
      `export const LIFE_PHOTO_PLACES: Record<string, string> = ${JSON.stringify(places, null, 2)};\n` +
      `export const LIFE_PHOTO_IDS = new Set<string>(Object.keys(LIFE_PHOTO_PLACES));\n`,
  );
  console.log(`清单已写入 lib/cats-life.ts(${have.length} 张)`);
}
main().catch((e) => { console.error(e); process.exit(1); });
