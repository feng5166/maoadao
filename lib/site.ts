// 站点外链基址:域名可配置(env SITE_URL),默认 www.maoadao.com。
// 微信消息链接、邮件链接、分享卡回流链接统一从这里取——切域名时只改一个环境变量。
// 注意:微信内 vercel.app 域名打不开(2026-08-02 实测),对用户的链接必须走自有域名。
export const SITE_URL = (process.env.SITE_URL ?? "https://www.maoadao.com").replace(/\/$/, "");
