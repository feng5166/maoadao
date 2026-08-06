import "./_env";
// D0 资产发布(doc2.0/15):assets/qizai(母版库,git 源头) → public/d0(线上服务)。
// 静帧 2048 → 1080 q82(首屏秒开预算);循环视频原样拷贝(720p ≤3MB 已在预算内)。
// 幂等可重跑;分镜有更新重跑一次即可。
// 用法:npx tsx scripts/d0-publish.ts
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const SRC = path.join("assets", "qizai", "shots");
const OUT = path.join("public", "d0");
const SHOTS = ["s2", "s3", "s4", "s5", "s6a", "s6b", "s8", "s10"];

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const id of SHOTS) {
    const jpg = path.join(SRC, `${id}.jpg`);
    const mp4 = path.join(SRC, `${id}-loop.mp4`);
    if (!fs.existsSync(jpg)) {
      console.error(`✗ 缺静帧 ${jpg}`);
      continue;
    }
    const outJpg = path.join(OUT, `${id}.jpg`);
    await sharp(jpg).resize(1080, 1080, { fit: "cover" }).jpeg({ quality: 82 }).toFile(outJpg);
    const kb = Math.round(fs.statSync(outJpg).size / 1024);
    let vkb = 0;
    if (fs.existsSync(mp4)) {
      fs.copyFileSync(mp4, path.join(OUT, `${id}-loop.mp4`));
      vkb = Math.round(fs.statSync(mp4).size / 1024);
    }
    console.log(`✓ ${id}: 静帧 ${kb}KB${vkb ? ` + 循环 ${vkb}KB` : "(无循环)"}`);
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
