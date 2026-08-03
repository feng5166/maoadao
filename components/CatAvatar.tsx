// 确定性 SVG 猫头像：同一只猫在所有页面、分享卡上外观一致（立绘一致性的 MVP 版）
// 未来接入生图后，portrait_url 有值时优先展示真立绘。
// SVG 以字符串为唯一来源：网页组件 innerHTML 渲染，分享卡转 data-URI 交给 resvg
// （satori 对内联 SVG 支持不全，route handler 又不能 import react-dom/server）。

function hashStr(s: string): number {
  let h = 2166136261;
  for (const ch of s) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const PALETTES = [
  { body: "#F5A623", patch: "#E08E0B", belly: "#FFF3E0" }, // 橘
  { body: "#4A4A4A", patch: "#2D2D2D", belly: "#9B9B9B" }, // 黑
  { body: "#FFFFFF", patch: "#E8E8E8", belly: "#FFF9F0" }, // 白
  { body: "#B8B8B8", patch: "#8E8E8E", belly: "#E5E5E5" }, // 灰
  { body: "#C89F7B", patch: "#A47B52", belly: "#F0E2D0" }, // 棕
  { body: "#E8D5C4", patch: "#F5A623", belly: "#FFF9F0" }, // 三花底
  { body: "#FDFDFD", patch: "#3A3A3A", belly: "#FDFDFD" }, // 奶牛
  { body: "#D7C7E8", patch: "#B49BD6", belly: "#F2EBFA" }, // 淡紫（幻想色）
];
const EYES = ["#4E7A3A", "#3A5F7A", "#C9862B", "#5A5A5A", "#7A3A5F"];
const BGS = ["#FDEBD0", "#D6EAF8", "#D5F5E3", "#FDEDEC", "#FEF9E7", "#EBDEF0"];

export function avatarTraits(id: string) {
  const h = hashStr(id);
  // 注意用无符号移位：有符号 >> 在 h 高位为 1 时产生负索引，取到 undefined（渲染成黑色）
  return {
    palette: PALETTES[h % PALETTES.length],
    eye: EYES[(h >>> 3) % EYES.length],
    bg: BGS[(h >>> 6) % BGS.length],
    hasPatch: (h >>> 9) % 3 !== 0, // 2/3 的猫有花纹
    patchSide: (h >>> 11) % 2 === 0,
    blush: (h >>> 13) % 2 === 0,
  };
}

export function catAvatarSvg(id: string, size = 64): string {
  const t = avatarTraits(id);
  const { body, patch, belly } = t.palette;
  const patchPath = t.patchSide
    ? "M22 48 Q30 30 48 34 Q40 52 22 48"
    : "M78 48 Q70 30 52 34 Q60 52 78 48";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
<circle cx="50" cy="50" r="50" fill="${t.bg}"/>
<polygon points="22,42 30,14 46,34" fill="${body}"/>
<polygon points="78,42 70,14 54,34" fill="${body}"/>
<polygon points="27,38 31,22 41,33" fill="#F8BBD0"/>
<polygon points="73,38 69,22 59,33" fill="#F8BBD0"/>
<ellipse cx="50" cy="58" rx="32" ry="28" fill="${body}"/>
${t.hasPatch ? `<path d="${patchPath}" fill="${patch}"/>` : ""}
<ellipse cx="50" cy="68" rx="14" ry="10" fill="${belly}"/>
<ellipse cx="38" cy="55" rx="4.5" ry="6" fill="${t.eye}"/>
<ellipse cx="62" cy="55" rx="4.5" ry="6" fill="${t.eye}"/>
<circle cx="39.5" cy="53" r="1.6" fill="#FFF"/>
<circle cx="63.5" cy="53" r="1.6" fill="#FFF"/>
<polygon points="47,64 53,64 50,68" fill="#E57373"/>
<path d="M50 68 Q46 73 42 70 M50 68 Q54 73 58 70" stroke="#8D6E63" stroke-width="1.5" fill="none" stroke-linecap="round"/>
${t.blush ? `<ellipse cx="28" cy="64" rx="5" ry="3" fill="#F8BBD0" opacity="0.7"/><ellipse cx="72" cy="64" rx="5" ry="3" fill="#F8BBD0" opacity="0.7"/>` : ""}
<path d="M30 66 L16 63 M30 70 L17 71 M70 66 L84 63 M70 70 L83 71" stroke="#9E9E9E" stroke-width="1.2" stroke-linecap="round"/>
</svg>`;
}

export function catAvatarDataUri(id: string, size = 140): string {
  return `data:image/svg+xml;base64,${Buffer.from(catAvatarSvg(id, size)).toString("base64")}`;
}

/** 网页用组件：有定稿立绘用立绘，否则用哈希 SVG 兜底（SVG 内容不含用户输入）
 *  crop="head"：小尺寸场景（署名、新闻行）把全身立绘放大聚焦到猫头，避免缩成一个看不清的小点 */
export function CatAvatar({
  id,
  size = 64,
  portraitUrl,
  crop = "full",
}: {
  id: string;
  size?: number;
  portraitUrl?: string | null;
  crop?: "full" | "head";
}) {
  if (portraitUrl) {
    // 站内立绘按显示尺寸取缩略图（2x 屏 + head 裁切的放大量都算进去了），别为 24px 头像下 768px 全图
    // URL 可能已带 ?v= 版本参数（重绘后顶掉 CDN 旧缓存），拼 s 时选对分隔符
    const thumb = size <= 40 ? 96 : size <= 80 ? 128 : size <= 128 ? 256 : 0;
    const src =
      portraitUrl.startsWith("/api/portrait/") && thumb
        ? `${portraitUrl}${portraitUrl.includes("?") ? "&" : "?"}s=${thumb}`
        : portraitUrl;
    return (
      <span
        style={{ width: size, height: size, borderRadius: "50%", overflow: "hidden", display: "inline-block", lineHeight: 0 }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          width={size}
          height={size}
          alt=""
          loading="lazy"
          decoding="async"
          style={{
            width: size,
            height: size,
            objectFit: "cover",
            ...(crop === "head" ? { transform: "scale(1.9)", transformOrigin: "50% 16%" } : {}),
          }}
        />
      </span>
    );
  }
  return (
    <span
      style={{ width: size, height: size, display: "inline-block", lineHeight: 0 }}
      dangerouslySetInnerHTML={{ __html: catAvatarSvg(id, size) }}
    />
  );
}
