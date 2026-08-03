import { encode } from "silk-wasm";

// 猫的声音:modelverse TTS(qwen3-tts-flash,返回 wav 下载链接)→ silk-wasm 转微信原生 SILK。
// 失败一律返回 null——语音是锦上添花,任何一环失败都不该影响主流程。

const TTS_TIMEOUT_MS = 30_000;

/** 流式 WAV 的 RIFF/data 长度字段常是占位值(dashscope 实测 0x7FFFFFC7),按实际文件大小修复 */
export function fixWavLengths(wav: Buffer): Buffer {
  const buf = Buffer.from(wav);
  if (buf.length < 44 || buf.toString("ascii", 0, 4) !== "RIFF") return buf;
  buf.writeUInt32LE(buf.length - 8, 4);
  let off = 12;
  while (off + 8 <= buf.length) {
    const id = buf.toString("ascii", off, off + 4);
    let len = buf.readUInt32LE(off + 4);
    const remain = buf.length - off - 8;
    if (len > remain) {
      buf.writeUInt32LE(remain, off + 4);
      len = remain;
    }
    if (id === "data") break;
    off += 8 + len + (len % 2);
  }
  return buf;
}

export interface CatVoice {
  silk: Buffer; // 微信原生编码(iLink 暂不下发 Bot 语音,留作协议放开后用)
  wav: Buffer; // 站内 <audio> 直接播放
  durationMs: number;
  sampleRate: number;
}

/** 猫的留声(AGENTS.md 声音约束):不用人声——喵叫 + 岛上环境声,音效模型生成 mp3。
 *  发给用户的音频一律走这里;prompt 用英文(ElevenLabs 引擎对英文最稳) */
export async function synthCatSound(prompt: string, durationSec = 6): Promise<{ mp3: Buffer; durationMs: number } | null> {
  const base = process.env.IMAGE_API_BASE ?? "https://api.modelverse.cn";
  const key = process.env.IMAGE_API_KEY;
  if (!key || !prompt.trim()) return null;
  try {
    const r = await fetch(`${base}/v1/audio/sound-generation`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.SFX_MODEL ?? "text-to-sound-v2",
        text: prompt.slice(0, 400),
        duration_seconds: durationSec,
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS * 2),
    });
    if (!r.ok) {
      console.error(`[sfx] 生成失败 ${r.status}:`, (await r.text()).slice(0, 200));
      return null;
    }
    const mp3 = Buffer.from(await r.arrayBuffer());
    if (mp3.length < 1000) return null;
    return { mp3, durationMs: durationSec * 1000 };
  } catch (err) {
    console.error("[sfx] 异常:", err instanceof Error ? err.message.slice(0, 200) : err);
    return null;
  }
}

/** 文本 → 人声 TTS。⚠️ 仅限内部实验(AGENTS.md 声音约束:人声出戏,不进用户触点) */
export async function synthCatVoice(text: string): Promise<CatVoice | null> {
  const base = process.env.IMAGE_API_BASE ?? "https://api.modelverse.cn";
  const key = process.env.IMAGE_API_KEY;
  if (!key || !text.trim()) return null;

  try {
    const r = await fetch(`${base}/v1/audio/speech`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.TTS_MODEL ?? "qwen3-tts-flash",
        input: text.slice(0, 200),
        voice: process.env.TTS_VOICE ?? "Cherry",
      }),
      signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
    });
    if (!r.ok) {
      console.error(`[tts] 合成失败 ${r.status}:`, (await r.text()).slice(0, 200));
      return null;
    }
    const json = (await r.json()) as { output?: { audio?: { url?: string } } };
    const url = json.output?.audio?.url;
    if (!url) {
      console.error("[tts] 响应里没有音频链接:", JSON.stringify(json).slice(0, 200));
      return null;
    }
    const audio = await fetch(url, { signal: AbortSignal.timeout(TTS_TIMEOUT_MS) });
    if (!audio.ok) return null;
    const wav = fixWavLengths(Buffer.from(await audio.arrayBuffer()));
    if (wav.toString("ascii", 0, 4) !== "RIFF") {
      console.error("[tts] 音频不是 WAV,放弃");
      return null;
    }
    const sampleRate = wav.readUInt32LE(24);
    const silk = await encode(wav, 0); // 0 = 用 wav 自带采样率
    return { silk: Buffer.from(silk.data), wav, durationMs: Math.round(silk.duration), sampleRate };
  } catch (err) {
    console.error("[tts] 异常:", err instanceof Error ? err.message.slice(0, 200) : err);
    return null;
  }
}
