// CLI 脚本的环境加载入口：必须作为脚本的第一个 import。
// Next 运行时（页面/route/action）由框架自带加载，禁止在 lib/ 里引入本文件。
import { config } from "dotenv";

// override: 本机 shell 里可能残留旧凭证，脚本以 .env.local 为准
config({ path: [".env.local", ".env"], override: true });
