#!/bin/bash
# 双击运行。把 7.8MB 的手部识别模型下到 lib/，之后这个程序完全不需要联网。
cd "$(dirname "$0")"
DEST="lib/hand_landmarker.task"
TMP="lib/.model.part"

echo "══════════════════════════════════════════════"
echo "  下载手部识别模型（约 7.8MB，只需要跑这一次）"
echo "══════════════════════════════════════════════"
echo

if [ -s "$DEST" ]; then
  SZ=$(wc -c < "$DEST" | tr -d ' ')
  if [ "$SZ" -gt 5000000 ]; then
    echo "已经有了：$DEST（$SZ 字节）"
    echo "要重下的话，先把它删掉再跑一次。"
    echo; read -p "按回车关闭"; exit 0
  fi
  echo "已有文件只有 $SZ 字节，不完整，重下。"
  rm -f "$DEST"
fi

URLS="https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task
https://storage.googleapis.com/mediapipe-assets/hand_landmarker.task"

OK=0
while IFS= read -r U; do
  [ -z "$U" ] && continue
  echo "→ 试 ${U#https://}"
  rm -f "$TMP"
  if curl -fL --connect-timeout 10 --max-time 300 -o "$TMP" "$U"; then
    SZ=$(wc -c < "$TMP" | tr -d ' ')
    if [ "$SZ" -gt 5000000 ]; then
      mv "$TMP" "$DEST"; OK=1
      echo "   拿到 $SZ 字节"
      break
    else
      echo "   只有 $SZ 字节，不是模型（多半是代理返回的错误页），换下一个"
    fi
  else
    echo "   连不上"
  fi
done <<< "$URLS"
rm -f "$TMP"

echo
if [ "$OK" = "1" ]; then
  echo "══════════════════════════════════════════════"
  echo "  好了。现在这个程序完全不联网也能跑。"
  echo "  双击 启动.command 打开，底下那行状态字应该"
  echo "  一闪就过去，不再出现「取模型 …」。"
  echo "══════════════════════════════════════════════"
  echo
  echo "（要把它也传到 GitHub 的话，跟我说一声，或者跑 推到GitHub.command）"
else
  echo "两个地址都没下下来。"
  echo "这台机器可能也连不到 storage.googleapis.com。"
  echo "可以换个网络再试，或者在浏览器里直接打开下面这个地址下载，"
  echo "然后把文件改名成 hand_landmarker.task 放进 lib/ 文件夹："
  echo "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task"
fi
echo
read -p "按回车关闭"
