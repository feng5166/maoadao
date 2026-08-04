import { hashSeed, mulberry32 } from "../sim/rng";
import type { CatVoiceProfile } from "./engine";

// 猫的声音档案(doc/17 §九):不加表不迁移,从性格确定性推导——同一只猫永远同一副嗓子。
// 音色靠三档基础音色 + 微偏移区分;爱不爱叫随社交度。

export function catVoiceProfile(cat: { id: string; boldness: number; sociability: number }): CatVoiceProfile {
  const rng = mulberry32(hashSeed("voice-profile", cat.id));
  const baseTimbre = cat.boldness >= 68 ? "deep" : cat.boldness <= 32 ? "young" : "normal";
  return {
    baseTimbre,
    pitchOffset: Math.round((rng() * 0.08 - 0.04) * 1000) / 1000, // ±4%
    volumeOffset: -Math.round(rng() * 0.1 * 100) / 100, // 0 ~ -10%
    vocalFrequency: Math.min(0.8, Math.max(0.15, cat.sociability / 100)),
  };
}
