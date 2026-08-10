// 院子玩法 Capability(doc2.0/14 §九 护栏③ → 2026-08-09 翻转拍板:默认开)。
// D0 尾部换轨与本开关同一提交翻转,避免半翻转状态(创始人拍板)。
// 紧急回退:设 YARD_GAMEPLAY_DISABLED=1(仅运维开关,不再有灰度语义)。

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- 兼容既有调用签名(翻转后参数不再参与判定)
export function yardGameplayEnabled(_user?: { yardAccess?: boolean } | null): boolean {
  return process.env.YARD_GAMEPLAY_DISABLED !== "1";
}
