// 静态资源基址(2026-08-06 国内加速)。重资源——D0 分镜与呼吸循环、场景图、声音包、
// 中文字体分片——放阿里云 OSS 杭州,国内直连;没配置时原样走同源 public/,
// 本地开发与回滚都零改动(把 NEXT_PUBLIC_ASSET_HOST 清掉即可全站回退)。
//
// 为什么:站点在 Vercel(边缘在香港),跨境链路实测吞吐 25-77KB/s、低谷更差;
// 同一张图 OSS 杭州 400-627KB/s、总耗时 0.2s vs 1.0-3.2s —— 快 5-15 倍。
//
// 版本前缀:资源名不带内容哈希,靠 ASSET_VERSION 目录隔离,所以能安全配一年长缓存。
// **改了 public/ 下任何已上线资源,把 ASSET_VERSION 加一,再跑 scripts/assets-sync.ts。**

export const ASSET_VERSION = "v1";

const HOST = (process.env.NEXT_PUBLIC_ASSET_HOST ?? "").replace(/\/$/, "");

/** CDN 是否启用 */
export const CDN_ON = Boolean(HOST);

/** 非图片资源(mp4 / mp3 / css):public 路径 → 可用 URL */
export function cdn(path: string): string {
  return HOST ? `${HOST}/assets/${ASSET_VERSION}${path}` : path;
}

/** 图片:开了 CDN 取 OSS 上的 WebP(同步脚本转好的);没开则走 Next 图片优化器。
 *  两条路都不会把原图直出——离开优化器就没人帮你压,所以 WebP 是同步时预生成的。 */
export function img(path: string): string {
  if (HOST) return `${HOST}/assets/${ASSET_VERSION}${path.replace(/\.(jpg|jpeg|png)$/i, ".webp")}`;
  return `/_next/image?url=${encodeURIComponent(path)}&w=1080&q=75`;
}
