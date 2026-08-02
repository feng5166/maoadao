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

// 小红书/朋友圈友好的 3:4 竖版分享卡
const W = 900;
const H = 1200;

const fontData = fs.readFileSync(path.join(process.cwd(), "assets/fonts/NotoSansSC-Regular.otf"));

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
  const qrUri = await QRCode.toDataURL(backUrl, { width: 120, margin: 1, color: { dark: "#3E3226", light: "#FDF8F0" } });
  await track("share_card_view", { catId: cat.id, day: diary.day }).catch(() => {});

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          background: "#faf6ee",
          padding: 64,
          fontFamily: "Noto Sans SC",
          color: "#3E3226",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={avatarUri} width={140} height={140} alt="" style={{ borderRadius: 70 }} />
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 56 }}>{cat.name}</div>
            <div style={{ fontSize: 28, color: "#8A7B65", marginTop: 6 }}>
              {`猫啊岛第 ${diary.day} 天 · ${world.season}天 · 心情：${diary.mood}`}
            </div>
          </div>
        </div>

        <div
          style={{
            display: "flex",
            flex: 1,
            marginTop: 48,
            background: "#FFFFFF",
            borderRadius: 36,
            padding: 52,
            fontSize: 34,
            lineHeight: 1.8,
            boxShadow: "0 8px 32px rgba(62,50,38,0.08)",
          }}
        >
          {diary.content}
        </div>

        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 36,
            fontSize: 26,
            color: "#A89B85",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>猫啊岛 · 领养一只会自己生活的猫</div>
            <div>maoadao.com</div>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={qrUri} width={104} height={104} alt="" style={{ borderRadius: 12 }} />
        </div>
      </div>
    ),
    {
      width: W,
      height: H,
      fonts: [{ name: "Noto Sans SC", data: fontData, style: "normal", weight: 400 }],
    },
  );
}
