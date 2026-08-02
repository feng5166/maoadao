// 猫啊岛微信桥(iLink 直连,fork 自 stocktell ilink-bridge,协议细节对齐 wechat-ilink-demo)。
// 与 stocktell 桥的三个关键差异(doc/11 哑管道红线):
//   1. 全量转发:用户的每条文本都 POST 给猫啊岛 /api/wechat/inbound,桥不解释任何指令;
//   2. 无硬编码欢迎语:激活回调 /api/wechat/bind 由猫啊岛返回人格化握手文案,桥只负责送;
//   3. 回复可带 typing 先行(猫在想)——生命感细节,失败不影响主流程。
//
// 端点(除 /health 外都要 x-bridge-secret):
//   POST /bind/start {userId}      → {qrcode, qrImg}   给该用户出专属绑定二维码
//   POST /bind/poll  {qrcode}      → {state: pending|scanned|activated|expired, openId?}
//   POST /send       {openId, text, typing?} → {ok}
//   POST /unbind     {openId}      → {ok}
//   GET  /users                    → 已绑用户列表(管理用)
//   GET  /health
//
// 环境变量:BRIDGE_SECRET(必填,fail-closed)/ MAOADAO_BASE(默认 https://maoadao.vercel.app)/ PORT(默认 8788)

import http from "http";
import fs from "fs";
import crypto from "crypto";

const ILINK = "https://ilinkai.weixin.qq.com";
const CHANNEL_VERSION = "1.0.2";
const SECRET = process.env.BRIDGE_SECRET || "";
if (!SECRET) {
  console.error("[bridge] 致命:未配置 BRIDGE_SECRET,拒绝启动(与 Vercel WECHAT_BRIDGE_SECRET 同值)");
  process.exit(1);
}
function secretOk(got) {
  if (typeof got !== "string") return false;
  const a = Buffer.from(got);
  const b = Buffer.from(SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
const MAOADAO = (process.env.MAOADAO_BASE || "https://maoadao.vercel.app").replace(/\/$/, "");
const PORT = process.env.PORT || 8788;
const FAIL_THRESHOLD = Number(process.env.FAIL_THRESHOLD || 3);

// 持久化:每个微信用户的凭证(botToken/contextToken),0600 防同机读取
const CREDS_FILE = new URL("./creds.json", import.meta.url).pathname;
let creds = fs.existsSync(CREDS_FILE) ? JSON.parse(fs.readFileSync(CREDS_FILE, "utf8")) : {};
const saveCreds = () => {
  fs.writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2), { mode: 0o600 });
  try { fs.chmodSync(CREDS_FILE, 0o600); } catch { /* 兜底改权限 */ }
};

const pending = new Map(); // qrcode -> {userId, state, openId, createdAt}
const workers = new Map(); // openId -> {stop}
const nowSec = () => Math.floor(Date.now() / 1000);
const clientId = () => "maoadao-weixin:" + Date.now() + "-" + crypto.randomBytes(4).toString("hex");

// X-WECHAT-UIN:随机 uint32 → base64(防重放,对齐 openclaw-weixin 1.0.2)
function ihdr(botToken) {
  return {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": Buffer.from(String(crypto.randomBytes(4).readUInt32BE(0))).toString("base64"),
    ...(botToken ? { Authorization: `Bearer ${botToken}` } : {}),
  };
}

async function ilinkPost(endpoint, payload, botToken, timeoutMs = 15_000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(`${ILINK}/${endpoint}`, {
      method: "POST",
      headers: ihdr(botToken),
      body: JSON.stringify({ ...payload, base_info: { channel_version: CHANNEL_VERSION } }),
      signal: ctrl.signal,
    });
    const raw = await r.text();
    let d = {};
    try { d = JSON.parse(raw); } catch { /* 空响应=成功 */ }
    return { http: r.status, ok: r.ok && (d.ret === undefined || d.ret === 0), data: d, raw };
  } catch (e) {
    return { http: 0, ok: false, error: String(e) };
  } finally {
    clearTimeout(t);
  }
}

async function ilinkSend(botToken, toUserId, contextToken, text) {
  const r = await ilinkPost("ilink/bot/sendmessage", {
    msg: {
      from_user_id: "",
      to_user_id: toUserId,
      client_id: clientId(),
      message_type: 2,
      message_state: 2,
      context_token: contextToken || "",
      item_list: [{ type: 1, text_item: { text } }],
    },
  }, botToken);
  if (!r.ok) console.error(`[bridge] 发送失败 to=${toUserId} http=${r.http} ret=${r.data?.ret} ${r.raw || r.error || ""}`);
  return r;
}

