#!/bin/bash
# 双击运行。把这个文件夹推到你自己的 GitHub 仓库。
# 令牌只在你这台机器上，不会出现在聊天里，也不会被提交进仓库。
cd "$(dirname "$0")"
REPO="GestureInteraction"
[ -f ".github-publish/config" ] && REPO=$(grep '^repo=' .github-publish/config | cut -d= -f2 || echo "GestureInteraction")
TOKDIR=".github-publish"
TOKFILE="$TOKDIR/token"

echo "══════════════════════════════════════════════"
echo "  把「手势乐器」推到 GitHub"
echo "══════════════════════════════════════════════"
echo

if [ ! -s "$TOKFILE" ]; then
  cat <<'HOWTO'
第一次跑，需要两样东西。两个网页我这就给你打开。

【一】建一个空仓库   https://github.com/new
    Repository name : GestureInteraction
    Public / Private:
        Public  → 可以开 GitHub Pages，等于这把琴有个网址，
                  https 下摄像头能用，换任何电脑都不用起本地服务器。
        Private → 免费账号开不了 Pages，只能当版本备份。
    下面三个勾（README / .gitignore / license）一个都不要勾，
    本地已经有了，勾了会冲突。
    建完这一页先别关。

【二】生成一个令牌   https://github.com/settings/personal-access-tokens/new
    Token name        : gesture-push
    Expiration        : 90 days
    Repository access : Only select repositories → 选 GestureInteraction
    Permissions → Repository permissions：
        Contents  : Read and write     ← 必须
        Pages     : Read and write     ← 想让我顺手开 Pages 就给，不给也行
        其余全部   : No access
    点最下面 Generate token，把那串 github_pat_... 复制下来。

HOWTO
  open "https://github.com/new" 2>/dev/null
  sleep 1
  open "https://github.com/settings/personal-access-tokens/new" 2>/dev/null
  echo "──────────────────────────────────────────────"
  printf "把令牌粘到这里，然后回车（屏幕上不会显示）： "
  read -s TOKEN
  echo
  echo
  if [ -z "$TOKEN" ]; then echo "没收到令牌，退出。"; echo; read -p "按回车关闭"; exit 1; fi
  mkdir -p "$TOKDIR"
  printf '%s' "$TOKEN" > "$TOKFILE"
  chmod 600 "$TOKFILE"
  echo "令牌已存到 $TOKDIR/（这个文件夹在 .gitignore 里，永远不会被提交）"
  echo
else
  TOKEN=$(cat "$TOKFILE")
  echo "用已经存好的令牌。"
  echo
fi

api() { curl -s -H "Authorization: Bearer $TOKEN" -H "Accept: application/vnd.github+json" "$@"; }
jq1() { python3 -c "import sys,json
try: d=json.load(sys.stdin)
except Exception: sys.exit(1)
v=d
for k in '$1'.split('.'):
    if isinstance(v,dict): v=v.get(k)
print(v if v is not None else '')"; }

echo "→ 验证令牌…"
USER=$(api https://api.github.com/user | jq1 login)
if [ -z "$USER" ] && [ -f "$TOKDIR/config" ]; then
  USER=$(grep '^owner=' "$TOKDIR/config" | cut -d= -f2)
  [ -n "$USER" ] && echo "   /user 读不到（细粒度令牌常见），用 config 里记的账号。"
fi
if [ -z "$USER" ]; then
  printf "   读不到账号名。手动输入你的 GitHub 用户名： "
  read USER
fi
if [ -z "$USER" ]; then echo "   没有账号名，退不下去了。"; echo; read -p "按回车关闭"; exit 1; fi
echo "   账号：$USER"

echo "→ 找仓库 $USER/$REPO …"
FULL=$(api "https://api.github.com/repos/$USER/$REPO" | jq1 full_name)
if [ -z "$FULL" ]; then
  echo "   没找到。试着建一个（公开）…"
  FULL=$(api -X POST https://api.github.com/user/repos \
    -d "{\"name\":\"$REPO\",\"description\":\"摄像头手势乐器：右手特雷门琴 + 左手桑巴打击乐\",\"private\":false}" | jq1 full_name)
  if [ -z "$FULL" ]; then
    echo "   建不了（细粒度令牌通常没有建仓库的权限，这很正常）。"
    echo "   请自己到 https://github.com/new 建一个叫 $REPO 的空仓库，"
    echo "   三个勾都别勾，然后再双击这个文件一次。"
    open "https://github.com/new" 2>/dev/null
    echo; read -p "按回车关闭"; exit 1
  fi
fi
echo "   仓库：$FULL"

echo "→ 推送…"
git remote remove origin 2>/dev/null
git remote add origin "https://github.com/$USER/$REPO.git"
# 令牌只在这一条命令里出现，不写进 .git/config
PUSHOUT=$(git push "https://x-access-token:$TOKEN@github.com/$USER/$REPO.git" main 2>&1)
PUSHRC=$?
echo "$PUSHOUT" | sed "s|$TOKEN|***|g" | sed 's/^/   /'
if [ $PUSHRC -ne 0 ]; then
  echo "   推送失败，上面有原因。"
  echo; read -p "按回车关闭"; exit 1
fi
git fetch -q origin 2>/dev/null
git branch --set-upstream-to=origin/main main >/dev/null 2>&1
echo "   推送完成。"

PRIVATE=$(api "https://api.github.com/repos/$USER/$REPO" | jq1 private)
echo
if [ "$PRIVATE" = "True" ] || [ "$PRIVATE" = "true" ]; then
  echo "仓库是私有的，免费账号开不了 Pages。"
  echo "想要网址的话，到下面这页把它改成 Public，再跑一次这个文件："
  echo "   https://github.com/$USER/$REPO/settings"
else
  echo "→ 打开 GitHub Pages…"
  RES=$(api -X POST "https://api.github.com/repos/$USER/$REPO/pages" \
      -d '{"source":{"branch":"main","path":"/"}}' | jq1 html_url)
  if [ -n "$RES" ]; then
    echo "   已开。网址（第一次大约等 1 分钟才生效）："
    echo "   ${RES}play.html"
  else
    echo "   自动开不了（令牌没给 Pages 权限，或者已经开过了）。"
    echo "   手动点一下：https://github.com/$USER/$REPO/settings/pages"
    echo "   Source 选 Deploy from a branch，分支 main，目录 / (root)。"
    echo "   开好之后网址是： https://$USER.github.io/$REPO/play.html"
  fi
fi

echo
echo "══════════════════════════════════════════════"
echo "  仓库： https://github.com/$USER/$REPO"
echo "  以后再改了东西，就跑一次这个文件（或者让我来）。"
echo "══════════════════════════════════════════════"
echo
read -p "按回车关闭"
