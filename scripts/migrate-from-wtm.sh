#!/bin/sh
# migrate-from-wtm.sh — 旧名 wtm（web-tn-multiplexer）の手元の状態を、Sodashitsu（soda・sodactl）の置き場へ一度だけ移す。
#
# 使い方: sh scripts/migrate-from-wtm.sh [--dry-run]
# 手順と注意は docs/migrate-from-wtm.md。アプリ（soda・sodactl）は古い名前を読まないので、移行はこのスクリプトだけが行う。
#
# 構成（20260927-rename-sodashitsu の design「移行スクリプトの構成」）:
#   1. 検査の段（PHASE=check）: 読むだけ。古いサーバが動いていないか・移す元がある項目の移動先とバックアップが無いかを調べ、
#      行う操作を数える。断る理由があれば全部を出して終了コード 1（何も変えていない）。
#   2. 実行の段（PHASE=run）: 同じ項目の関数をもう一度呼び、今度は操作を行う。
# 終了コード: 0 成功・予定の表示・移すものが無い / 1 断った（何も変えていない）/ 2 使い方の誤り / 3 実行の途中で失敗した
set -u

PROG=migrate-from-wtm
BAK=.bak-wtm-migration

usage() {
  cat <<'EOF'
使い方: sh scripts/migrate-from-wtm.sh [--dry-run]

旧名 wtm（web-tn-multiplexer）の手元の状態を Sodashitsu（soda）の置き場へ一度だけ移します。
  - 状態ディレクトリ   ${XDG_STATE_HOME:-~/.local/state}/web-tn-multiplexer → .../sodashitsu
                       （独自コマンド commands.json の中の WTM_ → SODA_ も）
                       （中の wtm.lock → soda.lock、clipboard-images/wtm-image-* → soda-image-*。sessions/*/ も）
  - CLI のキャッシュ   ~/.wtmctl → ~/.sodactl（キャッシュした cookie の名前も）
  - worktree の置き場  ~/.wtm/worktrees → ~/.sodashitsu/worktrees（各 worktree で git worktree repair。保存したレイアウトのパスも）
  - エージェントの hook（claude・codex・cursor・copilot・devin・droid〔~/.factory〕・grok・qwen）の wtm-agent-report → soda-agent-report
    （書き換える前のファイルは <ファイル>.bak-wtm-migration に残す）
古い wtm serve が動いているとき・移動先が既にあるときは、何も変えずに終了コード 1 で断ります。

  --dry-run   行う予定の操作を表示するだけで、何も変えない
  -h, --help  この説明を表示する
EOF
}

DRY_RUN=0
while [ $# -gt 0 ]; do
  case $1 in
    --dry-run) DRY_RUN=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      printf '%s: 不明な引数です: %s\n' "$PROG" "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

if [ -z "${HOME:-}" ]; then
  printf '%s: HOME が設定されていません\n' "$PROG" >&2
  exit 2
fi

SCRIPT_DIR=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd) || exit 2
HOOK_ASSET=$SCRIPT_DIR/../packages/server/assets/agent-hook-report.cjs

# 末尾の / を落とす（アプリの defaultWorktreeRoot も落としてから連結する。落とさないと保存したレイアウトの中のパスと一致しない）。
strip_slash() {
  p=$1
  while [ "${p%/}" != "$p" ]; do p=${p%/}; done
  printf '%s' "$p"
}
H=$(strip_slash "$HOME")

# 場所（アプリと同じ規則。packages/server/src/config.ts の defaultStateDir・agent/AgentIntegrationInstaller.ts の HOOK_SPECS）。
STATE_BASE=$(strip_slash "${XDG_STATE_HOME:-$H/.local/state}")
OLD_STATE=$STATE_BASE/web-tn-multiplexer
NEW_STATE=$STATE_BASE/sodashitsu
OLD_CLI=$H/.wtmctl
NEW_CLI=$H/.sodactl
OLD_WT_PARENT=$H/.wtm
OLD_WT=$OLD_WT_PARENT/worktrees
NEW_WT_PARENT=$H/.sodashitsu
NEW_WT=$NEW_WT_PARENT/worktrees
CLAUDE_DIR=${CLAUDE_CONFIG_DIR:-$H/.claude}
CODEX_DIR=${CODEX_HOME:-$H/.codex}
DEVIN_DIR=${DEVIN_CONFIG_DIR:-$H/.devin}
MY_HOST=$(uname -n)

PHASE=check
COUNT=0
PLAN=''
REFUSALS=''
NOTES=''
WARNED=0
HAS_STATE=0
HAS_CLI=0
HAS_WT=0
NEED_ASSET=0

refuse() {
  REFUSALS="$REFUSALS$PROG: $1
"
}

# 検査の段で、移動先・バックアップの名前が既に無いことを確かめる（上書きしない）。
need_absent() {
  [ "$PHASE" = check ] || return 0
  if [ -e "$1" ] || [ -L "$1" ]; then
    refuse "移動先が既にあります（$2）: $1"
  fi
}

# 1 つの操作。検査の段では数えて予定に積むだけ、実行の段では行う。
act() {
  desc=$1
  shift
  COUNT=$((COUNT + 1))
  if [ "$PHASE" = check ]; then
    PLAN="$PLAN予定: $desc
"
    return 0
  fi
  if "$@"; then
    printf '済み: %s\n' "$desc"
  else
    printf '失敗: %s\n' "$desc" >&2
    printf '%s: 移行は途中で止まりました。上の「済み:」までは行っています（巻き戻していません）。\n' "$PROG" >&2
    exit 3
  fi
}

# 失敗しても続ける操作（git worktree repair）。失敗は警告にして、最後に終了コード 3。
act_warn() {
  desc=$1
  shift
  COUNT=$((COUNT + 1))
  if [ "$PHASE" = check ]; then
    PLAN="$PLAN予定: $desc
"
    return 0
  fi
  if "$@"; then
    printf '済み: %s\n' "$desc"
  else
    printf '警告: 失敗しました（手で実行し直してください）: %s\n' "$desc" >&2
    WARNED=1
  fi
}

# stdin の中の文字列 $1 を $2 に置き換えて stdout へ（正規表現を使わない。パスの . や / をそのまま扱う）。
replace_literal() {
  FROM=$1 TO=$2 awk 'BEGIN { from = ENVIRON["FROM"]; to = ENVIRON["TO"]; n = length(from) }
    { line = $0; out = ""
      while ((i = index(line, from)) > 0) { out = out substr(line, 1, i - 1) to; line = substr(line, i + n) }
      print out line }'
}

# ファイルを元の権限のまま書き換える（元を <ファイル>.bak-wtm-migration に写してから。一時ファイル → mv）。
do_rewrite() {
  f=$1
  shift
  tmp=$f.tmp-wtm-migration.$$
  cp -p "$f" "$f$BAK" || return 1
  if cp -p "$f" "$tmp" && "$@" <"$f" >"$tmp" && mv "$tmp" "$f"; then
    return 0
  fi
  rm -f "$tmp"
  return 1
}

# 書き換えの項目。$1=実際のファイル（段によって移動の前後で違う）$2=表示するパス $3=何か、残りはフィルタのコマンド。
rewrite_file() {
  f=$1
  shown=$2
  what=$3
  shift 3
  need_absent "$f$BAK" "$what のバックアップ"
  act "${what}を書き換える: $shown（元は ${shown##*/}$BAK）" do_rewrite "$f" "$@"
}

