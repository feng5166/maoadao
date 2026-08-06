"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { track } from "@vercel/analytics/server";
import { prisma } from "./db";
import { moderateTexts } from "./moderation";
import { AdoptError, adoptCat } from "./adoption";
import { generateArrivalPhoto, generatePortrait } from "./portrait";
import { generateCatPoses } from "./visual/poses";
import { generateArrivalDay } from "./firstday";
import { ensureViewerId, getViewerId } from "./identity";
import { catDayOf } from "./sim/lifecycle";
import { cookies } from "next/headers";
import { SITE_URL } from "./site";
import soundCatalog from "./voice/sound-catalog.json";

const GOALS = new Set(["earn", "friends", "explore", "chill"]);

// D1 剧本流(doc/21):相遇地点 → 相遇照片场景 + 第一件礼物(keepsake)。
// 记忆文风与 firstday 一致:对猫第二人称;"它本来想留给自己"是礼物的分量所在。
const MEET_ROUTES: Record<string, { scene: string; keepsake: (nick: string) => string }> = {
  reef: { scene: "reef", keepsake: (nick) => `相遇那天，你把那枚本来要拖进岩缝里藏起来的贝壳，推到了${nick}脚边。` },
  pines: { scene: "pines", keepsake: (nick) => `相遇那天，你把那片按了很久、不让风吹走的羽毛，放到了${nick}脚边。` },
  lighthouse: { scene: "lighthouse", keepsake: (nick) => `相遇那天，你把石头缝里那截每天都要扒拉两下的旧绳结，放到了${nick}脚边。` },
};

/** 第一声猫语存进海螺留声位(doc/21 拍4:唯一能被听见的 D1 资产,相遇档案可回放)。
 *  素材是静态 mp3,一律走自家 CDN 取——**不要用 fs 读**:动态路径的 readFile 会让
 *  Next 追踪器把整个项目打进函数包(2026-08-05 事故,详见 lib/portrait.ts 注)。 */
async function saveFirstMeow(catId: string, assetId: string, text: string): Promise<void> {
  const entry = (soundCatalog as { assetId: string; file: string; durationMs: number }[]).find((e) => e.assetId === assetId);
  if (!entry) return;
  const base = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : SITE_URL;
  const res = await fetch(`${base}${entry.file}`);
  if (!res.ok) return;
  const mp3 = Buffer.from(await res.arrayBuffer());
  await prisma.catVoiceNote.upsert({
    where: { catId },
    update: {}, // 已有留声不覆盖——第一声只有一次
    create: { catId, data: new Uint8Array(mp3), mime: "audio/mpeg", text: text || "喵", durationMs: entry.durationMs, createdAt: new Date() },
  });
}

// 岛民登记册的心理选择题 → 三轴映射（doc/10 §2：性格参数彻底隐身）。
// 三档粗粒度对模拟器足够（行为判定都是 >60/>70 的阈值），细粒度交给 tags 与叙事层。
const IMPRESSION_AXES: Record<string, Record<string, number>> = {
  impBold: { dash: 82, watch: 25, slow: 52 },
  impSocial: { greet: 82, wait: 50, alone: 22 },
  impDiligent: { busy: 82, nap: 25, mood: 52 },
};

function axisOf(formData: FormData, field: keyof typeof IMPRESSION_AXES): number {
  return IMPRESSION_AXES[field][String(formData.get(field) ?? "")] ?? 50;
}

// 外貌四选一 → 立绘描述词(doc/12 §三.7):选择保证有画面,自由补充保留个性
const FIRST_SIGHT: Record<string, string> = {
  tail: "一条毛茸茸的大尾巴",
  eyes: "圆圆的大眼睛",
  ears: "一对小小的耳朵",
  messy: "总是乱糟糟的毛",
};

// 登记册回显字段：出错时把用户填的原样带回去，登记册不清空（谁也不想重填一遍）
const REGISTER_FIELDS = [
  "ticket", "name", "firstSight", "appearance", "bio", "tags",
  "impBold", "impSocial", "impDiligent", "goal", "ownerNick", "firstWords",
] as const;

export type CreateCatState = {
  err: string;
  n: number; // 第几次失败：客户端用作 key，强制表单以回填值重挂
  v: Record<string, string>;
} | null;

