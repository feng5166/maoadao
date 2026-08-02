// 微信消息文案层(doc/11 §六、doc/13 T4-T6):全部确定性生成,不调 LLM。
// 规范:每条以「🐱 {猫名}：」开头(1:1 直连,账号档案中性);事实先行——
// 消息内容只允许来自事实(factSummary/回执摘句),不允许在这里编任何情节。

import { hashSeed, mulberry32, pick } from "../sim/rng";
import { voiceFor } from "../narrative/voice";

interface MsgCat {
  id: string;
  name: string;
  boldness: number;
  sociability: number;
  diligence: number;
  personaTags: string[];
}

const header = (name: string) => `🐱 ${name}：`;

// ============ T4 握手:按性格主轴分池 + 昼夜变体(doc/12 §三.6)============
const HANDSHAKE_BOLD_LOW = [
  "我确认了三遍，才敢给你发消息。",
  "我在屋里练习了好几遍开场白……结果还是只想说，我找到你啦。",
];
const HANDSHAKE_SOCIAL_HIGH = [
  "我找到你啦！我已经迫不及待想告诉你今天认识的每一只猫。",
  "找到你啦！岛上的事太多了，我都不知道明天先讲哪件。",
];
const HANDSHAKE_DILIGENT_HIGH = [
  "我把小屋收拾好了，才来找你。",
  "我先把今天的事都记在爪垫上了，明早一件件讲给你听。",
];
const HANDSHAKE_DEFAULT = [
  "我找到你啦。",
  "是你吗？太好了，我找到你了。",
];
const HANDSHAKE_NIGHT = [
  "这么晚呀。我也刚到，睡不着。明早说给你听。",
  "夜里到的岛，灯塔的光扫过来一下一下的。你也早点睡，明早我有话跟你说。",
];

/** 主轴判定:最偏离 50 的那一轴决定池子 */
function handshakePool(cat: MsgCat): string[] {
  const axes: [number, string[]][] = [
    [50 - cat.boldness, HANDSHAKE_BOLD_LOW], // 胆小(低胆量)
    [cat.sociability - 50, HANDSHAKE_SOCIAL_HIGH],
    [cat.diligence - 50, HANDSHAKE_DILIGENT_HIGH],
  ];
  const best = axes.sort((a, b) => b[0] - a[0])[0];
  return best[0] >= 20 ? best[1] : HANDSHAKE_DEFAULT;
}

export function handshakeMessage(cat: MsgCat, firstWords: string | null, hourBJ: number): string {
  const rng = mulberry32(hashSeed("handshake", cat.id));
  const night = hourBJ >= 22 || hourBJ < 8;
  const opening = night ? pick(rng, HANDSHAKE_NIGHT) : pick(rng, handshakePool(cat));
  const quote = firstWords
    ? `\n\n你说「${firstWords}」——我记住了。`
    : "\n\n你还没跟我说过话——回岛上给我留一句吧，我想记住它。";
  const promise = "\n明天早上，我醒来第一件事就告诉你。";
  return `${header(cat.name)}\n${opening}${quote}${promise}`;
}

// ============ 门铃三件套(doc/11 修订):一来一回,然后回岛。全部确定性,永不 LLM ============
// 产品规则:猫不住在微信里,微信只是它偶尔伸到现实世界的一只爪子。

/** 找猫("你在哪/在干嘛"):报当前已解锁的真实状态 + 回岛深链。nowFirstPerson 来自事实,绝不编造。 */
export function statusReply(cat: MsgCat, nowFirstPerson: string, link: string, hourBJ: number): string {
  const night = hourBJ >= 22 || hourBJ < 6;
  if (night) {
    return `${header(cat.name)}\n${nowFirstPerson}\n你也可以进来看看我——轻一点。\n${link}`;
  }
  return `${header(cat.name)}\n我现在不在微信里。${nowFirstPerson}\n\n来岛上找我吧：\n${link}`;
}

