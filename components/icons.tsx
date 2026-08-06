import type { SVGProps } from "react";

// 手绘单色图标系（v0.7 视觉规范·容器与图标）：替代裸线性图标与 emoji。
// 统一 24 视窗、圆头描边、轮廓带轻微不对称的手绘感；只用 currentColor 跟随文字色。
// 规范八枚：鱼币/灯塔/小屋/邮箱/足迹/心情/关系/天气；另补体力、罗盘两枚同风格补足档案页。

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function Svg({ size = 16, style, children, ...props }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      style={{ display: "inline-block", verticalAlign: "-0.125em", ...style }}
      {...props}
    >
      {children}
    </svg>
  );
}

/** 鱼币：一枚歪歪的硬币，里面游着一条鱼 */
export function IconFishCoin(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.4c4.8-.2 8.6 3.7 8.5 8.5-.1 4.7-3.9 8.6-8.6 8.5-4.7-.1-8.4-3.9-8.3-8.6C3.7 7.2 7.4 3.6 12 3.4z" />
      <path d="M7.4 12c1.3-1.8 3.2-2.8 5.3-2.6 1.7.2 3 1.1 3.9 2.6-.9 1.5-2.2 2.4-3.9 2.6-2.1.2-4-.8-5.3-2.6z" />
      <path d="M16.6 12c.8-.7 1.5-1.1 2.3-1.3-.3.9-.3 1.8 0 2.7-.8-.2-1.5-.7-2.3-1.4z" />
      <circle cx="13.9" cy="11.5" r="0.35" fill="currentColor" stroke="none" />
    </Svg>
  );
}

/** 灯塔：条纹塔身与两道光 */
export function IconLighthouse(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.7 20.2 10.5 9.8h3l.8 10.4" />
      <path d="M10.2 13.5h3.6M9.9 16.7h4.2" />
      <path d="M10.2 9.8V7.7h3.6v2.1" />
      <path d="M9.7 7.7 12 5.6l2.3 2.1" />
      <path d="M6 6.3l2.2 1.1M18 6.3l-2.2 1.1" />
      <path d="M7.7 20.3c2.9-.4 5.7-.4 8.6 0" />
    </Svg>
  );
}

/** 礁石：潮线边两块挨着的歪石头，脚下一道退下去的浪 */
export function IconReef(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.2 17.5 7 11.8l3.1-1.6 2.4 2.9.6 4.3" />
      <path d="M13.4 17.4l1.2-4.6 2.8-1 1.9 3-.6 2.7" />
      <path d="M4 19.6c1.6-.9 3.2-.9 4.8-.1 1.7.8 3.3.8 5-.1 1.6-.8 3.2-.8 6.2.2" />
      <path d="M9 13.9l1.3.8" />
    </Svg>
  );
}

/** 松树：三层歪松枝、一截树干和坡上的一点草 */
export function IconPine(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.6 8.6 8.3h2L7.4 12.6h2.2L6.4 17h11.2l-3.3-4.4h2.2l-3.4-4.3h2L12 3.6Z" />
      <path d="M11.6 17v3.2M12.6 17v3.2" />
      <path d="M6.8 20.4c3.4-.5 6.9-.5 10.4 0" />
    </Svg>
  );
}

/** 小屋：歪屋顶、烟囱和一扇门 */
export function IconHouse(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.9 11.9C7.3 9.6 9.6 7.4 12 5.3c2.4 2.1 4.7 4.3 7.1 6.5" />
      <path d="M6.7 10.6v9.2h10.6v-9.3" />
      <path d="M10.4 19.8v-4.5c0-.9.7-1.7 1.6-1.7s1.6.8 1.6 1.7v4.5" />
      <path d="M15.8 7V4.9h1.9v3.8" />
    </Svg>
  );
}

