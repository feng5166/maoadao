import fs from "node:fs";
import path from "node:path";

// tsx 脚本不会自动加载 .env.local；且需要覆盖 shell 里可能残留的旧凭证，
// 所以这里强制以项目根目录的 .env.local / .env 为准。
const root = process.cwd();
for (const file of [".env", ".env.local"]) {
  const p = path.join(root, file);
  if (!fs.existsSync(p)) continue;
  for (const line of fs.readFileSync(p, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

// SDK 同时收到 API key 和 auth token 会被拒绝，二者只保留 .env 指定的那个
if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_AUTH_TOKEN) {
  delete process.env.ANTHROPIC_AUTH_TOKEN;
}
