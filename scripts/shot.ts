// 移动端截图（视觉审计用）：390×844 @2x，带 mily 主人身份看 /my-cat
import puppeteer from "puppeteer-core";

const OUT = process.env.SHOT_DIR ?? "/tmp/shots";
const UID = process.env.SHOT_UID ?? "";

async function main() {
  const browser = await puppeteer.launch({
    executablePath: "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true,
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 2 });
  if (UID) {
    await browser.setCookie({
      name: "maoadao_uid", value: UID, domain: "maoadao.vercel.app", path: "/",
      httpOnly: true, secure: true, sameSite: "Lax",
    });
  }
  const pages: [string, string][] = [
    ["home", "https://maoadao.vercel.app/"],
    ["adopt", "https://maoadao.vercel.app/adopt"],
    ["mycat", "https://maoadao.vercel.app/my-cat"],
    ["history", "https://maoadao.vercel.app/my-cat/history"],
    ["island", "https://maoadao.vercel.app/island"],
  ];
  for (const [name, url] of pages) {
    await page.goto(url, { waitUntil: "networkidle2", timeout: 60_000 });
    await new Promise((r) => setTimeout(r, 800));
    await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
    console.log(`${name} ✓`);
  }
  await browser.close();
}
main().catch((e) => { console.error(e); process.exit(1); });
