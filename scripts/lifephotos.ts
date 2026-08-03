import "./_env";
// 猫的生活照(猫主页 P0):立绘 + 场景多图融合,"它在岛上生活的一个安静瞬间"。
// 一次性资产:NPC 固定入库 public/cats-life/;运行时新领养的猫走页面兜底(相遇照片/立绘)。
// 用法:npx tsx scripts/lifephotos.ts [--force] [--only=<catId>]
import fs from "node:fs";
import sharp from "sharp";
import { generateImage } from "../lib/imagegen";

// 每只猫的场景与动作瞬间(小屋 2.0):不是角色展示,是"我刚好路过,看见它"——
// 猫不看镜头,背影/侧身/低头做事,像被偶然拍到的生活抓拍
const MOMENTS: Record<string, { scene: string; action: string }> = {
  "npc-juzi": { scene: "market", action: "它侧着身子从两个摊位之间挤过去,鼻子朝烤鱼摊的方向使劲嗅" },
  "npc-yantai": { scene: "lighthouse", action: "它背对镜头蹲在灯塔坡的草地上,专注望着海面,尾巴安静地收在脚边" },
  "npc-mantou": { scene: "market", action: "它低着头把摊子上的蒸笼布叼正,笼屉冒着热气,完全没注意有谁路过" },
  "npc-doudou": { scene: "boat", action: "它正忙着把一小卷绳子往船头拖,屁股撅着使劲,背对镜头" },
  "npc-xiaomei": { scene: "dock", action: "它侧身踮起前爪扒着木箱边沿,偷看船上正卸下来的货" },
  "npc-laoguai": { scene: "pines", action: "只看得到它的背影,正慢慢走进小径深处,尾巴扫过路边的松针" },
  "npc-tangyuan": { scene: "home", action: "它四脚朝天摊在窗边的软垫上睡得正香,完全没察觉有谁在看" },
  "npc-qiuqiu": { scene: "market", action: "它低头认真拨着摊位上的货物,一样一样地清点,只露出侧脸" },
  "npc-wuya": { scene: "lighthouse", action: "它的背影立在坡顶的高处,望着暮色里层层叠叠的屋顶" },
  "npc-nuomi": { scene: "reef", action: "它低头盯着水洼里自己的倒影出神,一只爪子悬在水面上方" },
  "npc-jiangjun": { scene: "dock", action: "它端坐在码头入口的侧面,目光追着一艘正在进港的小船" },
  "npc-bingfen": { scene: "market", action: "它侧身从灯串下走过,回头望了一眼摊位上摆着的白瓷杯子" },
  "npc-tudou": { scene: "market", action: "它背对镜头,正把一只木箱往摊位底下推,肩背绷得紧紧的" },
  "npc-lingdang": { scene: "farewell", action: "它的背影坐在码头尽头,面向落日的海,喉咙里像正含着一段歌" },
  "npc-heidou": { scene: "market", action: "它蹲在小店门口,低着头数面前摆着的几枚鱼币,数得很专心" },
  "npc-mianhua": { scene: "reef", action: "它侧身蹲在礁石上眯眼吹风,蓬松的白毛被海风掀起一绺" },
  "npc-maoadao": { scene: "dock", action: "它的背影坐在码头边,面前摊着一册翻开的簿子,背有点驼,很安稳" },
  "cat-meiqiu": { scene: "home", action: "它蜷在小屋窗边的软垫上睡熟了,尾巴搭在鼻尖,呼吸把毛吹得一起一伏" },
  "cat-d3d8bbdd": { scene: "home", action: "它背对镜头趴在桌边的灯下,前爪正拨弄一团滚远的毛线" },
  "cat-f92c7c1c": { scene: "reef", action: "它侧身低着头,小心翼翼伸出一只爪子碰浅滩的潮水" },
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
        "这是被偶然拍到的一个生活瞬间:猫不看镜头,正专注做自己的事,像小动物观察日志里的抓拍,不是摆拍海报。" +
        "猫的花色、五官、体型必须和参考图1完全一致;场景的配色、水彩纸纹必须和参考图2完全一致;" +
        "猫是画面的绝对主角,离镜头较近,占画面高度约一半;环境作为背景衬托,光线与场景统一。" +
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