export async function createCat(prevState: CreateCatState, formData: FormData): Promise<CreateCatState> {
  const fail = (err: string): CreateCatState => ({
    err,
    n: (prevState?.n ?? 0) + 1,
    v: Object.fromEntries(REGISTER_FIELDS.map((k) => [k, String(formData.get(k) ?? "")])),
  });

  const sight = FIRST_SIGHT[String(formData.get("firstSight") ?? "")] ?? "";
  const extra = String(formData.get("appearance") ?? "").trim().slice(0, 60);
  const input = {
    name: String(formData.get("name") ?? "").trim().slice(0, 12),
    appearance: [sight, extra].filter(Boolean).join("，").slice(0, 80) || extra,
    bio: String(formData.get("bio") ?? "").trim().slice(0, 120),
    tagsRaw: String(formData.get("tags") ?? "").trim().slice(0, 60),
    ownerNick: String(formData.get("ownerNick") ?? "").trim().slice(0, 8),
    goal: GOALS.has(String(formData.get("goal") ?? "")) ? String(formData.get("goal")) : "chill",
    boldness: axisOf(formData, "impBold"),
    sociability: axisOf(formData, "impSocial"),
    diligence: axisOf(formData, "impDiligent"),
    ticket: String(formData.get("ticket") ?? "").trim().toUpperCase(),
    firstWords: String(formData.get("firstWords") ?? "").trim().slice(0, 60),
  };
  if (!input.name) return fail("猫得有个名字");
  if (!input.ticket) return fail("需要一张船票（邀请码）才能上岛");

  // D1 剧本流补充位(doc/21,可缺省——缺省即旧表单语义:码头场景、无礼物、无第一声)
  const route = MEET_ROUTES[String(formData.get("route") ?? "")] ? String(formData.get("route")) : null;
  const meowId = /^MEOW_[A-Z_]+_(young|normal|deep)_[12]$/.test(String(formData.get("meow") ?? "")) ? String(formData.get("meow")) : null;
  const meowText = String(formData.get("meowText") ?? "").trim().slice(0, 8);

  const uid = await ensureViewerId();
  // 预期错误（无效船票/审核不通过）不再裸抛：返回错误状态就地显示，
  // 页面不刷新、登记册不清空（useActionState）
  const t0 = Date.now();
  let result: Awaited<ReturnType<typeof adoptCat>>;
  try {
    result = await adoptCat(uid, input);
  } catch (err) {
    const msg = err instanceof AdoptError ? err.message : "码头这会儿有点忙，稍等片刻再试一次";
    if (!(err instanceof AdoptError)) console.error("[adopt] 未预期错误:", err);
    return fail(msg);
  }
  console.log(`[adopt] adoptCat 耗时 ${Date.now() - t0}ms`);
  if (!result.ok) redirect(`/my-cat`);

  // 异步生成，不阻塞领养流程。时序有讲究（doc/10 修订 1）：
  // 首日内容 → 立绘定稿 → 相遇照片（照片由立绘合成，必须在定稿之后）。
  // 每段计时打日志：万一 after 抢跑阻塞响应，日志时间线能立刻暴露
  after(async () => {
    const g0 = Date.now();
    await generateArrivalDay(result.catId).catch((e) => console.error("[firstday]", e));
    // 剧本流的两件私人资产(doc/21 §七):它给的礼物(keepsake)+ 可回放的第一声。
    // 都不致命——失败只损一件资产,不拦领养
    if (route) {
      const catRow = await prisma.cat.findUnique({ where: { id: result.catId }, select: { arrivalWorldDay: true } });
      await prisma.memoryEntry
        .create({
          data: {
            id: randomUUID(),
            catId: result.catId,
            day: catRow?.arrivalWorldDay ?? 0,
            kind: "keepsake",
            content: MEET_ROUTES[route].keepsake(input.ownerNick || "主人"),
            importance: 5,
            visibility: "public",
          },
        })
        .catch((e) => console.error("[keepsake]", e));
    }
    if (meowId) await saveFirstMeow(result.catId, meowId, meowText).catch((e) => console.error("[first-meow]", e));
    const g1 = Date.now();
    await generatePortrait(result.catId).catch((e) => console.error("[portrait]", e));
    const g2 = Date.now();
    await generateArrivalPhoto(result.catId, { scene: route ? MEET_ROUTES[route].scene : undefined }).catch((e) => console.error("[arrival-photo]", e));
    const g3 = Date.now();
    // 姿势集(doc/15 L1):立绘定稿后接着生成,手账页此后走导演系统拼贴。
    // 失败/超时不致命——页面会回落旧渲染,tick 每日安全网负责补齐
    await generateCatPoses(result.catId).catch((e) => console.error("[poses]", e));
    console.log(`[adopt-after] 首日 ${g1 - g0}ms 立绘 ${g2 - g1}ms 相遇照 ${g3 - g2}ms 姿势 ${Date.now() - g3}ms`);
  });

  // 埋点全部挪出关键路径：每个 track 都是一次出网往返，不该让用户等
  const ref = (await cookies()).get("maoadao_ref")?.value ?? null;
  after(async () => {
    const user = await prisma.user.findUnique({ where: { id: uid }, select: { inviteBatch: true } });
    await track("adopt_complete", { goal: input.goal, referred: ref === "share_card", batch: user?.inviteBatch ?? "unknown" });
    // D1 北极星：领养 ≠ 建立关系，第一句话才是关系开始（doc/10 §10）
    if (input.firstWords) await track("first_words_submit", {});
    if (ref === "share_card") await track("referred_adopt_complete", {});
  });
  revalidatePath("/");
  console.log(`[adopt] 动作总耗时 ${Date.now() - t0}ms`);
  redirect(`/my-cat`);
}

const SUGGESTIONS = new Set(["earn", "explore", "social", "rest"]);

/** 所有权守卫：非 NPC、有主、且当前访客就是主人 */
export async function assertOwnerCheck(
  cat: { isNpc: boolean; ownerId: string | null } | null,
  viewerId: string | null,
): Promise<void> {
  assertOwner(cat, viewerId);
}

