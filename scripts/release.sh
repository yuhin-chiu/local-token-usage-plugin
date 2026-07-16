#!/usr/bin/env bash
#
# 发布同步：把插件当前版本钉成看板仓库的同名 tag（version-lockstep 的发布侧）。
#
# 插件 .claude-plugin/plugin.json 的 version 是唯一版本源。发布一个插件版本时，
# 跑这个脚本给看板仓库当前 main 的 HEAD 打上 v<version> tag 并 push —— 之后
# 该插件版本的用户跑 /update 就会被 sync-code 钉到这个 commit（见 scripts/install.js）。
#
# 默认 dry-run（只显示将做什么，不动任何东西）；确认无误后加 --push 才真正打 tag + push。
#
# 用法：
#   scripts/release.sh                      # dry-run：显示将给哪个 commit 打什么 tag
#   scripts/release.sh --push               # 真正打 tag 并 push 到看板 origin
#   scripts/release.sh --dashboard=<path>   # 指定看板本地 clone（默认探测 ../local-usage）
#
set -euo pipefail

PLUGIN_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

PUSH=0
DASH=""
for a in "$@"; do
  case "$a" in
    --push) PUSH=1 ;;
    --dashboard=*) DASH="${a#--dashboard=}" ;;
    -h|--help) sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "release: 未知参数 $a" >&2; exit 2 ;;
  esac
done

die() { echo "release: $*" >&2; exit 1; }
say() { echo "  $*"; }

# --- 1. 读插件版本，派生目标 tag -------------------------------------------
VERSION="$(PLUGIN_ROOT="$PLUGIN_ROOT" node -e \
  'process.stdout.write(String(require(process.env.PLUGIN_ROOT + "/.claude-plugin/plugin.json").version || ""))')"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+ ]] || die "插件 version 非法或缺失：'$VERSION'"
TAG="v$VERSION"

# --- 2. 定位看板本地 clone --------------------------------------------------
if [[ -z "$DASH" ]]; then
  for c in "$PLUGIN_ROOT/../local-usage" "$PLUGIN_ROOT/../local-token-usage" \
           "$HOME/local-usage" "$HOME/local-token-usage"; do
    if [[ -d "$c/.git" ]]; then DASH="$(cd "$c" && pwd)"; break; fi
  done
fi
[[ -n "$DASH" && -d "$DASH/.git" ]] || \
  die "找不到看板本地 clone，请用 --dashboard=<path> 指定"

# --- 3. 校验插件仓库：main + 干净 + 与 origin 同步 ---------------------------
pg() { git -C "$PLUGIN_ROOT" "$@"; }
[[ "$(pg branch --show-current)" == "main" ]] || die "插件不在 main 分支"
[[ -z "$(pg status --porcelain)" ]] || die "插件工作区有未提交改动，先 commit"
pg fetch -q origin main || die "插件 fetch 失败（离线？）"
[[ "$(pg rev-parse HEAD)" == "$(pg rev-parse origin/main)" ]] || \
  die "插件 main 与 origin/main 不一致，先 push 插件（tag 必须指向已发布的插件版本）"

# --- 4. 校验看板仓库：main + 干净 + 与 origin 同步 ---------------------------
dg() { git -C "$DASH" "$@"; }
[[ "$(dg branch --show-current)" == "main" ]] || die "看板不在 main 分支：$DASH"
[[ -z "$(dg status --porcelain)" ]] || die "看板工作区有未提交改动：$DASH"
dg fetch -q origin main || die "看板 fetch 失败（离线？）"
[[ "$(dg rev-parse HEAD)" == "$(dg rev-parse origin/main)" ]] || \
  die "看板 main 与 origin/main 不一致，先在看板同步 main：$DASH"

# --- 5. tag 冲突检查：已存在则绝不覆盖 --------------------------------------
if [[ -n "$(dg tag -l "$TAG")" ]]; then
  die "看板本地已存在 tag $TAG —— 已发布的 tag 不移动。如需重发请人工处理。"
fi
if [[ -n "$(dg ls-remote --tags origin "refs/tags/$TAG" 2>/dev/null)" ]]; then
  die "看板 origin 已存在 tag $TAG —— 已发布的 tag 不移动。"
fi

# --- 6. 展示计划 ------------------------------------------------------------
TARGET_COMMIT="$(dg rev-parse HEAD)"
echo
echo "版本锁定发布计划："
say "插件版本   : $VERSION"
say "目标 tag   : $TAG"
say "看板 clone : $DASH"
say "钉到 commit: $(dg log --oneline -1 HEAD)"
echo

if [[ "$PUSH" -ne 1 ]]; then
  echo "（dry-run）未做任何改动。确认无误后加 --push 执行："
  echo "  scripts/release.sh --push"
  exit 0
fi

# --- 7. 真正打 tag + push --------------------------------------------------
dg tag -a "$TAG" -m "Release $TAG (plugin $VERSION)" "$TARGET_COMMIT"
dg push origin "refs/tags/$TAG:refs/tags/$TAG"

# --- 8. 复核：远程确实有了这个 tag，且指向目标 commit -----------------------
REMOTE_LINE="$(dg ls-remote --tags origin "refs/tags/$TAG")"
[[ -n "$REMOTE_LINE" ]] || die "push 后在 origin 未查到 $TAG，请人工核查"
echo
echo "✓ 已发布 $TAG → $DASH 的 $(dg rev-parse --short "$TARGET_COMMIT")"
echo "  远程：$REMOTE_LINE"
echo "  之后插件 $VERSION 用户跑 /update 会被 sync-code 钉到此 commit。"
