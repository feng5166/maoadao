import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // silk-wasm 运行时从包目录读 .wasm,交给 Node 原生解析,不进 bundle
  serverExternalPackages: ["silk-wasm"],
  // 函数包追踪保险丝:任何动态路径 fs 调用都会让追踪器把整个项目扫进函数包
  //(2026-08-05 事故:/adopt 函数 339MB,连 .git 和素材母版都进去了,冷启动秒级)。
  // 运行时确实要读的只有 public/ 下的静态资源(scenes 字面量路径已单独追踪),
  // 这些目录永远不该出现在函数包里:
  outputFileTracingExcludes: {
    "*": [".git/**", "assets/**", "doc/**", "doc2.0/**", "data/**", "scripts/**", "wechat-bridge/**", "public/d0/**", "public/cats-life/**", "public/sounds/**"],
  },
};

export default nextConfig;
