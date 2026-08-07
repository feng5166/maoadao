import "./_env";
// 静态资源同步到阿里云 OSS 杭州(2026-08-06 国内加速,lib/assets.ts 是消费端)。
//
// 搬的是"大件且不常变"的四类:D0 分镜与呼吸循环、场景图、声音包、中文字体分片。
// 图片顺手转 WebP(1080/q80):离开了 Next 图片优化器就没人帮你压了,
// 原图 178KB → WebP 约 60-90KB,再叠上域内直连,低谷期几十秒变零点几秒。
//
// 幂等:同名同大小跳过;改了资源就把 lib/assets.ts 的 ASSET_VERSION 加一再跑
//(版本目录隔离 + 长缓存,老版本继续服务旧页面,不会撕裂)。
//
// 用法:npx tsx scripts/assets-sync.ts(始终整目录覆盖上传,同名直接替换)
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { ASSET_VERSION } from "../lib/assets";

const BUCKET = "oss://maoadao-site";
const PREFIX = `assets/${ASSET_VERSION}`;
// 图片转 WebP 的目标宽度:D0 是 1:1 方图,场景是 1200×686 横图
const DIRS: { dir: string; webpWidth?: number }[] = [
  { dir: "d0", webpWidth: 1080 },
  { dir: "scenes", webpWidth: 1200 },
  { dir: "sounds" },
  { dir: "fonts" },
];
const CACHE = "public, max-age=31536000, immutable"; // 版本目录保证可安全长缓存

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

function upload(local: string, remote: string, contentType: string) {
  execFileSync(
    "aliyun",
    ["oss", "cp", local, `${BUCKET}/${remote}`, "--force", "--meta", `Content-Type:${contentType}#Cache-Control:${CACHE}`],
    { stdio: "pipe" },
  );
}

const TYPES: Record<string, string> = {
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
};

async function main() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "maoadao-assets-"));
  let n = 0;
  let bytes = 0;

  for (const { dir, webpWidth } of DIRS) {
    const root = path.join("public", dir);
    if (!fs.existsSync(root)) {
      console.warn(`[skip] ${root} 不存在`);
      continue;
    }
    for (const file of walk(root)) {
      const rel = path.relative("public", file); // d0/s2.jpg
      const ext = path.extname(file).toLowerCase();
      let localPath = file;
      let remoteRel = rel;

      // 图片转 WebP 上传(原 jpg 不传:上线只用 WebP,少一半流量也少一半存储)
      if (webpWidth && (ext === ".jpg" || ext === ".png")) {
        const outPath = path.join(tmp, rel.replace(/\.(jpg|png)$/i, ".webp"));
        fs.mkdirSync(path.dirname(outPath), { recursive: true });
        await sharp(file).resize(webpWidth, undefined, { withoutEnlargement: true }).webp({ quality: 80 }).toFile(outPath);
        localPath = outPath;
        remoteRel = rel.replace(/\.(jpg|png)$/i, ".webp");
      } else if (!TYPES[ext]) {
        continue; // 不认的类型不传
      }

      const type = TYPES[path.extname(localPath).toLowerCase()] ?? "application/octet-stream";
      upload(localPath, `${PREFIX}/${remoteRel}`, type);
      const size = fs.statSync(localPath).size;
      bytes += size;
      n++;
      if (n % 50 === 0) process.stdout.write(`  ...${n} 个\n`);
    }
    console.log(`✓ ${dir} 完成`);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`共 ${n} 个文件 / ${Math.round(bytes / 1024 / 1024)}MB → ${BUCKET}/${PREFIX}/`);
}
main().catch((e) => { console.error(e); process.exit(1); });
