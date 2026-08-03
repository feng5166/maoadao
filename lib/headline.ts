// 岛闻选稿(今日页头版与海螺明信片共用,保证"网页头条=海螺推的那一幕"):
// 分量 = 内容值 + 线索加成——挂着事件线的事优先上头版,天然带"明天有后续"。

export interface HeadlineEvent {
  catId: string;
  segment: string;
  type: string;
  outcome: string;
  data: unknown;
  targetId: string | null;
  contentValue: number;
  threadKey: string | null;
}

const THREAD_BONUS = 1.5;

function score(e: HeadlineEvent): number {
  return e.contentValue + (e.threadKey ? THREAD_BONUS : 0);
}

/** 主事件排序:分量降序、同类型去重;excludeCatId 用于把浏览者自己的猫留给"和你有关的" */
export function rankHeadlines<T extends HeadlineEvent>(mains: T[], excludeCatId?: string | null): T[] {
  return [...mains]
    .filter((e) => e.catId !== excludeCatId)
    .sort((a, b) => score(b) - score(a))
    .filter((e, i, arr) => arr.findIndex((x) => x.type === e.type) === i);
}