function assertOwner(cat: { isNpc: boolean; ownerId: string | null } | null, viewerId: string | null): asserts cat {
  if (!cat || cat.isNpc) throw new Error("只能给自己领养的猫留言");
  if (!cat.ownerId || !viewerId || cat.ownerId !== viewerId) throw new Error("这不是你的猫哦");
}

export async function saveNudge(formData: FormData) {
  const catId = String(formData.get("catId") ?? "");
  const message = String(formData.get("message") ?? "").trim().slice(0, 60);
  const suggestionRaw = String(formData.get("suggestion") ?? "");
  const suggestion = SUGGESTIONS.has(suggestionRaw) || /^story:[a-z_]+$/.test(suggestionRaw) ? suggestionRaw : null;
  const isPublic = formData.get("isPublic") === "on";

  if (!catId || (!message && !suggestion)) return;
  const cat = await prisma.cat.findUnique({ where: { id: catId } });
  const uid = await getViewerId();
  assertOwner(cat, uid);

  if (message) {
    const mod = await moderateTexts([message]);
    if (!mod.ok) throw new Error(mod.reason ?? "留言未通过审核");
  }

  // 未消费的旧干预直接覆盖（每天只认最新一条）
  await prisma.ownerNudge.deleteMany({ where: { catId, consumedDay: null } });
  await prisma.ownerNudge.create({
    data: {
      id: randomUUID(),
      catId,
      message: message || null,
      suggestion,
      isPublic,
      createdAt: new Date(),
    },
  });

  const priorCount = await prisma.ownerNudge.count({ where: { catId, consumedDay: { not: null } } });
  await track("intervention_submit", { hasMessage: Boolean(message), suggestion: suggestion ?? "none", first: priorCount === 0 });
  revalidatePath(`/cats/${catId}`);

  // D1 夜晚离开仪式（doc/10 §8）：来岛第一天留完话不直接结束——
  // 看一眼它把纸条放在床边，才建立"它会继续生活"。redirect 必须在所有写入之后。
  const world = await prisma.worldState.findUnique({ where: { id: 1 } });
  // 猫龄改读 firstTickDay（doc/14 §一）；0 = 未回填历史数据，回退首事件倒推
  let catDay: number;
  if (cat.firstTickDay > 0) {
    catDay = catDayOf(world?.day ?? 0, cat.firstTickDay);
  } else {
    const firstEvent = await prisma.event.findFirst({ where: { catId }, orderBy: { day: "asc" }, select: { day: true } });
    catDay = (world?.day ?? 0) - (firstEvent?.day ?? world?.day ?? 0) + 1;
  }
  if (catDay <= 1) redirect("/my-cat/goodnight");
}

/** 给《猫啊岛日报》递一条线索：用户在这个世界里留下的痕迹，次日见报 */
export async function submitNewsTip(formData: FormData) {
  const content = String(formData.get("content") ?? "").trim().slice(0, 60);
  if (!content) return;
  const uid = await getViewerId();
  const cat = await prisma.cat.findFirst({ where: { ownerId: uid ?? "__none__" }, select: { id: true } });
  if (!cat) throw new Error("要先有一只猫，才能给爆米花递线索");

  // 一次只压一条待发线索：防刷版面
  const pending = await prisma.newsTip.count({ where: { catId: cat.id, publishedAt: null } });
  if (pending > 0) throw new Error("爆米花手上还压着你的一条线索，等见了报再递下一条");

  const mod = await moderateTexts([content]);
  if (!mod.ok) throw new Error(mod.reason ?? "这条线索没通过爆米花的审稿");

  await prisma.newsTip.create({ data: { id: randomUUID(), catId: cat.id, content, createdAt: new Date() } });
  await track("news_tip_submit", {});
  revalidatePath("/island");
}

/** 入岛三件事之三：和它约好明早八点（一次性，不是签到） */
export async function keepArrivalPromise() {
  const uid = await getViewerId();
  const cat = await prisma.cat.findFirst({ where: { ownerId: uid ?? "__none__" }, select: { id: true } });
  if (!cat) return;
  await prisma.arrivalNote.upsert({
    where: { catId: cat.id },
    update: { promisedAt: new Date() },
    create: { catId: cat.id, metNpcIds: [], promisedAt: new Date() },
  });
  await track("arrival_promise", {});
  revalidatePath("/my-cat");
}

export async function renameCat(formData: FormData) {
  const newName = String(formData.get("newName") ?? "").trim().slice(0, 12);
  if (!newName) return;
  const uid = await getViewerId();
  const cat = await prisma.cat.findFirst({ where: { ownerId: uid ?? "__none__" } });
  if (!cat) throw new Error("你还没有猫");
  if (cat.renamedAt) throw new Error("改名机会只有一次，已经用过了");
  const mod = await moderateTexts([newName]);
  if (!mod.ok) throw new Error(mod.reason ?? "名字未通过审核");
  await prisma.cat.update({ where: { id: cat.id }, data: { name: newName, renamedAt: new Date() } });
  revalidatePath("/my-cat");
}
