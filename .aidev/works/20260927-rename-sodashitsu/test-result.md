# テスト結果: 製品名を Sodashitsu に改める と 一度きりの移行スクリプト

## 実行したもの

- `pnpm -s build` — exit 0
- `pnpm -s typecheck` — exit 0（`scripts/tsconfig.json` を含む。型の誤りを 1 つ入れた確かめで exit 2 になることも見た〔decisions D5〕）
- `pnpm -s test` — 279 files / **5209 passed / 0 failed / 0 skipped**（うち `scripts` の project の移行スクリプトの統合テスト 33 本）
- `aidev smoke` — pass（9 本。9 本目に移行スクリプトを足した）
- E2E・負荷テストは走らせていない（利用者の指示）。

## 受け入れ基準ごとの判定

- AC1: pass — `packages/*/package.json` の name・bin（`soda`・`sodactl`）、`pnpm install --offline` で作り直した lock（差分は workspace のキーの名前だけ。T3 の点検）。smoke が `packages/server/dist/main.js`・`packages/cli/dist/main.js` を新しい名前の出力で動かした。
- AC2: pass — 一律の置換（T1）と、アプリのテスト 5176 本（改名後の名前で書き換わった期待値）が緑。後方互換のコードは足していない（`git grep` で古い名前はアプリのソースに 0 件。下記 AC5）。
- AC3: pass — ページのタイトル・ログイン画面の見出し `Sodashitsu`（`documentTitle.test.ts`）、CLI の接頭辞 `soda:`（smoke の出力）、`sodactl skill | cmp - packages/cli/skills/sodactl/SKILL.md`（smoke 4 本目）。
- AC4: pass — AGENTS.md・docs・LICENSE/NOTICE・`.aidev/config.yml`・backlog を置換・手直し。`docs/sodactl.md`。
- AC5: pass — 最後の `git grep -i -E 'wtm|web-tn-multiplexer' -- ':!.aidev/works'`（未追跡の新規ファイルも含めて）の当たりは、移行スクリプト 3 本（`.sh` 45・`.bat` 53・`.test.ts` 55 行）・`docs/migrate-from-wtm.md`（44 行）・移行の docs と移行スクリプトへの言及（AGENTS.md:8・docs/sodactl.md:349・scripts/vitest.config.ts:4・`.aidev/config.yml` の 9 本目の smoke と説明 3 行）・`pnpm-lock.yaml:1182`（typescript の integrity の中の偶然の `wtm`）だけ。
- AC6〜AC13: pass — `scripts/migrate-from-wtm.test.ts`（一時的な HOME・XDG・CLAUDE_CONFIG_DIR・CODEX_HOME・DEVIN_CONFIG_DIR だけ。環境は一から組む）。dry-run で木が同じ・予定の行／全部の移動（状態ディレクトリ・sessions・ロック・画像・独自コマンドの `WTM_`・CLI のキャッシュと cookie・実物の git の worktree の repair〔元の repo の `git worktree list --porcelain` が新しいパス・worktree の中で `git rev-parse`〕・レイアウトのパス・8 種の hook〔今のアプリの `FsAgentIntegrationInstaller.status` が導入済みと見る・同梱のスクリプト・バックアップ・他製品のエントリ／ファイルが残る〕・`済み:` の行が dry-run の `予定:` と同じ 28 行）／動いているサーバ（既定・名前付き・dry-run でも・別のホスト・pid 1〔他の利用者〕・ps が無い環境）で断る／移動先・バックアップ 13 種で断る（壊れたシンボリックリンクを含む）／理由を全部並べる／移す元が無い項目は検査しない／2 回目は「移すものがありません」で 0／`.` で始まる repo 名・末尾の `/` の HOME／同梱の hook のスクリプトが無い・古い／git が無い／Claude Code の会話の記録は変えずに `注意:`／使い方の誤りは 2。
- AC14: pass — 下記「負の対照」。36 の変異がすべてテストを落とした。
- AC15: pass — `docs/migrate-from-wtm.md`（スクリプトの実行と `--dry-run`・ログインし直し・localStorage のスニペット〔themeOverrides の CSS 変数名も直す〕・既定と違う場所の手動の移行・`.bat` が未検証）。T8 と cross の点検で直した。
- AC16: pass — 上記の build・typecheck・test。
- AC17: pass — 下記「起動確認」。
- AC18: pass（読み合わせのみ・Windows で未実行）— 下記「`.bat` と `.sh` の対応」。

