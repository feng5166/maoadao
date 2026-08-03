import fs from "node:fs";
import path from "node:path";
import { ImageResponse } from "next/og";
import QRCode from "qrcode";
import { track } from "@vercel/analytics/server";
import { catAvatarDataUri } from "@/components/CatAvatar";
import { getCat, getDiary, getWorld } from "@/lib/queries";
import { prisma } from "@/lib/db";
import { SITE_URL } from "@/lib/site";

export const dynamic = "force-dynamic";

// 小红书/朋友圈友好的 3:4 竖版分享卡。
// 视觉与站内同一套纸张系统（v0.7）：奶油白纸底、纸张分割线、便签纸 + 鼠尾草胶带、
// 报头宋体 + 日记楷体;禁白卡圆角阴影。色值对齐 globals.css。
const W = 900;
const H = 1200;

const PAPER = "#faf6ee";
const SLIP = "#fffdf6";
const INK = "#4a4237";
const INK_SOFT = "#8b8071";
const INK_FAINT = "#b3a892";
const LINE = "#e2d9c6";
const BRICK = "#b5543b";
const TAPE = "rgba(138, 155, 124, 0.32)";

const serifBold = fs.readFileSync(path.join(process.cwd(), "assets/fonts/NotoSerifSC-Bold.otf"));
const wenkai = fs.readFileSync(path.join(process.cwd(), "assets/fonts/LXGWWenKaiLite-Regular.ttf"));

export async function GET(_req: Request, ctx: { params: Promise<{ catId: string; day: string }> }) {
  const { catId, day: dayStr } = await ctx.params;
  const day = Number(dayStr);
  const cat = await getCat(catId);
  const diary = Number.isInteger(day) ? await getDiary(catId, day) : undefined;
  if (!cat || !diary) {
    return new Response("没有这一天的日记", { status: 404 });
  }
  const world = await getWorld();
  const portrait = await prisma.portrait.findUnique({ where: { catId: cat.id } });
  const avatarUri = portrait
    ? `data:${portrait.mime};base64,${Buffer.from(portrait.data).toString("base64")}`
    : catAvatarDataUri(cat.id, 140);
  // 回流二维码：带猫 ID 与渠道归因参数
  const backUrl = `${SITE_URL}/cats/${cat.id}?from=share_card&d=${diary.day}`;
  const qrUri = await QRCode.toDataURL(backUrl, { width: 120, margin: 1, color: { dark: INK, light: SLIP } });
  await track("share_card_view", { catId: cat.id, day: diary.day }).catch(() => {});

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: PAPER,
          padding: "56px 64px 48px",
          fontFamily: "LXGW WenKai Lite",
          color: INK,
        }}
      >
        {/* 页眉：手账体例的一行小字 + 双细线 */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            fontSize: 24,
            color: INK_FAINT,
            letterSpacing: 6,
          }}
        >
          {`猫啊岛历 第 ${diary.day} 天 · ${world.season}天 · 心情 ${diary.mood}`}
        </div>
        <div style={{ display: "flex", flexDirection: "column", marginTop: 20 }}>
          <div style={{ height: 1, background: LINE, display: "flex" }} />
          <div style={{ height: 1, background: LINE, marginTop: 3, display: "flex" }} />
        </div>

        {/* 猫名与立绘：像册页上贴的一张小照 */}
        <div style={{ display: "flex", alignItems: "center", gap: 28, marginTop: 36 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={avatarUri}
            width={132}
            height={132}
            alt=""
            style={{ borderRadius: 66, border: `1px solid ${LINE}` }}
          />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 52, fontFamily: "Noto Serif SC", fontWeight: 700 }}>{cat.name}</div>
            <div style={{ fontSize: 26, color: INK_SOFT, marginTop: 8 }}>今天写下的一页</div>
          </div>
        </div>

        {/* 日记便签：贴在纸上的一页，顶上一截鼠尾草色胶带 */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            marginTop: 40,
            transform: "rotate(-0.6deg)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              width: 170,
              height: 34,
              background: TAPE,
              transform: "rotate(-2deg)",
              margin: "0 auto -18px",
            }}
          />
          <div
            style={{
              display: "flex",
              flex: 1,
              background: SLIP,
              border: `1px solid ${LINE}`,
              padding: "48px 52px",
              fontSize: 33,
              lineHeight: 1.9,
              color: INK,
            }}
          >
            {diary.content}
          </div>
        </div>

        {/* 页脚：印章 + 一句话 + 回岛二维码 */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 40,
            paddingTop: 28,
            borderTop: `1px solid ${LINE}`,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
            <div
              style={{
                display: "flex",
                border: `2px solid ${BRICK}`,
                color: BRICK,
                borderRadius: 6,
                padding: "4px 14px",
                fontSize: 26,
                fontFamily: "Noto Serif SC",
                fontWeight: 700,
                transform: "rotate(-2deg)",
              }}
            >
              猫啊岛
            </div>
            <div style={{ display: "flex", flexDirection: "column", fontSize: 22, color: INK_FAINT, gap: 6 }}>
              <div style={{ display: "flex" }}>一座猫住的小岛 · 每天都有新的一页</div>
              <div style={{ display: "flex" }}>maoadao.com</div>
            </div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUri} width={100} height={100} alt="" style={{ border: `1px solid ${LINE}` }} />
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [
        { name: "Noto Serif SC", data: serifBold, style: "normal", weight: 700 },
        { name: "LXGW WenKai Lite", data: wenkai, style: "normal", weight: 400 },
      ],
    },
  );
}
