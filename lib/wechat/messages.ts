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

// ============ T5 回信 ACK:确定性短句,按心情分池,绝不接续聊天 ============
const ACK_DEFAULT = [
  "记住啦。明早说给你听。",
  "收到。我把它压在爪垫底下了。",
  "嗯嗯，记下了。",
];
const ACK_HAPPY = ["收到收到！尾巴都翘起来了。", "记住啦！今天正好有好事，明早一起讲。"];
const ACK_DOWN = ["……收到了。有你这句话，好受多了。", "记下了。今天有点蔫，明早再说。"];
const ACK_REPEAT = "一天捎一句就够啦，我记性好。都记着呢。";

export function ackLine(cat: MsgCat, day: number, mood: string | null | undefined, isRepeat: boolean): string {
  if (isRepeat) return `${header(cat.name)}${ACK_REPEAT}`;
  const rng = mulberry32(hashSeed(day, "wx-ack", cat.id));
  const m = mood ?? "";
  const pool = ["得意", "眉开眼笑"].includes(m) ? ACK_HAPPY : ["郁闷", "有点丧", "饿肚子", "愁钱"].includes(m) ? ACK_DOWN : ACK_DEFAULT;
  return `${header(cat.name)}${pick(rng, pool)}`;
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
