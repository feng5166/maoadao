import "./_env";
// D0 声音包批产(doc2.0/15 §五「听海」层):环境声,不是猫语——不进 sound-catalog,
// 固定文件名落 public/sounds/D0/,D0Player 按屏静态映射。
// 红线:无人声(AGENTS.md §5);S9 的「静」是设计,没有文件。
// prompt 英文(ElevenLabs 引擎最稳),干净无杂音;循环素材首尾要能接上。
// 用法:npx tsx scripts/d0-sounds.ts [--only=sea,mm] [--force]
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.IMAGE_API_BASE ?? "https://api.modelverse.cn";
const KEY = process.env.IMAGE_API_KEY!;

// 屏 → 声音(doc2.0/15 §一「声音」列):S0 纸响 / S1 海浪鸥鸣 / S2 风纸页 /
// S3 远处一声猫叫 / S4 瓶盖磕地两声 / S6 极轻「呣」 / S8 风 / S10 海浪回来
const PACK: Record<string, { prompt: string; seconds: number; loopable: boolean }> = {
  ticket: {
    prompt: "a single sheet of thick paper being touched and settling gently on a wooden desk, very soft paper rustle, quiet room ambience, clean recording, no voices, no music",
    seconds: 3,
    loopable: false,
  },
  "sea-gulls": {
    prompt: "gentle sea waves lapping against a wooden dock, calm evening harbor, two distant seagull cries far away, soft and peaceful, seamless ambient loop, no voices, no music",
    seconds: 10,
    loopable: true,
  },
  "wind-paper": {
    prompt: "a soft evening breeze through a small seaside market, occasional light flutter of newspaper pages pinned on a wooden board, calm and quiet, seamless ambient loop, no voices, no music",
    seconds: 8,
    loopable: true,
  },
  vista: {
    prompt: "soft wind over open coastal hills at dusk, very quiet, one single faint cat meow very far away in the distance, peaceful, no voices, no music",
    seconds: 8,
    loopable: false,
  },
  "cap-taps": {
    prompt: "a small metal bottle cap being tapped twice by a cat paw on wooden dock planks, two light metallic taps, tiny and close-up, quiet background, clean recording, no voices, no music",
    seconds: 2,
    loopable: false,
  },
  mm: {
    prompt: "an extremely soft short closed-mouth cat trill, a quiet muffled single 'mrr' hum from an adult cat holding its mouth closed, very gentle and low volume, close-up, clean recording, not a meow, no background noise, no voices, no music",
    seconds: 2,
    loopable: false,
  },
  wind: {
    prompt: "soft low wind moving past a small quiet wooden house at dusk, gentle and steady, slightly lonely but warm, seamless ambient loop, no voices, no music, no birds",
    seconds: 8,
    loopable: true,
  },
  sea: {
    prompt: "gentle sea waves rolling in slowly and steadily on a quiet evening shore, calm and warm, seamless ambient loop, no seagulls, no voices, no music",
    seconds: 10,
    loopable: true,
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
      signal: AbortSignal.timeout(90_000),
    });
    if (!r.ok) {
      console.error(`  ✗ ${r.status}:`, (await r.text()).slice(0, 120));
      return null;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    return buf.length > 2000 ? buf : null;
  } catch (e) {
    console.error("  ✗", e instanceof Error ? e.message.slice(0, 120) : e);
    return null;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes("--force");
  const only = args.find((a) => a.startsWith("--only="))?.slice(7).split(",");

  const dir = "public/sounds/D0";
  fs.mkdirSync(dir, { recursive: true });
  let ok = 0;
  for (const [name, cfg] of Object.entries(PACK)) {
    if (only && !only.includes(name)) continue;
    const file = `${dir}/${name}.mp3`;
    if (!force && fs.existsSync(file)) {
      console.log(`${name} 已存在`);
      ok++;
      continue;
    }
    process.stdout.write(`${name} ... `);
    const buf = await generate(cfg.prompt, cfg.seconds);
    if (!buf) continue;
    fs.writeFileSync(file, buf);
    const durationMs = probeDurationMs(file);
    if (durationMs < 500 || durationMs > cfg.seconds * 2500) {
      console.log(`✗ 时长异常 ${durationMs}ms,弃用`);
      fs.unlinkSync(file);
      continue;
    }
    console.log(`✓ ${durationMs}ms`);
    ok++;
  }
  console.log(`完成 ${ok}/${Object.keys(PACK).filter((k) => !only || only.includes(k)).length}`);
}
main().catch((e) => { console.error(e); process.exit(1); });
