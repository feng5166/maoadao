import { config } from "dotenv";
config({ path: [".env.local", ".env"], override: true });

// 连库测试的统一闸门(2026-08-07 review P1)。
//
// 原先各测试文件自己读 .env.local,只判断 `DATABASE_URL` 存在就开始写库 ——
// 而 .env.local 里那一串指向的是**生产库**(Neon 新加坡)。误跑一次 `npm test`
// 就会往真实用户的数据里写测试猫、写日记、删行。tick-concurrency 甚至会
// `prisma.cat.findFirst()` 抓库里第一只真猫往上写。
//
// 现在:必须显式给出 `TEST_DATABASE_URL` 才连库,并且库名要能认出是测试库。
// 没给就整体跳过 —— 跳过比"跑了但改了生产"安全一万倍。
//
// 怎么跑连库测试:
//   TEST_DATABASE_URL="postgresql://…/maoadao_test" npm test
// 库名需含 test(或设 ALLOW_UNSAFE_TEST_DB=1 明确越权,仅限一次性排查)。

const RAW = process.env.TEST_DATABASE_URL ?? "";

function dbName(url: string): string {
  try {
    return new URL(url).pathname.replace(/^\//, "").split("?")[0];
  } catch {
    return "";
  }
}

/** 这个连接串看起来像测试库吗(库名含 test / 以 _test 结尾) */
function looksLikeTestDb(url: string): boolean {
  const name = dbName(url).toLowerCase();
  return name.includes("test");
}

const unsafeOk = process.env.ALLOW_UNSAFE_TEST_DB === "1";

export const TEST_DB_READY = (() => {
  if (!RAW) return false;
  if (!looksLikeTestDb(RAW) && !unsafeOk) {
    console.warn(
      `[db-guard] TEST_DATABASE_URL 指向的库名「${dbName(RAW)}」不像测试库,已拒绝连接。` +
        `确认无误再加 ALLOW_UNSAFE_TEST_DB=1。`,
    );
    return false;
  }
  // 让 lib/db 的 PrismaClient 连到测试库,而不是 .env.local 里的生产串
  process.env.DATABASE_URL = RAW;
  process.env.DATABASE_URL_UNPOOLED = RAW;
  return true;
})();

/** 每次运行唯一的 fixture 前缀:跑挂了也能一眼认出、批量清掉,且并发跑不互相踩 */
export const FIXTURE = `t${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
export const fx = (s: string) => `${FIXTURE}-${s}`;
