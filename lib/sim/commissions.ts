// NPC 委托：邻居捎来的口信，用户替猫做一次选择（v0.8+ 第二周起的"有事可做"来源）。
// 不是任务系统——没有奖励数值、没有完成度、拒绝也不惩罚。
// 两个选项都是"帮"，区别在于怎么帮：选择塑造的是这只猫是什么样的猫，不是效率高低。
//
// 时序：D1 委托上门（事实带 choices → 进当日摘要 → 用户在留言框选）
//       D2 按选择 × 性格兑现（选项影响方向，性格影响做法）。没选就按性格自己拿主意。

export interface CommissionOutcome {
  scene: string;
  coins?: number;
  affinity: number; // 与委托 NPC 的好感变化
  reason: string;
  /** 顺带影响的第三方关系 */
  side?: { catId: string; delta: number; reason: string };
}

export interface Commission {
  key: string;
  npcId: string;
  /** 口信正文（第三人称事实，叙事层会改写成日记口吻） */
  letter: string;
  choices: { value: string; label: string }[];
  /** choice → 结果；bold = 这只猫胆子大（同一选择的不同做法） */
  outcomes: Record<string, (bold: boolean) => CommissionOutcome>;
  /** 没选时按性格自行其是 */
  fallback: (bold: boolean) => CommissionOutcome;
}

