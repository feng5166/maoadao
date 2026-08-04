import type { VoiceEmotion, VoiceState } from "./engine";

// 模拟器的中文心情词 → 声音引擎情绪枚举(doc/17)。宁可映射到 neutral 也别瞎猜——
// 声音只负责加强反馈,不负责解释猫的心理。

export function emotionOf(mood: string | undefined | null): VoiceEmotion {
  const m = mood ?? "";
  if (/开心|兴奋|得意|雀跃/.test(m)) return "happy";
  if (/满足|放松|舒服|平静|安心/.test(m)) return "content";
  if (/失落|难过|委屈|沮丧/.test(m)) return "sad";
  if (/想家|孤单|想你/.test(m)) return "lonely";
  if (/烦|生气|不耐烦|恼/.test(m)) return "irritated";
  if (/紧张|害怕|警惕/.test(m)) return "afraid";
  return "neutral";
}

/** 时刻 + 地点 → 声音状态(MVP 粗粒度:夜里在家=睡觉,其余=休息) */
export function voiceStateOf(hourBJ: number, location: string | undefined | null): VoiceState {
  const home = (location ?? "").includes("小屋");
  if ((hourBJ >= 22 || hourBJ < 6) && home) return "sleeping";
  return "resting";
}
