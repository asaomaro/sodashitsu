# テスト結果: 端末内の画像表示（Kitty graphics。herdr H13）

## 実行したもの

- `pnpm -s build` — exit 0（`scratchpad/build2.log`）
- `pnpm -s typecheck` — exit 0（`scratchpad/typecheck2.log`）
- `pnpm -s test`（全体） — 217 files / **4310 passed / 0 failed / 0 skipped**（test 工程の 1 回目。`scratchpad/full-test2.log`）
  - coding の最後の 1 回目（T9）は 4307 passed / 1 failed。落ちたのは `composeServer.integration.test.ts` の画面履歴のテスト（タイムアウト。この work の変更と無関係の既知の負荷で揺れるテスト）で、
    そのファイルだけを 1 回走らせ直して 38 passed。下の「失敗の証跡」に生の出力を貼る。その後 `maxPngBytes` を足してから全体を走らせたのが上の 4310 passed。
- 追加・変更したテスト（単独の実行でも全て通る）: `png.test.ts`（8）・`KittyGraphics.test.ts`（41）・`Mirror.test.ts`（+2）・`TerminalHost.test.ts`（+7）・
  `NodePtyBackend.integration.test.ts`（+1。python3 で `TIOCGWINSZ` を読む。この環境では走った）・`QueryFilter.test.ts`（+1）・`TerminalRegistry.test.ts`（+5）・
  `imageAddon.test.ts`（3）・`imageAddon.cursor.test.ts`（3）
- E2E と負荷試験は走らせていない（利用者の指示）。

### review ラウンド 1 の差し戻し後の再実行（2 回目の test）

- `pnpm -s build`・`pnpm -s typecheck` — exit 0（`scratchpad/build3.log`・`typecheck3.log`）
- `pnpm -s test` — 217 files / **4312 passed / 0 failed / 0 skipped**（`scratchpad/full-test3.log`。`png.test.ts` に 2 本追加）
- `aidev smoke` — pass（exit 0, 5 本）
- 追加の負の確認: `png.ts` の行のフィルタ・圧縮に 4 変異（2 KILLED、2 は同等変異。review.md「ラウンド 1 の対応」）

## 受け入れ基準ごとの判定

- AC1: pass — `KittyGraphics.test.ts`「表示」（1 回の送信・`m=1` の分割・どの位置で割れても同じ結果）、`TerminalHost.test.ts`（ブラウザへは OSC 1337、ミラーへは IND＋CUF、CPR で位置を確認）。
- AC2: pass — `KittyGraphics.test.ts`「生の画素」（f=32・f=24・o=z・既定の f）、`png.test.ts`。
- AC3: pass — `KittyGraphics.test.ts`「問い合わせと応答」（i 無し・q=1・q=2・非対応）、`TerminalHost.test.ts`（DA1 の応答の後に Kitty の OK が 1 回）。
- AC4: pass — `KittyGraphics.test.ts`「保存と後からの配置」（a=t→a=p・ENOENT・I の番号・d=I/d=A・上限）。
- AC5: pass — `KittyGraphics.test.ts`（c/r の表・0 は指定なし・C=1）。
- AC6: pass — `TerminalRegistry.test.ts`（実物の addon を読み込んだ端末から DA1・XTSMGRAPHICS・CSI 14/16/18 t の応答が出ない。負の対照として以前の順序では DA1 に答える）、`QueryFilter.test.ts`、`imageAddon.test.ts`。
- AC7: pass（ミラーとブラウザの addon のコードまで） — ミラー: `TerminalHost.test.ts` の CPR（LNM を含む）。ブラウザ: `imageAddon.cursor.test.ts` で実物の xterm.js＋addon 0.9.0 に
  サーバと同じ形の指示を書き、カーソルが同じ位置になること（C=0・C=1・LNM・下端でのスクロール）を確かめた。**`createImageBitmap` は happy-dom に無いので差し替えている**（描画は確かめていない）。
- AC8: pass — `Mirror.test.ts`（CSI 14/16 t・大きさの変更の後・他の CSI t は headless と同じ）、`TerminalHost.test.ts`（resize に画素・下限 1）、`NodePtyBackend.integration.test.ts`（実 PTY で `WS 30 100 900 510`）。
- AC9: pass — `KittyGraphics.test.ts`「ファイル・共有メモリの転送の拒否」（実在するファイルのパスを t=f/t/s で送ってもエラーで答え、表示せず、t=t でもファイルは残る）。翻訳器は `fs` を import していない。
- AC10: pass — `KittyGraphics.test.ts`「上限」（APC・1 回の送信・画素・1 辺・展開・箱・保存・送る PNG）、`imageAddon.test.ts`（ブラウザの上限）。
- AC11: pass — `KittyGraphics.test.ts`（指示は数値と base64 だけの正規表現に一致・base64 でない中身はエラー）。
- AC12: pass — `KittyGraphics.test.ts`（Kitty 以外の出力はどの位置で割っても連結すれば元のまま）、`TerminalHost.test.ts`（割れた ESC を含む出力がミラーとブラウザへ同じ文字列で渡る）、既存のテスト全体が通る。
- AC13: pass — 上の build・typecheck・全体のテスト・smoke。
- AC14: pass — `docs/herdr-parity.md` H13 の行（対応範囲・herdr との違い・対象外・上限・既知の食い違い）と「未検証のまま見送った項目」。

