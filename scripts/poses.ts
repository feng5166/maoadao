import "./_env";
// L1 姿势集(doc/15):每猫 5 姿势,立绘做参考图保同猫一致,存 CatPose 表。
// 领养时一次投入,此后所有生活图拼贴复用——绝不按天生成。
// 用法:npx tsx scripts/poses.ts --cat=<catId>[,<catId>] | --all-users [--force]
import { PrismaClient } from "@prisma/client";
import { generateImage } from "../lib/imagegen";
import { POSES, POSE_PROMPTS } from "../lib/visual/assets";

const STYLE =
  "手绘绘本风格角色设计。严格遵守:与参考图是同一只猫(花色、五官、体型完全一致);" +
  "均匀柔和的平光,无投影无高光渲染;粗细一致的深棕色手绘轮廓线;色彩中低饱和;" +
  "纯米白色背景(#FAF6EE),无任何环境和道具;扁平上色带轻微水彩纸纹理;" +
  "不要写实毛发细节,不要摄影感,无文字无水印";

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const prisma = new PrismaClient();

  let catIds = args.find((a) => a.startsWith("--cat="))?.slice(6).split(",") ?? [];
  if (args.includes("--all-users")) {
    const cats = await prisma.cat.findMany({ where: { isNpc: false, ownerId: { not: null } }, select: { id: true } });
    catIds = cats.map((c) => c.id);
  }
  if (catIds.length === 0) {
    console.log("用法: --cat=<catId> 或 --all-users");
    process.exit(1);
  }

  for (const catId of catIds) {
    const portrait = await prisma.portrait.findUnique({ where: { catId } });
    if (!portrait) {
      console.log(`${catId} 无定稿立绘,跳过(姿势集必须锚定立绘)`);
      continue;
    }
    const cat = await prisma.cat.findUnique({ where: { id: catId }, select: { name: true } });
    for (const pose of POSES) {
      if (!force && (await prisma.catPose.findUnique({ where: { catId_pose: { catId, pose } } }))) {
        console.log(`${cat?.name}/${pose} 已存在`);
        continue;
      }
      process.stdout.write(`${cat?.name}/${pose} ... `);
      const raw = await generateImage({
        prompt: `参考图这只猫的另一个姿势:${POSE_PROMPTS[pose]}。${STYLE}`,
        size: "2048x2048",
        referenceImages: [{ data: Buffer.from(portrait.data), mime: portrait.mime }],
      });
      if (!raw) {
        console.log("✗");
        continue;
      }
      const now = new Date();
      const bytes = new Uint8Array(raw);
      await prisma.catPose.upsert({
        where: { catId_pose: { catId, pose } },
        update: { data: bytes, mime: raw[0] === 0x89 ? "image/png" : "image/jpeg", createdAt: now },
        create: { catId, pose, data: bytes, mime: raw[0] === 0x89 ? "image/png" : "image/jpeg", createdAt: now },
      });
      console.log("✓");
    }
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
