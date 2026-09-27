# テスト結果: クリップボードの画像を pane へ貼り付ける（herdr H44）

## ラウンド 1（2026-09-27）

### 実行したもの
- `pnpm -s build` — exit 0
- `pnpm -s test` — 5087 passed / 6 failed / 0 skipped（275 files 中 2 files が失敗）→ coding へ差し戻し

### 失敗の証跡

操作を 1 つ（`remote_image_paste`・既定の直接のキー `ctrl+v`）足したことで、件数を固定した既存のテスト（web の `KeySettings.test.ts`・`store/settings.test.ts`）が落ちた。
T7 では `packages/web/src/keys` の下だけを走らせていて、ほかのディレクトリの件数のテストを見落とした。

```
$ pnpm -s test
     × 何も保存されていなければ既定の表（prefix は ctrl+b・割り当ては既定） 15ms
     × prefix と、3 群 50 個の操作＋navigate 6操作の現在の割り当てが見える（既定は今のキー）。割り当てなしは「なし」 320ms
     × 押すと 10 個の直接のキーが足され、足した数と一覧が出る。prefix の後のキーは残る 244ms
     × 別の操作が使っている chord は足さず、理由（持ち主の名前）を出す。残りは足す（足した数・キーが二重に出ない） 250ms
     × 最初から表示され（開閉の概念を持たない）、操作名の一部で一致する操作だけが残る（AC1・AC-I1） 199ms
     × 入力を空にすると全部戻る（即時反映。AC3・AC-I2） 423ms
 FAIL  |@wtm/web| src/store/settings.test.ts > useSettingsStore — キーの割り当て（AC8） > 何も保存されていなければ既定の表（prefix は ctrl+b・割り当ては既定）
AssertionError: expected 1 to be +0 // Object.is equality
 ❯ src/store/settings.test.ts:476:41
    476|     expect(store.keymap.directMap.size).toBe(0);
 FAIL  |@wtm/web| src/components/KeySettings.test.ts > KeySettings — 一覧（AC1） > prefix と、3 群 50 個の操作＋navigate 6操作の現在の割り当てが見える（既定は今のキー）。割り当てなしは「なし」
AssertionError: expected …(58) to have a length of 57 but got 58
 ❯ src/components/KeySettings.test.ts:77:56
 FAIL  |@wtm/web| src/components/KeySettings.test.ts > KeySettings — herdr のおすすめの直接のキー（AC10） > 押すと 10 個の直接のキーが足され、足した数と一覧が出る。prefix の後のキーは残る
AssertionError: expected 11 to be 10 // Object.is equality
 ❯ src/components/KeySettings.test.ts:652:44
 FAIL  |@wtm/web| src/components/KeySettings.test.ts > KeySettings — herdr のおすすめの直接のキー（AC10） > 別の操作が使っている chord は足さず、理由（持ち主の名前）を出す。残りは足す（足した数・キーが二重に出ない）
AssertionError: expected 11 to be 10 // Object.is equality
 ❯ src/components/KeySettings.test.ts:677:44
 FAIL  |@wtm/web| src/components/KeySettings.test.ts > KeySettings — 絞り込み（AC1・AC2・AC3・AC-I1〜AC-I5） > 最初から表示され（開閉の概念を持たない）、操作名の一部で一致する操作だけが残る（AC1・AC-I1）
AssertionError: expected …(58) to have a length of 57 but got 58
 ❯ src/components/KeySettings.test.ts:822:56
 FAIL  |@wtm/web| src/components/KeySettings.test.ts > KeySettings — 絞り込み（AC1・AC2・AC3・AC-I1〜AC-I5） > 入力を空にすると全部戻る（即時反映。AC3・AC-I2）
AssertionError: expected …(58) to have a length of 57 but got 58
 ❯ src/components/KeySettings.test.ts:846:56
 Test Files  2 failed | 273 passed (275)
      Tests  6 failed | 5087 passed (5093)
```

## ラウンド 2（2026-09-27。差し戻しの修正の後）

