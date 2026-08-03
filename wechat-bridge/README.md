# 猫啊岛微信桥(iLink)

> **已部署(2026-08-02)**:47.84.8.167(新加坡 ECS,i-t4n7n557ll7e8ia2pi16)`/opt/maoadao-bridge`,
> systemd 单元 `maoadao-bridge`,监听 127.0.0.1:8788;公网入口 `https://bridge.stocktell.me/maoadao`
> (复用 stocktell 桥的宝塔 nginx+TLS,路径反代,配置在 `/www/server/panel/vhost/nginx/proxy/bridge.stocktell.me/maoadao.conf`)。
> Vercel 已配 `WECHAT_BRIDGE_URL` / `WECHAT_BRIDGE_SECRET`,通道已点亮。
> 运维:`systemctl status maoadao-bridge` / `journalctl -u maoadao-bridge -n 100`;
> 改桥代码后:`scp wechat-bridge/server.mjs root@47.84.8.167:/opt/maoadao-bridge/ && ssh root@47.84.8.167 systemctl restart maoadao-bridge`

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

## 外部依赖与协议参考(对照 `@tencent-weixin/openclaw-weixin` 官方文档,2026-08-03 核对)

桥本身**零 npm 依赖**(纯 Node 内置 http/fs/crypto)——真正的外部依赖是腾讯 iLink 的 HTTP 协议。
官方文档在 npm 包 readme 里(`npm view @tencent-weixin/openclaw-weixin readme`),以下是与桥有关的全部要点。

**版本线**:1.0.x 已进 `legacy` 维护线(活跃线 2.x,当前 2.4.6)。核对过 1.0.2 与 2.4.6 的
「后端 API 协议」章节逐字一致——协议未漂移,桥暂不用动;但协议若将来升级只会发在 2.x,升级前先 diff 两版 readme。

**通用请求头**(官方规范,桥已按此实现于 `ihdr()`):

| Header | 值 |
| --- | --- |
| `AuthorizationType` | 固定 `ilink_bot_token` |
| `Authorization` | `Bearer <bot_token>` |
| `X-WECHAT-UIN` | 随机 uint32 的 base64(防重放) |

**端点对照**(官方文档只写了前五个;二维码两个端点**不在官方文档里**,来自 `wechat-ilink-demo`/stocktell 实测——协议升级时最容易碎的就是这两个):

| 端点 | 桥的用法 | 文档背书 |
| --- | --- | --- |
| `ilink/bot/getupdates` | 单用户长轮询 worker,超时跟随服务端 `longpolling_timeout_ms` 建议(+5s 余量,15~90s 夹逼,默认 40s) | ✅ 官方 |
| `ilink/bot/sendmessage` | 只发文本(type 1),`message_state=2`(FINISH) | ✅ 官方 |
| `ilink/bot/getconfig` | 拿 `typing_ticket`(缓存) | ✅ 官方 |
| `ilink/bot/sendtyping` | 只发 `status=1`(正在输入),从不发 2(取消) | ✅ 官方 |
| `ilink/bot/getuploadurl` | **未使用**(桥不支持媒体) | ✅ 官方 |
| `ilink/bot/get_bot_qrcode?bot_type=3` | 出绑定二维码 | ⚠️ 仅实测 |
| `ilink/bot/get_qrcode_status?qrcode=` | 轮询扫码,拿 `bot_token`/`ilink_user_id` | ⚠️ 仅实测 |

**关键枚举**(官方定义,桥代码里是魔法数字):
`message_type` 1=USER 2=BOT(worker 靠它过滤自己的消息);`message_state` 0=NEW 1=GENERATING 2=FINISH;
`item_list[].type` 1=TEXT 2=IMAGE 3=VOICE 4=FILE 5=VIDEO;`sendtyping.status` 1=正在输入 2=取消。

**已按官方文档采用的**(2026-08-03 落地):

- `longpolling_timeout_ms`:worker 的长轮询超时跟随服务端建议(+5s 余量,15~90s 夹逼);
- `bot_agent`:出站请求 `base_info` 里声明 `maoadao-bridge/0.1`(官方仅说"每条出站请求携带",未写字段位置,
  与 channel_version 同放 base_info;该字段仅观测不参与鉴权,放错位置也只是被忽略);
- 媒体消息(图片/语音/文件/视频):桥不下载媒体,标注 kind 转发给 `/api/wechat/inbound {media}`,
  业务侧回「它只看得懂字」旁白体轻响应(不占一来一回、不落留言)——不再已读不回。
  **真正收发媒体**(CDN + AES-128-ECB + `getuploadurl`)仍未做,要做时读官方 readme「CDN 上传流程」。

**官方文档没写、纯靠实测的**(即下面"已知坑"的性质——这些没有任何官方背书,风控/协议调整可能说变就变):
24h 窗口、`sendmessage` 静默丢弃、隔夜 `context_token`、`-14` 暂停 60 分钟策略、二维码绑定流程。

## 已知坑(前人验尸报告)

- `sendmessage` 成功与**静默丢弃**都返回空对象——不能靠响应判断窗口是否有效,业务侧自估 24h 窗口;
- `context_token` 必须用户先发消息才有;隔夜 token 在窗口内可用(stocktell 实测);
- 错误码 `-14` = 会话过期 → 暂停该用户 60 分钟防风控,用户需重新扫码;
- 每条消息 `client_id` 全局唯一;
- 桥是明文 HTTP 的单点:Vercel 调桥必带 10s 超时,业务侧熔断已备(doc/13 T8)。
