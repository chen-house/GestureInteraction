#!/bin/bash
# 双击即可：在本文件所在目录起一个本地服务器，并打开页面。
# 摄像头必须走 http://localhost，file:// 直接打开拿不到权限。
cd "$(dirname "$0")"
PORT=4173
URL="http://localhost:$PORT/play.html"

alive() { curl -s -o /dev/null -w '%{http_code}' --max-time 2 "$URL" 2>/dev/null | grep -q '^200$'; }

if alive; then
  echo "服务器已经在跑了。"
else
  echo "起服务器…"
  # nohup + disown：关掉这个终端窗口服务器也不会死。
  nohup python3 -m http.server "$PORT" >/dev/null 2>&1 &
  disown 2>/dev/null
  # 等它真的能应答，最多等 10 秒 —— 固定 sleep 1 在机器慢的时候不够
  for i in $(seq 1 20); do
    alive && break
    sleep 0.5
  done
fi

if alive; then
  VER=$(curl -s "$URL" | grep -o '<title>[^<]*</title>' | sed 's/<[^>]*>//g')
  echo "✓ $VER  已就绪"
  echo "  $URL"
  open "$URL"
  echo
  echo "这个窗口现在可以关掉，服务器会继续跑。"
  echo "要停掉服务器：pkill -f 'http.server $PORT'"
else
  echo "✗ 起不来。$PORT 端口可能被别的程序占着。"
  echo "  看一下是谁占着： lsof -i :$PORT"
fi
echo
read -p "按回车关闭"
