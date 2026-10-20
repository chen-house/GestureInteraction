#!/bin/bash
# 双击即可：在本文件所在目录起一个本地服务器，并打开页面。
# 摄像头必须走 http://localhost，file:// 直接打开拿不到权限。
cd "$(dirname "$0")"
PORT=4173
if ! curl -s -o /dev/null "http://localhost:$PORT/play.html"; then
  python3 -m http.server $PORT >/dev/null 2>&1 &
  sleep 1
fi
open "http://localhost:$PORT/play.html"
echo "服务已在 http://localhost:$PORT 运行。关掉这个终端窗口就会停止。"