### 実行したもの
- `pnpm -s build` — exit 0
- `pnpm -s typecheck` — exit 0
- `pnpm -s test` — 5094 passed / 0 failed / 0 skipped（275 files。1 回だけの実行。負荷をかける並走・繰り返しはしていない）
- `aidev smoke` — pass（8 本）
- `aidev coverage` — ac=18 design=18/18 tasks=18/18 gaps=0
- 負の確認（変異）33 通り——`scratchpad/mutate.py`（worktree の中の作業場所。コミットしない）で 1 つずつ壊し、該当するテストのファイルだけを 1 回走らせ、元に戻して `cmp` で一致を確かめた。
  M30 は最初は検出されず（列で待っている仕事の世代の確かめ）、テスト「列で待っている仕事は、切り替えの後に番が来ても始めない」を足してから検出した。**33 通りすべて検出**。

### 失敗の証跡

このラウンドでは失敗が発生していない（`pnpm -s test` は 0 failed）。負の確認で「わざと壊して落ちた」出力の抜粋:

```
$ python3 scratchpad/mutate.py   # M1〜M28（M21・M28 は整形の後に錨を直して下で再実行）
M1 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 13 passed (14) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M2 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 13 passed (14) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M3 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 18 passed (19) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M4 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 18 passed (19) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M5 DETECTED exit=1 Test Files  1 failed (1) | Tests  2 failed | 17 passed (19) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
M6 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 18 passed (19) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M7 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 18 passed (19) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M8 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 18 passed (19) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M9 DETECTED exit=1 Test Files  1 failed (1) | Tests  2 failed | 17 passed (19) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
M10 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 18 passed (19) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M11 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 14 passed (15) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M12 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 14 passed (15) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M13 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 14 passed (15) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M14 DETECTED exit=1 Test Files  1 failed (1) | Tests  2 failed | 13 passed (15) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
M15 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 5 passed (6) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M16 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 2 passed (3) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M17 DETECTED exit=1 Test Files  1 failed (1) | Tests  3 failed | 15 passed (18) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯
M18 DETECTED exit=1 Test Files  1 failed (1) | Tests  2 failed | 16 passed (18) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
M19 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 22 passed (23) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M20 DETECTED exit=1 Test Files  1 failed (1) | Tests  2 failed | 21 passed (23) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
M21 SKIP(anchor count=0)
M22 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 15 passed (16) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M23 DETECTED exit=1 Test Files  2 failed (2) | Tests  2 failed | 51 passed (53) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
M24 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 36 passed (37) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M25 DETECTED exit=1 Test Files  1 failed (1) | Tests  2 failed | 44 passed (46) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯
M26 DETECTED exit=1 Test Files  1 failed (1) | Tests  5 failed | 41 passed (46) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯
M27 DETECTED exit=1 Test Files  3 failed (3) | Tests  7 failed | 77 passed (84) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 7 ⎯⎯⎯⎯⎯⎯⎯
M28 SKIP(anchor count=0)
M21 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 22 passed (23) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M28 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 22 passed (23) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M29 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 22 passed (23) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M30 NOT DETECTED exit=0 Test Files  1 passed (1) | Tests  23 passed (23)
M31 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 22 passed (23) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M32 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 22 passed (23) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
M33 DETECTED exit=1 Test Files  2 failed (2) | Tests  4 failed | 37 passed (41) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯
M30 DETECTED exit=1 Test Files  1 failed (1) | Tests  1 failed | 23 passed (24) | ⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

$ (M15: composeServer の中継側の onClientGone(images) を外す) npx vitest run packages/server/src/machine/machines.integration.test.ts
 FAIL  |@wtm/server| src/machine/machines.integration.test.ts > 保存した SSH のマシン（2 つの composeServer。T8） > クリップボードの画像（20260927-clipboard-image-paste の T6）: 中継越しに分けて送ると、リモートの状態ディレクトリに置かれてリモートのパスが返る。中継の接続が切れると送信は捨てられる
Error: timed out: slot freed
$ (M17: InputGate の first を溜めた分の後に流す) npx vitest run packages/web/src/net/InputGate.test.ts
AssertionError: expected [ [ 'p1', 'j' ], [ 'p1', 'j' ], …(1) ] to deeply equal [ [ 'p1', '\u0016' ], …(2) ]
$ (M29: マシンの切り替えで保持をその場で捨てない) npx vitest run packages/web/src/term/ImagePaster.test.ts
AssertionError: expected [] to deeply equal [ [ 'p3', 'new' ] ]
```

