// 官方 NPC 猫：解决冷启动密度问题——新猫入岛第一天就有猫可遇、有店可逛、有新闻可看
export interface NpcSeed {
  id: string;
  name: string;
  role: "function" | "story" | "social" | "background";
  boldness: number;
  sociability: number;
  diligence: number;
  personaTags: string[];
  appearance: string;
  bio: string;
}

export const NPC_CATS: NpcSeed[] = [
  { id: "npc-juzi", role: "social", name: "橘子", boldness: 75, sociability: 80, diligence: 30, personaTags: ["自来熟", "馋", "爱吹牛"], appearance: "圆滚滚的橘猫，肚子上有白毛", bio: "岛上消息最灵通的猫，什么都想掺一脚。" },
  { id: "npc-yantai", role: "story", name: "盐汽水", boldness: 40, sociability: 25, diligence: 90, personaTags: ["沉默", "手巧", "夜猫子"], appearance: "瘦高的黑猫，左耳有个缺口", bio: "灯塔管理员，修得好一切会转的东西。" },
  { id: "npc-mantou", role: "function", name: "馒头", boldness: 20, sociability: 60, diligence: 70, personaTags: ["胆小", "温柔", "会做饭"], appearance: "雪白的长毛猫，总是眯着眼", bio: "在集市摆早点摊，蒸的鱼糕全岛闻名。" },
  { id: "npc-doudou", role: "story", name: "斗斗", boldness: 95, sociability: 50, diligence: 40, personaTags: ["莽", "讲义气", "怕水却爱出海"], appearance: "虎斑猫，尾巴短了一截", bio: "自称探险家，废弃渔船是他的秘密基地。" },
  { id: "npc-xiaomei", role: "social", name: "爆米花", boldness: 55, sociability: 90, diligence: 55, personaTags: ["八卦", "热心", "嗓门大"], appearance: "三花猫，脖子上系着红铃铛", bio: "岛上小报《猫啊岛日报》的主编。" },
  { id: "npc-laoguai", role: "story", name: "老怪", boldness: 60, sociability: 10, diligence: 60, personaTags: ["古怪", "博学", "收藏癖"], appearance: "灰色缅因猫，胡子特别长", bio: "住在松林深处，据说见过岛的第一天。" },
  { id: "npc-tangyuan", role: "background", name: "汤圆", boldness: 35, sociability: 75, diligence: 20, personaTags: ["懒", "撒娇", "运气好"], appearance: "黑白奶牛猫，圆脸", bio: "从没干过活但从没饿过肚子，岛上未解之谜。" },
  { id: "npc-qiuqiu", role: "function", name: "球球", boldness: 70, sociability: 65, diligence: 80, personaTags: ["要强", "精打细算", "刀子嘴"], appearance: "橘白相间，额头有个M形花纹", bio: "杂货铺老板娘，全岛的鱼币有一半从她店里过。" },
  { id: "npc-wuya", role: "function", name: "乌鸦", boldness: 85, sociability: 35, diligence: 50, personaTags: ["独行", "身手好", "傲娇"], appearance: "纯黑猫，眼睛一金一蓝", bio: "夜里在屋顶巡逻，自封岛上治安官。" },
  { id: "npc-nuomi", role: "background", name: "糯米", boldness: 15, sociability: 55, diligence: 65, personaTags: ["害羞", "爱画画", "细心"], appearance: "浅灰色英短，圆眼睛", bio: "在溪流边写生，画里的岛比真的还好看。" },
  { id: "npc-jiangjun", role: "function", name: "将军", boldness: 65, sociability: 45, diligence: 85, personaTags: ["严肃", "守时", "热心肠"], appearance: "威风的狸花猫，走路带风", bio: "退休的船猫，现在管理码头的进出。" },
  { id: "npc-bingfen", role: "social", name: "冰粉", boldness: 50, sociability: 85, diligence: 45, personaTags: ["时髦", "爱凑热闹", "人来疯"], appearance: "银渐层，毛总是梳得一丝不苟", bio: "梦想在岛上开一家全岛最气派的咖啡馆。" },
  { id: "npc-tudou", role: "function", name: "土豆", boldness: 45, sociability: 40, diligence: 95, personaTags: ["老实", "力气大", "闷声干活"], appearance: "棕色土猫，爪子特别大", bio: "岛上一半的房子都是他帮忙搭的。" },
  { id: "npc-lingdang", role: "background", name: "铃铛", boldness: 30, sociability: 70, diligence: 35, personaTags: ["爱唱歌", "多愁善感", "浪漫"], appearance: "奶白色布偶猫，蓝眼睛", bio: "每天黄昏在灯塔坡唱歌，听众时多时少。" },
  { id: "npc-heidou", role: "social", name: "黑豆", boldness: 80, sociability: 60, diligence: 25, personaTags: ["赌性坚强", "乐观", "口才好"], appearance: "黑色短毛猫，右前爪是白色", bio: "开过七家店倒闭了七家，正在筹备第八家。" },
  { id: "npc-mianhua", role: "social", name: "棉花", boldness: 25, sociability: 95, diligence: 50, personaTags: ["治愈", "好脾气", "记性差"], appearance: "蓬松的白色长毛猫，像一朵云", bio: "谁心情不好都会去找棉花聊聊，虽然她转头就忘。" },
  // 岛主（doc/00 §八功能型"岛长"的落位，2026-08-02）：入岛登记的主持者——码头的进出归将军，岛民的名字归岛主
  { id: "npc-maoadao", role: "function", name: "猫阿道", boldness: 40, sociability: 55, diligence: 60, personaTags: ["慢性子", "记性极好", "落笔认真"], appearance: "上了年纪的黄白田园猫，背有点驼，耳朵边的毛发白", bio: "猫啊岛的岛主。有猫说岛是照他的名字起的，也有猫说是他随了岛——他从不解释。岛民册是他一笔一笔记的，谁哪天登的岛，他都记得。" },
];
