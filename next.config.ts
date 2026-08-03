import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // silk-wasm 运行时从包目录读 .wasm,交给 Node 原生解析,不进 bundle
  serverExternalPackages: ["silk-wasm"],
};

export default nextConfig;