/** 邮箱：一封边角不齐的信 */
export function IconMailbox(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M3.9 7.2c5.4-.5 10.8-.5 16.2 0 .3 3.2.3 6.4 0 9.6-5.4.5-10.8.5-16.2 0-.3-3.2-.3-6.4 0-9.6z" />
      <path d="M4.3 7.7 12 13.4l7.7-5.7" />
    </Svg>
  );
}

/** 足迹：一枚猫爪印 */
export function IconPaw(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.1 10.9c-.9-.2-1.4-1.2-1.1-2.2.3-1 1.2-1.6 2-1.3.9.3 1.3 1.3 1 2.2-.3 1-1.1 1.6-1.9 1.3z" />
      <path d="M10.7 8.6c-.9-.1-1.5-1-1.4-2.1.1-1 .9-1.8 1.8-1.7.9.1 1.5 1 1.4 2.1-.1 1-.9 1.8-1.8 1.7z" />
      <path d="M14.6 8.7c-.9.1-1.7-.7-1.8-1.7-.1-1 .5-2 1.4-2.1.9-.1 1.7.7 1.8 1.7.1 1-.5 2-1.4 2.1z" />
      <path d="M18 10.9c-.8.3-1.6-.3-1.9-1.3-.3-1 .1-2 1-2.2.8-.3 1.7.3 2 1.3.3 1-.2 2-1.1 2.2z" />
      <path d="M12 11.3c2.6 0 4.9 2 4.9 4.2 0 1.6-1.2 2.6-2.6 2.6-.9 0-1.6-.4-2.3-.4-.7 0-1.4.4-2.3.4-1.4 0-2.6-1-2.6-2.6 0-2.2 2.3-4.2 4.9-4.2z" />
    </Svg>
  );
}

/** 心情：眯眼笑的猫脸 */
export function IconMood(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 5.8c3.6-.1 6.5 2.8 6.5 6.4 0 3.6-2.9 6.5-6.5 6.5-3.6 0-6.5-2.9-6.5-6.5 0-3.6 2.9-6.3 6.5-6.4z" />
      <path d="M7.3 7.7 6.5 4.4l3.1 1.6M16.7 7.7l.8-3.3-3.1 1.6" />
      <path d="M9.3 11.8c.5-.6 1.1-.6 1.6 0M13.1 11.8c.5-.6 1.1-.6 1.6 0" />
      <path d="M10.6 14.4c.5.5.9.7 1.4.7.5 0 .9-.2 1.4-.7" />
    </Svg>
  );
}

/** 关系：一颗不太对称的心 */
export function IconHeart(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 19.1c-3.1-2.2-5.4-4.2-6.6-6.2-1.2-2-.8-4.3.9-5.3 1.6-1 3.9-.4 5.7 1.9 1.8-2.3 4.1-2.9 5.7-1.9 1.7 1 2.1 3.3.9 5.3-1.2 2-3.5 4-6.6 6.2z" />
    </Svg>
  );
}

/** 天气：云朵后面探出半个太阳 */
export function IconWeather(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M6.2 9.9c.3-1.9 1.9-3.3 3.8-3.2 1.5.1 2.7 1 3.3 2.3" />
      <path d="M9.7 3.2v1.5M4.3 8.6l1.5.3M5.6 4.8l1.1 1.1M14 4.2l-1.1 1.1" />
      <path d="M8 19c-2 0-3.6-1.4-3.6-3.2 0-1.6 1.2-2.9 2.8-3.1.5-1.9 2.2-3.2 4.3-3.2 2.3 0 4.2 1.6 4.5 3.7 1.7.1 3 1.4 3 3 0 1.7-1.4 2.9-3.2 2.9-2.6 0-5.2-.1-7.8-.1z" />
    </Svg>
  );
}

/** 体力：一道手画的小闪电 */
export function IconSpark(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M13.2 3.9 7.6 12.7l3.7.4-1.5 6.9 6.1-9.1-3.8-.4 1.1-6.6z" />
    </Svg>
  );
}

