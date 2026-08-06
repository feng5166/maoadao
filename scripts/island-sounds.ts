import "./_env";
// 岛声层资产(2026-08-06):全站背景声,按"你在岛上的哪儿 × 什么时辰"选。
//
// 定性:**不是背景音乐,是岛本身的声音**——海浪、风、幌子、纸页、虫鸣。
// 这条线由 AGENTS.md §5「声音也不出戏」与 doc2.0/04 第五声部「沉默」共同划定:
// 循环 BGM 是最有 App 感的东西,岛不该有;但岛该有它自己的动静。
// **无人声红线**:集市不能出现人语/交谈/叫卖,只能是风吹幌子、纸页翻动、远处鸥鸣。
//
// 循环安全:提示词只写**稳定质地**,不写一次性事件(单声鸟叫/钟声/汽笛)——
// 有特征事件的素材循环起来会听出接缝。一次性音效归 D0 的 cue 系统。
//
// 另出一条 music-bed 作对照(创始人点名要"背景音乐"),供 A/B 试听后拍板。
// 用法:npx tsx scripts/island-sounds.ts [--only=dock-day,...] [--force]
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.IMAGE_API_BASE ?? "https://api.modelverse.cn";
const KEY = process.env.IMAGE_API_KEY!;
const OUT = "public/sounds/island";

const BEDS: Record<string, { prompt: string; seconds: number }> = {
  // 码头(首页):海边最开阔的地方
  "dock-day": {
    prompt:
      "continuous calm ocean ambience at a small wooden dock, gentle steady waves lapping, soft sea breeze, faint distant seagulls far away in the background, warm afternoon, even and unchanging texture throughout, seamless ambient loop, no music, no voices, no people talking",
    seconds: 20,
  },
  "dock-night": {
    prompt:
      "continuous calm night ocean ambience at a small dock, slow gentle waves, soft night breeze, faint crickets very far away, deep and peaceful, even and unchanging texture throughout, seamless ambient loop, no music, no voices, no people talking, no birds",
    seconds: 20,
  },
  // 村子(岛上/公告栏/报摊):有生活但没有人
  "village-day": {
    prompt:
      "continuous gentle breeze through a quiet small seaside village, soft rustle of paper notices and cloth awnings, faint wooden creaking, distant soft surf underneath, sleepy afternoon, even and unchanging texture throughout, seamless ambient loop, no music, no voices, no people talking, no footsteps",
    seconds: 20,
  },
  "village-night": {
    prompt:
      "continuous quiet night ambience in a small seaside village, steady crickets, soft low wind, very faint distant waves, calm and sleepy, even and unchanging texture throughout, seamless ambient loop, no music, no voices, no people talking",
    seconds: 20,
  },
  // 小屋(我的猫):最私人的地方,声音要更小更近
  "home-day": {
    prompt:
      "continuous quiet ambience inside a small wooden cabin by the sea, very soft breeze through a window, faint distant surf, occasional soft wood settling, intimate and close, even and unchanging texture throughout, seamless ambient loop, no music, no voices, no people talking",
    seconds: 20,
  },
  "home-night": {
    prompt:
      "continuous quiet night ambience inside a small wooden cabin, soft crickets outside the window, very faint distant waves, gentle low wind, cozy and still, even and unchanging texture throughout, seamless ambient loop, no music, no voices, no people talking",
    seconds: 20,
  },
  // 对照组:创始人点名的"背景音乐"。刻意做成极稀疏的环境音乐床,不是旋律循环
  "music-bed": {
    prompt:
      "very sparse warm ambient music, soft sustained pads, slow and gentle, seaside afternoon mood, no drums, no percussion, no strong melody, no vocals, calm and unobtrusive background texture, seamless loop",
    seconds: 20,
  },
};

function probeDurationMs(file: string): number {
  try {
    const out = execFileSync("afinfo", [file], { encoding: "utf8" });
    const m = out.match(/estimated duration:\s*([\d.]+)\s*sec/);
    return m ? Math.round(parseFloat(m[1]) * 1000) : 0;
  } catch {
    return 0;
  }
}

async function generate(prompt: string, seconds: number): Promise<Buffer | null> {
  try {
    const r = await fetch(`${BASE}/v1/audio/sound-generation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: process.env.SFX_MODEL ?? "text-to-sound-v2", text: prompt, duration_seconds: seconds }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!r.ok) {
      console.error(`  ✗ ${r.status}:`, (await r.text()).slice(0, 160));
      return null;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 2000 ? buf : null;
  } catch (e) {
    console.error("  ✗", e instanceof Error ? e.message.slice(0, 160) : e);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");
  fs.mkdirSync(OUT, { recursive: true });
  let ok = 0;
  const targets = Object.entries(BEDS).filter(([k]) => !only || only.includes(k));
  for (const [name, cfg] of targets) {
    const file = `${OUT}/${name}.mp3`;
    if (!force && fs.existsSync(file)) {
      console.log(`${name} 已存在`);
      ok++;
      continue;
    }
    process.stdout.write(`${name} ... `);
    const buf = await generate(cfg.prompt, cfg.seconds);
    if (!buf) continue;
    fs.writeFileSync(file, buf);
    const ms = probeDurationMs(file);
    if (ms < 3000) {
      console.log(`✗ 时长异常 ${ms}ms,弃用`);
      fs.unlinkSync(file);
      continue;
    }
    console.log(`✓ ${ms}ms / ${Math.round(buf.length / 1024)}KB`);
    ok++;
  }
  console.log(`完成 ${ok}/${targets.length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
