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
// 出站自声明(官方 bot_agent 规范:UA 风格、ASCII ≤256,仅腾讯侧日志归因,不参与鉴权)
const BOT_AGENT = "maoadao-bridge/0.1";
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
// 原子落盘(2026-08-07 review P2):先写临时文件再 rename —— 直接覆写时进程被杀
// 会留下截断的 JSON,那等于所有用户的凭据一起没了。旧文件另存一份 .bak 兜底。
const saveCreds = () => {
  const tmp = `${CREDS_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(creds, null, 2), { mode: 0o600 });
  try { if (fs.existsSync(CREDS_FILE)) fs.copyFileSync(CREDS_FILE, `${CREDS_FILE}.bak`); } catch { /* 备份失败不挡主流程 */ }
  fs.renameSync(tmp, CREDS_FILE);
  try { fs.chmodSync(CREDS_FILE, 0o600); } catch { /* 兜底改权限 */ }
};

// 游标持久化(2026-08-07 review P1):get_updates_buf 原先只在内存里,
// 且在业务回调成功之前就被推进 —— 回调失败两次后循环继续,那条消息**永远丢了**;
// 进程重启又会从头回放旧消息。现在:游标随 creds 落盘,且**只在业务确认后提交**。
const CURSOR_FILE = new URL("./cursors.json", import.meta.url).pathname;
let cursors = fs.existsSync(CURSOR_FILE) ? JSON.parse(fs.readFileSync(CURSOR_FILE, "utf8")) : {};
const saveCursors = () => {
  const tmp = `${CURSOR_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cursors, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, CURSOR_FILE);
};
// 已处理过的消息 id(按 openId 存最近 200 条):重启回放/服务端重投时不重复消费
const seen = fs.existsSync(new URL("./seen.json", import.meta.url).pathname)
  ? JSON.parse(fs.readFileSync(new URL("./seen.json", import.meta.url).pathname, "utf8"))
  : {};
