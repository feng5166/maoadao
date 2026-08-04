import { describe, expect, it } from "vitest";
import { newVoiceSession, resolveCatVoice, type CatVoiceProfile, type CatVoiceRequest } from "../lib/voice/engine";

// 猫语声音引擎(doc/17):纯函数规则,rng/now 可注入——锁住连点阶梯/冷却/呼噜配额/反重复

const profile: CatVoiceProfile = { baseTimbre: "normal", pitchOffset: 0, volumeOffset: 0, vocalFrequency: 0.5 };
const base: CatVoiceRequest = { catId: "cat-t", context: "user_touch", state: "resting", emotion: "neutral", intensity: 1, relationLevel: 1 };
const always = () => 0; // rng=0:概率判定必过,选池选第一个
const never = () => 0.999;

describe("猫语声音引擎", () => {
  it("连点阶梯:第三次点击出不耐烦喵,之后进入静默", () => {
    const s = newVoiceSession();
    let t = 1000;
    const r1 = resolveCatVoice(base, profile, s, always, (t += 100));
    expect(r1.voiceType).toBe("MEOW_SHORT_SOFT");
    resolveCatVoice(base, profile, s, never, (t += 100)); // 第二次没叫
    const r3 = resolveCatVoice(base, profile, s, always, (t += 100));
    expect(r3.voiceType).toBe("MEOW_IRRITATED");
    // 第四次:概率 0 → 静默,且触发 15s 禁声
    const r4 = resolveCatVoice(base, profile, s, always, (t += 100));
    expect(r4.shouldPlay).toBe(false);
  });

  it("睡觉=呼噜且一页只一次;呼噜可循环", () => {
    const s = newVoiceSession();
    const req: CatVoiceRequest = { ...base, context: "user_enter", state: "sleeping" };
    const r1 = resolveCatVoice(req, profile, s, always, 1000);
    expect(r1.voiceType).toBe("PURR");
    expect(r1.loop).toBe(true);
    const r2 = resolveCatVoice(req, profile, s, always, 200000);
    expect(r2.shouldPlay).toBe(false);
  });

  it("同类型冷却:轻短喵 8s 内不重复;海螺有距离感(音量低,延迟≥500ms)", () => {
    const s = newVoiceSession();
    const enter: CatVoiceRequest = { ...base, context: "user_enter" };
    const r1 = resolveCatVoice(enter, profile, s, always, 1000);
    expect(r1.shouldPlay).toBe(true);
    const r2 = resolveCatVoice(enter, profile, s, always, 4000);
    expect(r2.shouldPlay).toBe(false); // 冷却中
    const s2 = newVoiceSession();
    const conch = resolveCatVoice({ ...base, context: "conch" }, profile, s2, always, 1000);
    expect(conch.shouldPlay).toBe(true);
    expect(conch.volume!).toBeLessThan(0.6);
    expect(conch.delayMs!).toBeGreaterThanOrEqual(500);
  });

  it("单页最多 3 声;开心高关系走明亮喵,低关系走轻短喵", () => {
    const s = newVoiceSession();
    s.pagePlays = 3;
    expect(resolveCatVoice(base, profile, s, always, 1000).shouldPlay).toBe(false);
    const s2 = newVoiceSession();
    const happyClose = resolveCatVoice({ ...base, context: "user_enter", emotion: "happy", relationLevel: 3 }, profile, s2, always, 1000);
    expect(happyClose.voiceType).toBe("MEOW_BRIGHT");
    const s3 = newVoiceSession();
    const happyNew = resolveCatVoice({ ...base, context: "user_enter", emotion: "happy", relationLevel: 0 }, profile, s3, always, 1000);
    expect(happyNew.voiceType).toBe("MEOW_SHORT_SOFT");
  });
});
