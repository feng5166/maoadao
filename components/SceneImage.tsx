import Image from "next/image";
import { CDN_ON, img } from "@/lib/assets";

// 场景图统一出口(2026-08-06 国内加速)。
// 开了国内 CDN:直接 <img> 取 OSS 上预转的 WebP —— 走 next/image 会把请求绕回
// Vercel 香港边缘代理一趟,那正是要绕开的跨境段;没开则照旧 next/image 优化。
// 两条路都给出 width/height,布局不跳。

export function SceneImage({
  src,
  alt = "",
  width,
  height,
  priority,
  sizes,
  className,
}: {
  src: string;
  alt?: string;
  width: number;
  height: number;
  priority?: boolean;
  sizes?: string;
  className?: string;
}) {
  if (CDN_ON) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={img(src)}
        alt={alt}
        width={width}
        height={height}
        loading={priority ? "eager" : "lazy"}
        // priority 那张是首屏主体:早解码、早取
        fetchPriority={priority ? "high" : undefined}
        decoding={priority ? "sync" : "async"}
        className={className}
      />
    );
  }
  return <Image src={src} alt={alt} width={width} height={height} priority={priority} sizes={sizes} className={className} />;
}