const SEEN_FILE = new URL("./seen.json", import.meta.url).pathname;
const saveSeen = () => {
  const tmp = `${SEEN_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(seen, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, SEEN_FILE);
};
function alreadyHandled(openId, msgId) {
  if (!msgId) return false;
  return (seen[openId] || []).includes(msgId);
}
function markHandled(openId, msgId) {
  if (!msgId) return;
  const list = seen[openId] || (seen[openId] = []);
  list.push(msgId);
  if (list.length > 200) list.splice(0, list.length - 200);
  saveSeen();
}

// 出站幂等键:记住最近发成功的 key(24h),重试不会变成两条消息。
// 只在内存 —— 进程重启后最坏是重发一条,比把键写盘再引一套一致性问题划算。
const sentKeys = new Map(); // key -> 时间戳
function rememberSentKey(key) {
  sentKeys.set(key, Date.now());
  if (sentKeys.size > 5000) {
    const cutoff = Date.now() - 24 * 3600_000;
    for (const [k, t] of sentKeys) if (t < cutoff) sentKeys.delete(k);
  }
}

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
      body: JSON.stringify({ ...payload, base_info: { channel_version: CHANNEL_VERSION, bot_agent: BOT_AGENT } }),
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

async function ilinkSendItem(botToken, toUserId, contextToken, item) {
  const r = await ilinkPost("ilink/bot/sendmessage", {
    msg: {
      from_user_id: "",
      to_user_id: toUserId,
      client_id: clientId(),
      message_type: 2,
      message_state: 2,
      context_token: contextToken || "",
      item_list: [item], // 对齐 openclaw-weixin:每条消息只放一个 item
    },
  }, botToken);
  if (!r.ok) console.error(`[bridge] 发送失败 to=${toUserId} http=${r.http} ret=${r.data?.ret} ${r.raw || r.error || ""}`);
  return r;
}

async function ilinkSend(botToken, toUserId, contextToken, text) {
  return ilinkSendItem(botToken, toUserId, contextToken, { type: 1, text_item: { text } });
}

// ============ CDN 媒体上传(对齐 openclaw-weixin src/cdn/*) ============
// 流程:AES-128-ECB 整体加密 → getuploadurl 拿 upload_param(带 aeskey hex,no_need_thumb)
// → POST 密文到 CDN /upload → 响应头 x-encrypted-param 即下载参数。
const CDN_BASE = "https://novac2c.cdn.weixin.qq.com/c2c";

async function uploadMediaToCdn(botToken, toUserId, plaintext, mediaType) {
  const rawsize = plaintext.length;
  const rawfilemd5 = crypto.createHash("md5").update(plaintext).digest("hex");
  const filesize = Math.ceil((rawsize + 1) / 16) * 16; // PKCS7 补齐后的密文大小
  const filekey = crypto.randomBytes(16).toString("hex");
  const aeskey = crypto.randomBytes(16);

  const up = await ilinkPost("ilink/bot/getuploadurl", {
    filekey, media_type: mediaType, to_user_id: toUserId,
    rawsize, rawfilemd5, filesize, no_need_thumb: true, aeskey: aeskey.toString("hex"),
  }, botToken, 20_000);
  if (!up.ok || !up.data?.upload_param) return { error: `getuploadurl 失败 http=${up.http} ret=${up.data?.ret}` };

  const cipher = crypto.createCipheriv("aes-128-ecb", aeskey, null);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const url = `${CDN_BASE}/upload?encrypted_query_param=${encodeURIComponent(up.data.upload_param)}&filekey=${encodeURIComponent(filekey)}`;

  let lastErr = "";
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/octet-stream" },
        body: ciphertext,
        signal: AbortSignal.timeout(30_000),
      });
      if (res.status >= 400 && res.status < 500) {
        return { error: `CDN 4xx ${res.status} ${res.headers.get("x-error-message") ?? ""}` };
      }
      const param = res.headers.get("x-encrypted-param");
      if (res.status === 200 && param) {
        return {
          // aes_key 编码怪癖对齐插件实现:hex 字符串按 utf8 转 base64,不是原始 16 字节
          media: { encrypt_query_param: param, aes_key: Buffer.from(aeskey.toString("hex")).toString("base64"), encrypt_type: 1 },
          filesize,
        };
      }
      lastErr = `CDN ${res.status} ${res.headers.get("x-error-message") ?? ""}`;
    } catch (e) {
      lastErr = String(e?.message ?? e);
    }
  }
  return { error: `CDN 上传 3 次失败: ${lastErr}` };
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
  // 30s:Vercel 冷启动 + 跨洋库 + 审核 LLM,15s 会把"慢但成功"的回调误判为失败(2026-08-02 实测踩坑)
  try {
    const r = await fetch(`${MAOADAO}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-bridge-secret": SECRET },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(30_000),
    });
    return await r.json().catch(() => ({}));
  } catch (e) {
    console.error(`[bridge] 回调猫啊岛失败 ${path}: ${e.message}`);
    return null;
  }
}

// iLink item type → 媒体标注(猫只看得懂字:媒体不下载,只告诉业务侧"来了个什么")
const MEDIA_KIND = { 2: "image", 3: "voice", 4: "file", 5: "video" };

