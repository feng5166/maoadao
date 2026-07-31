import type { EventTemplate, TemplateCtx } from "./templates";
import type { SimThread } from "./types";
import { pick } from "./rng";

// 事件线系统：多步剧情跨天推进，每天最多前进一步（追更感的来源）。
// 每条线：可选的每日自动事实（autoDaily，如店铺营业）+ 主角的推进意图（intentFor）。

export const THREAD_LABELS: Record<string, string> = {
  shop: "经营小店",
  debt: "欠着债",
  lighthouse: "灯塔之谜",
  arrival_key: "旧钥匙的来历",
};

interface ThreadSystem {
  /** 不需要意图、每天自动发生的事实（如店铺营业） */
  autoDaily?: (ctx: TemplateCtx, thread: SimThread) => ReturnType<EventTemplate["resolve"]> | null;
  /** 主角当天可选的推进意图（导演会给推进加权） */
  intentFor?: (ctx: TemplateCtx, thread: SimThread) => EventTemplate | null;
}

function stepTemplate(
  key: string,
  label: string,
  partial: Partial<EventTemplate> & Pick<EventTemplate, "resolve">,
): EventTemplate {
  return {
    key,
    label,
    category: "thread",
    segments: partial.segments ?? ["morning", "afternoon", "evening"],
    cooldownDays: 1, // 事件线每天最多推进一步
    baseWeight: partial.baseWeight ?? 20,
    contentValue: partial.contentValue ?? 6,
    minEnergy: partial.minEnergy ?? 15,
    condition: partial.condition,
    personalityFit: partial.personalityFit ?? (() => 1),
    propose: partial.propose,
    resolve: partial.resolve,
  };
}