# 名前を変えながら書き換える（copilot・grok の hooks/wtm-agent-report.json）。元は <元>.bak-wtm-migration に残す。
# 移動先は hooks/*.json として読まれる場所なので、一時ファイルに書き終えてから mv で置く（半端な JSON を残さない）。
do_rename_rewrite() {
  src=$1
  dst=$2
  shift 2
  tmp=$src.tmp-wtm-migration.$$
  cp -p "$src" "$src$BAK" || return 1
  if cp -p "$src" "$tmp" && "$@" <"$src" >"$tmp" && mv "$tmp" "$dst" && rm "$src"; then
    return 0
  fi
  rm -f "$tmp"
  return 1
}

# hook のスクリプトを同梱の新しい版に置き換える（写した古い版は WTM_* を読むので、名前を変えるだけでは効かない）。
do_replace_script() {
  src=$1
  dst=$2
  cp -p "$src" "$src$BAK" && cp "$HOOK_ASSET" "$dst" && rm "$src"
}

# ---- 検査 1: 古いサーバが動いていないか（packages/server/src/persist/StateDirLock.ts の parseHolder・isInUse と同じ判定）----

pid_alive() {
  if kill -0 "$1" 2>/dev/null; then
    return 0
  fi
  # 他の利用者のプロセスは kill -0 が失敗する（EPERM）。アプリは生きているとみなすので、ps でも確かめる。
  ps -p "$1" >/dev/null 2>&1
}