変異の一覧（何を壊したか）: M1 PNG の印を 4 バイトに／M2 `isPastablePath` の C0・C1 の検査／M3 片の offset の検査／M4 最初の片の先頭のバイト／M5 同時数の上限／M6 保存中を同時数に数えない／
M7 全体の頻度／M8 接続ごとの同時 1／M9 16 MiB の境界／M10 片を受けたときの時計の測り直し／M11 ファイルの 0600／M12 シンボリックリンクの検査／M13 今書いたものを 24 時間の判定から外す／
M14 `wx`（上書きしない）／M15 中継側の切断の配線／M16 `/ws` 側の切断の配線／M17 first の順序／M18 終わった保持の first を関所に通す／M19 返ったパスの検査／M20 bracketed paste の無視の設定／
M21 保持の 20 秒／M22 許可の `denied`／M23 テキストがあれば画像を取らない／M24 paste イベントの `stopPropagation`／M25 端末以外の Ctrl+V を横取りしない／M26 fallback の `\x16`／
M27 既定の `ctrl+v`／M28 失敗したときの `pane.image.cancel`／M29 切り替えで保持を捨てる／M30 列の番が来たときの世代の確かめ／M31 閉じた pane に貼らない／M32 LRU の後に始めたときの bracketed の状態で貼る／
M33 `discard` が溜めた分を捨てる。

## 受け入れ基準ごとの判定

- AC1: pass — `ImagePaster.test.ts`（画像あり→begin/chunk×2/commit→bracketed のパス→溜めたキー）・`imagePaste.integration.test.ts`（実物の composeServer の `/ws` で 3 片を送り同じバイト列のファイル・0600・0700）・`clipboardImage.test.ts`（画像とテキストがあれば画像）。
- AC2: pass — `ImagePaster.test.ts`（画像無し・読めないブラウザ・読み取りが投げる→`\x16` がキーより先）・`clipboardImage.test.ts`（read が無い・permissions が投げる・denied）・`KeyInputController.test.ts`（fallback の列）・`InputGate.test.ts`（first の順序）。
- AC3: pass — `TerminalRegistry.test.ts`（画像だけの paste イベントを横取りし xterm に渡さない・テキストなら xterm が貼る）・`clipboardImage.test.ts`（`imageFromDataTransfer`）。
- AC4: pass — `KeyInputController.test.ts`（`Ctrl+Shift+V`→`pasteClipboard`）・`ActionDispatcher.test.ts`（メニュー→`pasteClipboard`）・`ImagePaster.test.ts`（テキスト優先・画像）・`clipboardImage.test.ts`（`readClipboardForPaste`）。
- AC5: pass — `machines.integration.test.ts`（`/ws?machine=` 越しに 2 片を送り、リモートの状態ディレクトリにできる・中継の切断で枠が空く）。
- AC6: pass — `keymap.test.ts`・`bindings.test.ts`（既定 `ctrl+v`・外す・別のキー）・`KeyInputController.test.ts`（外したら xterm の既定）・`KeySettings.test.ts`（節「キー」に 58 行）。
- AC7: pass — `ImageUploads.test.ts`（種類・先頭のバイト・16 MiB・大きさの食い違い・pane 無し・ファイルを作らない）・`image.test.ts`（スキーマ）・結合テスト（`not_found`・`invalid_params`・`image_too_large`）。
- AC8: pass（POSIX）— `ImageStore.test.ts`（0700・0600・乱数の名前・wx・シンボリックリンク・持ち主・24 時間・100 個・合計）。Windows の権限は未検証（下記）。
- AC9: pass — `ImageUploads.test.ts`（接続 1・全体 4・保存中も数える・直近 60 秒の 20/60・30 秒・cancel・切断・dispose）・結合テスト（切断で枠が空く）。
- AC10: pass — `ImagePaster.test.ts`（失敗で toast・画像の分は入らず溜めたキーは流れる）。
- AC11: pass — `ImagePaster.test.ts`（制御文字を含むパスを貼らない）・`image.test.ts`（`isPastablePath`）。
- AC12: pass — `docs/herdr-parity.md` H44・`docs/machines.md`・`docs/verification.md`（T8 の独立点検で実装と突き合わせた）。
- AC13: pass — `pnpm -s test` 5094 passed・`aidev smoke` pass。
- AC-I1: pass — どの経路も `hold.cancel(...)`／`discard`／toast で終わり、保持は 20 秒で流れる（`InputGate.test.ts`・`ImagePaster.test.ts`）。
- AC-I2: pass — 確認のダイアログ無し。閉じた pane にはパスを貼らない（`ImagePaster.test.ts`）。
- AC-I3: pass — キー・`Ctrl+Shift+V`・節「キー」（既存の取り込み）はキーボードで操作できる（`KeyInputController.test.ts`・`KeySettings.test.ts`）。
- AC-I4: pass — 送り先はきっかけの pane に固定（`ImagePaster.test.ts`「送り先はきっかけの pane に固定」）。
- AC-I5: pass — 画像が無いときの `\x16` がキーより先・端末以外の Ctrl+V（押しっぱなしを含む）を横取りしない（`KeyInputController.test.ts`）。

