// 院子玩法 Capability Flag（doc2.0/14 §九 护栏③）。
// 默认关：新表/新 API/新结算器上线后不改变线上世界；内部测试账号先开（User.yardAccess）。
// 全量开启 = 设 YARD_GAMEPLAY_ENABLED=1，且必须与 D0 尾部换轨（script.ts 三处 + 路由）
// 同一个提交——在那之前旧 /adopt 链路保持默认在线。

export function yardGameplayEnabled(user?: { yardAccess?: boolean } | null): boolean {
  if (process.env.YARD_GAMEPLAY_ENABLED === "1") return true;
  return Boolean(user?.yardAccess);
}
