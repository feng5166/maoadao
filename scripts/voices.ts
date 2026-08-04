import "./_env";
// 猫语声音资产批产(doc/17):音效模型生成 → afinfo 校验时长 → 入 public/sounds/ +
// 目录写 lib/voice/sound-catalog.json。生成只为扩池,线上永不实时生成。
// 用法:npx tsx scripts/voices.ts [--only=PURR,MEOW_BRIGHT] [--force]
import { execFileSync } from "node:child_process";
import fs from "node:fs";

const BASE = process.env.IMAGE_API_BASE ?? "https://api.modelverse.cn";
const KEY = process.env.IMAGE_API_KEY!;

// 音色修饰词(prompt 用英文,ElevenLabs 引擎最稳)
const TIMBRES: Record<string, string> = {
  young: "a small young kitten with a high-pitched tiny voice",
  normal: "an adult cat with a natural medium voice",
  deep: "a large adult cat with a low deep voice",
};

// 声音族 → prompt 与参数。文案要点:干净无背景音;低落喵严禁婴儿哭化
const TYPES: Record<string, { prompt: (t: string) => string; seconds: number; loopable: boolean; variants: number }> = {
  PURR: {
    prompt: (t) => `${t} purring steadily and contentedly, a soft continuous rumbling cat purr, close-up, calm, no meowing, no background noise, clean recording`,
    seconds: 8,
    loopable: true,
    variants: 2,
  },
  MEOW_SHORT_SOFT: {
    prompt: (t) => `${t} giving one single soft short meow, gentle and quiet, calm greeting, a real cat meow, no background noise, clean recording`,
    seconds: 2,
    loopable: false,
    variants: 2,
  },
  MEOW_BRIGHT: {
    prompt: (t) => `${t} giving one single bright cheerful meow, slightly higher pitch, clear and welcoming, happy real cat meow, no background noise, clean recording`,
    seconds: 2,
    loopable: false,
    variants: 2,
  },
  MEOW_SAD: {
    prompt: (t) => `${t} giving one single quiet low sad meow, soft and drooping at the end, slightly breathy, a real cat sound, not a human baby cry, no background noise, clean recording`,
    seconds: 3,
    loopable: false,
    variants: 2,
  },
  MEOW_IRRITATED: {
    prompt: (t) => `${t} giving one single short curt annoyed meow, clipped and firm, mildly grumpy real cat sound, no hissing, no background noise, clean recording`,
    seconds: 2,
    loopable: false,
    variants: 2,
  },
};

interface CatalogEntry {
  assetId: string;
  voiceType: string;
  timbre: string;
  file: string;
  durationMs: number;
  loopable: boolean;
}

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

  const catalogPath = "lib/voice/sound-catalog.json";
  const catalog: CatalogEntry[] = fs.existsSync(catalogPath) ? JSON.parse(fs.readFileSync(catalogPath, "utf8")) : [];
  const has = new Set(catalog.map((c) => c.assetId));

  for (const [type, cfg] of Object.entries(TYPES)) {
    if (only && !only.includes(type)) continue;
    const dir = `public/sounds/${type}`;
    fs.mkdirSync(dir, { recursive: true });
    for (const [timbre, timbreDesc] of Object.entries(TIMBRES)) {
      for (let n = 1; n <= cfg.variants; n++) {
        const assetId = `${type}_${timbre}_${n}`;
        const file = `${dir}/${timbre}-${n}.mp3`;
        if (!force && has.has(assetId) && fs.existsSync(file)) {
          console.log(`${assetId} 已存在`);
          continue;
        }
        process.stdout.write(`${assetId} ... `);
        const buf = await generate(cfg.prompt(timbreDesc), cfg.seconds);
        if (!buf) continue;
        fs.writeFileSync(file, buf);
        const durationMs = probeDurationMs(file);
        // 校验:时长离谱(为 0 或超过请求 2 倍)判废
        if (durationMs < 500 || durationMs > cfg.seconds * 2000) {
          console.log(`✗ 时长异常 ${durationMs}ms,弃用`);
          fs.unlinkSync(file);
          continue;
        }
        const entry: CatalogEntry = { assetId, voiceType: type, timbre, file: `/sounds/${type}/${timbre}-${n}.mp3`, durationMs, loopable: cfg.loopable };
        const idx = catalog.findIndex((c) => c.assetId === assetId);
        if (idx >= 0) catalog[idx] = entry;
        else catalog.push(entry);
        console.log(`✓ ${durationMs}ms`);
      }
    }
  }
  fs.mkdirSync("lib/voice", { recursive: true });
  fs.writeFileSync(catalogPath, JSON.stringify(catalog, null, 2));
  console.log(`目录共 ${catalog.length} 条`);
}
main().catch((e) => { console.error(e); process.exit(1); });
