import fs from "node:fs";
import path from "node:path";

// 视觉资产注册表(doc/15 图片导演系统):导演只引用资产 ID,不产生成指令。
// L2 场景:public/scenes/{name}.jpg(白天基础图) + {name}-{time}.jpg(时段变体,缺则用基础图+色调层)

export const SCENE_TIMES = ["morning", "dusk", "night"] as const;
export type SceneTime = (typeof SCENE_TIMES)[number] | "day";

/** 地点关键词 → 场景资产名(与 lib/handbook.ts sceneFor 同源;导演层用资产名而非路径) */
export const LOCATION_SCENES: [string, string][] = [
  ["码头", "dock"],
  ["海边礁石", "reef"],
  ["溪流浅滩", "reef"],
  ["松林小径", "pines"],
  ["集市广场", "market"],
  ["灯塔坡", "lighthouse"],
  ["废弃渔船", "boat"],
  ["自家小屋", "home"],
];

export function sceneNameFor(location: string | undefined): string {
  for (const [key, name] of LOCATION_SCENES) if (location?.includes(key)) return name;
  return "home";
}

/** 场景文件解析:优先时段变体,缺则回落白天基础图(合成器会补色调层) */
export function sceneFile(name: string, time: SceneTime): { file: string; needsTint: boolean } {
  const dir = path.join(process.cwd(), "public", "scenes");
  if (time !== "day") {
    const variant = path.join(dir, `${name}-${time}.jpg`);
    if (fs.existsSync(variant)) return { file: variant, needsTint: false };
  }
  return { file: path.join(dir, `${name}.jpg`), needsTint: time !== "day" };
}

/** L1 姿势枚举(CatPose 表;立绘 = 另存的定稿资产,不在此列) */
export const POSES = ["sit", "sleep", "walk", "play", "lookout"] as const;
export type Pose = (typeof POSES)[number];

/** 姿势的画面语言(生成 prompt 用,中文描述;贴纸合成不需要透明底) */
export const POSE_PROMPTS: Record<Pose, string> = {
  sit: "端正坐着，尾巴绕在身前，神态放松",
  sleep: "蜷成一团趴着睡觉，眼睛闭着",
  walk: "迈步行走的侧面姿态，尾巴自然抬起",
  play: "扑向一个毛线球的玩耍瞬间，神态兴奋",
  lookout: "背对观众坐着远眺，只看得到背影和转向一侧的耳朵",
};

/** 时段色调层(与 app/globals.css 的 fx-dawn/fx-dusk/夜色同源),盖在无变体的白天图上 */
export const TIME_TINTS: Record<Exclude<SceneTime, "day">, string> = {
  morning:
    '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(180,205,220,0.20)"/><stop offset="1" stop-color="rgba(255,235,205,0.14)"/></linearGradient>',
  dusk:
    '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(255,180,120,0.22)"/><stop offset="1" stop-color="rgba(120,90,110,0.18)"/></linearGradient>',
  night:
    '<linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="rgba(28,39,51,0.50)"/><stop offset="1" stop-color="rgba(28,39,51,0.42)"/></linearGradient>',
};
