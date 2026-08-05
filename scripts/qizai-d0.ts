import "./_env";
// 七仔 D0 生产脚本（doc2.0/15 P1，两步法——2026-08-05 D0 Freeze v1.0）：
//   Step1 角色表：五姿锁定（正/侧/背/行走/坐），master 为唯一参考 → 人工定稿后
//         把选中的图拷入 assets/qizai/sheet/{front,side,back,walk,sit}.jpg
//   Step2 关键镜头：S4/S6a/S6b/S10 先行（决定一致性/行为真实/情绪表达），
//         过关后再批量其余分镜（S2/S3/S5/S7/S8）
// 用法：npx tsx scripts/qizai-d0.ts sheet [--n=1]
//       npx tsx scripts/qizai-d0.ts shots [--n=2]
// 全部资产按十字段规格（Scene ID/叙事目的/感受/镜头/主体/环境/动作/禁止/动画空间/Prompt）。
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { generateImage } from "../lib/imagegen";

const MASTER = path.join("assets", "qizai", "master.jpg");
const SHEET_FINAL_DIR = path.join("assets", "qizai", "sheet");
const SHEET_RAW = "assets/qizai-sheet-raw";
const SHOTS_RAW = "assets/qizai-shots-raw";

// 画风：与 lib/portrait.ts STYLE 同宗（doc/05），场景镜头放开"无环境"限制
const STYLE_CHAR =
  "手绘绘本风格角色设定图。均匀柔和的平光，无投影无高光渲染；粗细一致的深棕色手绘轮廓线；" +
  "色彩中低饱和；纯米白色背景（#FAF6EE），无任何环境和道具（嘴里瓶盖除外）；" +
  "扁平上色带轻微水彩纸纹理；不要写实毛发，不要摄影感，不要3D渲染，无文字无水印";
const STYLE_SCENE =
  "手绘绘本风格插画，黄昏基调。均匀柔和的平光；粗细一致的深棕色手绘轮廓线；" +
  "色彩中低饱和，整幅画面色数克制；扁平上色带轻微水彩纸纹理和铅笔瑕疵感；" +
  "不要写实细节，不要摄影感，不要3D渲染，无文字无水印";

// 身份锁：每一张都要重复（AI 最容易丢的就是这四样）
const IDENTITY =
  "画面里的猫与参考图是同一只猫，必须完全一致：橘白虎斑、白色的胸口肚子和爪子、" +
  "异瞳（一只琥珀黄、一只浅蓝）、尾巴是极短的一小截绒球（绝对不能画成正常长度的尾巴）、" +
  "体格圆润、嘴里轻轻叼着同一枚小瓶盖。";

// 禁止基线（doc2.0/15 §三 不拟人化硬线）——每张都带
const FORBID =
  "禁止：看向镜头、微笑、任何人类表情、直立、挥爪打招呼、佩戴饰品、大头卖萌比例";

type Spec = { id: string; file: string; prompt: string };

// ── Step1 角色表（五姿）─────────────────────────────────────
const SHEET: Spec[] = [
  { id: "front", file: "front", prompt: "全身正面站姿，四脚着地，平视前方（视线略偏离正中）" },
  {
    id: "side",
    file: "side",
    prompt:
      "全身正侧面站姿（头朝左），完整展示体侧花纹与短尾绒球。" +
      "严格的正侧面视角：**只能看到靠近观者的那一只眼睛**，另一只眼睛完全被头部遮挡",
  },
  { id: "back", file: "back", prompt: "全身背面视角，短尾绒球位于画面中央，头部微微偏转只露出侧脸轮廓" },
  {
    id: "walk",
    file: "walk",
    prompt:
      "行走中的全身侧面（头朝左），一只前爪抬起，短尾绒球翘起。" +
      "严格的侧面视角：只能看到靠近观者的那一只眼睛，另一只完全被头部遮挡。" +
      "**露出的这只眼睛是纯琥珀黄色**（蓝色的那只在另一侧被遮住）——" +
      "绝不能把两种颜色画进同一只眼睛",
  },
  { id: "sit", file: "sit", prompt: "端正坐姿的全身像，微微歪头，短尾绒球贴在身侧可见" },
  {
    id: "avatar",
    file: "avatar",
    prompt:
      "头像特写：只画头部与一点点肩部，居中构图，正面微侧、微微歪头，异瞳清晰可见，" +
      "嘴里叼着小瓶盖。主体四周留出均匀的空白边距（用于圆形头像裁切，头部不贴边不裁切）",
  },
].map((p) => ({ ...p, prompt: `七仔角色设定图：${p.prompt}。${IDENTITY}${STYLE_CHAR}。${FORBID}。参考图只锁定这只猫的长相与画风，姿势按本描述。` }));