check_lock() {
  lock=$1
  [ -f "$lock" ] || return 0
  pid=$(sed -n 1p "$lock" | tr -d ' \t\r')
  host=$(sed -n 2p "$lock" | tr -d ' \t\r')
  case $pid in
    '' | *[!0-9]*) return 0 ;; # 中身を読めない＝落ちた残り
  esac
  [ "$pid" -gt 0 ] 2>/dev/null || return 0
  if [ -n "$host" ] && [ "$host" != "$MY_HOST" ]; then
    refuse "別のホスト $host の wtm（pid $pid）がこの状態ディレクトリを使っています: $lock（動いていないことを確かめたら、このファイルを消してから実行し直してください）"
    return 0
  fi
  if pid_alive "$pid"; then
    refuse "古い wtm serve が動いています（pid $pid。$lock）。止めてから実行し直してください"
  fi
}

check_running() {
  [ -d "$OLD_STATE" ] || return 0
  check_lock "$OLD_STATE/wtm.lock"
  for d in "$OLD_STATE"/sessions/*/; do
    [ -d "$d" ] || continue
    check_lock "${d%/}/wtm.lock"
  done
}

# ---- 項目 ----

rename_in_state() {
  src=$1
  dst=$2
  what=$3
  [ -e "$src" ] || [ -L "$src" ] || return 0
  need_absent "$dst" "$what"
  act "${what}の名前を変える: ${src#"$SD"/} → ${dst##*/}（$NEW_STATE の中）" mv "$src" "$dst"
}

item_state() {
  if [ "$PHASE" = check ]; then
    [ -d "$OLD_STATE" ] || return 0
    HAS_STATE=1
    need_absent "$NEW_STATE" "状態ディレクトリ"
  fi
  [ "$HAS_STATE" = 1 ] || return 0
  act "状態ディレクトリを移す: $OLD_STATE → $NEW_STATE" mv "$OLD_STATE" "$NEW_STATE"
  if [ "$PHASE" = check ]; then SD=$OLD_STATE; else SD=$NEW_STATE; fi
  for d in "$SD" "$SD"/sessions/*/; do
    d=${d%/}
    [ -d "$d" ] || continue
    rename_in_state "$d/wtm.lock" "$d/soda.lock" "ロック"
    for img in "$d"/clipboard-images/wtm-image-*; do
      [ -e "$img" ] || continue
      base=${img##*/}
      rename_in_state "$img" "${img%/*}/soda-image-${base#wtm-image-}" "クリップボードの画像"
    done
  done
}

item_cli() {
  if [ "$PHASE" = check ]; then
    [ -d "$OLD_CLI" ] || return 0
    HAS_CLI=1
    need_absent "$NEW_CLI" "CLI のキャッシュ"
  fi
  [ "$HAS_CLI" = 1 ] || return 0
  act "CLI のキャッシュを移す: $OLD_CLI → $NEW_CLI" mv "$OLD_CLI" "$NEW_CLI"
  if [ "$PHASE" = check ]; then f=$OLD_CLI/session.json; else f=$NEW_CLI/session.json; fi
  if [ -f "$f" ] && grep -q 'wtm_session' "$f"; then
    rewrite_file "$f" "$NEW_CLI/session.json" "CLI のキャッシュの cookie の名前" sed 's/wtm_session/soda_session/g'
  fi
}

move_worktrees() {
  mkdir -p "$NEW_WT_PARENT" && mv "$OLD_WT" "$NEW_WT"
}

# git worktree repair は直したときにも「repair: gitdir incorrect: …」を出すので、出力は失敗したときだけ見せる。
repair_worktree() {
  out=$(git -C "$1" worktree repair 2>&1) && return 0
  printf '%s\n' "$out" >&2
  return 1
}

