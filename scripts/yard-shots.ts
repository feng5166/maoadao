import "./_env";
// Renderer 第一刀验收三状态截图（11 §12.9 拍板）：① 空院子 ② 棉花+软垫
// ③ 无猫+一撮毛。姿势图从库里取（只读），场景合成走 renderYardScene 正式管线。
// 用法：npx tsx scripts/yard-shots.ts <输出目录>
import fs from "node:fs";
import path from "node:path";
import { prisma } from "../lib/db";
import { renderYardScene } from "../lib/yard/scene-render";
import type { YardView } from "../lib/yard/view";

const outDir = process.argv[2] ?? "tmp-assets/yard-shots";

const baseView = (over: Partial<YardView>): YardView => ({
  yardId: "yard-shot",
  fish: 12,
  materials: [],
  weather: "晴",
  dayKey: "20260808",
  windowIndex: 5,
  slots: [
    { slotKey: "eaves", slotName: "屋檐下", itemKey: null, itemName: null, placedThisWindow: false },
    { slotKey: "tree", slotName: "老树旁", itemKey: null, itemName: null, placedThisWindow: false },
    { slotKey: "clearing", slotName: "空地中央", itemKey: null, itemName: null, placedThisWindow: false },
  ],
  ownedIdle: [],
  shop: [],
  present: [],
  records: [],
  traceMarks: [],
  ...over,
});

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const poseOf = async (catId: string, behavior: string) => {
    const pose = /睡|盹|趴|窝|蜷/.test(behavior) ? "sleep" : "sit";
    let row = await prisma.catPose.findUnique({ where: { catId_pose: { catId, pose } } });
    if (!row) row = await prisma.catPose.findUnique({ where: { catId_pose: { catId, pose: "sit" } } });
    return row ? Buffer.from(row.data) : null;
  };

  const states: Array<[string, YardView]> = [
    ["1-empty", baseView({})],
    [
      "2-mianhua-cushion",
      baseView({
        slots: [
          { slotKey: "eaves", slotName: "屋檐下", itemKey: null, itemName: null, placedThisWindow: false },
          { slotKey: "tree", slotName: "老树旁", itemKey: null, itemName: null, placedThisWindow: false },
          { slotKey: "clearing", slotName: "空地中央", itemKey: "old_cushion", itemName: "旧垫子", placedThisWindow: false },
        ],
        present: [{ visitId: "shot-v1", catId: "npc-mianhua", catName: "棉花", behavior: "睡成一朵云，尾巴盖住鼻子", slotKey: "clearing" }],
      }),
    ],
    [
      "3-trace-only",
      baseView({
        traceMarks: [{
          visitId: "shot-v2", dayKey: "20260808", windowIndex: 3, slotKey: "clearing",
          traces: ["地上留了一串浅浅的爪印", "落了一撮深黑色的毛"],
          left: { fish: 0, leftText: null }, collected: false,
        }],
      }),
    ],
    [
      "4-record-left",
      baseView({
        records: [{
          visitId: "shot-v3", catId: "npc-tangyuan", catName: "汤圆", dayKey: "20260808", windowIndex: 3,
          slotKey: "eaves", behaviors: ["翻个身，换个方向继续睡"], traces: ["垫子上多了一个浅浅的窝"],
          left: { fish: 4, leftText: "4条小鱼干" }, collected: false,
        }],
      }),
    ],
    [
      "5-dark-cat-tree",
      baseView({
        present: [{ visitId: "shot-v4", catId: "npc-wuya", catName: "一只猫", behavior: "只在墙头停一停", slotKey: "tree" }],
      }),
    ],
  ];

  for (const [name, view] of states) {
    const img = await renderYardScene(view, { poseOf });
    const file = path.join(outDir, `${name}.jpg`);
    fs.writeFileSync(file, img);
    console.log(`✓ ${file}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
// （第二刀补充状态在 main 内联注册,见 states 数组——本注释防止误删）