// ── Step2 关键镜头（十字段规格，S4/S6a/S6b/S10 先行）────────
// Scene ID / 叙事目的 / 用户此刻感受 / 镜头 / 主体 / 环境 / 七仔动作 / 禁止 / 动画空间 → Prompt
const SHOTS: { id: string; file: string; ref: string[]; prompt: string }[] = [
  {
    id: "S2", // 幕二·岛在运行：报摊换新一期（画面里没有完整的猫，只有一只爪）
    file: "s2-newsstand",
    ref: [],
    prompt:
      "中景偏远：海边小镇的木公告栏与报摊。公告栏上钉着几张小告示纸，报摊上摞着几份报纸，" +
      "一只猫爪（花色不限，不是参考图里的猫）正把最上面一份压好。画面里没有完整的猫。黄昏。" +
      "所有纸面上**只有淡淡的色块和模糊的浅色横线示意版面，绝对没有任何可辨认的文字、字母或数字**。" +
      `${STYLE_SCENE}。参考图只锁定画风。禁止：任何文字/字母/数字、水印、完整的猫出现。`,
  },
  {
    id: "S3", // 幕二·岛在运行：世界的密度——没有主角
    file: "s3-vista",
    ref: [],
    prompt:
      "大远景：黄昏的海岛坡地与滩涂。三个互不相关的小生命点位——礁石上打盹的一只黑白猫、" +
      "沿小路往渔港方向走的一只三花猫、坡顶亮灯小屋边的一只灰猫——**三只花色各不相同，都不是橘猫**。" +
      "猫都很小很远。天空占画面上半部，大面积留白，安静。" +
      `${STYLE_SCENE}。参考图只锁定画风。禁止：任何猫的近景、文字、水印。`,
  },
  {
    id: "S5", // 幕三·七仔=生命感：收藏有秩序（嘴空，瓶盖在排尾——全程嘴空原则）
    file: "s5-collection",
    ref: ["sit", "front"],
    prompt:
      "中近景：旧木箱旁的地面上整齐排着一排小收藏——一枚生锈的顶针、一颗玻璃珠、" +
      "一片羽毛、一枚小贝壳、一小截旧绳结等六七件小东西；那枚圆形扁平的金属啤酒瓶盖" +
      "躺在这一排的最末尾。七仔**蹲坐**在收藏排前，伸出一只前爪轻轻把其中一件挪正，" +
      "**嘴里没有叼任何东西**。**尾巴是极短的一小截绒球，紧贴身侧，绝对不能画成长尾巴。**" +
      "暖橙色的黄昏天空，码头一角，大量留白。" +
      `${IDENTITY.replace("嘴里轻轻叼着同一枚小瓶盖。", "")}${STYLE_SCENE}。${FORBID}、嘴里叼任何东西。`,
  },
  {
    id: "S8", // 幕四·空小屋：放下瓶盖退两步的静止（结构 aha 锚；此屋为 S10 的同屋参考）
    file: "s8-emptyhome",
    ref: ["side", "sit"],
    prompt:
      "中景：一间安静的小木屋正面，**门完全关着**；门上挂着一块空白的小木门牌" +
      "（门牌上没有任何字）；门前石阶上放着一枚小小的金属啤酒瓶盖。" +
      "七仔站在屋前两步远的地方，侧身站定，头朝小屋方向——像刚放下什么、" +
      "退开了两步的样子，**嘴里没有叼东西**。暖黄的暮色，大量留白。" +
      `${IDENTITY.replace("嘴里轻轻叼着同一枚小瓶盖。", "")}${STYLE_SCENE}。${FORBID}、嘴里叼任何东西、门牌出现文字、门开着。`,
  },
  {
    id: "S4", // 叙事目的：行为即生命（拍两下是它的规矩）；感受："这只猫不是NPC"；动画空间：拍两下→叼起
    file: "s4-bottlecap",
    ref: ["walk", "side"],
    prompt:
      "近景低机位：一枚小瓶盖躺在码头木板上占据前景，七仔俯下身，一只前爪悬在瓶盖上方将拍未拍，" +
      "视线锁定瓶盖（此镜头嘴里没有叼东西——它正要去捡这枚瓶盖）。" +
      `环境：黄昏的码头木板地，留白为主，至多一两片落叶。${IDENTITY.replace("嘴里轻轻叼着同一枚小瓶盖。", "")}` +
      `${STYLE_SCENE}。${FORBID}、瓶盖变形、出现多枚瓶盖。`,
  },
  {
    id: "S6a", // 叙事目的：回应的一瞬；感受：平静、不讨好；动画空间：眨眼、耳朵转向
    // 2026-08-05 改设计：嘴部道具漂移无法根治（母版贝壳参考压过文字）——改为瓶盖在地上、
    // 嘴里空着。时序反而更顺：S4 拍瓶盖 → S6 瓶盖在它面前,它抬眼看你 → S8 叼起放到空小屋门口。
    file: "s6a-glance",
    ref: ["front", "sit"],
    prompt:
      "近景平视：七仔蹲坐着，**嘴里没有叼任何东西**，一枚圆形扁平的金属啤酒瓶盖躺在它面前的" +
      "地上。它抬眼看向画面外偏下方——视线明显偏离镜头轴线，" +
      "神态平静、专注、不讨好。环境：码头木箱一角，黄昏，大量留白。" +
      `${IDENTITY.replace("嘴里轻轻叼着同一枚小瓶盖。", "")}${STYLE_SCENE}。${FORBID}、任何亲昵讨好的神态、嘴里叼任何东西。`,
  },
  {
    id: "S6b", // 叙事目的：不服务——回应之后是它自己的日子；动画空间：走过（唯一位移）
    file: "s6b-passby",
    ref: ["back", "walk"],
    prompt:
      "低机位：七仔从画面下缘走过，只见它的背影与翘起的短尾绒球，嘴里叼着小瓶盖朝画面深处走去，" +
      "不回头。环境：码头木板地延伸向远处，黄昏，极简。" +
      `${IDENTITY}${STYLE_SCENE}。${FORBID}、回头看观者。`,
  },
  {
    id: "S10", // 叙事目的：完成引路——它知道你的故事还没开始；动画空间：转头→迈步
    file: "s10-farewell",
    ref: ["side", "walk", "s8"],
    prompt:
      "中景：黄昏的小路上，七仔停在一间小木屋前的侧影，头转向木屋门口。" +
      "**木屋的门是关着的**，门上挂着一块空白的木门牌；" +
      "门口台阶上放着一枚圆形扁平的金属啤酒瓶盖（很小的一枚，绝不是罐子或瓶子）。" +
      "此镜头它嘴里没有叼东西（瓶盖已经放在门口）。" +
      "**小木屋的外观必须与参考图里的小木屋保持一致（同一间屋子：同样的屋顶、门、门牌位置）**。" +
      "环境：安静的小屋、空白门牌、暖黄的天色。" +
      `${IDENTITY.replace("嘴里轻轻叼着同一枚小瓶盖。", "")}${STYLE_SCENE}。${FORBID}、门牌上出现文字。`,
  },
];

