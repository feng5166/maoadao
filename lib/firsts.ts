// 它记得的第一次（doc/09 §6 数字生命层）：全部从 events 回放派生，零新状态。
// 第一次不是数据统计，是纪念——猫啊岛最大的资产不是事件，是记忆。

import { prisma } from "./db";

export interface FirstMoment {
  catDay: number; // 来岛第几天
  text: string;
}

const SEG_ORDER: Record<string, number> = { morning: 0, afternoon: 1, evening: 2 };

export async function firstsFor(catId: string): Promise<FirstMoment[]> {
  const events = await prisma.event.findMany({
    where: { catId },
    orderBy: { day: "asc" },
    select: { day: true, segment: true, type: true, data: true, targetId: true },
  });
  if (events.length === 0) return [];
  events.sort((a, b) => a.day - b.day || (SEG_ORDER[a.segment] ?? 0) - (SEG_ORDER[b.segment] ?? 0));
  const firstDay = events[0].day;

  const targetIds = [...new Set(events.map((e) => e.targetId).filter((x): x is string => !!x))];
  const targets = targetIds.length
    ? await prisma.cat.findMany({ where: { id: { in: targetIds } }, select: { id: true, name: true } })
    : [];
  const nameOf = new Map(targets.map((c) => [c.id, c.name]));

  const firsts: FirstMoment[] = [];
  const seen = new Set<string>();
  const add = (key: string, day: number, text: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    firsts.push({ catDay: day - firstDay + 1, text });
  };

  for (const e of events) {
    const d = e.data as Record<string, unknown>;
    const t = e.targetId ? nameOf.get(e.targetId) : null;
    switch (e.type) {
      case "visit":
        if (t && d.wentWell) add("visit", e.day, `第一次串门，去的是${t}家`);
        break;
      case "explore":
        if (d.found) add("found", e.day, `第一次捡到宝贝——${String(d.found)}，在${String(d.location)}`);
        break;
      case "fish":
        if (Number(d.catchCount) > 0) add("fish", e.day, `第一次钓到鱼，一口气钓了 ${Number(d.catchCount)} 条`);
        else if (d.strangeItem) add("strange", e.day, `第一次从海里钓上来怪东西：${String(d.strangeItem)}`);
        break;
      case "odd_job":
        add("job", e.day, `第一次打零工，给${String(d.boss)}${String(d.what)}`);
        break;
      case "quarrel":
        if (t) add("quarrel", e.day, `第一次吵架，和${t}，为了${String(d.cause)}`);
        break;
      case "shop_open":
        add("shop", e.day, `第一次开自己的店——「${String(d.shopName)}」`);
        break;
      case "stargaze":
        add("stargaze", e.day, `第一次自己去看星星，那晚${String(d.sky)}`);
        break;
    }
  }
  firsts.sort((a, b) => a.catDay - b.catDay);
  return firsts.slice(0, 6);
}
