// 猫对主人的第一印象 + 首日小秘密(doc/12 §三.4 / §八.7):
// 全部确定性生成,不调 LLM——关系事实不允许被编造。
// 输入只有两类:登记册的心理选择(已映射为三轴数值)+ firstWords 的可验证特征。

import { hashSeed, mulberry32, pick } from "../sim/rng";

interface FICat {
  id: string;
  boldness: number;
  sociability: number;
  diligence: number;
}

const SOOTHE_WORDS = ["别怕", "不怕", "不要害怕", "放心", "安心", "慢慢来", "别担心", "别害怕"];

// 按 firstWords 特征分池;句内的性格小尾巴由三轴选
const POOL_SOOTHED = [
  "它觉得你说话的样子让它安心",
  "你说那句话的时候,它的耳朵慢慢放平了——它信了",
];
const POOL_LONG = [
  "你说了很多。它没全听懂,但它记住了你说话时一直看着它",
  "你的话很长,它听到一半就开始盯着你的眼睛看",
];
const POOL_SHORT = [
  "你话不多。它喜欢不吵的人",
  "你只说了一句。它把这一句翻来覆去想了一路",
];
const POOL_SILENT = [
  "你没说话,它也没叫——你们就这么看了对方一会儿,它觉得这样挺好",
  "你什么都没说。它反而凑近了半步",
];

// 性格小尾巴(可选,约一半的猫带)
const TAIL_BOLD_LOW = "它假装在看别处,尾巴尖却一直朝着你的方向";
const TAIL_SOCIAL_HIGH = "它当场就想把这件事讲给码头上的猫听";
const TAIL_DILIGENT_HIGH = "它把这件事记在了小本子的第一行";

/** 第一印象:同一只猫 + 同一句话,永远同一个印象 */
export function firstImpression(cat: FICat, firstWords: string | null, nick: string): string {
  const rng = mulberry32(hashSeed("first-impression", cat.id));
  const fw = (firstWords ?? "").trim();
  const soothed = SOOTHE_WORDS.some((w) => fw.includes(w));
  const pool = !fw ? POOL_SILENT : soothed ? POOL_SOOTHED : fw.length >= 16 ? POOL_LONG : POOL_SHORT;
  const base = pick(rng, pool);
  const tails: [number, string][] = [
    [50 - cat.boldness, TAIL_BOLD_LOW],
    [cat.sociability - 50, TAIL_SOCIAL_HIGH],
    [cat.diligence - 50, TAIL_DILIGENT_HIGH],
  ];
  const best = tails.sort((a, b) => b[0] - a[0])[0];
  const tail = best[0] >= 20 && rng() < 0.6 ? `。${best[1]}` : "";
  return `第一次见到${nick},${base}${tail}。`;
}

// ============ 首日小秘密(doc/12 §八.7):结构化事实,不给钥匙,可被将来重新发现 ============
const SECRETS_PLAIN = [
  "偷偷藏了一片码头边捡的叶子",
  "第一次进小屋时,故意没有立刻关门——想留一条缝看看外面",
  "把一颗没什么用的小石子收进了抽屉最里面",
  "在窗台上选了一个位置,决定那是它的",
];

/** 小秘密:留了话的猫优先"数字数"变体(可验证的事实,最动人) */
export function firstSecret(catId: string, firstWords: string | null, nick: string): string {
  const rng = mulberry32(hashSeed("first-secret", catId));
  const fw = (firstWords ?? "").trim();
  if (fw && rng() < 0.5) {
    return `偷偷数了${nick}那句话,一共 ${fw.length} 个字`;
  }
  return pick(rng, SECRETS_PLAIN);
}
