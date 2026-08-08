// Yard Renderer 第一刀（doc2.0/11 §12.9 拍板范围）：Base + 3 Placement Anchor
// + Cat + Trace。不做：Weather 动效 / Time overlay / MicroMotion / 换货单 /
// 册子展开 / 资源反馈（第二刀起）。
//
// 管线（11 §12.6 冻结）：Renderer 只消费 YardPresentationModel 的语义节点作画
// ——画什么由模型（事实回溯 CI 已看守），怎么画由本文件（VisualConfig 域）。
//
// Trace 合法落位规则（C Gate，冻结）：绘制位置必须在其事实区域（zone footprint）
// 内；允许区内可读性偏移（预置候选点避开树荫深部），禁止跨区（树下爪印不得
// 挪去屋檐下——结构上 spotFor 只在本 zone 候选内取点）。
// 可读性门：Trace 不发光、不描边、不跳动——只靠合法落位/局部明度差/尺寸。
//
// Base LOCK 纪律：锚点/候选点是对锁定版 yard.jpg（900×1200）的手工标定；
// 视觉问题先调这里，不重画 Base。

import fs from "node:fs";
import path from "node:path";
import sharp, { type OverlayOptions } from "sharp";
import { groundShadow, makeCutout } from "../visual/compose";
import { hashSeed, mulberry32 } from "../sim/rng";
import { buildPresentation, YARD_VISUAL, type YardPresentationModel } from "./present";
import type { YardView } from "./view";

export const W = 900;
export const H = 1200;

export interface Rect {
  x: number; // 0..1（占画面宽高比例）
  y: number;
  w: number;
  h: number;
}
export interface Spot {
  x: number; // 0..1，猫脚/痕迹中心的落点
  y: number;
}

/** 三个自然位（22 玩法轴长在环境里）：footprint=事实区域；spots=区内可读性候选点 */
export interface ZoneDef {
  footprint: Rect;
  catSpots: Spot[]; // 猫的落点候选（脚底中心）
  traceSpots: Spot[]; // 痕迹候选（避开树荫深部与高噪区——合法偏移的具体形态）
  catScale: number; // 猫高占画面高的比例（景深：后景小、前景大）
}

export const ZONES: Record<"eaves" | "tree" | "clearing", ZoneDef> = {
  eaves: {
    footprint: { x: 0.08, y: 0.44, w: 0.3, h: 0.14 },
    catSpots: [{ x: 0.24, y: 0.53 }, { x: 0.3, y: 0.55 }],
    traceSpots: [{ x: 0.22, y: 0.54 }, { x: 0.3, y: 0.52 }],
    catScale: 0.1,
  },
  tree: {
    footprint: { x: 0.52, y: 0.44, w: 0.36, h: 0.14 },
    catSpots: [{ x: 0.63, y: 0.52 }, { x: 0.74, y: 0.55 }],
    traceSpots: [{ x: 0.6, y: 0.54 }, { x: 0.79, y: 0.52 }], // 树干深部之外
    catScale: 0.1,
  },
  clearing: {
    footprint: { x: 0.18, y: 0.56, w: 0.64, h: 0.26 },
    catSpots: [{ x: 0.42, y: 0.68 }, { x: 0.54, y: 0.72 }, { x: 0.35, y: 0.74 }],
    traceSpots: [{ x: 0.37, y: 0.66 }, { x: 0.52, y: 0.72 }, { x: 0.63, y: 0.7 }], // 亮面中带,避树荫深部与台阶口
    catScale: 0.12,
  },
};

export type ZoneKey = keyof typeof ZONES;

export const zoneOfSlot = (slotKey: string | null | undefined): ZoneKey =>
  slotKey === "eaves" || slotKey === "tree" ? slotKey : "clearing";

/** 区内确定性选点（同事实同落点——语义确定性；ref 变化带来自然分布） */
export function spotFor(zone: ZoneKey, kind: "cat" | "trace", ref: string): Spot {
  const spots = kind === "cat" ? ZONES[zone].catSpots : ZONES[zone].traceSpots;
  const rng = mulberry32(hashSeed("yard-spot", zone, kind, ref));
  return spots[Math.floor(rng() * spots.length)];
}

