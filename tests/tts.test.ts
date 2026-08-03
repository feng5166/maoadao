import { describe, expect, it } from "vitest";
import { fixWavLengths } from "../lib/tts";

// 流式 WAV 修复:dashscope 返回的 wav 头长度是占位值(0x7FFFFFC7),silk-wasm 严格校验会拒收

function makeWav(pcmLen: number, bogusLengths: boolean): Buffer {
  const buf = Buffer.alloc(44 + pcmLen);
  buf.write("RIFF", 0, "ascii");
  buf.writeUInt32LE(bogusLengths ? 0x7ffffff7 : 36 + pcmLen, 4);
  buf.write("WAVE", 8, "ascii");
  buf.write("fmt ", 12, "ascii");
  buf.writeUInt32LE(16, 16); // fmt chunk 长度
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(24000, 24); // 采样率
  buf.writeUInt32LE(48000, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36, "ascii");
  buf.writeUInt32LE(bogusLengths ? 0x7fffffd3 : pcmLen, 40);
  return buf;
}

describe("fixWavLengths", () => {
  it("修复占位长度:RIFF 主块与 data 块按实际文件大小回写", () => {
    const fixed = fixWavLengths(makeWav(1600, true));
    expect(fixed.readUInt32LE(4)).toBe(fixed.length - 8);
    expect(fixed.readUInt32LE(40)).toBe(1600);
  });

  it("长度本来正确的 wav 原样保留", () => {
    const good = makeWav(1600, false);
    const fixed = fixWavLengths(good);
    expect(fixed.equals(good)).toBe(true);
  });

  it("非 RIFF 数据不动", () => {
    const junk = Buffer.from("not a wav at all, definitely not a riff header padding padding");
    expect(fixWavLengths(junk).equals(junk)).toBe(true);
  });
});
