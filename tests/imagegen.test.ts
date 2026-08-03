import { config } from "dotenv";
config({ path: [".env.local", ".env"], override: true });

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateImage, toDataUri } from "../lib/imagegen";

// 全程 mock fetch：不打真 API，不花钱。验证的是"铁律"——
// watermark 必须是 false、b64_json 直取、URL 兜底、参考图进 images、5xx 重试 4xx 不重试。

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200 });
}

describe("generateImage（mock fetch）", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("IMAGE_API_KEY", "test-key");
    vi.stubEnv("IMAGE_API_BASE", "https://img.example.com");
    fetchMock.mockReset();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it("请求体永远带 watermark:false 与 b64_json（去 AI 化铁律）", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ data: [{ b64_json: PNG.toString("base64") }] }));
    const buf = await generateImage({ prompt: "一只猫" });
    expect(buf?.equals(PNG)).toBe(true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://img.example.com/v1/images/generations");
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.watermark).toBe(false);
    expect(body.response_format).toBe("b64_json");
    expect(body.images).toBeUndefined(); // 没传参考图就不该带这个字段
  });

  it("参考图转成 data URI 进 images 字段", async () => {
    fetchMock.mockResolvedValueOnce(okResponse({ data: [{ b64_json: PNG.toString("base64") }] }));
    await generateImage({
      prompt: "一只猫",
      referenceImages: [{ data: Buffer.from("abc"), mime: "image/jpeg" }],
    });
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.images).toEqual([toDataUri(Buffer.from("abc"), "image/jpeg")]);
  });

  it("中转忽略 b64_json 时兜底下载 url", async () => {
    fetchMock
      .mockResolvedValueOnce(okResponse({ data: [{ url: "https://cdn.example.com/x.jpg" }] }))
      .mockResolvedValueOnce(new Response(PNG, { status: 200 }));
    const buf = await generateImage({ prompt: "一只猫" });
    expect(buf?.equals(PNG)).toBe(true);
    expect(fetchMock.mock.calls[1][0]).toBe("https://cdn.example.com/x.jpg");
  });

  it("5xx 重试一次后成功", async () => {
    fetchMock
      .mockResolvedValueOnce(new Response("boom", { status: 500 }))
      .mockResolvedValueOnce(okResponse({ data: [{ b64_json: PNG.toString("base64") }] }));
    const buf = await generateImage({ prompt: "一只猫" });
    expect(buf?.equals(PNG)).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  }, 15_000);

  it("4xx 不重试直接失败（prompt 违规重试也没用）", async () => {
    fetchMock.mockResolvedValueOnce(new Response("bad prompt", { status: 400 }));
    const buf = await generateImage({ prompt: "一只猫" });
    expect(buf).toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("缺 IMAGE_API_KEY 时不发请求", async () => {
    vi.stubEnv("IMAGE_API_KEY", "");
    const buf = await generateImage({ prompt: "一只猫" });
    expect(buf).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