export const COMMISSIONS: Commission[] = [
  {
    key: "xiaomei_headline",
    npcId: "npc-xiaomei",
    letter:
      "爆米花急匆匆跑来：明天的日报头版还空着一块。「听说灯塔坡昨晚又亮了一整夜——你帮我去问一句？问不出来我就自己编一个。」",
    choices: [
      { value: "story:go_check", label: "替她跑一趟灯塔坡" },
      { value: "story:talk_her_down", label: "劝她别写没影的事" },
    ],
    outcomes: {
      "story:go_check": (bold) => ({
        scene: bold
          ? "它天没黑就蹲到了灯塔坡下。盐汽水果然在，抱着一盏修了一半的灯出来倒水，看见它愣了愣：「跟爆米花说，是我在修灯。别写得神神鬼鬼的。」第二天日报头版：《灯塔的灯，有猫在修》"
          : "它在坡下犹豫了很久，最后只敢远远看着。灯亮着，窗后有个影子来回走动——修东西的姿势。它把看到的原样告诉了爆米花，一个字也没多说。爆米花撇撇嘴，还是照着写了",
        affinity: 8,
        reason: "跑腿跑出了头版",
        side: { catId: "npc-yantai", delta: bold ? 6 : 2, reason: "没有被写成怪谈" },
      }),
      "story:talk_her_down": () => ({
        scene:
          "它蹲在爆米花的桌角，看她把「灯塔闹鬼」的标题写了又划、划了又写，最后叹了口气改成《岛上的夜晚》，配一张糯米画的坡地速写。「没劲透了，」爆米花说，「但你说得对，盐汽水会难过的。」",
        affinity: 10,
        reason: "拦下了一条不该写的新闻",
        side: { catId: "npc-yantai", delta: 8, reason: "有猫替他挡了一下" },
      }),
    },
    fallback: (bold) => ({
      scene: bold
        ? "没等谁发话，它自己溜到了灯塔坡下张望了半天，什么也没看清，回来跟爆米花说「就是有灯」。爆米花照着写了《灯塔的灯还亮着》，反响平平"
        : "它想了一天也没想好该怎么办。第二天日报头版印着《灯塔怪谈》，它看着那行字，心里有点不是滋味",
      affinity: 2,
      reason: "总算是回了话",
    }),
  },
  {
    key: "mantou_morning",
    npcId: "npc-mantou",
    letter:
      "馒头站在门口搓爪子，声音小得快听不见：明天早市他一个人忙不过来，蒸笼又坏了一只。「要是……要是不麻烦的话。」",
    choices: [
      { value: "story:help_stall", label: "去摊子上搭把手" },
      { value: "story:fix_steamer", label: "先帮他把蒸笼修好" },
    ],
    outcomes: {
      "story:help_stall": (bold) => ({
        scene: bold
          ? "它天不亮就到了摊子上，扯着嗓子吆喝，把馒头吓了一跳。那天的鱼糕卖得比哪天都快，馒头红着脸塞给它一整包还热着的"
          : "它默默站在馒头身后递盘子、收鱼币，一上午没说几句话。收摊时馒头把最后两块鱼糕包好塞过来：「你比我会算账。」",
        coins: 12,
        affinity: 10,
        reason: "早市帮工",
      }),
      "story:fix_steamer": () => ({
        scene:
          "它拖着坏蒸笼去找盐汽水。盐汽水翻出一圈铜丝，一句话没说就修好了，只在还回去的时候补了一句：「让他别再拿这个垫门。」第二天早市，新蒸笼冒出的白汽比往常高一截",
        affinity: 8,
        reason: "把蒸笼救回来了",
        side: { catId: "npc-yantai", delta: 5, reason: "修东西的默契" },
      }),
    },
    fallback: () => ({
      scene: "它一觉睡到日上三竿。等赶到集市，馒头的摊子已经收了，剩一只歪着的蒸笼靠在墙边。它站着看了一会儿，什么也没说",
      affinity: -2,
      reason: "早市那天没露面",
    }),
  },
  {
    key: "qiuqiu_debt",
    npcId: "npc-qiuqiu",
    letter:
      "球球把账本拍在柜台上：黑豆赊的账拖了半个月了。「我抹不开脸去催，你去。」她顿了顿，「……也别太凶。」",
    choices: [
      { value: "story:press_hard", label: "板着脸把账要回来" },
      { value: "story:hear_him_out", label: "先听听黑豆怎么说" },
    ],
    outcomes: {
      "story:press_hard": () => ({
        scene:
          "它把账本摊在黑豆面前，一个字没多说。黑豆笑嘻嘻地讲了三个新买卖的点子，讲到第四个的时候自己也讲不下去了，从枕头底下摸出一小袋鱼币：「行吧行吧，做猫要讲信用。」",
        coins: 5,
        affinity: 12,
        reason: "账要回来了",
        side: { catId: "npc-heidou", delta: -5, reason: "被当面讨了债" },
      }),
      "story:hear_him_out": () => ({
        scene:
          "黑豆倒了两杯梅子水，把第八家店的计划从头讲到尾。讲完他自己沉默了一会儿：「其实前七家倒的原因我都知道。」第二天他真的去还了一半，跟球球说另一半下个月连本带利。球球哼了一声，把账本收进了抽屉",
        affinity: 8,
        reason: "把话带到了",
        side: { catId: "npc-heidou", delta: 12, reason: "有猫肯听他说完" },
      }),
    },
    fallback: (bold) => ({
      scene: bold
        ? "它自作主张跑去了黑豆家，结果被拉着听了一晚上第八家店的宏图大业，账的事一个字也没提上"
        : "它揣着账本在杂货铺门口来回走了三趟，到底没好意思开口。球球远远看见了，摆摆手让它回去",
      affinity: 1,
      reason: "这趟差事办得含糊",
    }),
  },
  {
    key: "lingdang_song",
    npcId: "npc-lingdang",
    letter:
      "铃铛难得来敲门，眼睛有点红：黄昏那场，昨天只来了一位听众，还是路过歇脚的。「我想问问……是不是我唱得不好。」",
    choices: [
      { value: "story:go_listen", label: "傍晚去坡上陪她唱完" },
      { value: "story:spread_word", label: "满岛去替她吆喝一圈" },
    ],
    outcomes: {
      "story:go_listen": () => ({
        scene:
          "整个黄昏就它一个听众。铃铛唱了七首，唱到第四首的时候声音才稳下来。散场时天已经黑透，她说：「其实一位也够了。」它没接话，只是陪她一路走回了溪流边",
        affinity: 16,
        reason: "一个人的听众席",
      }),
      "story:spread_word": (bold) => ({
        scene: bold
          ? "它挨家挨户去敲门，连松林深处的老怪都被它拽了出来。那天坡上坐了十几只猫，铃铛紧张得第一句就跑了调，唱到后来眼泪掉下来，全场没一只猫笑她"
          : "它一路请了棉花、糯米和馒头。四只猫坐在坡上，铃铛唱到一半停下来说了句「谢谢」，然后从头又唱了一遍",
        affinity: 12,
        reason: "替她攒了一场听众",
        side: { catId: "npc-mianhua", delta: 5, reason: "一起听了场黄昏的歌" },
      }),
    },
    fallback: () => ({
      scene: "那天黄昏它没去成坡上。远远听见有歌声，唱了两首就停了。它在原地站了一会儿，转身回了家",
      affinity: -1,
      reason: "错过了那场黄昏",
    }),
  },
  {
    key: "laoguai_lost",
    npcId: "npc-laoguai",
    letter:
      "老怪破天荒走出了松林，脸色很不好看：他丢了一只小木箱，里头没什么值钱东西，「就是几封信」。他说得很轻，但一直没走。",
    choices: [
      { value: "story:search_hard", label: "把岛翻个底朝天找" },
      { value: "story:ask_around", label: "挨个问问岛上的猫" },
    ],
    outcomes: {
      "story:search_hard": (bold) => ({
        scene: bold
          ? "它从废弃渔船一路找到礁石背面，天黑了还打着手电继续。木箱最后是在松林边的树洞里找到的——被松鼠拖进去当窝了。信一封没少，就是有一封被咬掉了角"
          : "它顺着老怪常走的那条小径来回走了三遍，终于在一处塌了的石堆下看见木箱的一角。抱回去的时候老怪的爪子在抖，一封一封数过去，数了两遍",
        affinity: 18,
        reason: "把那些信找回来了",
      }),
      "story:ask_around": () => ({
        scene:
          "问到第五只猫的时候，乌鸦说他前天夜里见过：一只木箱被浪冲到了礁石那边。找到时箱子进了水，信纸泡得发皱。老怪一张张摊在石头上晾，晾到太阳落山，一句话也没说。临走时他塞给它一枚旧船钉：「这是那条船上的。」",
        affinity: 15,
        reason: "顺着线索找了回来",
        side: { catId: "npc-wuya", delta: 6, reason: "夜巡的情报派上了用场" },
      }),
    },
    fallback: () => ({
      scene: "它找了半天没头绪就放弃了。第二天听说木箱是自己被浪送回岸边的。老怪没提这件事，只是从那以后见到它会点点头",
      affinity: 3,
      reason: "到底还是找回来了",
    }),
  },
  {
    key: "tudou_roof",
    npcId: "npc-tudou",
    letter:
      "土豆蹲在门口啃着爪子：糯米家的屋顶漏了，他一个人翻修得干到后半夜。「不用你出力，」他补了一句，「有个猫说话就行。」",
    choices: [
      { value: "story:work_together", label: "跟他一起上房顶" },
      { value: "story:keep_company", label: "就在底下陪他说话" },
    ],
    outcomes: {
      "story:work_together": (bold) => ({
        scene: bold
          ? "它二话不说爬了上去，结果踩碎两块瓦，被土豆一把拎住后颈拎了下来。最后分工变成它在下面递瓦、土豆在上面铺——干到月亮升起来，屋顶补得严严实实"
          : "它小心翼翼跟上去，一块瓦一块瓦地递。土豆干活不说话，但每接一块都「嗯」一声。收工时他说：「这声嗯，是谢谢。」",
        coins: 8,
        affinity: 14,
        reason: "一起补好了屋顶",
        side: { catId: "npc-nuomi", delta: 6, reason: "屋顶不漏了" },
      }),
      "story:keep_company": () => ({
        scene:
          "它就坐在梯子底下，有一句没一句地说话。土豆平时闷得像块石头，那天居然讲起了他盖的第一间屋子——盖歪了，主人是棉花，棉花住了三年都没发现。讲到这儿他自己在房顶上笑出了声",
        affinity: 12,
        reason: "陪了一整夜",
      }),
    },
    fallback: () => ({
      scene: "它没去成。第二天路过糯米家，屋顶已经补好了，土豆蹲在檐上啃爪子，看见它招了招手",
      affinity: 2,
      reason: "屋顶总算是补好了",
    }),
  },
];

export const COMMISSION_BY_KEY = new Map(COMMISSIONS.map((c) => [c.key, c]));
