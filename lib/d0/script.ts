// D0 剧本配置(doc2.0/14 v3 冻结 + doc2.0/15 秒级分镜表+§七 处置四表)。
// 文案全部走这里,不散进组件——上线前整体过 04 语言防火墙(负面词典扫描)。
// 结构对应五幕状态机:ENTER→ARRIVAL→ISLAND_ALIVE→QIZAI_LIFE→EMPTY_HOME→IDEA_RESONANCE→D1_GATE。
// 红线(doc2.0/14 §五):永不宣布/无步骤条/七仔不看镜头/S6 轻触无奖励/禁 emoji/老用户不重放。

export type D0Act = "ENTER" | "ARRIVAL" | "ISLAND_ALIVE" | "QIZAI_LIFE" | "EMPTY_HOME" | "IDEA_RESONANCE" | "D1_GATE";

export interface D0Screen {
  id: string;
  act: D0Act;
  /** public/d0 下的静帧;无 = 排版屏(S0 船票 / S9 理念) */
  img?: string;
  /** 呼吸循环(静图秒开,就绪后无感替换——doc2.0/15 §五 降级梯) */
  video?: string;
  /** 场景合成屏(S1):public/scenes 底图 + 脚印前景层 */
  scene?: string;
  /** 旁白行(逐行浮现,.fx-rise 系;现在时,只说看得见的) */
  lines?: string[];
  /** 主按钮文字;无 = 整屏点按推进 */
  button?: string;
  /** 「听海」层(默认关):环境声文件名(public/sounds/D0),loop 由文件性质定 */
  ambient?: string;
  /** 进屏一次性音效(听海开启时) */
  cue?: string;
  /** 进屏埋点 */
  enterEvent?: string;
}

/** 心流版本:以后 D0 再调整改这里,分析不必再靠提交时间切数据 */
export const FLOW_VERSION = "d0_v3"; // v3:S8 三行换轨/S10 进院子(14 v3 冻结,2026-08-09 翻转)

/** S6 轻触(D0 唯一交互)的配置:不点则 8s 后浮现下一步点按区(可被略过,不强制) */
export const TOUCH = {
  button: "蹲下来看看",
  timeoutMs: 8000,
  cue: "mm.mp3", // 极轻一声「呣」(synthCatSound,无人声红线)
} as const;

export const D0_SCREENS: D0Screen[] = [
  {
    id: "S0",
    act: "ENTER",
    // 船票已经躺在纸面上——没有"获得",没有领取动作(2026-08-05 评审细化)
    lines: ["你的船到了。"],
    button: "登岛",
    cue: "ticket.mp3",
    enterEvent: "d0_enter",
  },
  {
    id: "S1",
    act: "ARRIVAL",
    scene: "/scenes/dock-dusk.jpg",
    lines: ["风是咸的。", "远处有猫叫，但看不见猫。", "沙地上有一串脚印，往岛里去。"],
    button: "跟上去",
    ambient: "sea-gulls.mp3",
    enterEvent: "d0_act_1",
  },
  {
    id: "S2",
    act: "ISLAND_ALIVE",
    img: "/d0/s2.jpg",
    video: "/d0/s2-loop.mp4",
    lines: ["公告栏贴着今天的岛闻。", "新一期《猫啊岛日报》刚被压上摊位。"],
    ambient: "wind-paper.mp3",
    enterEvent: "d0_act_2",
  },
  {
    id: "S3",
    act: "ISLAND_ALIVE",
    img: "/d0/s3.jpg",
    video: "/d0/s3-loop.mp4",
    lines: ["有的猫在晒太阳，有的往渔港去。", "坡上有间小屋，灯已经亮了。"],
    ambient: "vista.mp3",
  },
  {
    id: "S4",
    act: "QIZAI_LIFE",
    img: "/d0/s4.jpg",
    video: "/d0/s4-loop.mp4",
    lines: ["脚印的尽头是它。", "它对一枚瓶盖拍了两下——先拍两下，是它的规矩。"],
    ambient: "sea.mp3",
    cue: "cap-taps.mp3",
    enterEvent: "d0_act_3",
  },
  {
    id: "S5",
    act: "QIZAI_LIFE",
    img: "/d0/s5.jpg",
    video: "/d0/s5-loop.mp4",
    lines: ["木箱边排着它的收藏。", "它把其中一件，挪了个位置。"],
    ambient: "sea.mp3",
  },
  {
    id: "S6a",
    act: "QIZAI_LIFE",
    img: "/d0/s6a.jpg",
    video: "/d0/s6a-loop.mp4",
    // 轻触后的旁白(回应,不服务);未轻触直接略过此屏文案,进 S6b
    lines: ["它抬眼看了你一下。", "然后继续手上的事。"],
    ambient: "sea.mp3",
  },
  {
    id: "S6b",
    act: "QIZAI_LIFE",
    img: "/d0/s6b.jpg",
    video: "/d0/s6b-loop.mp4",
    lines: ["片刻后，它从你脚边走过去了。"],
    ambient: "sea.mp3",
  },
  {
    id: "S8",
    act: "EMPTY_HOME",
    img: "/d0/s8.jpg",
    video: "/d0/s8-loop.mp4",
    // 体验承诺三行(现在时;结构 aha 锚)
    // 体验承诺三行(14 v3 终审冻结版:位置/条件权/不由你决定)
    lines: ["这个院子，以后就是你的。", "摆下点什么，偶尔会有猫按自己的性子来看看。", "你不在的时候，这里也会发生一点事。"],
    ambient: "wind.mp3",
    enterEvent: "d0_act_4",
  },
  {
    id: "S9",
    act: "IDEA_RESONANCE",
    // 独屏一句(语言 aha 锚);「静」是设计(沉默声部)——无 ambient
    lines: ["当现实世界太忙，总有一座岛上的猫替你慢慢生活。"],
    enterEvent: "d0_aha_dwell",
  },
  {
    id: "S10",
    act: "D1_GATE",
    img: "/d0/s10.jpg",
    video: "/d0/s10-loop.mp4",
    lines: ["它往回走，经过小屋时停了一下，朝门口那枚瓶盖看了一眼。", "然后回头看了看你，往码头去了。", "它回码头去了。院门虚掩着——这里，以后就是你的地方。"],
    button: "进院子",
    ambient: "sea-gulls.mp3",
    // 到达闸门 ≠ 完成:d0_complete 归「去见它」那一下(D0Player.finish),
    // 这里只记"走到了最后一屏"——两者之差就是站在门口没进去的人
    enterEvent: "d0_gate_view",
  },
];

/** S1 右下唯一跳过口(跳过的只是电影,不是身份建立——skip 同走 claimYard,14 §九②) */
export const SKIP_LABEL = "直接去院子";

/** 心流用图统一出口:开了国内 CDN 取 OSS 上的 WebP,否则走 Next 图片优化器
 *  (2026-08-05 起原图不再直出;2026-08-06 起优先国内直连,见 lib/assets.ts)。
 *  预取与渲染必须共用这一个函数,URL 不一致就命不中缓存。 */
export { img as optimizedImg } from "@/lib/assets";