// 单用户 getupdates 循环:刷 context_token(=24h 窗口的真身)+ 全量转发文本给猫啊岛
function startWorker(openId) {
  const existing = workers.get(openId);
  if (existing) existing.stop = true;
  const w = { stop: false };
  workers.set(openId, w);
  // 从落盘游标接着拉(重启不回放已确认的消息)
  let buf = cursors[openId] || "";
  // 长轮询超时跟随服务端建议(longpolling_timeout_ms + 5s 余量,15~90s 夹逼);拿到建议前用 40s
  let pollMs = 40_000;
  console.log(`[bridge] worker 启动 ${openId}`);
  (async () => {
    while (!w.stop && creds[openId]) {
      const r = await ilinkPost("ilink/bot/getupdates", { get_updates_buf: buf }, creds[openId].botToken, pollMs);
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
      // ⚠️ 只更新内存游标,**先不落盘**:这一批全部交付业务侧之后才提交(见循环末尾)。
      // 提前提交 = 回调失败的那条消息永远拿不回来了。
      const nextBuf = r.data.get_updates_buf || buf;
      const hint = Number(r.data.longpolling_timeout_ms);
      if (hint > 0) pollMs = Math.min(90_000, Math.max(15_000, hint + 5_000));
      let batchOk = true; // 本批是否全部交付成功——有一条没成,游标就不往前走
      for (const m of r.data.msgs || []) {
        if (m.message_type === 2) continue; // bot 自己的消息
        if (m.from_user_id?.endsWith?.("@im.bot")) continue;
        // 幂等:服务端重投 / 游标回退时,同一条消息不会被消费两次
        const msgId = m.msg_id || m.msgid || m.message_id || null;
        if (alreadyHandled(openId, msgId)) continue;
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
        // 媒体消息(无文本时):标注类型转发,业务侧回「它只看得懂字」旁白——不再已读不回
        const media = text ? null : (m.item_list || []).map((i) => MEDIA_KIND[i.type]).find(Boolean) || null;

        // 首条消息 = 激活:回调猫啊岛建绑定,拿人格化握手文案回给用户(桥不写一句台词)。
        // 回调成功才置 activated——失败重试一次,再失败留给用户下一条消息自动重试(2026-08-02 超时踩坑后加固)
        if (!c.activated) {
          let res = await maoadao("/api/wechat/bind", { userId: c.userId, openId, text });
          if (!res?.ok) {
            await new Promise((s) => setTimeout(s, 3000));
            res = await maoadao("/api/wechat/bind", { userId: c.userId, openId, text });
          }
          if (res?.ok) {
            c.activated = true;
            saveCreds();
            const p = [...pending.values()].find((x) => x.openId === openId);
            if (p) p.state = "activated";
            if (res.replyText) {
              await tryTyping(c.botToken, openId, c.contextToken);
              recordSendResult(openId, await ilinkSend(c.botToken, openId, c.contextToken, res.replyText));
            }
          } else {
            // 游标不前进:这条消息下轮还会再来,不会像原先那样被静默吞掉
            console.error(`[bridge] bind 回调两次失败 ${openId},保留游标,下轮重试`);
            batchOk = false;
            break;
          }
          markHandled(openId, msgId);
          continue;
        }
        if (!text && !media) continue;
        // 全量转发:留言/退订/媒体旁白全部由猫啊岛决定,桥只送话
        const res = await maoadao("/api/wechat/inbound", { from: openId, text, media });
        if (!res) {
          // 业务侧没收到 = 这条还没算数:保留游标,下轮重来(原先直接往下走 = 消息永久丢失)
          console.error(`[bridge] inbound 回调失败 ${openId},保留游标,下轮重试`);
          batchOk = false;
          break;
        }
        markHandled(openId, msgId);
        if (res.replyText) {
          await tryTyping(c.botToken, openId, c.contextToken);
          recordSendResult(openId, await ilinkSend(c.botToken, openId, c.contextToken, res.replyText));
        }
      }
      // 全批交付成功才提交游标并落盘;有失败就原地不动,下轮重拉
      if (batchOk) {
        buf = nextBuf;
        cursors[openId] = buf;
        saveCursors();
      } else {
        await new Promise((s2) => setTimeout(s2, 3000));
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
function readBody(req, maxLen = 65536) {
  return new Promise((resolve) => {
    let b = "";
    req.on("data", (c) => { b += c; if (b.length > maxLen) req.destroy(); });
    req.on("end", () => { try { resolve(JSON.parse(b || "{}")); } catch { resolve({}); } });
  });
}

// 媒体 body 上限:base64 后约 8MB(照片压到 1080 宽后远小于此;语音 silk 更小)
const MEDIA_BODY_MAX = 8 * 1024 * 1024;
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
    const { openId, text, typing, idempotencyKey } = await readBody(req);
    const c = creds[openId];
    if (!c) return json(res, 404, { ok: false, error: "not_bound" });
    if (!c.contextToken) return json(res, 200, { ok: false, error: "no_context_token" });
    // 幂等(2026-08-07 review P1):业务侧"发出去了但响应超时"会重试同一个 key,
    // 那不该让猫在微信里把同一句话说两遍。答 duplicate,业务侧当成功处理。
    if (idempotencyKey && sentKeys.has(idempotencyKey)) {
      return json(res, 200, { ok: true, duplicate: true });
    }
    if (typing) await tryTyping(c.botToken, openId, c.contextToken);
    const r = await ilinkSend(c.botToken, openId, c.contextToken, String(text ?? "").slice(0, 4000));
    recordSendResult(openId, r);
    if (idempotencyKey && r.ok) rememberSentKey(idempotencyKey);
    return json(res, 200, { ok: r.ok, ret: r.data?.ret, http: r.http });
  }
  // 寄图:image=base64;caption 作为单独一条文本先发(对齐插件的 caption 行为)
  if (req.method === "POST" && url.pathname === "/send-image") {
    const { openId, image, caption } = await readBody(req, MEDIA_BODY_MAX);
    const c = creds[openId];
    if (!c) return json(res, 404, { ok: false, error: "not_bound" });
    if (!c.contextToken) return json(res, 200, { ok: false, error: "no_context_token" });
    const buf = Buffer.from(String(image ?? ""), "base64");
    if (buf.length < 100 || buf.length > 5 * 1024 * 1024) return json(res, 400, { ok: false, error: "bad_image" });
    const up = await uploadMediaToCdn(c.botToken, openId, buf, 1);
    if (up.error) { console.error(`[bridge] 寄图上传失败 ${openId}: ${up.error}`); return json(res, 200, { ok: false, error: up.error }); }
    if (caption) {
      await tryTyping(c.botToken, openId, c.contextToken);
      recordSendResult(openId, await ilinkSend(c.botToken, openId, c.contextToken, String(caption).slice(0, 500)));
    }
    const r = await ilinkSendItem(c.botToken, openId, c.contextToken, {
      type: 2,
      image_item: { media: up.media, mid_size: up.filesize },
    });
    recordSendResult(openId, r);
    return json(res, 200, { ok: r.ok, ret: r.data?.ret, http: r.http });
  }
  // 寄语音:audio=base64 SILK(0x02#!SILK_V3),duration 毫秒。encryptType 可覆写(排障用,默认 1)
  if (req.method === "POST" && url.pathname === "/send-voice") {
    const { openId, audio, durationMs, encryptType } = await readBody(req, MEDIA_BODY_MAX);
    const c = creds[openId];
    if (!c) return json(res, 404, { ok: false, error: "not_bound" });
    if (!c.contextToken) return json(res, 200, { ok: false, error: "no_context_token" });
    const buf = Buffer.from(String(audio ?? ""), "base64");
    if (buf.length < 50 || buf.length > 2 * 1024 * 1024) return json(res, 400, { ok: false, error: "bad_audio" });
    const up = await uploadMediaToCdn(c.botToken, openId, buf, 4); // UploadMediaType.VOICE=4(用 3=FILE 会被静默丢弃,2026-08-03 实测)
    if (up.error) { console.error(`[bridge] 寄语音上传失败 ${openId}: ${up.error}`); return json(res, 200, { ok: false, error: up.error }); }
    // 字段基线对齐 wechat-robot-go:media + duration(毫秒);file_size=密文大小(对齐图片 mid_size 的做法)
    const media = { ...up.media };
    if (encryptType !== undefined) media.encrypt_type = Number(encryptType);
    const r = await ilinkSendItem(c.botToken, openId, c.contextToken, {
      type: 3,
      voice_item: {
        media,
        duration: Number(durationMs) || 0,
        file_size: up.filesize,
      },
    });
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