async function loadRef(files: string[]): Promise<{ data: Buffer; mime: string }[]> {
  const refs: { data: Buffer; mime: string }[] = [{ data: await readFile(MASTER), mime: "image/jpeg" }];
  const DIRS = [SHEET_FINAL_DIR, path.join("assets", "qizai", "shots")];
  for (const f of files) {
    let buf: Buffer | null = null;
    for (const dir of DIRS) {
      try {
        buf = await readFile(path.join(dir, `${f}.jpg`));
        break;
      } catch {}
    }
    if (buf) refs.push({ data: buf, mime: "image/jpeg" });
    else console.warn(`[warn] 参考 ${f}.jpg 未定稿（sheet/shots 均无），跳过`);
  }
  return refs;
}

async function run(specs: Spec[] | typeof SHOTS, outDir: string, n: number, withSheetRef: boolean) {
  await mkdir(outDir, { recursive: true });
  let ok = 0;
  const total = specs.length * n;
  for (const spec of specs) {
    const refs = withSheetRef
      ? await loadRef((spec as (typeof SHOTS)[number]).ref)
      : [{ data: await readFile(MASTER), mime: "image/jpeg" }];
    for (let i = 1; i <= n; i++) {
      const name = n > 1 ? `${spec.file}-${i}` : spec.file;
      process.stdout.write(`${name} ... `);
      const raw = await generateImage({ prompt: spec.prompt, size: "2048x2048", referenceImages: refs });
      if (!raw) {
        console.log("✗");
        continue;
      }
      const ext = raw[0] === 0x89 ? "png" : "jpg";
      await writeFile(path.join(outDir, `${name}.${ext}`), raw);
      console.log("✓");
      ok++;
    }
  }
  console.log(`完成：${ok}/${total}，产出在 ${outDir}/`);
}

async function main() {
  const step = process.argv[2];
  const nArg = process.argv.find((a) => a.startsWith("--n="));
  const n = nArg ? Math.max(1, Math.min(4, Number(nArg.slice(4)) || 1)) : 1;
  const onlyArg = process.argv.find((a) => a.startsWith("--only="));
  const only = onlyArg ? onlyArg.slice(7).split(",") : null;
  if (step === "sheet") {
    const specs = only ? SHEET.filter((s) => only.includes(s.id)) : SHEET;
    console.log(`Step1 角色表 ×${n}（${specs.map((s) => s.id).join("/")}，参考=母版）`);
    await run(specs, SHEET_RAW, n, false);
    console.log(`定稿：把选中的图拷入 ${SHEET_FINAL_DIR}/{front,side,back,walk,sit,avatar}.jpg`);
  } else if (step === "shots") {
    const specs = only ? SHOTS.filter((s) => only.includes(s.id)) : SHOTS;
    console.log(`Step2 关键镜头 ×${n}（${specs.map((s) => s.id).join("/")}，参考=母版+角色表）`);
    await run(specs as unknown as Spec[], SHOTS_RAW, n, true);
  } else {
    console.log("用法：npx tsx scripts/qizai-d0.ts sheet [--n=1] | shots [--n=2]");
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