## 負の対照（AC14。`.aidev/conventions/regression-negative-control.md`）

`scratchpad/mutate/sweep.py` が、安全の検査の行ごとに変異を `scripts/migrate-from-wtm.sh` へバイト単位で注入し、`npx vitest run --project scripts` を 1 回ずつ直列に走らせ、
生の出力を保存し、元のバイトに戻して `cmp` で一致を確かめた（最後の `cmp: 0`）。経緯: 1 巡目で 4 件が生き残った（`pid_alive.kill`・`item_worktrees.git-missing`・
`item_hooks.asset-missing`・`item_hooks.asset-old`）→ テストを足した。T6 の点検で変異の漏れ（`ps -p` の単独・`-L`・ホスト名の行・pid 0）を指摘され、変異とテストを足した。
以下は最終のスクリプト・最終のテスト一式（33 本。review ラウンド 1 の修正の後に走らせ直した）での実行。

```
need_absent.phase-guard KILLED
need_absent.exists-e KILLED
need_absent.refuse-call KILLED
refuse.append KILLED
main.refusal-test KILLED
main.refusal-exit KILLED
main.refusal-exit-removed KILLED
check_running.default KILLED
check_running.sessions KILLED
check_running.call KILLED
check_lock.file-test KILLED
check_lock.pid-line KILLED
check_lock.host-line KILLED
check_lock.pid-positive KILLED
pid_alive.ps KILLED
need_absent.exists-L KILLED
check_lock.other-host-cond KILLED
check_lock.other-host-refuse KILLED
check_lock.alive-cond KILLED
check_lock.alive-refuse KILLED
pid_alive.kill KILLED
pid_alive.always-dead KILLED
item_state.need_absent KILLED
item_cli.need_absent KILLED
item_worktrees.need_absent KILLED
item_worktrees.git-missing KILLED
rename_in_state.need_absent KILLED
rewrite_file.need_absent KILLED
one_agent.json-dst KILLED
one_agent.json-bak KILLED
one_agent.cjs-dst KILLED
one_agent.cjs-bak KILLED
item_hooks.asset-missing KILLED
item_hooks.asset-old KILLED
act.check-phase KILLED
act_warn.check-phase KILLED
cmp: 0
```

各変異で落ちたテスト（先頭 2 件）と件数（生の出力の抜粋。各 log の `×` の行と `Tests` の行をそのまま）:

```
## need_absent.phase-guard
       × 状態ディレクトリ
       × CLI のキャッシュ
      Tests  14 failed | 19 passed (33)
## need_absent.exists-e
       × 状態ディレクトリ
       × CLI のキャッシュ
      Tests  13 failed | 20 passed (33)
## need_absent.refuse-call
       × 状態ディレクトリ
       × CLI のキャッシュ
      Tests  14 failed | 19 passed (33)
## refuse.append
       × 既定の session のロックの持ち主が動いている
       × 名前付き session のロックの持ち主が動いている（--dry-run でも断る）
      Tests  22 failed | 11 passed (33)
## main.refusal-test
     × --dry-run は予定を出すだけで、何も変えない
     × 全部を移す: 状態ディレクトリ・sessions・ロック・画像・CLI のキャッシュ・worktree と repair・レイアウトのパス・8 種の hook
      Tests  32 failed | 1 passed (33)
## main.refusal-exit
       × 既定の session のロックの持ち主が動いている
       × 名前付き session のロックの持ち主が動いている（--dry-run でも断る）
      Tests  22 failed | 11 passed (33)
## main.refusal-exit-removed
       × 既定の session のロックの持ち主が動いている
       × 名前付き session のロックの持ち主が動いている（--dry-run でも断る）
      Tests  22 failed | 11 passed (33)
## check_running.default
       × 既定の session のロックの持ち主が動いている
       × ps が無い環境（busybox 等）でも kill -0 で見つける
      Tests  4 failed | 29 passed (33)
## check_running.sessions
       × 名前付き session のロックの持ち主が動いている（--dry-run でも断る）
      Tests  1 failed | 32 passed (33)
## check_running.call
       × 既定の session のロックの持ち主が動いている
       × 名前付き session のロックの持ち主が動いている（--dry-run でも断る）
      Tests  5 failed | 28 passed (33)
## check_lock.file-test
       × 既定の session のロックの持ち主が動いている
       × 名前付き session のロックの持ち主が動いている（--dry-run でも断る）
      Tests  5 failed | 28 passed (33)
## check_lock.pid-line
       × 既定の session のロックの持ち主が動いている
       × 名前付き session のロックの持ち主が動いている（--dry-run でも断る）
      Tests  5 failed | 28 passed (33)
## check_lock.host-line
       × 別のホストのロックは生死を確かめられないので断る
      Tests  1 failed | 32 passed (33)
## check_lock.pid-positive
       × pid が 0 のロックは落ちた残りとみなして移す
      Tests  1 failed | 32 passed (33)
## pid_alive.ps
       × 他の利用者のプロセス（kill -0 が EPERM）も ps で動いていると見る（pid 1）
      Tests  1 failed | 32 passed (33)
## need_absent.exists-L
       × CLI のキャッシュ（壊れたシンボリックリンク）
      Tests  1 failed | 32 passed (33)
## check_lock.other-host-cond
     × --dry-run は予定を出すだけで、何も変えない
     × 全部を移す: 状態ディレクトリ・sessions・ロック・画像・CLI のキャッシュ・worktree と repair・レイアウトのパス・8 種の hook
      Tests  8 failed | 25 passed (33)
## check_lock.other-host-refuse
       × 別のホストのロックは生死を確かめられないので断る
      Tests  1 failed | 32 passed (33)
## check_lock.alive-cond
     × --dry-run は予定を出すだけで、何も変えない
     × 全部を移す: 状態ディレクトリ・sessions・ロック・画像・CLI のキャッシュ・worktree と repair・レイアウトのパス・8 種の hook
      Tests  8 failed | 25 passed (33)
## check_lock.alive-refuse
       × 既定の session のロックの持ち主が動いている
       × 名前付き session のロックの持ち主が動いている（--dry-run でも断る）
      Tests  4 failed | 29 passed (33)
## pid_alive.kill
       × ps が無い環境（busybox 等）でも kill -0 で見つける
      Tests  1 failed | 32 passed (33)
## pid_alive.always-dead
       × 既定の session のロックの持ち主が動いている
       × 名前付き session のロックの持ち主が動いている（--dry-run でも断る）
      Tests  4 failed | 29 passed (33)
## item_state.need_absent
       × 状態ディレクトリ
       × 理由はすべて集めてから一度に出す
      Tests  2 failed | 31 passed (33)
## item_cli.need_absent
       × CLI のキャッシュ
       × CLI のキャッシュ（壊れたシンボリックリンク）
      Tests  3 failed | 30 passed (33)
## item_worktrees.need_absent
       × worktree の置き場
      Tests  1 failed | 32 passed (33)
## item_worktrees.git-missing
       × worktree を移すのに git が無い
      Tests  1 failed | 32 passed (33)
## rename_in_state.need_absent
       × 状態ディレクトリの中の新しい名前のロック
       × 状態ディレクトリの中の新しい名前の画像
      Tests  2 failed | 31 passed (33)
## rewrite_file.need_absent
       × hook の設定のバックアップ
       × CLI のキャッシュのバックアップ
      Tests  3 failed | 30 passed (33)
## one_agent.json-dst
       × hook の設定（名前も変わる）
      Tests  1 failed | 32 passed (33)
## one_agent.json-bak
       × hook の設定（名前も変わる）のバックアップ
      Tests  1 failed | 32 passed (33)
## one_agent.cjs-dst
       × hook のスクリプト
      Tests  1 failed | 32 passed (33)
## one_agent.cjs-bak
       × hook のスクリプトのバックアップ
      Tests  1 failed | 32 passed (33)
## item_hooks.asset-missing
       × 同梱の hook のスクリプトが無い
      Tests  1 failed | 32 passed (33)
## item_hooks.asset-old
       × 同梱の hook のスクリプトが古い版（SODA_PANE_ID を読まない）
      Tests  1 failed | 32 passed (33)
## act.check-phase
     × --dry-run は予定を出すだけで、何も変えない
     × 全部を移す: 状態ディレクトリ・sessions・ロック・画像・CLI のキャッシュ・worktree と repair・レイアウトのパス・8 種の hook
      Tests  28 failed | 5 passed (33)
## act_warn.check-phase
     × --dry-run は予定を出すだけで、何も変えない
     × 全部を移す: 状態ディレクトリ・sessions・ロック・画像・CLI のキャッシュ・worktree と repair・レイアウトのパス・8 種の hook
      Tests  15 failed | 18 passed (33)
```

