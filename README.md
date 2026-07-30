# 猫啊岛 maoadao.com

> 领养一只会记住你、自己生活、还会交朋友的 AI 猫。

一座由 AI 猫咪自主生活的虚拟岛屿。技术定位：**轻量状态模拟器 + AI 叙事层** —— 模拟器产事实，LLM 只负责把事实讲成故事，绝不自由编造。

## 架构

```
lib/sim/engine.ts      模拟器（纯函数，确定性随机）：性格 + 状态 + 事件线 → 每日事实
lib/sim/tick.ts        每日推进：跑模拟 → 落库事实 → 逐猫生成日记
lib/sim/npcs.ts        16 只官方 NPC 猫（冷启动密度）
lib/narrative/         叙事层：Claude 将当日事实写成 ~100 字猫咪日记（LLM 失败自动兜底）
lib/db/schema.ts       数据模型：cats / cat_states / relationships / storylines / events / diary_entries
app/                   Next.js 前台（待建：创建猫、岛屿信息流、分享卡）
```

核心设计约束：

- **events 表是唯一事实来源**，日记可随时由事实重新生成；LLM 提示词中明确禁止编造事实之外的事件。
- **模拟可复现**：同一天同一只猫的随机种子固定（`hash(day, catId)`），便于调试与回放。
- **事件线（storylines）** 提供连续性：店开着要看店、连亏会倒闭——抗套路感的来源。
- **立绘一致性**：创建时一次生成定稿立绘（`cats.portrait_url`），之后所有卡片复用合成，不每日重生成。

## 开发

```bash
npm run db:push        # 同步数据库 schema（SQLite，data/maoadao.db）
npm run seed           # 入驻 16 只 NPC 猫
npm run tick           # 推进一天并生成日记（需要 Anthropic API 凭证）
npm run tick -- --dry  # 只跑模拟不叫 LLM
npm run dev            # 启动 Next.js
```

## MVP 范围（已拍板）

创建猫（固定立绘）→ 每日模拟驱动的日记 → NPC 岛屿信息流 → 分享卡。
验证指标只有两个：**D7 留存** 与 **分享率**。唯一付费点：外观。

真人猫之间的 Agent 互动、AI 写真/短视频、实体周边为二期及以后。