// ---------- 痕迹小件（v0 手绘 SVG；不发光不描边不跳动） ----------
const INK = "rgba(96,80,64,0.42)";

/** 一串浅浅的爪印：四组小梅花斜着走 */
function pawMarks(w: number): Buffer {
  const h = Math.round(w * 0.9);
  const paw = (cx: number, cy: number, s: number, rot: number) =>
    `<g transform="translate(${cx},${cy}) rotate(${rot})">` +
    `<ellipse cx="0" cy="${s * 0.35}" rx="${s * 0.42}" ry="${s * 0.34}" fill="${INK}"/>` +
    [-1, 0, 1].map((i) => `<ellipse cx="${i * s * 0.42}" cy="${-s * 0.28 - (i === 0 ? s * 0.1 : 0)}" rx="${s * 0.16}" ry="${s * 0.2}" fill="${INK}"/>`).join("") +
    `</g>`;
  const s = w * 0.14;
  return Buffer.from(
    `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
      paw(w * 0.22, h * 0.82, s, -18) + paw(w * 0.48, h * 0.6, s * 0.96, -10) +
      paw(w * 0.36, h * 0.38, s * 0.92, -22) + paw(w * 0.62, h * 0.16, s * 0.88, -8) +
      `</svg>`,
  );
}

/** 一撮毛：几笔弯弯的浅色绒毛 */
function furTuft(w: number, tint: string): Buffer {
  const h = Math.round(w * 0.6);
  const stroke = (d: string, sw: number, op: number) =>
    `<path d="${d}" fill="none" stroke="${tint}" stroke-opacity="${op}" stroke-width="${sw}" stroke-linecap="round"/>`;
  return Buffer.from(
    `<svg width="${w}" height="${h}" viewBox="0 0 100 60">` +
      stroke("M18,46 C30,30 42,26 56,30", 5, 0.5) +
      stroke("M26,50 C40,38 56,34 70,40", 4.4, 0.42) +
      stroke("M36,52 C48,44 60,44 72,48", 3.6, 0.36) +
      stroke("M30,42 C40,32 50,30 58,32", 3, 0.3) +
      `</svg>`,
  );
}

/** 毛色痕文本 → 绒毛颜色（世界语言里的可见特征，pool.furTraceOf 同源词面） */
export function furTintOf(traceText: string): string {
  if (traceText.includes("黑")) return "rgba(58,54,52,1)";
  if (traceText.includes("橘")) return "rgba(196,128,66,1)";
  if (traceText.includes("银") || traceText.includes("灰")) return "rgba(140,140,144,1)";
  if (traceText.includes("白")) return "rgba(232,228,218,1)";
  if (traceText.includes("棕")) return "rgba(140,102,70,1)";
  return "rgba(120,104,90,1)";
}

// ---------- 资产读取 ----------
export async function itemSprite(itemKey: string): Promise<Buffer | null> {
  const p = path.join(process.cwd(), "public", "items", `${itemKey}.jpg`);
  if (!fs.existsSync(p)) return null; // 物件小图逐步补产；缺图=该物件先不入画（不画占位框）
  try {
    return await makeCutout(fs.readFileSync(p), 380);
  } catch {
    return null; // 抠图失败宁可不画（同 compose"宁可没有猫"口径）
  }
}

// ---------- 合成 ----------
export interface SceneAssets {
  poseOf: (catId: string, behavior: string) => Promise<Buffer | null>;
}

/** 语义模型 → 成图。画什么来自 model.nodes（事实回溯已 CI），怎么画在本文件。 */
export async function renderYardScene(view: YardView, assets: SceneAssets): Promise<Buffer> {
  const model: YardPresentationModel = buildPresentation(view, YARD_VISUAL);
  const baseFile = path.join(process.cwd(), "public", "scenes", `${model.base.sceneKey}.jpg`);
  const layers: OverlayOptions[] = [];

  // Object 层：语义节点 → 物件小图（缺资产先不画，槽位永不画发光框）
  const objectSpots = new Map<string, Spot>(); // slotKey → 落点（猫用物件时共享：睡在垫子上，不是垫子旁）
  for (const node of model.nodes.filter((n) => n.layer === "object")) {
    const slotKey = node.sourceRef.replace("slot:", "");
    const sprite = await itemSprite(node.key);
    const zone = zoneOfSlot(slotKey);
    const spot = spotFor(zone, "cat", node.sourceRef); // 物件用猫位同一落点系（猫会来用它）
    objectSpots.set(slotKey, spot);
    if (!sprite) continue;
    const targetH = Math.round(H * ZONES[zone].catScale * 0.8); // 垫子类要比猫的脚印面宽,睡上去还露边
    const scaled = await sharp(sprite).resize({ height: targetH }).png().toBuffer();
    const meta = await sharp(scaled).metadata();
    const cw = meta.width ?? targetH;
    const left = Math.round(W * spot.x - cw / 2);
    const top = Math.round(H * spot.y - targetH * 0.92);
    layers.push({ input: groundShadow(cw), left, top: top + targetH - Math.round(cw * 0.1) });
    layers.push({ input: scaled, left, top });
  }

  // Trace 层：毛/爪印小件，合法落位（区内候选，不跨区）
  for (const node of model.nodes.filter((n) => n.layer === "trace")) {
    const visitId = node.sourceRef.replace("visit:", "");
    const mark = view.traceMarks.find((t) => t.visitId === visitId);
    if (!mark) continue;
    const zone = zoneOfSlot(mark.slotKey);
    const spot = spotFor(zone, "trace", node.sourceRef);
    const fur = mark.traces.find((t) => t.includes("毛"));
    const w = Math.round(W * 0.085); // 可读性靠尺寸与落位,不靠描边发光（C Gate 可读性门）
    const svg = fur ? furTuft(w, furTintOf(fur)) : pawMarks(w);
    const png = await sharp(svg).png().toBuffer();
    const meta = await sharp(png).metadata();
    layers.push({
      input: png,
      left: Math.round(W * spot.x - (meta.width ?? w) / 2),
      top: Math.round(H * spot.y - (meta.height ?? w) / 2),
    });
  }

  // Cat 层：抠图入画 + 接地影（在场才画——模型里有节点就是世界说它在）
  for (const node of model.nodes.filter((n) => n.layer === "cat")) {
    const visitId = node.sourceRef.replace("visit:", "");
    const p = view.present.find((c) => c.visitId === visitId);
    if (!p) continue;
    const pose = await assets.poseOf(p.catId, p.behavior);
    if (!pose) continue; // 宁可这一张没有猫，不要幽灵猫（compose 同口径）
    let cutout: Buffer;
    try {
      cutout = await makeCutout(pose);
    } catch {
      continue;
    }
    const zone = zoneOfSlot(p.slotKey);
    const spot = (p.slotKey && objectSpots.get(p.slotKey)) || spotFor(zone, "cat", node.sourceRef);
    const targetH = Math.round(H * ZONES[zone].catScale);
    const scaled = await sharp(cutout).resize({ height: targetH }).png().toBuffer();
    const meta = await sharp(scaled).metadata();
    const cw = meta.width ?? targetH;
    const ch = meta.height ?? targetH;
    const onItem = Boolean(p.slotKey && objectSpots.get(p.slotKey));
    const left = Math.round(W * spot.x - cw / 2);
    // 睡在物件上时脚位略抬,让垫子边沿露出来（表现偏移,不改事实落点）
    const top = Math.round(H * spot.y - ch - (onItem ? targetH * 0.08 : 0));
    layers.push({ input: groundShadow(cw), left, top: top + ch - Math.round(cw * 0.08) });
    layers.push({ input: scaled, left, top });
  }

  return sharp(baseFile).resize(W, H, { fit: "cover" }).composite(layers).jpeg({ quality: 84 }).toBuffer();
}
