#!/bin/zsh
# maoadao.com 占位页 HTTPS 证书续期：Let's Encrypt 签发 + 绑定到 OSS 自定义域名
# 证书 90 天有效，到期前跑一次（acme.sh 会记住上次签发时间，未到续期窗口会跳过）
set -e

export Ali_Key=$(grep -o '"access_key_id": "[^"]*"' ~/.aliyun/config.json | cut -d'"' -f4)
export Ali_Secret=$(grep -o '"access_key_secret": "[^"]*"' ~/.aliyun/config.json | cut -d'"' -f4)

acme.sh --renew --dns dns_ali -d maoadao.com -d www.maoadao.com --server letsencrypt --home ~/.acme.sh || true

CERT=$(cat ~/.acme.sh/maoadao.com_ecc/fullchain.cer)
KEY=$(cat ~/.acme.sh/maoadao.com_ecc/maoadao.com.key)

for D in maoadao.com www.maoadao.com; do
  XML="<BucketCnameConfiguration><Cname><Domain>$D</Domain><CertificateConfiguration><Certificate>$CERT</Certificate><PrivateKey>$KEY</PrivateKey><Force>true</Force></CertificateConfiguration></Cname></BucketCnameConfiguration>"
  TMP=$(mktemp)
  print -r -- "$XML" > "$TMP"
  ossutil api put-cname --bucket maoadao-site --region cn-hangzhou \
    --cname-configuration "file://$TMP" -i "$Ali_Key" -k "$Ali_Secret"
  rm -f "$TMP"
  echo "bound: $D"
done