## 起動確認（smoke）

新しい入口（CLI のサブコマンド・オプション）は足していないので `smokeCommands` は増やさない。新しい RPC は、ビルドする前の src を使う結合テスト（実物の `composeServer`・`/ws`・中継）で確かめた。

```
smoke: 20260927-clipboard-image-paste
$ pnpm -s build && pnpm -s smoke
smoke: starting server on 127.0.0.1:38392 (state dir /tmp/wtm-smoke-4kWNvo)
{"ts":"2026-09-27T12:05:22.264Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-27T12:05:22.269Z","level":"info","msg":"custom commands loaded","file":"/tmp/wtm-smoke-4kWNvo/commands.json","count":1}
smoke: agent manifests ok (22/22)
smoke: login ok
smoke: websocket connected
smoke: client.hello ok
smoke: workspace.create ok (pane p2)
smoke: pane.subscribe ok
smoke: echo round trip ok
{"ts":"2026-09-27T12:05:23.283Z","level":"info","msg":"custom command run","commandId":"smoke-cat","type":"popup","clientId":"3f0ef653-5e6d-4236-ad2f-1af569a4f93d","paneId":"p2"}
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
$ pnpm --filter @wtm/cli run smoke

> @wtm/cli@0.1.0 smoke /workspaces/web-tn-multiplexer-wt/clipboard-image-paste/packages/cli
> node --enable-source-maps dist/smoke.js

smoke(cli): temp server state dir /tmp/wtmctl-smoke-state-jHhrs3, sandboxed HOME /tmp/wtmctl-smoke-home-lfO0oh
{"ts":"2026-09-27T12:05:31.963Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-09-27T12:05:31.966Z","level":"info","msg":"custom commands loaded","file":"/tmp/wtmctl-smoke-state-jHhrs3/commands.json","count":0}
smoke(cli): server listening on http://127.0.0.1:38992
smoke(cli): wtmctl workspace create ok (pane p2)
smoke(cli): wtmctl pane run ok (no --token needed; cached session reused)
smoke(cli): wtmctl pane read ok (echo round trip confirmed)
smoke(cli): wtmctl snapshot ok
smoke(cli): wtmctl workspace/pane report-metadata ok (normalized, in snapshot, cleared, bad source refused)
smoke(cli): wtmctl agent list ok (no agents)
smoke(cli): wtmctl agent rename ok (named, resolved by name, cleared)
smoke(cli): wtmctl agent start ok (usage error for an unknown kind, agent_pane_busy on a pane with an agent)
smoke(cli): wtmctl agent send-keys ok (the RPC accepted the keys)
smoke(cli): wtmctl agent prompt ok (submitted; the shell printed the marker)
smoke(cli): wtmctl pane attach refuses a non-terminal (not_a_tty)
smoke(cli): wtmctl pane attach ok (in a real PTY: size 100x30, echo round trip, resize 90x25, Ctrl+B q exit 0, left the alternate screen)
smoke(cli): wtmctl pane observe/control ok (pipes: full first frame, control size 100x30, NDJSON input round trip, invalid line warned, release exit 0, observe pane_closed exit 0)
smoke(cli): PASS
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && node packages/server/dist/main.js token reset --session smoke --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && node packages/server/dist/main.js session list --state-dir "$d" | grep -q '^smoke ' && node packages/server/dist/main.js session delete smoke --state-dir "$d" && test ! -e "$d/sessions/smoke"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: bqUnhgHaqCQf-g4XVDXcvjOkNoPPYjOG
wtm: deleted session smoke (/tmp/tmp.qQzgpEpqX0/sessions/smoke)
$ WTMCTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill | cmp - packages/cli/skills/wtmctl/SKILL.md
$ d=$(mktemp -d) && mkdir -p "$d/sessions/smoke" && WTM_SESSION=smoke node packages/server/dist/main.js token reset --state-dir "$d" && test -f "$d/sessions/smoke/auth.json" && test ! -e "$d/auth.json" && { WTM_SESSION=a/b node packages/server/dist/main.js token reset --state-dir "$d" 2>/dev/null; test $? -eq 2; } && test ! -e "$d/auth.json"; rc=$?; rm -rf "$d"; exit $rc
wtm: new token: 4NGWQUdAUNd25sKs1J99DZvjZ2ufguE_
$ node packages/server/dist/handoffSmoke.js
handoff-smoke: not running → exit 3, nothing created ok
handoff-smoke: before: server pid 634745, pane p1, shell pid 634758
handoff-smoke: wtm handoff → exit 0: wtm: handoff complete: 1 pane(s) kept running
handoff-smoke: same server pid, /ws closed with 1012, handoff.json removed ok
handoff-smoke: same pane, same shell pid, previous screen visible, input/output ok
handoff-smoke: resize reaches the adopted pty ok
handoff-smoke: pane closes when the adopted shell exits ok
handoff-smoke: ok
$ node packages/server/dist/stopSmoke.js
stop-smoke: not running → exit 3, nothing created ok
stop-smoke: started: pid 635141, pane p2, marker shown
stop-smoke: stopped: CLI exit 0, server exit 0, list shows stopped, lock released, state saved ok
stop-smoke: stopped → exit 3 ok
stop-smoke: restarted: same pane, previous screen restored ok
stop-smoke: ok
$ node packages/server/dist/machineSmoke.js
machine-smoke: remote wtm serve started (pid 635333)
machine-smoke: wtm machine add (probed over the fake ssh) and list ok
machine-smoke: local wtm serve connected to the remote machine (machine.list: online)
machine-smoke: relay ok: hello (hostname OSK2-024680-2), workspace.create and echo reached the remote wtm serve
machine-smoke: ok
smoke: pass (exit 0, 8 本)
```

## 未検証の穴（skip / 環境不足）

- 実物のブラウザ（Chromium・Firefox・Safari・スマートフォン）のクリップボード・許可の画面・paste イベントの `clipboardData`、本物の Claude Code・Codex での添付は確かめていない
  （E2E は利用者の指示で回さない。happy-dom と偽のクリップボードの単体テストのみ）。手順は `docs/verification.md`「共通：クリップボードの画像の貼り付け」。
- Windows ネイティブのサーバでの置き場所の権限（0700/0600 は効かない）・パスに空白を含む場合のエージェントの扱い。
- 実物の SSH を越えた中継（偽の ssh で同じプロセスの 2 つのサーバを繋いだ結合テストのみ。smoke の `machineSmoke` は画像を送らない）。
- 大きな画像（16 MiB 近く）を遅い回線で送ったときの体感（20 秒の保持を超える場合）。負荷をかける試験は利用者の指示で行わない。