/** 船票：带撕口和打孔线的票根 */
export function IconTicket(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M4.1 7.3c5.3-.4 10.5-.4 15.8 0l.2 2.9c-1.1.2-1.9 1-1.9 1.8 0 .8.8 1.6 1.9 1.8l-.2 2.9c-5.3.4-10.5.4-15.8 0l-.2-2.9c1.1-.2 1.9-1 1.9-1.8 0-.8-.8-1.6-1.9-1.8l.2-2.9z" />
      <path d="M14.6 8.2v1.2M14.6 11.4v1.2M14.6 14.6v1.2" />
    </Svg>
  );
}

/** 小船：一叶帆船 */
export function IconBoat(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M5.1 15.4c4.6.5 9.2.5 13.8 0l-1.7 3.2c-3.5.4-7 .4-10.4 0l-1.7-3.2z" />
      <path d="M12.1 3.9v11.3" />
      <path d="M12.1 4.6c2.6 1.9 4.1 4.4 4.6 7.4-1.5.4-3 .6-4.6.6V4.6z" />
      <path d="M10.9 8.2c-1.3 1.3-2.1 2.8-2.5 4.5.8.2 1.6.4 2.5.4V8.2z" />
      <path d="M3.2 19.9c.9.6 1.7.6 2.6 0 .9-.6 1.7-.6 2.6 0 .9.6 1.7.6 2.6 0" />
    </Svg>
  );
}

/** 罗盘：探索用的歪指针 */
export function IconCompass(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12 3.6c4.6-.2 8.3 3.5 8.2 8.2-.1 4.6-3.8 8.4-8.3 8.3-4.5-.1-8.1-3.8-8-8.4C4 7.3 7.6 3.8 12 3.6z" />
      <path d="M14.9 9.1l-1.7 4.1-4.1 1.7 1.7-4.1 4.1-1.7z" />
    </Svg>
  );
}

/** 提灯：夜里页头的灯——歪提手、玻璃罩和一粒火苗 */
export function IconLamp(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M9.3 7.1V6.2c1.7-2 3.8-2 5.5.1v.8" />
      <path d="M8.7 7.2h6.7" />
      <path d="M9.4 7.4 8.7 15.8h6.8l-.8-8.4" />
      <path d="M8.4 15.9l-.4 2.8M15.7 15.9l.3 2.7" />
      <path d="M7.2 18.9c3.2-.4 6.4-.4 9.7 0" />
      <path d="M12 10.3c.9 1 .9 2.2 0 3-.9-.8-.9-2 0-3z" />
    </Svg>
  );
}

/** 海螺：存着猫声音的那只——一圈歪螺旋和一个壳口 */
export function IconShell(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M12.6 4.8c3.8 0 6.7 2.9 6.6 6.3-.1 3.1-2.6 5.6-5.6 5.5-2.5-.1-4.5-2.1-4.4-4.4.1-1.9 1.7-3.4 3.5-3.3 1.4.1 2.5 1.2 2.4 2.6-.1 1-.9 1.8-2 1.7" />
      <path d="M12.6 4.8C8.5 5 5.2 8.2 5 12.3c-.1 2 .6 3.8 1.8 5.1" />
      <path d="M6.8 17.4l-3.1 1.7c3.3 1 6.5 1.1 9.6.3" />
    </Svg>
  );
}

/** 回岛钥匙：一把老式门钥匙——圆环柄、歪齿 */
export function IconKey(props: IconProps) {
  return (
    <Svg {...props}>
      <path d="M8.9 5.2c2.3-.1 4.2 1.7 4.3 3.9.1 2.2-1.7 4.1-4 4.2-2.3.1-4.2-1.6-4.3-3.9-.1-2.3 1.7-4.1 4-4.2z" />
      <path d="M11.9 12.1l7.3 6.9" />
      <path d="M16.2 16.2l1.8-1.9M18.4 18.3l1.5-1.6" />
    </Svg>
  );
}
