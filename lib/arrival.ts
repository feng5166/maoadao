import { prisma } from "./db";

// 入岛三件事：一次性的到岸便条，不是每日任务。
// 世界观口径——这是码头塞给新岛民的一张纸，做完三件就收进生活册，永不再现。
// 刻意不给奖励、不计分、不催促：驱动力是"把这只猫安顿好"，不是完成度。

export const MEET_TARGET = 2; // 认识几只邻居算数

export interface ArrivalTask {
  key: "message" | "meet" | "promise";
  label: string;
  hint: string;
  done: boolean;
  /** 这次来才发现办妥的：本次渲染要庆祝一下（之后归于平静的划掉态） */
  justDone: boolean;
  /** 刚办妥时的那句话：肯定这件事 + 交代它带来了什么 */
  cheer: string;
}

export interface ArrivalChecklist {
  tasks: ArrivalTask[];
  allDone: boolean;
  /** 三件事刚做完、这次渲染后就收册（用于显示告别文案） */
  justFinished: boolean;
  metCount: number;
}

/** 读取三件事状态；已收册返回 null（页面不再显示） */
export async function getArrivalChecklist(catId: string, catName: string): Promise<ArrivalChecklist | null> {
  const note = await prisma.arrivalNote.findUnique({ where: { catId } });
  if (note?.archivedAt) return null;

  const nudgeCount = await prisma.ownerNudge.count({ where: { catId } });
  const metCount = note?.metNpcIds.length ?? 0;
  const celebrated = note?.celebratedKeys ?? [];
  const tasks: ArrivalTask[] = [
    {
      key: "message",
      label: `给${catName}留下第一句话`,
      hint: "它不一定照做，但会记住",
      done: nudgeCount > 0,
      justDone: false,
      cheer: "办妥了——它把这句话收好了，明早八点看它怎么回应。",
    },
    {
      key: "meet",
      label: `带它认识 ${MEET_TARGET} 位邻居`,
      hint: metCount > 0 ? `已经认识了 ${metCount} 位` : "去公告栏点开一只猫看看",
      done: metCount >= MEET_TARGET,
      justDone: false,
      cheer: "办妥了——岛上开始有猫认得它了。",
    },
    {
      key: "promise",
      label: "和它约好明早八点",
      hint: "它的第一篇日记那时候写好",
      done: Boolean(note?.promisedAt),
      justDone: false,
      cheer: "约好了——明早八点，它的第一篇日记准时送到。",
    },
  ];
  for (const t of tasks) t.justDone = t.done && !celebrated.includes(t.key);
  const allDone = tasks.every((t) => t.done);
  return { tasks, allDone, justFinished: allDone, metCount };
}

/** 刚办妥的庆祝展示过一次后记下来，下次回归安静的划掉态 */
export async function markArrivalCelebrated(catId: string, keys: string[]): Promise<void> {
  if (keys.length === 0) return;
  const note = await prisma.arrivalNote.findUnique({ where: { catId } });
  const merged = [...new Set([...(note?.celebratedKeys ?? []), ...keys])];
  await prisma.arrivalNote
    .upsert({
      where: { catId },
      update: { celebratedKeys: merged },
      create: { catId, metNpcIds: [], celebratedKeys: merged },
    })
    .catch(() => {});
}

/** 逛到某只岛民的主页 = 认识了它（幂等，去重） */
export async function recordMetNpc(catId: string, npcId: string): Promise<void> {
  const note = await prisma.arrivalNote.findUnique({ where: { catId } });
  if (note?.archivedAt) return;
  if (note?.metNpcIds.includes(npcId)) return;
  await prisma.arrivalNote.upsert({
    where: { catId },
    update: { metNpcIds: { push: npcId } },
    create: { catId, metNpcIds: [npcId] },
  });
}

/** 三件事做完并展示过告别文案后收册 */
export async function archiveArrivalNote(catId: string): Promise<void> {
  await prisma.arrivalNote
    .upsert({
      where: { catId },
      update: { archivedAt: new Date() },
      create: { catId, metNpcIds: [], archivedAt: new Date() },
    })
    .catch(() => {});
}
