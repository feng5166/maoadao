import { SITE_URL } from "./site";

// 邮件发送：Resend REST API（无 SDK 依赖）。
// 未配置 RESEND_API_KEY 时优雅降级：验证码打到服务端日志（内测期可用），每日邮件跳过。

const FROM = process.env.EMAIL_FROM ?? "猫啊岛 <onboarding@resend.dev>";

export function emailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(to: string, subject: string, html: string): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    console.warn(`[email] 未配置 RESEND_API_KEY，跳过发送 → ${to}：${subject}`);
    return false;
  }
  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: FROM, to: [to], subject, html }),
    });
    if (!res.ok) {
      console.error(`[email] 发送失败 ${res.status}:`, (await res.text()).slice(0, 200));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[email] 发送异常:", err instanceof Error ? err.message.slice(0, 150) : err);
    return false;
  }
}

export function otpEmailHtml(code: string): string {
  return `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px;background:#FDF8F0;border-radius:16px">
  <p style="font-size:20px;letter-spacing:0.12em;color:#4A4237">猫啊岛</p>
  <p>你的验证码是：</p>
  <p style="font-size:32px;font-weight:bold;letter-spacing:6px;color:#E08E0B">${code}</p>
  <p style="color:#8A7B65;font-size:13px">10 分钟内有效。如果不是你在操作，忽略这封邮件即可。</p>
</div>`;
}

/** 异常登录提醒(doc/20 §八):只在账户已有别的设备在线、且邮箱确认过归属时寄出 */
export function newDeviceLoginEmailHtml(userAgent: string): string {
  const os = /iPhone|iPad/i.test(userAgent) ? "iPhone/iPad" : /Android/i.test(userAgent) ? "Android" : /Mac OS X/i.test(userAgent) ? "Mac" : /Windows/i.test(userAgent) ? "Windows" : "一台设备";
  return `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px;background:#FDF8F0;border-radius:16px">
  <p style="font-size:20px;letter-spacing:0.12em;color:#4A4237">猫啊岛</p>
  <p style="line-height:1.7">刚才有人在<b>${os}</b>上用你的邮箱和密码登录了猫啊岛。</p>
  <p style="line-height:1.7;color:#8A7B65;font-size:13px">如果就是你,忽略这封信即可。<br/>
  如果不是你,请立刻到<a href="${SITE_URL}/account" style="color:#B5543B">岛民册</a>换一个密码,并踢出其他设备。</p>
</div>`;
}

/** 每日召回邮件：内容钩子，不是系统通知 */
export function dailyEmailHtml(catName: string, hook: string): string {
  const url = `${SITE_URL}/my-cat`;
  return `<div style="font-family:sans-serif;max-width:420px;margin:0 auto;padding:24px;background:#FDF8F0;border-radius:16px">
  <p style="font-size:16px;line-height:1.7">${hook}</p>
  <p style="margin-top:20px"><a href="${url}" style="background:#F5A623;color:#fff;padding:10px 24px;border-radius:999px;text-decoration:none">看看${catName}的今天 →</a></p>
  <p style="margin-top:20px;color:#A89B85;font-size:12px">不想收到每日故事？<a href="${SITE_URL}/account" style="color:#A89B85">到账户页关闭</a></p>
</div>`;
}
