#!/usr/bin/env bash
# 七仔 D0 呼吸循环批产（doc2.0/15 §五 P4，2026-08-05 S4 试产过闸后全量）
# 方法：seedling quality 首尾帧 = 同一张定稿分镜 → 无缝微动循环（循环点无跳变）
# 规格：与 s4-loop 试产一致——5s / 720p / 1:1 / 静音（不开 --audio）/ 目标 ≤3MB
# 提示词纪律（试产经验）：只写微动（呼吸/耳/尾/环境），镜头锁死，身份四样
#（花纹/异瞳/短尾/爪型）全程稳定；位移类动画空间（走过/转头迈步）一律降为
# 原地微动——首尾同帧下位移会被强行拉回，反而出 morph。
# 注意：macOS 自带 bash 3.2，无关联数组——用 case 映射。
# 用法：bash scripts/qizai-loops.sh [s2 s3 ...]（无参=全量 7 条,s4 已有）
set -uo pipefail
cd "$(dirname "$0")/.."

SHOTS_DIR="assets/qizai/shots"
STABLE="手绘绘本画风与原图完全一致，镜头完全固定不动，构图不变。猫的橘白花纹、异瞳眼色（一琥珀黄一浅蓝）、极短的绒球尾、爪型全程稳定不变形。动作极轻微缓慢，适合无缝循环播放。无文字无水印。"

prompt_for() {
  case "$1" in
    s2)  echo "微风掀动报摊最上面那份报纸的一角，公告栏上的告示纸轻轻颤动，那只猫爪把报纸轻轻压好。${STABLE}" ;;
    s3)  echo "黄昏海岛大远景保持安静：远处小路上的猫极缓慢地挪了半步，坡顶小屋窗口的灯光轻微闪烁，海面波光微动。猫都很小很远，不出现任何近景。${STABLE}" ;;
    s5)  echo "它蹲坐在收藏排前，伸出的前爪极轻地把面前那件小收藏挪正了一点，短尾绒球轻轻晃动，胸口随呼吸微微起伏。收藏排里其他小物件保持原位不动。${STABLE}" ;;
    s6a) echo "它抬眼看向画面外偏下方，缓慢眨了一次眼，一只耳朵轻轻转动，胸口随呼吸微微起伏。视线保持偏离镜头轴线，神态平静不讨好。${STABLE}" ;;
    s6b) echo "它保持行走的背影姿态，身体随步伐极轻微起伏，翘起的短尾绒球一翘一翘，嘴里叼着的小瓶盖保持稳定。不回头，不离开画面。${STABLE}" ;;
    s8)  echo "空小屋门前一片安静：门上空白的小木门牌被风吹得极轻微地晃动，它站在原地，尾巴尖轻轻动了动，胸口随呼吸微微起伏。门保持关着，台阶上的瓶盖不动。${STABLE}" ;;
    s10) echo "它停在小屋前的侧影保持原地，头朝门口瓶盖的方向微微转动了一下，耳朵动了动，尾巴尖轻晃，胸口随呼吸起伏。门保持关着，瓶盖在台阶上不动。${STABLE}" ;;
    *)   echo "" ;;
  esac
}

LIST=("$@")
[ ${#LIST[@]} -eq 0 ] && LIST=(s2 s3 s5 s6a s6b s8 s10)

IDS=()
TIDS=()
for id in "${LIST[@]}"; do
  img="$SHOTS_DIR/$id.jpg"
  [ -f "$img" ] || { echo "[skip] $img 不存在"; continue; }
  p=$(prompt_for "$id")
  [ -n "$p" ] || { echo "[skip] $id 无提示词"; continue; }
  echo "[submit] $id ..."
  out=$(seedling task create \
    --model quality --resolution 720p --ratio 1:1 --duration 5 \
    --first-frame "$img" --last-frame "$img" \
    --prompt "$p" --json 2>&1)
  tid=$(printf '%s' "$out" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{const j=JSON.parse(s.slice(s.indexOf('{')));console.log(j.taskId||j.id||'')}catch{console.log('')}})")
  if [ -z "$tid" ]; then echo "[fail] $id 提交失败: $out"; continue; fi
  IDS+=("$id")
  TIDS+=("$tid")
  echo "[ok] $id -> $tid"
done

fail=0
i=0
while [ $i -lt ${#IDS[@]} ]; do
  id="${IDS[$i]}"
  tid="${TIDS[$i]}"
  i=$((i + 1))
  echo "[wait] $id ($tid) ..."
  if ! seedling task wait "$tid" --timeout 900; then echo "[fail] $id 生成失败/超时"; fail=1; continue; fi
  if ! seedling task download "$tid" --output "$SHOTS_DIR/$id-loop.mp4"; then echo "[fail] $id 下载失败"; fail=1; continue; fi
  sz=$(stat -f%z "$SHOTS_DIR/$id-loop.mp4" 2>/dev/null || echo 0)
  echo "[done] $id-loop.mp4 $((sz/1024))KB"
  [ "$sz" -gt 3145728 ] && echo "[warn] $id 超 3MB 预算，考虑压制"
done
exit $fail