/** 留话回执:确认收到 + 性格小尾巴 + 回岛深链。不承诺照做,不展开对话。 */
const RECEIPT_BOLD_LOW = "我收到啦。我会先想一想，再决定要不要照做。";
const RECEIPT_BOLD_HIGH = "收到。不过我可能还是会先去看看。";
const RECEIPT_DILIGENT_HIGH = "我记下来了，等忙完手上的事就认真想想。";
const RECEIPT_DEFAULT = "我收到啦。这句话我会带回猫啊岛，等明天遇到事情的时候再想一想。";

export function receiptReply(cat: MsgCat, link: string): string {
  const axes: [number, string][] = [
    [50 - cat.boldness, RECEIPT_BOLD_LOW],
    [cat.boldness - 50, RECEIPT_BOLD_HIGH],
    [cat.diligence - 50, RECEIPT_DILIGENT_HIGH],
  ];
  const best = axes.sort((a, b) => b[0] - a[0])[0];
  const line = best[0] >= 20 ? best[1] : RECEIPT_DEFAULT;
  return `${header(cat.name)}\n${line}\n\n你也可以现在来看看我：\n${link}`;
}

/** 收束(同一天第二次来消息):听见了,但不陪聊。 */
export function closeReply(cat: MsgCat): string {
  return `${header(cat.name)}你后面说的话我也收到了。我先回岛上了，晚点在那里见。`;
}

// ============ 微响应(收束之后):不静默也不接话——岛上漏过来的一点动静 ============
// 括号旁白体:不是"猫在说话",是你隔着海看它的一眼。永不引用用户内容,防 Chatbot 化。
const PRESENCE_DAY = [
  "（它的耳朵朝这边转了一下，又转回去了）",
  "（远处传来一声短短的喵）",
  "（它正忙着岛上的事，尾巴尖朝你晃了晃）",
  "（风把你的话捎过去了——它嗯了一声）",
  "（它探出头看了你一眼，又缩回去晒太阳了）",
];
const PRESENCE_NIGHT = [
  "（小屋的灯已经熄了）",
  "（它睡得很沉，胡子抖了一下）",
  "（枕头边的纸条又多了一张）",
];

/** n = 今天第几次微响应(从 0 起):连发多条后收敛为一个爪印,防刷也防旁白疲劳 */
export function presenceReply(cat: MsgCat, hourBJ: number, n: number, dayKey: number): string {
  if (n >= 4) return "🐾";
  const night = hourBJ >= 22 || hourBJ < 7;
  const pool = night ? PRESENCE_NIGHT : PRESENCE_DAY;
  const rng = mulberry32(hashSeed(dayKey, "presence", cat.id, n));
  return pick(rng, pool);
}

export const UNSUBSCRIBE_WORDS = ["别再捎信", "取消", "退订", "别发了"];
export function unsubscribeAck(catName: string): string {
  return `${header(catName)}好。我就不捎信了——你想我的时候，岛上见。`;
}

// ============ T6 每日消息模板(内容素材由调用方从事实取)============
/** D2 兑现:今晨第一件事。morningLine 来自 factSummary,responseLine 来自回执摘句,都不许编。 */
export function d2Message(cat: MsgCat, morningLine: string, responseLine: string | null, link: string): string {
  const v = voiceFor(cat);
  const self = v.selfRef === "我" ? "我" : v.selfRef;
  const resp = responseLine ? `\n${responseLine}` : "";
  return `${header(cat.name)}\n早上好。${self}醒来后的第一件事——${morningLine}。${resp}\n\n来看看？${link}`;
}

/** 事件触发(白名单):eventLine 来自事实转写 */
export function eventMessage(cat: MsgCat, eventLine: string, link: string): string {
  return `${header(cat.name)}\n${eventLine}\n\n来看看？${link}`;
}

/** 缺席 3 天关怀:不责备体(v0.8 缺席原则)。todayLine 来自当日事实。 */
export function absenceMessage(cat: MsgCat, todayLine: string): string {
  return `${header(cat.name)}\n我没什么事。就是今天${todayLine}的时候，多看了两眼码头。`;
}