## `.bat` と `.sh` の対応（AC18。読み合わせ。Windows では未実行）

| 項目 | `.sh` | `.bat` |
|---|---|---|
| 引数 | `--dry-run`・`-h`・不明は 2 | 同じ（`%0` のずれを避けて `SCRIPT_DIR` を先に取る） |
| 場所 | `XDG_STATE_HOME`／`HOME`（末尾の `/` を落とす）・3 つの上書き | `LOCALAPPDATA`（無ければ `USERPROFILE\AppData\Local`）／`USERPROFILE`（末尾の `\` を落とす）・同じ 3 つ |
| 動いているサーバ | `wtm.lock` と `sessions/*/wtm.lock`、1 行目の pid・2 行目のホスト名、`kill -0` と `ps -p` | 同じファイル、`for /f` の 1・2 行目、`hostname` と大文字小文字を無視して比べる、`tasklist /FI "PID eq"` |
| 検査と実行の二段・理由を全部集めて 1 | `PHASE=check`→`run`・`REFUSALS` | `PHASE=check`→`plan`/`run`・`REFUSED` |
| 状態ディレクトリ・ロック・画像 | `mv`・`soda.lock`・`soda-image-*` | `move`・`ren` |
| 独自コマンドの `WTM_` | `sed` | PowerShell の `Replace`（BOM 無しの UTF-8） |
| CLI のキャッシュ・cookie の名前 | `mv`・`sed` | `move`・PowerShell |
| worktree・repair・空の `~/.wtm`・レイアウトのパス | `*/*/.git`（`.` 始まりも）・`git -C … worktree repair`・`rmdir`・`/` 区切り | `for /d` 2 段・同じ git・`rmdir` の後に `if exist`・`/` と JSON の `\\` の 2 形 |
| hook 8 種・copilot/grok の名前の変更・スクリプトの置き換え・バックアップ | 同梱の asset を写す・`.bak-wtm-migration` | 同じ（`del` の後に `if exist`） |
| 出力・終了コード | 日本語・0/1/2/3 | 英語（decisions D6）・0/1/2/3 |

ずれとして許容したもの: 予定の行に出すパス（`.bat` は移動前のパス）とロックの行の空白の扱い（decisions D7）。

## 失敗の証跡

このラウンド（test 工程）では失敗が発生していない（coding 中のテストの失敗はタスク点検ログと decisions に記録した）。

## 起動確認（smoke）

```
smoke: 20260927-rename-sodashitsu
$ pnpm -s build && pnpm -s smoke
smoke: starting server on 127.0.0.1:38082 (state dir /tmp/soda-smoke-MX7DpQ)
{"ts":"2026-09-27T14:58:20.996Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-27T14:58:21.005Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-smoke-MX7DpQ/commands.json","count":1}
smoke: agent manifests ok (22/22)
smoke: login ok
smoke: websocket connected
smoke: client.hello ok
smoke: workspace.create ok (pane p2)
smoke: pane.subscribe ok
smoke: echo round trip ok
{"ts":"2026-09-27T14:58:22.096Z","level":"info","msg":"custom command run","commandId":"smoke-cat","type":"popup","clientId":"f1064633-285e-4132-bd34-0b0c848bd6bf","paneId":"p2"}
smoke: custom command popup round trip ok
smoke(web): auto-login (#token) → connect → pane 表示 ok
smoke(web): 端末の描画用 canvas が画面内にある（xterm.css 有効。D96）
smoke(web): tab title ok ("OSK2-024680-2: smoke"。H14/AC4）
smoke(web): typed into pane p2
smoke(web): echo round trip ok（ブラウザでの入力が PTY まで届いた）
smoke(web): 初めてのブラウザで、はじめの案内が端末の表示のあとに開き、見出しにフォーカスがある
smoke(web): Esc で閉じると端末へフォーカスが戻り、案内済みだけが保存される
smoke(web): 開き直しても、はじめの案内は出ない
smoke(web): はじめの案内を閉じたあと、クリックせずに打った文字が PTY まで届いた
smoke: PASS
$ pnpm --filter @sodashitsu/cli run smoke

> @sodashitsu/cli@0.1.0 smoke /workspaces/web-tn-multiplexer-wt/rename-sodashitsu/packages/cli
> node --enable-source-maps dist/smoke.js

smoke(cli): temp server state dir /tmp/sodactl-smoke-state-goKZw1, sandboxed HOME /tmp/sodactl-smoke-home-s4lfb3
{"ts":"2026-09-27T14:58:31.097Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-27T14:58:31.100Z","level":"info","msg":"custom commands loaded","file":"/tmp/sodactl-smoke-state-goKZw1/commands.json","count":0}
smoke(cli): server listening on http://127.0.0.1:38736
smoke(cli): sodactl workspace create ok (pane p2)
smoke(cli): sodactl pane run ok (no --token needed; cached session reused)
smoke(cli): sodactl pane read ok (echo round trip confirmed)
smoke(cli): sodactl snapshot ok
smoke(cli): sodactl pane current / pane split (caller pane, not the focused one) ok (tab t2)
smoke(cli): sodactl workspace/pane report-metadata ok (normalized, in snapshot, cleared, bad source refused)
smoke(cli): sodactl agent list ok (no agents)
smoke(cli): sodactl agent rename ok (named, resolved by name, cleared)
smoke(cli): sodactl agent start ok (usage error for an unknown kind, agent_pane_busy on a pane with an agent)
smoke(cli): sodactl agent send-keys ok (the RPC accepted the keys)
smoke(cli): sodactl agent prompt ok (submitted; the shell printed the marker)
smoke(cli): sodactl pane attach refuses a non-terminal (not_a_tty)
smoke(cli): sodactl pane attach ok (in a real PTY: size 100x30, echo round trip, resize 90x25, Ctrl+B q exit 0, left the alternate screen)
smoke(cli): sodactl pane observe/control ok (pipes: full first frame, control size 100x30, NDJSON input round trip, invalid line warned, release exit 0, observe pane_closed exit 0)
smoke(cli): PASS
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && node packages/server/dist/main.js token reset --session smoke --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && node packages/server/dist/main.js session list --state-dir "$d" | grep -q '^smoke ' && node packages/server/dist/main.js session delete smoke --state-dir "$d" && test ! -e "$d/sessions/smoke"; rc=$?; rm -rf "$d"; exit $rc
soda: new token: WQlWp2ASgnJioikCSloRu5J_78BHmTiT
soda: deleted session smoke (/tmp/tmp.fN4VUPMK4O/sessions/smoke)
$ SODACTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill | cmp - packages/cli/skills/sodactl/SKILL.md
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && SODA_SESSION=smoke node packages/server/dist/main.js token reset --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && test ! -e "$d/auth.json" && { SODA_SESSION=a/b node packages/server/dist/main.js token reset --state-dir "$d" 2>/dev/null; test $? -eq 2; } && test ! -e "$d/auth.json"; rc=$?; rm -rf "$d"; exit $rc
soda: new token: NQyDLvj8iGi4sw5e0RieK-bdfpH1pm9h
$ node packages/server/dist/handoffSmoke.js
handoff-smoke: not running → exit 3, nothing created ok
handoff-smoke: before: server pid 1273016, pane p1, shell pid 1273028
handoff-smoke: soda handoff → exit 0: soda: handoff complete: 1 pane(s) kept running
handoff-smoke: same server pid, /ws closed with 1012, handoff.json removed ok
handoff-smoke: same pane, same shell pid, previous screen visible, input/output ok
handoff-smoke: resize reaches the adopted pty ok
handoff-smoke: pane closes when the adopted shell exits ok
handoff-smoke: ok
$ node packages/server/dist/stopSmoke.js
stop-smoke: not running → exit 3, nothing created ok
stop-smoke: started: pid 1273232, pane p2, marker shown
stop-smoke: stopped: CLI exit 0, server exit 0, list shows stopped, lock released, state saved ok
stop-smoke: stopped → exit 3 ok
stop-smoke: restarted: same pane, previous screen restored ok
stop-smoke: ok
$ node packages/server/dist/machineSmoke.js
machine-smoke: remote soda serve started (pid 1273357)
machine-smoke: soda machine add (probed over the fake ssh) and list ok
machine-smoke: local soda serve connected to the remote machine (machine.list: online)
machine-smoke: relay ok: hello (hostname OSK2-024680-2), workspace.create and echo reached the remote soda serve
machine-smoke: ok
$ d=$(mktemp -d) && mkdir -p "$d/home/.wtmctl" && env -i PATH="$PATH" HOME="$d/home" XDG_STATE_HOME="$d/state" sh scripts/migrate-from-wtm.sh >"$d/out" && grep -q '^済み: CLI のキャッシュを移す' "$d/out" && test -d "$d/home/.sodactl" && env -i PATH="$PATH" HOME="$d/home" XDG_STATE_HOME="$d/state" sh scripts/migrate-from-wtm.sh | grep -q '移すものがありません'; rc=$?; rm -rf "$d"; exit $rc
smoke: pass (exit 0, 9 本)
```

9 本目は、この work が足した新しい入口（`scripts/migrate-from-wtm.sh`）を一時的な HOME だけの環境（`env -i`）で一巡させる。

## 未検証の穴（skip / 環境不足）

- **`scripts/migrate-from-wtm.bat` は Windows で一度も実行していない**（cmd が無い）。読み合わせと独立点検（T7）だけ。docs に明記した。
- 移行スクリプトは利用者の本物の HOME では実行していない（依頼どおり）。本物の状態の形（例: 実際の Claude Code の settings.json の他の項目）は、今のアプリの導入の処理で作った形で模した。
- macOS での `.sh`（`ps -p`・`uname -n`・BSD の `sed`/`awk`）は未実行。POSIX の範囲で書き、Linux の dash で確かめた。
- E2E（`packages/e2e`）は走らせていない（利用者の指示）。e2e のソースは置換で改め、型検査だけ通っている。
- ブラウザの localStorage のスニペットは実際のブラウザで実行していない。

## ラウンド 2（review ラウンド 1 の差し戻しの後）

- build・typecheck・test（279 files / 5209 passed）・変異 36 件すべて KILLED・`cmp: 0`・smoke pass（9 本）。上の各ブロックはこのラウンドの出力に差し替えた。
- このラウンドでは失敗が発生していない。
- ラウンド 3（review ラウンド 2 の差し戻しの後）: 変更は docs/migrate-from-wtm.md の手順 7 だけ（コード・テスト・スクリプトは不変）。ラウンド 2 の build・typecheck・test（5209 passed）・変異 36 件・smoke（9 本）の結果がそのまま有効。
- ラウンド 4（review ラウンド 3 の差し戻しの後）: 変更は docs/migrate-from-wtm.md の手順 7 の 1 行だけ。ラウンド 2 の結果がそのまま有効。