item_worktrees() {
  if [ "$PHASE" = check ]; then
    [ -d "$OLD_WT" ] || return 0
    HAS_WT=1
    need_absent "$NEW_WT" "worktree の置き場"
    command -v git >/dev/null 2>&1 || refuse "git が見つかりません（移した worktree で git worktree repair を実行するのに要ります）"
  fi
  [ "$HAS_WT" = 1 ] || return 0
  act "worktree の置き場を移す: $OLD_WT → $NEW_WT" move_worktrees
  if [ "$PHASE" = check ]; then root=$OLD_WT; else root=$NEW_WT; fi
  # 作成先は <置き場>/<repo 名>/<ブランチの slug>（research F5.3）。worktree の .git はファイル。
  # `*` は . で始まる名前に一致しないので、. で始まる repo 名・slug（例 .dotfiles）も並べる。
  for g in "$root"/*/*/.git "$root"/.[!.]*/*/.git "$root"/*/.[!.]*/.git "$root"/.[!.]*/.[!.]*/.git; do
    [ -f "$g" ] || continue
    wt=${g%/.git}
    act_warn "worktree のリンクを直す（git worktree repair）: $NEW_WT/${wt#"$root"/}" repair_worktree "$wt"
  done
  # 古い ~/.wtm に worktrees しか無ければ、移した後に空になるので消す。
  if [ "$PHASE" = check ]; then
    others=$(ls -A "$OLD_WT_PARENT" 2>/dev/null | grep -v -x 'worktrees')
    [ -z "$others" ] && RM_OLD_WT_PARENT=1 || RM_OLD_WT_PARENT=0
  fi
  if [ "$RM_OLD_WT_PARENT" = 1 ]; then
    act "空になった $OLD_WT_PARENT を消す" rmdir "$OLD_WT_PARENT"
  fi
  # 保存したレイアウト（session.json）の中の古い worktree のパス（research F5.4）。
  if [ "$HAS_STATE" = 1 ] && [ "$PHASE" = check ]; then
    sd=$OLD_STATE
  else
    sd=$NEW_STATE
  fi
  for d in "$sd" "$sd"/sessions/*/; do
    d=${d%/}
    f=$d/session.json
    [ -f "$f" ] || continue
    grep -F -q "$OLD_WT" "$f" || continue
    rewrite_file "$f" "$NEW_STATE${f#"$sd"}" "保存したレイアウトの worktree のパス" replace_literal "$OLD_WT" "$NEW_WT"
  done
}

one_agent() {
  kind=$1
  conf=$2
  hooks=$3
  if [ -n "$conf" ] && [ -f "$conf" ] && grep -q 'wtm-agent-report' "$conf"; then
    rewrite_file "$conf" "$conf" "$kind の hook の設定" sed 's/wtm-agent-report/soda-agent-report/g'
  fi
  old_json=$hooks/wtm-agent-report.json
  if [ -z "$conf" ] && [ -f "$old_json" ]; then
    new_json=$hooks/soda-agent-report.json
    need_absent "$new_json" "$kind の hook の設定"
    need_absent "$old_json$BAK" "$kind の hook の設定のバックアップ"
    act "$kind の hook の設定の名前を変えて書き換える: $old_json → ${new_json##*/}（元は ${old_json##*/}$BAK）" \
      do_rename_rewrite "$old_json" "$new_json" sed 's/wtm-agent-report/soda-agent-report/g'
  fi
  old_cjs=$hooks/wtm-agent-report.cjs
  if [ -f "$old_cjs" ]; then
    new_cjs=$hooks/soda-agent-report.cjs
    need_absent "$new_cjs" "$kind の hook のスクリプト"
    need_absent "$old_cjs$BAK" "$kind の hook のスクリプトのバックアップ"
    NEED_ASSET=1
    act "$kind の hook のスクリプトを新しい版に置き換える: $old_cjs → ${new_cjs##*/}（元は ${old_cjs##*/}$BAK）" \
      do_replace_script "$old_cjs" "$new_cjs"
  fi
}