// typing 先行(猫在想):getconfig 拿 ticket(缓存),失败静默
const typingTickets = {};
async function tryTyping(botToken, openId, contextToken) {
  try {
    if (!typingTickets[openId]) {
      const c = await ilinkPost("ilink/bot/getconfig", { ilink_user_id: openId, context_token: contextToken }, botToken, 10_000);
      if (c.data?.typing_ticket) typingTickets[openId] = c.data.typing_ticket;
    }
    if (typingTickets[openId]) {
      await ilinkPost("ilink/bot/sendtyping", { ilink_user_id: openId, typing_ticket: typingTickets[openId], status: 1 }, botToken, 10_000);
      await new Promise((s) => setTimeout(s, 600));
    }
  } catch { /* typing 失败不影响主流程 */ }
}

// 硬失败治理(对齐 stocktell 桥):http>=400 或 ret!=0 计数,连续 3 次判失效 → 清凭证 + 回调猫啊岛
function recordSendResult(openId, r) {
  const c = creds[openId];
  if (!c) return;
  if (r.ok) {
    c.lastSendOkAt = nowSec();
    if (c.failCount || c.lastError) { c.failCount = 0; c.lastError = null; }
    saveCreds();
    return;
  }
  const hardError = (r.http && r.http >= 400) || (typeof r.data?.ret === "number" && r.data.ret !== 0);
  if (!hardError) return; // 网络抖动不计
  c.failCount = (c.failCount || 0) + 1;
  c.lastError = { ret: r.data?.ret ?? null, http: r.http ?? null, at: nowSec() };
  saveCreds();
  console.error(`[bridge] 硬失败 ${openId} #${c.failCount}`);
  if (c.failCount >= FAIL_THRESHOLD) {
    console.warn(`[bridge] ${openId} 连续 ${c.failCount} 次硬失败 → 判失效,清除并回调`);
    maoadao("/api/wechat/unbind", { openId });
    removeUser(openId);
  }
}