export const THREAD_SYSTEMS: Record<string, ThreadSystem> = {
  // ============ 店铺线：开店后每天自动营业，连亏关店，赚了有里程碑 ============
  shop: {
    autoDaily: (ctx, thread) => {
      const daysOpen = ctx.world.day - thread.startDay;
      const stability = Math.min(0.55, 0.18 + daysOpen * 0.05);
      const revenue = Math.round((ctx.rng() - (0.58 - stability * 0.4)) * 55);
      const totalProfit = Number(thread.data.totalProfit ?? 0) + revenue;
      const name = String(thread.data.name);

      // 连亏太多 → 关店（事件线落幕，本身就是大事件）
      if (daysOpen >= 3 && totalProfit < -45) {
        return {
          outcome: "fail",
          data: { shopName: name, revenue, totalProfit, closed: true },
          deltas: { coins: revenue, energy: -20 },
          threadUpdates: [{ threadId: thread.id, status: "failed", data: { ...thread.data, totalProfit } }],
          cvBonus: 5,
        };
      }
      // 盈利里程碑（只报一次）
      if (totalProfit > 100 && !thread.data.milestone) {
        return {
          outcome: "success",
          data: { shopName: name, revenue, totalProfit, milestone: "累计盈利破百" },
          deltas: { coins: revenue, energy: -20 },
          threadUpdates: [{ threadId: thread.id, data: { ...thread.data, totalProfit, milestone: true }, lastAdvanceDay: ctx.world.day }],
          cvBonus: 4,
        };
      }
      return {
        outcome: revenue >= 0 ? "success" : "partial",
        data: { shopName: name, revenue, totalProfit, daysOpen },
        deltas: { coins: revenue, energy: -20 },
        threadUpdates: [{ threadId: thread.id, data: { ...thread.data, totalProfit }, lastAdvanceDay: ctx.world.day }],
        cvBonus: revenue < -15 ? 2 : 0,
      };
    },
  },

  // ============ 债务线：有钱就想还，拖太久债主上门 ============
  debt: {
    autoDaily: (ctx, thread) => {
      const overdue = ctx.world.day - thread.startDay;
      // 拖过 6 天：债主上门（每 3 天一次）
      if (overdue > 6 && (ctx.world.day - thread.lastAdvanceDay) >= 3) {
        return {
          outcome: "complication",
          data: { creditorName: thread.data.creditorName, amount: thread.data.amount, scene: "债主堵在家门口" },
          deltas: { energy: -10 },
          affinityChanges: [{ catAId: thread.catId, catBId: String(thread.data.creditorId), delta: -5, reason: "催债" }],
          threadUpdates: [{ threadId: thread.id, lastAdvanceDay: ctx.world.day }],
          cvBonus: 4,
        };
      }
      return null;
    },
    intentFor: (ctx, thread) => {
      const amount = Number(thread.data.amount);
      if (ctx.state.coins < amount + 10) return null;
      return stepTemplate("debt_repay", "还钱", {
        contentValue: 4,
        resolve: () => ({
          outcome: "success",
          data: { creditorId: thread.data.creditorId, creditorName: thread.data.creditorName, amount },
          deltas: { coins: -amount, energy: -5 },
          affinityChanges: [{ catAId: thread.catId, catBId: String(thread.data.creditorId), delta: 8, reason: "有借有还" }],
          threadUpdates: [{ threadId: thread.id, status: "resolved" }],
          cvBonus: 2,
        }),
      });
    },
  },

  // ============ 旧钥匙线：新猫首日拿到的钥匙（三步短线，与老船长传说呼应） ============
  arrival_key: {
    intentFor: (ctx, thread) => {
      switch (thread.step) {
        case 1:
          return stepTemplate("arrival_key_ask", "打听旧钥匙的来历", {
            segments: ["morning", "afternoon"],
            contentValue: 5,
            resolve: (ctx2) => ({
              outcome: "success" as const,
              data: {
                targetId: "npc-jiangjun",
                targetName: "将军",
                clue: "将军接过钥匙眯眼看了半天：「这是三十年前老船长小屋的备用钥匙。你住的那间屋子……以前是他的。」",
              },
              deltas: { energy: -10 },
              affinityChanges: [{ catAId: thread.catId, catBId: "npc-jiangjun", delta: 5, reason: "听了段老故事" }],
              threadUpdates: [{ threadId: thread.id, step: 2, lastAdvanceDay: ctx2.world.day }],
              cvBonus: 3,
            }),
          });
        case 2:
          return stepTemplate("arrival_key_open", "试试钥匙能开什么", {
            segments: ["evening"],
            contentValue: 6,
            resolve: () => ({
              outcome: "success",
              data: {
                location: "自家小屋",
                discovery:
                  "钥匙打开了床板下的一个小隔层：一页泛黄的航海笔记，和一小袋还香着的鱼干——老船长留给后来住客的见面礼",
              },
              deltas: { energy: -10, coins: 5 },
              threadUpdates: [{ threadId: thread.id, status: "resolved", data: { ...thread.data, opened: true } }],
              cvBonus: 5,
            }),
          });
        default:
          return null;
      }
    },
  },

  // ============ 灯塔之谜：七步线（step 1 由八卦模板触发创建） ============
  lighthouse: {
    intentFor: (ctx, thread) => {
      const step = thread.step;
      switch (step) {
        case 1:
          // 第二步：设法弄到旧铜铃（传闻里灯塔的钥匙信物）
          return stepTemplate("lighthouse_seek_bell", "翻找旧铜铃", {
            segments: ["morning", "afternoon"],
            resolve: (c) => {
              if (c.rng() < 0.55) {
                return {
                  outcome: "success",
                  data: { location: "废弃渔船", found: "旧铜铃", note: "船舱夹层里居然真的有一只锈迹斑斑的铜铃" },
                  deltas: { energy: -25 },
                  threadUpdates: [{ threadId: thread.id, step: 2, data: { ...thread.data, hasBell: true }, lastAdvanceDay: c.world.day }],
                  cvBonus: 4,
                };
              }
              return {
                outcome: "fail",
                data: { location: "废弃渔船", found: null, note: "翻遍了船舱一无所获，倒是惊起一窝海鸟" },
                deltas: { energy: -25 },
                cvBonus: 1,
              };
            },
          });
        case 2:
          // 第三步：拿着铜铃去问灯塔管理员盐汽水 → 被搪塞
          return stepTemplate("lighthouse_ask_keeper", "追问盐汽水", {
            resolve: (c) => ({
              outcome: "complication",
              data: {
                targetId: "npc-yantai",
                targetName: "盐汽水",
                scene: "盐汽水看到铜铃的瞬间僵住了，随即把门关上，只说了一句「别管这件事」",
              },
              deltas: { energy: -10 },
              affinityChanges: [{ catAId: thread.catId, catBId: "npc-yantai", delta: -3, reason: "被吃了闭门羹" }],
              threadUpdates: [{ threadId: thread.id, step: 3, lastAdvanceDay: c.world.day }],
              cvBonus: 5,
            }),
          });
        case 3:
          // 第四步：夜探灯塔 → 遇阻
          return stepTemplate("lighthouse_night_visit", "夜探灯塔", {
            segments: ["evening"],
            resolve: (c) => ({
              outcome: "fail",
              data: {
                location: "灯塔坡",
                scene: pick(c.rng, [
                  "刚到坡下就被巡夜的乌鸦拦住，只好装作看星星",
                  "灯塔的门锁得死死的，窗户里却分明有光在晃",
                ]),
              },
              deltas: { energy: -20 },
              threadUpdates: [{ threadId: thread.id, step: 4, lastAdvanceDay: c.world.day }],
              cvBonus: 4,
            }),
          });
        case 4:
          // 第五步：去松林找老怪问线索
          return stepTemplate("lighthouse_ask_elder", "请教老怪", {
            segments: ["morning", "afternoon"],
            resolve: (c) => ({
              outcome: "success",
              data: {
                targetId: "npc-laoguai",
                targetName: "老怪",
                clue: "老怪盯着铜铃看了很久：「三十年前的老船长出海没回来。灯塔背面的木板后头，有一间没人知道的屋子。」",
              },
              deltas: { energy: -15 },
              affinityChanges: [{ catAId: thread.catId, catBId: "npc-laoguai", delta: 6, reason: "被托付了旧事" }],
              threadUpdates: [{ threadId: thread.id, step: 5, lastAdvanceDay: c.world.day }],
              cvBonus: 5,
            }),
          });
        case 5:
          // 第六步：找到隐藏房间，真相揭晓
          return stepTemplate("lighthouse_hidden_room", "寻找隐藏房间", {
            segments: ["evening"],
            resolve: (c) => ({
              outcome: "success",
              data: {
                location: "灯塔坡",
                discovery:
                  "木板后真的有间小屋：满墙的航海图，一盏每夜亮起的旧灯，和一本写了三十年的日志——盐汽水一直在为没回来的老船长留灯",
              },
              deltas: { energy: -25 },
              threadUpdates: [{ threadId: thread.id, step: 6, lastAdvanceDay: c.world.day }],
              cvBonus: 7,
            }),
          });
        case 6: {
          // 第七步：选择公开还是保守秘密（性格决定）
          const willPublish = ctx.cat.boldness > 70;
          return stepTemplate("lighthouse_choice", willPublish ? "公开灯塔的秘密" : "守住灯塔的秘密", {
            resolve: () => {
              if (willPublish) {
                return {
                  outcome: "success",
                  data: {
                    choice: "publish",
                    scene: "把灯塔的故事讲给了小梅，《猫啊岛日报》头版：《灯塔三十年，一盏为归途留的灯》。盐汽水气了一天，晚上却默默在门口放了条烤鱼",
                  },
                  deltas: { energy: -10 },
                  affinityChanges: [
                    { catAId: thread.catId, catBId: "npc-yantai", delta: 10, reason: "秘密被善意讲述" },
                    { catAId: thread.catId, catBId: "npc-xiaomei", delta: 8, reason: "独家大新闻" },
                  ],
                  threadUpdates: [{ threadId: thread.id, status: "resolved", data: { ...thread.data, choice: "publish" } }],
                  cvBonus: 8,
                };
              }
              return {
                outcome: "success",
                data: {
                  choice: "keep",
                  scene: "把铜铃还给了盐汽水，什么也没说。从那以后，每晚灯塔亮灯的时候，两只猫会一起在坡上坐一会儿",
                },
                deltas: { energy: -10 },
                affinityChanges: [{ catAId: thread.catId, catBId: "npc-yantai", delta: 20, reason: "守住了秘密" }],
                threadUpdates: [{ threadId: thread.id, status: "resolved", data: { ...thread.data, choice: "keep" } }],
                cvBonus: 8,
              };
            },
          });
        }
        default:
          return null;
      }
    },
  },
};