item_hooks() {
  # packages/server/src/agent/AgentIntegrationInstaller.ts の HOOK_SPECS と同じ場所（ただし devin・grok は、元の版が入れた古い場所・形。今の installer は devin を ~/.config/devin/config.json に、grok を入れ子の形で書く）。copilot・grok は設定ファイル自体が hooks/wtm-agent-report.json。
  one_agent claude "$CLAUDE_DIR/settings.json" "$CLAUDE_DIR/hooks"
  one_agent codex "$CODEX_DIR/hooks.json" "$CODEX_DIR/hooks"
  one_agent cursor "$H/.cursor/hooks.json" "$H/.cursor/hooks"
  one_agent copilot '' "$H/.copilot/hooks"
  one_agent devin "$DEVIN_DIR/hooks.json" "$DEVIN_DIR/hooks"
  one_agent droid "$H/.factory/hooks.json" "$H/.factory/hooks"
  one_agent grok '' "$H/.grok/hooks"
  one_agent qwen "$H/.qwen/settings.json" "$H/.qwen/hooks"
  if [ "$PHASE" = check ] && [ "$NEED_ASSET" = 1 ]; then
    if [ ! -f "$HOOK_ASSET" ]; then
      refuse "同梱の hook のスクリプトが見つかりません: $HOOK_ASSET（リポジトリの scripts/ から実行してください）"
    elif ! grep -q 'SODA_PANE_ID' "$HOOK_ASSET"; then
      refuse "同梱の hook のスクリプトが古い版です（SODA_PANE_ID を読みません）: $HOOK_ASSET（改名した後の checkout から実行してください）"
    fi
  fi
}

# 独自コマンド（commands.json）のコマンドの文字列が参照する環境変数（WTM_ACTIVE_PANE_CWD 等）。新しいアプリは SODA_* だけを渡す。
item_commands() {
  if [ "$HAS_STATE" = 1 ] && [ "$PHASE" = check ]; then
    sd=$OLD_STATE
  else
    sd=$NEW_STATE
  fi
  for d in "$sd" "$sd"/sessions/*/; do
    d=${d%/}
    f=$d/commands.json
    [ -f "$f" ] || continue
    grep -q 'WTM_' "$f" || continue
    rewrite_file "$f" "$NEW_STATE${f#"$sd"}" "独自コマンドの環境変数の名前（WTM_ → SODA_）" sed 's/WTM_/SODA_/g'
  done
}

all_items() {
  item_state
  item_commands
  item_cli
  item_worktrees
  item_hooks
}

# ---- 本体 ----

check_running
all_items

if [ -d "$CLAUDE_DIR/skills/wtmctl" ]; then
  NOTES="$NOTES注意: 手で入れた skill $CLAUDE_DIR/skills/wtmctl は変えていません。消して、sodactl skill で入れ直してください（docs/sodactl.md）。
"
fi

# Claude Code の会話の記録は cwd から決まる名前のディレクトリ（~/.claude/projects/<cwd の記号を - にした名前>）にある。
# worktree を移すと古い名前のまま残るが、Claude Code の内部のデータなのでスクリプトは動かさず、知らせるだけ（decisions D8）。
for p in "$CLAUDE_DIR"/projects/*-wtm-worktrees-*; do
  [ -d "$p" ] || continue
  NOTES="$NOTES注意: Claude Code の会話の記録 $p は古い worktree のパスの名前のままです（変えていません）。自動再開や claude --resume で使うなら、docs/migrate-from-wtm.md の手順で名前を変えてください。
"
done

if [ -n "$REFUSALS" ]; then
  printf '%s' "$REFUSALS" >&2
  printf '%s: 上の理由で移行しません。何も変えていません。\n' "$PROG" >&2
  exit 1
fi

if [ "$COUNT" -eq 0 ]; then
  printf '移すものがありません（移行済みか、古い名前の状態がありません）。\n'
  printf '%s' "$NOTES"
  exit 0
fi

if [ "$DRY_RUN" = 1 ]; then
  printf '%s' "$PLAN"
  printf '移行: %d 件の操作を行う予定です（--dry-run なので何も変えていません）。\n' "$COUNT"
  printf '%s' "$NOTES"
  exit 0
fi

PHASE=run
COUNT=0
all_items
printf '移行: %d 件の操作を行いました。ブラウザでは一度ログインし直してください（docs/migrate-from-wtm.md）。\n' "$COUNT"
printf '%s' "$NOTES"
if [ "$WARNED" = 1 ]; then
  exit 3
fi
exit 0
