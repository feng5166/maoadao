# 猫啊岛微信桥(iLink)

腾讯官方 iLink 个人号 Bot 协议直连(`ilinkai.weixin.qq.com`),fork 自 stocktell `ilink-bridge`,
协议细节对齐 `wechat-ilink-demo` / `@tencent-weixin/openclaw-weixin` 1.0.2。

与 stocktell 桥的三个差异(doc/11 哑管道红线):
1. **全量转发**:用户每条文本 POST 给猫啊岛 `/api/wechat/inbound`,桥不解释任何指令(退订也由业务侧判);
2. **零台词**:激活回调 `/api/wechat/bind` 由猫啊岛返回人格化握手文案,桥只负责送;
3. **typing 先行**:回复前"正在输入"600ms(猫在想),失败静默。

## 部署(47.84.8.167,与 stocktell 桥同机不同端口)

```bash
# 1. 上传本目录到服务器
scp -r wechat-bridge root@47.84.8.167:/opt/maoadao-bridge

# 2. systemd 单元 /etc/systemd/system/maoadao-bridge.service:
#    [Unit]
#    Description=maoadao wechat bridge (iLink)
#    After=network.target
#    [Service]
#    WorkingDirectory=/opt/maoadao-bridge
#    Environment=BRIDGE_SECRET=<与 Vercel WECHAT_BRIDGE_SECRET 同值>
#    Environment=MAOADAO_BASE=https://maoadao.vercel.app
#    Environment=PORT=8788
#    ExecStart=/usr/bin/node server.mjs
#    Restart=always
#    [Install]
#    WantedBy=multi-user.target

systemctl daemon-reload && systemctl enable --now maoadao-bridge
curl -s http://127.0.0.1:8788/health   # {"ok":true,...}

# 3. 宝塔 nginx 反代(参照 bridge.stocktell.me 同款):
#    新子域(如 bridge.maoadao.com 或临时用 IP+端口内网穿透)→ 127.0.0.1:8788,Let's Encrypt 证书
#    Vercel 侧设 WECHAT_BRIDGE_URL=https://<反代域名>
```

## 与 Vercel 的对接

| Vercel 环境变量 | 值 |
| --- | --- |
| `WECHAT_BRIDGE_URL` | 桥的公网地址(nginx 反代后) |
| `WECHAT_BRIDGE_SECRET` | 与桥 `BRIDGE_SECRET` 同值(双向:Vercel 调桥、桥回调 Vercel 都用它) |

桥 → 猫啊岛的回调(头 `x-bridge-secret`):
- `POST /api/wechat/bind {userId, openId, text}` → `{replyText}`(首条消息激活;text=用户对猫说的第一句话)
- `POST /api/wechat/inbound {from, text}` → `{replyText}`(此后每条消息)
- `POST /api/wechat/unbind {openId}`(连续 3 次硬失败判失效)

## 已知坑(前人验尸报告)

- `sendmessage` 成功与**静默丢弃**都返回空对象——不能靠响应判断窗口是否有效,业务侧自估 24h 窗口;
- `context_token` 必须用户先发消息才有;隔夜 token 在窗口内可用(stocktell 实测);
- 错误码 `-14` = 会话过期 → 暂停该用户 60 分钟防风控,用户需重新扫码;
- 每条消息 `client_id` 全局唯一;
- 桥是明文 HTTP 的单点:Vercel 调桥必带 10s 超时,业务侧熔断已备(doc/13 T8)。