async function maoadao(path, payload) {
  try {
    const r = await fetch(`${MAOADAO}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bridge-secret": SECRET },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15_000),
    });
    return await r.json().catch(() => ({}));
  } catch (e) {
    console.error(`[bridge] 回调猫啊岛失败 ${path}: ${e.message}`);
    return {};
  }
}

// 单用户 getupdates 循环:刷 context_token(=24h 窗口的真身)+ 全量转发文本给猫啊岛
function startWorker(openId) {
  const existing = workers.get(openId);
  if (existing) existing.stop = true;
  const w = { stop: false };
  workers.set(openId, w);
  let buf = "";
  console.log(`[bridge] worker 启动 ${openId}`);
  (async () => {
    while (!w.stop && creds[openId]) {
      const r = await ilinkPost("ilink/bot/getupdates", { get_updates_buf: buf }, creds[openId].botToken, 40_000);
      if (!r.ok) {
        // -14 = 会话过期:暂停 60 分钟防风控(openclaw-weixin 同款策略),用户需重新扫码
        if (r.data?.errcode === -14 || r.data?.ret === -14) {
          console.error(`[bridge] ${openId} 会话过期(-14),暂停 60 分钟`);
          await new Promise((s) => setTimeout(s, 3600_000));
        } else {
          await new Promise((s) => setTimeout(s, 3000));
        }
        continue;
      }
      if (r.data.get_updates_buf) buf = r.data.get_updates_buf;
      for (const m of r.data.msgs || []) {
        if (m.message_type === 2) continue; // bot 自己的消息
        if (m.from_user_id?.endsWith?.("@im.bot")) continue;
        const c = creds[openId];
        if (!c) break;
        if (m.context_token) {
          c.contextToken = m.context_token;
          c.lastMsgAt = nowSec();
          c.failCount = 0;
          c.lastError = null;
          saveCreds();
        }
        const text = (m.item_list || []).filter((i) => i.type === 1 && i.text_item).map((i) => i.text_item.text).join("").trim();

        // 首条消息 = 激活:回调猫啊岛建绑定,拿人格化握手文案回给用户(桥不写一句台词)
        if (!c.activated) {
          c.activated = true;
          saveCreds();
          const res = await maoadao("/api/wechat/bind", { userId: c.userId, openId, text });
          const p = [...pending.values()].find((x) => x.openId === openId);
          if (p) p.state = "activated";
          if (res?.replyText) {
            await tryTyping(c.botToken, openId, c.contextToken);
            recordSendResult(openId, await ilinkSend(c.botToken, openId, c.contextToken, res.replyText));
          }
          continue;
        }
        if (!text) continue;
        // 全量转发:留言/退订全部由猫啊岛决定,桥只送话
        const res = await maoadao("/api/wechat/inbound", { from: openId, text });
        if (res?.replyText) {
          await tryTyping(c.botToken, openId, c.contextToken);
          recordSendResult(openId, await ilinkSend(c.botToken, openId, c.contextToken, res.replyText));
        }
      }
    }
    console.log(`[bridge] worker 退出 ${openId}`);
    if (workers.get(openId) === w) workers.delete(openId);
  })();
}

function removeUser(openId) {
  const w = workers.get(openId);
  if (w) w.stop = true;
  delete creds[openId];
  delete typingTickets[openId];
  saveCreds();
}

// 绑定看守:轮询待扫码的码;扫到建 creds + 起 worker,等首条消息激活
async function bindWatcher() {
  for (;;) {
    await new Promise((s) => setTimeout(s, 2000));
    for (const [qrcode, p] of pending) {
      if (nowSec() - p.createdAt > 600) { pending.delete(qrcode); continue; }
      if (p.state !== "pending") continue;
      try {
        const st = await fetch(`${ILINK}/ilink/bot/get_qrcode_status?qrcode=${encodeURIComponent(qrcode)}`, { headers: ihdr() }).then((r) => r.json());
        if (st.status === "expired") { p.state = "expired"; continue; }
        if (st.bot_token && st.ilink_user_id) {
          const openId = st.ilink_user_id;
          const sameBot = creds[openId]?.botToken === st.bot_token;
          p.openId = openId;
          p.state = "scanned";
          creds[openId] = {
            userId: p.userId,
            botToken: st.bot_token,
            ilinkBotId: st.ilink_bot_id,
            // 新扫码=新会话,旧 context_token 失效;等首条消息拿新 token 才算激活
            contextToken: sameBot ? creds[openId]?.contextToken || null : null,
            activated: sameBot ? creds[openId]?.activated || false : false,
            boundAt: creds[openId]?.boundAt || nowSec(),
            failCount: 0,
            lastError: null,
          };
          saveCreds();
          console.log(`[bridge] 扫码确认 user=${p.userId} openId=${openId}`);
          startWorker(openId);
        }
      } catch (e) {
        console.error("[bridge] bindWatcher err:", e.message);
      }
    }
  }
}

// 重启恢复:已有凭证的用户全部重新拉起 worker
for (const openId of Object.keys(creds)) startWorker(openId);
bindWatcher();

// ============ HTTP 服务 ============
function readBody(req) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > 65536) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
  });
}
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://x");
  if (url.pathname === "/health") return json(res, 200, { ok: true, users: Object.keys(creds).length, pending: pending.size });
  if (!secretOk(req.headers["x-bridge-secret"])) return json(res, 401, { ok: false, error: "unauthorized" });

  if (req.method === "POST" && url.pathname === "/bind/start") {
    const { userId } = await readBody(req);
    if (!userId) return json(res, 400, { ok: false, error: "missing userId" });
    try {
      const qr = await fetch(`${ILINK}/ilink/bot/get_bot_qrcode?bot_type=3`, { headers: ihdr() }).then((r) => r.json());
      if (!qr.qrcode_img_content) return json(res, 502, { ok: false, error: "qrcode_unavailable", detail: qr });
      pending.set(qr.qrcode, { userId, state: "pending", openId: null, createdAt: nowSec() });
      return json(res, 200, { ok: true, qrcode: qr.qrcode, qrImg: qr.qrcode_img_content });
    } catch (e) {
      return json(res, 502, { ok: false, error: String(e) });
    }
  }
  if (req.method === "POST" && url.pathname === "/bind/poll") {
    const { qrcode } = await readBody(req);
    const p = pending.get(qrcode);
    if (!p) return json(res, 200, { ok: true, state: "expired", openId: null });
    return json(res, 200, { ok: true, state: p.state, openId: p.openId });
  }
  if (req.method === "POST" && url.pathname === "/send") {
    const { openId, text, typing } = await readBody(req);
    const c = creds[openId];
    if (!c) return json(res, 404, { ok: false, error: "not_bound" });
    if (!c.contextToken) return json(res, 200, { ok: false, error: "no_context_token" });
    if (typing) await tryTyping(c.botToken, openId, c.contextToken);
    const r = await ilinkSend(c.botToken, openId, c.contextToken, String(text ?? "").slice(0, 4000));
    recordSendResult(openId, r);
    return json(res, 200, { ok: r.ok, ret: r.data?.ret, http: r.http });
  }
  if (req.method === "POST" && url.pathname === "/unbind") {
    const { openId } = await readBody(req);
    removeUser(openId);
    return json(res, 200, { ok: true });
  }
  if (req.method === "GET" && url.pathname === "/users") {
    return json(res, 200, {
      ok: true,
      users: Object.entries(creds).map(([openId, c]) => ({
        openId, userId: c.userId, activated: !!c.activated, boundAt: c.boundAt, lastMsgAt: c.lastMsgAt ?? null, failCount: c.failCount ?? 0,
      })),
    });
  }
  return json(res, 404, { ok: false, error: "not_found" });
}).listen(PORT, "127.0.0.1", () => {
  console.log(`[bridge] 猫啊岛微信桥监听 127.0.0.1:${PORT} → ${MAOADAO}(已恢复 ${Object.keys(creds).length} 个用户)`);
});
