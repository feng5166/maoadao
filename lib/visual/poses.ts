import { prisma } from "../db";
import { generateImage } from "../imagegen";
import { POSES, POSE_PROMPTS } from "./assets";

// L1 姿势集生成(doc/15):立绘做参考图保同猫一致。三个调用方共用——
// ①领养链路(立绘定稿后自动接着生成) ②tick 每日安全网(补漏) ③scripts/poses.ts(手动批产)

const STYLE =
  "手绘绘本风格角色设计。严格遵守:与参考图是同一只猫(花色、五官、体型完全一致);" +
  "均匀柔和的平光,无投影无高光渲染;粗细一致的深棕色手绘轮廓线;色彩中低饱和;" +
  "纯米白色背景(#FAF6EE),无任何环境和道具;扁平上色带轻微水彩纸纹理;" +
  "不要写实毛发细节,不要摄影感,无文字无水印";

/** 给一只猫生成全套姿势;幂等(已有的跳过)。返回完成的姿势数(含已存在)。约 20s/张。 */
export async function generateCatPoses(catId: string, force = false): Promise<number> {
  const portrait = await prisma.portrait.findUnique({ where: { catId } });
  if (!portrait) return 0; // 姿势必须锚定定稿立绘

  let done = 0;
  for (const pose of POSES) {
    if (!force && (await prisma.catPose.findUnique({ where: { catId_pose: { catId, pose } } }))) {
      done++;
      continue;
    }
    const raw = await generateImage({
      prompt: `参考图这只猫的另一个姿势:${POSE_PROMPTS[pose]}。${STYLE}`,
      size: "2048x2048",
      referenceImages: [{ data: Buffer.from(portrait.data), mime: portrait.mime }],
    });
    if (!raw) {
      console.error(`[poses] ${catId}/${pose} 生成失败,留给安全网补`);
      continue;
    }
    const now = new Date();
    const bytes = new Uint8Array(raw);
    const mime = raw[0] === 0x89 ? "image/png" : "image/jpeg";
    await prisma.catPose.upsert({
      where: { catId_pose: { catId, pose } },
      update: { data: bytes, mime, createdAt: now },
      create: { catId, pose, data: bytes, mime, createdAt: now },
    });
    done++;
  }
  return done;
}

/** 安全网:立绘已定稿但姿势不全的用户猫,每次补 limit 只(领养链路失败/中断时兜底)。
 *  挂在每日 tick 的 after() 里,不占模拟主链路时间。 */
export async function sweepMissingPoses(limit = 1): Promise<void> {
  const cats = await prisma.cat.findMany({
    where: { isNpc: false, ownerId: { not: null }, portraitUrl: { not: null } },
    select: { id: true, name: true },
  });
  let fixed = 0;
  for (const cat of cats) {
    if (fixed >= limit) break;
    const n = await prisma.catPose.count({ where: { catId: cat.id } });
    if (n >= POSES.length) continue;
    console.log(`[poses-sweep] ${cat.name} 姿势 ${n}/${POSES.length},补齐中`);
    await generateCatPoses(cat.id).catch((e) => console.error("[poses-sweep]", e));
    fixed++;
  }
}
