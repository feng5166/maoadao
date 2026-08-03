<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 视觉硬约束（v0.7 去 AI 化，规范全文见 doc/05）

1. **用户侧禁 emoji**。图标一律用 `components/icons.tsx` 的手绘单色图标系；缺哪枚就按同风格补进去（24 视窗、strokeWidth 1.7、圆头描边、轮廓带轻微手绘不对称、只用 currentColor），不要引入 Lucide 等线性图标库，也不要塞 emoji 顶替。纯排版符号（✓ · ×）不算 emoji，可以用。`app/admin` 是内部后台，不受此限。
2. **禁卡片堆栈样式**：用户侧不用 `shadow-*`、渐变、`rounded-xl/2xl` 白底卡；分区用纸张分割线（`border-t border-line`），唯一明显容器留给操作区（`note-slip`/`stamp-btn`）。
3. **字体栈别动顺序**：标题/报纸体 = 系统宋体优先、自托管 Noto Serif SC 兜底；日记体 = Apple 系统楷体优先、自托管 LXGW 文楷 Lite 兜底（都在 `app/globals.css`，webfont 在 `app/layout.tsx` 引入，unicode-range 分片按需下载）。新增文字样式先复用 `.font-title/.font-diary/.font-press`。
4. **用户侧禁系统词**：AI/Agent/建议/采纳/事件线/参数名与裸数值——术语产品化口径见 doc/05「系统术语产品化」。
5. **声音也不出戏（2026-08-03 拍板）**：发给用户的音频**一律不用人声**——猫的留声用喵叫，其余用岛上的环境声（海浪/风/雨/鸥鸣）。音源由音效模型生成（`lib/tts.ts` 的 `synthCatSound`，modelverse `/v1/audio/sound-generation`）；人声 TTS（`synthCatVoice`）仅限内部实验，不进任何用户触点。
6. **图片一律走导演系统（2026-08-04 拍板，doc/15）**：日常画面**禁止按事件调用生图**——用 `lib/visual/` 导演+合成（`direct()` → `composeMoment()`），素材来自资产库（场景×时段 + `CatPose` 姿势集）。允许调用生成的只有三类：**新猫入岛资产**（立绘 + `scripts/poses.ts` 姿势集）、**新场景资产**（`scripts/scenes.ts` + `scripts/scene-times.ts` 四时段，且要同步登记 `lib/visual/assets.ts` 的场景映射/比例/锚点三张表）、**L5 特殊时刻**（相遇/D7/重大剧情/节日，低频高价值）。比例观感用 `composeMoment` 的 `scaleOverride` 三档对比校准，改表不改逻辑。

# 协作与环境

- 协作者高频直推 main：push 前必须 `git fetch` + rebase，冲突按"保上游功能、叠视觉约束"解。
- push main = Vercel 自动部署。上游改了 `prisma/schema.prisma` 后本地要重跑 `npx prisma generate`。
- 本地 `.env.local` 的 DATABASE_URL 若指旧 us-east-1 库（生产已迁新加坡），连真库的测试会挂——那是环境问题，别对旧库 db:push。
