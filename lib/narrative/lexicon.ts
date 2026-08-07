// 语言防火墙词表(doc2.0/04 §六 负面词典 + AGENTS.md §4 用户侧禁系统词)。
//
// 这里是**唯一一份**词表:构建期由 scripts/lang-scan.ts 扫源码,运行期由
// lib/narrative/narrator.ts 校验 LLM 产出。以前只有扫描脚本管得住写死的文案,
// 模型现编的句子没人拦——而用户看到的正是后者(2026-08-07 review P2)。
//
// 判据(04 §一,一票否决):**一句话如果可以原样出现在任何 App 里,它就不属于猫岛。**

export const BANNED_WORDS: { word: string; family: string }[] = [
  ...["任务", "成就", "等级", "积分", "签到", "奖励", "解锁", "存档", "读档"].map((word) => ({ word, family: "系统/游戏词" })),
  ...["活动", "福利", "限时", "错过", "立即", "点击领取", "新版本", "更新公告", "上新"].map((word) => ({ word, family: "运营/FOMO 词" })),
  ...["搭档", "官宣", "粉丝", "人设", "塌房"].map((word) => ({ word, family: "人类社交词" })),
  ...["优化", "提升", "管理", "打卡", "复盘"].map((word) => ({ word, family: "效率词" })),
  ...["等你好久", "你怎么才来"].map((word) => ({ word, family: "情感绑架词" })),
  // AGENTS.md §4:用户侧禁系统词。「建议/采纳/事件线」是设计词,不该出现在猫嘴里
  ...["AI", "Agent", "智能体", "大模型", "算法", "建议", "采纳", "事件线", "参数"].map((word) => ({ word, family: "系统词" })),
];

/** 纯拉丁词按词边界匹配,免得 QIZAI / COMPANY 这类标识符全是误报 */
function hit(text: string, word: string): boolean {
  return /^[A-Za-z]+$/.test(word)
    ? new RegExp(`(?<![A-Za-z0-9_])${word}(?![A-Za-z0-9_])`).test(text)
    : text.includes(word);
}

/** 命中的负面词(空数组 = 干净) */
export function bannedHits(text: string): string[] {
  return BANNED_WORDS.filter((b) => hit(text, b.word)).map((b) => b.word);
}

// 「第 N 天」「天气X。今天:」这类是系统口径直出,不是猫在说话
const SYSTEM_SHAPES = [
  /第\s*\d+\s*天/, // 世界日编号
  /^\s*\d+\.\s/m, // 编号清单
  /\[(早晨|上午|中午|下午|傍晚|夜里)\]/, // 时段标记原样漏出
];

/** 这段文字像不像"系统在说话"(不是猫在说话) */
export function looksSystemic(text: string): boolean {
  return SYSTEM_SHAPES.some((re) => re.test(text));
}

/** 用户侧文案总闸:过不了就别送到用户眼前 */
export function passesLanguageFirewall(text: string): { ok: boolean; reason?: string } {
  const banned = bannedHits(text);
  if (banned.length) return { ok: false, reason: `负面词典命中:${banned.join("、")}` };
  if (looksSystemic(text)) return { ok: false, reason: "系统口径外泄(日编号/编号清单/时段标记)" };
  return { ok: true };
}
