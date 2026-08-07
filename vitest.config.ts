import { defineConfig } from "vitest/config";

// 连真库的测试跨境打到 Neon 新加坡:首次连接实测 3.4s(冷启动 + 跨境),
// vitest 默认 5s 超时不够——建猫、写几张表再断言,一路就顶穿了。
// 症状是 PrismaClientInitializationError 与 "Test timed out in 5000ms",
// 看着像逻辑挂了,其实是环境慢(2026-08-06)。给足余量,别让人再排查一遍。
// 另一半:测试文件默认并行,多个文件各建一个 PrismaClient 同时打同一个 Neon pooler,
// 连接争抢会让本来能过的用例随机挂(单跑绿、全量跑红,最容易误判成代码坏了)。
// 连库的这套东西串行跑最稳,总时长也就一分多钟。
export default defineConfig({
  test: {
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