## 負の確認（変異）

`.aidev/conventions/regression-negative-control.md` に従い、`scratchpad/mutate.py` で 1 変異ずつ当て、対象のテストだけを 1 回走らせ（直列）、元へ戻して `cmp`（`filecmp`）で一致を確かめた
（全ログ `restored identical: True`。各回の後に `sha1sum -c` でも一致）。生のログは `scratchpad/neg/*.log`（コミットしない）。

- T1 `png.ts`: 16 変異。初回の生き残り 2（`ihdr-first-off` → テストを足して KILLED。`len-overflow-check-off` は同等変異：長さの検査を外しても CRC の読み出しが範囲外で不一致になり偽を返す）。点検後の 5 変異は全て KILLED。
- T2 `KittyGraphics.ts`: 60 変異＋点検後の追加 9。初回の生き残り 6 → 5 つはテストを足して KILLED（CAN が末尾・m を持つ新しい分割送信・c だけ/r だけの割り切れない例・10 桁の範囲外の値）、
  1 つ（a=p の id 無しの早期 return）は同等変異なのでコードから消した。
- T3 `Mirror.ts`: 7 変異。生き残り 1（他の Ps で true を返す）は同等変異：headless は `windowOptions` が無効な Ps のハンドラを呼ばずに握りつぶすので、応答が変わらない。
- T4 `NodePtyBackend.ts`・`TerminalHost.ts`・`cellPixels.ts`: 4 変異、全て KILLED（下限 1 は初回生き残り → テストを足して KILLED）。
- T5 `TerminalHost.ts`: 6 変異（画像の文字列の入れ替え・応答の即時書き込み・破棄の確認・翻訳器の迂回・配信の欠落）、全て KILLED。
- T6/T7 web: 7 変異（`enableSizeReports`・`iipSupport`・設定の未渡し・addon の未読み込み・try の除去・握りつぶしの順序を戻す・XTSMGRAPHICS の握りつぶしの除去）、全て KILLED
  （順序の変異は最初「前にも足す」形で同等になったので、「前へ移す」形で作り直して KILLED）。

例（T5 の応答の順序。`scratchpad/neg/t5.log`）:

```
=== response-immediate: KILLED (rc=1)
```

## 失敗の証跡

coding の T9 の全体の実行（1 回目）での失敗。この work の変更に無関係（画面履歴の結合テストのタイムアウト。単独の再実行で通った）:

```
$ pnpm -s test
 FAIL  |@wtm/server| src/composeServer.integration.test.ts > composeServer — 画面履歴（--pane-history） > 停止時に保存し（0600・色つき）、起動し直すと前回の画面・区切りの行・新しいシェルの出力がこの順に並ぶ（AC1・AC2・AC6・AC12）
Error: timed out waiting for the output in the first server
 ❯ until src/composeServer.integration.test.ts:768:40
 Test Files  1 failed | 216 passed (217)
      Tests  1 failed | 4307 passed (4308)
$ npx vitest run packages/server/src/composeServer.integration.test.ts
      Tests  38 passed (38)
```

test 工程の全体の実行では失敗が発生していない。

## 起動確認（smoke）

```
$ aidev smoke
smoke(cli): wtmctl pane observe/control ok (pipes: full first frame, control size 100x30, NDJSON input round trip, invalid line warned, release exit 0, observe pane_closed exit 0)
smoke(cli): PASS
$ WTMCTL_URL=http://127.0.0.1:9 node packages/cli/dist/main.js skill | cmp - packages/cli/skills/wtmctl/SKILL.md
wtm: new token: (省略)
smoke: pass (exit 0, 5 本)
```

`smokeCommands` には足していない: この work は新しい入口（サブコマンド・オプション・設定）を足さない。ビルドしたサーバの出力の経路（`TerminalHost`）は 1 本目の smoke の echo の往復が通る。

## 未検証の穴

- **実物のブラウザでの画像の描画**（canvas への描画・WebGL との重なり・pane を表示し直したとき・HiDPI）: E2E を走らせない指示のため未検証。happy-dom では `createImageBitmap` を差し替えてカーソル位置だけを確かめた。
- 実際の画像ツール（`kitten icat`・`chafa`・`timg`・`img2sixel`）での動作: 手元に無く未検証（プロトコルの形は参照実装とテストで確かめた）。
- Windows（ConPTY）で Kitty の APC が出力に届くか、`ws_xpixel` が無視されること: 未検証。
- 基準のセル 9×17 px が既定のフォントの実際のセルに近いか: 未計測。
- 既知の食い違い（decisions D13）: ブラウザで画像を置けなかったとき・DECSDM のとき、プログラムが直接出した Sixel/iTerm2 の画像。
