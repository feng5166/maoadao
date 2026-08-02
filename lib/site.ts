// 站点外链基址:域名可配置(env SITE_URL),默认当前部署域 maoadao.vercel.app。
// 微信消息链接、邮件链接、分享卡回流链接统一从这里取——切正式域名时只改一个环境变量。
export const SITE_URL = (process.env.SITE_URL ?? "https://maoadao.vercel.app").replace(/\/$/, "");
