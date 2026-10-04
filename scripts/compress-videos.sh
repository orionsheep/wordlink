#!/bin/bash
# 原地压缩 public/videos 下的 mp4：原片备份到 originals/（若尚无同名备份），
# 输出覆盖原文件名。带声音轨的保留 aac 96k，纯背景视频去音轨。
set -u
cd "$(dirname "$0")/../public/videos"

# name|crf|audio(keep|strip)
SPECS=(
  "ambient-reading-demo.mp4|28|keep"
  "ambient-words-demo.mp4|28|keep"
  "immersive-graph-demo.mp4|28|keep"
  "featured-demo.mp4|28|keep"
  "veo3-seamless-loop.mp4|30|strip"
  "veo3-blackhole-seamless.mp4|30|strip"
  "cosmic-universe.mp4|30|strip"
  "spring.mp4|30|strip"
  "summer.mp4|30|strip"
  "autumn.mp4|30|strip"
  "winter.mp4|30|strip"
)

mkdir -p originals posters _tmp

for spec in "${SPECS[@]}"; do
  IFS='|' read -r f crf audio <<< "$spec"
  [ -f "$f" ] || { echo "SKIP missing $f"; continue; }
  before=$(stat -f%z "$f")
  # 备份原片
  if [ ! -f "originals/$f" ]; then cp "$f" "originals/$f"; fi
  if [ "$audio" = "keep" ]; then
    AOPTS=(-c:a aac -b:a 96k)
  else
    AOPTS=(-an)
  fi
  ffmpeg -y -hide_banner -loglevel error -i "$f" \
    -c:v libx264 -crf "$crf" -preset medium -pix_fmt yuv420p \
    -movflags +faststart "${AOPTS[@]}" "_tmp/$f" </dev/null \
    && mv "_tmp/$f" "$f" \
    && after=$(stat -f%z "$f") \
    && echo "OK $f: $((before/1048576))MB -> $((after/1048576))MB"
done

# 为没有 poster 的演示视频生成首帧海报
for f in ambient-reading-demo ambient-words-demo immersive-graph-demo featured-demo; do
  [ -f "posters/$f.jpg" ] || ffmpeg -y -hide_banner -loglevel error \
    -i "$f.mp4" -vf "select=eq(n\,0),scale=1280:-2" -frames:v 1 -q:v 4 "posters/$f.jpg" </dev/null \
    && echo "poster posters/$f.jpg"
done

rmdir _tmp 2>/dev/null
echo "=== DONE ==="
du -sh .
