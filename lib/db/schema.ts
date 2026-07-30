import { sqliteTable, text, integer, uniqueIndex, index } from "drizzle-orm/sqlite-core";

// 设计原则：模拟器产事实，LLM 只负责叙事。
// events 表是唯一事实来源；diary_entries 是叙事层产物，可随时由 events 重新生成。

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const cats = sqliteTable("cats", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").references(() => users.id), // null = NPC 猫
  name: text("name").notNull(),
  isNpc: integer("is_npc", { mode: "boolean" }).notNull().default(false),
  // 性格：数值轴决定模拟器行为倾向，tags 供叙事层塑造语气
  boldness: integer("boldness").notNull(), // 0-100 冒险倾向
  sociability: integer("sociability").notNull(), // 0-100 社交倾向
  diligence: integer("diligence").notNull(), // 0-100 勤劳程度
  personaTags: text("persona_tags", { mode: "json" }).$type<string[]>().notNull(),
  appearance: text("appearance").notNull(), // 外形描述，生成立绘用
  portraitUrl: text("portrait_url"), // 定稿立绘，一次生成反复合成
  bio: text("bio").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const catStates = sqliteTable("cat_states", {
  catId: text("cat_id").primaryKey().references(() => cats.id),
  coins: integer("coins").notNull().default(50), // 鱼币
  energy: integer("energy").notNull().default(100),
  mood: text("mood").notNull().default("平静"),
  location: text("location").notNull().default("自家小屋"),
  updatedDay: integer("updated_day").notNull().default(0),
});

export const items = sqliteTable(
  "items",
  {
    id: text("id").primaryKey(),
    catId: text("cat_id").notNull().references(() => cats.id),
    itemKey: text("item_key").notNull(),
    qty: integer("qty").notNull().default(1),
    acquiredDay: integer("acquired_day").notNull(),
  },
  (t) => [uniqueIndex("items_cat_item").on(t.catId, t.itemKey)],
);

export const relationships = sqliteTable(
  "relationships",
  {
    id: text("id").primaryKey(),
    catAId: text("cat_a_id").notNull().references(() => cats.id),
    catBId: text("cat_b_id").notNull().references(() => cats.id),
    affinity: integer("affinity").notNull().default(0), // -100 ~ 100
    kind: text("kind").notNull().default("acquaintance"), // acquaintance | friend | rival | partner
    lastInteractionDay: integer("last_interaction_day").notNull().default(0),
  },
  (t) => [uniqueIndex("rel_pair").on(t.catAId, t.catBId)],
);

// 未完成的事件线：店还开着、债还欠着、探险进行到一半——连续性与抗套路的来源
export const storylines = sqliteTable("storylines", {
  id: text("id").primaryKey(),
  catId: text("cat_id").notNull().references(() => cats.id),
  kind: text("kind").notNull(), // shop | debt | expedition | feud | courtship
  status: text("status").notNull().default("active"), // active | resolved | failed
  data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
  startDay: integer("start_day").notNull(),
  endDay: integer("end_day"),
});

// 模拟器每日产出的事实（唯一事实来源）
export const events = sqliteTable(
  "events",
  {
    id: text("id").primaryKey(),
    day: integer("day").notNull(),
    catId: text("cat_id").notNull().references(() => cats.id),
    type: text("type").notNull(), // fish | shop_day | visit | explore | rest | shop_open | ...
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    deltas: text("deltas", { mode: "json" }).$type<Record<string, number>>().notNull(),
  },
  (t) => [index("events_day_cat").on(t.day, t.catId)],
);

// 叙事层产物：由当日 events 生成的猫咪日记
export const diaryEntries = sqliteTable(
  "diary_entries",
  {
    id: text("id").primaryKey(),
    catId: text("cat_id").notNull().references(() => cats.id),
    day: integer("day").notNull(),
    content: text("content").notNull(),
    mood: text("mood").notNull(),
    eventIds: text("event_ids", { mode: "json" }).$type<string[]>().notNull(),
    generatedBy: text("generated_by").notNull().default("llm"), // llm | fallback
    createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  },
  (t) => [uniqueIndex("diary_cat_day").on(t.catId, t.day)],
);

export const worldState = sqliteTable("world_state", {
  id: integer("id").primaryKey(), // 恒为 1
  day: integer("day").notNull().default(0),
  season: text("season").notNull().default("夏"),
  weather: text("weather").notNull().default("晴"),
});
