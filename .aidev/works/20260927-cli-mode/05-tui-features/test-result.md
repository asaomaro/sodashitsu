# テスト結果: 05-tui-features

## 実行したもの（6fcf23f だけを取り出した作業ツリー）
- `pnpm build` — exit 0 / `pnpm typecheck` — exit 0
- `pnpm test` — 320 files / 5757 passed / 1 failed（下の証跡）。落ちた 1 件を単独で再実行すると 38 passed・exit 0
- `npx eslint packages --ext .ts` — exit 1（18 errors。**すべて今回触っていない packages/cli・packages/server の既存のファイル**〔ansiStrip.ts・attach.integration.test.ts・sessionStream*.ts・smoke.ts・agentInput.ts・MachineLink*.ts・MachineManager.ts・AdoptedPtyProcess.test.ts・KittyGraphics*.ts〕。packages/tui・client-core・web・protocol は 0 件）
- `node scripts/tui-pty-verify.mjs` — exit 0

## ラウンド 2（review の差し戻し・T7 の追加の後。f32e3f6 を取り出した作業ツリー）
- `pnpm build`・`pnpm typecheck` — exit 0
- `pnpm test` — 323 files / 5793 passed / 0 failed / 0 skipped
- `npx eslint packages/tui packages/client-core packages/web/src packages/protocol` — exit 0
- `node scripts/tui-pty-verify.mjs` — exit 0（新しい状態ディレクトリではじめの案内が出て Enter で閉じる流れを含む）
- `node packages/tui/dist/bench/latency.js` — exit 0

```
(a) 1 pane      打鍵→フレーム {"n":30,"p50":6.6,"p95":8.7,"max":9.5} ms / 素の往復 {"n":30,"p50":3,"p95":4,"max":5.6} ms
(d) 大量出力の隣 打鍵→フレーム {"n":30,"p50":6.5,"p95":7.6,"max":7.9} ms（隣の pane: 3.1 MB を 1789 ms）
(b) 16 pane     打鍵→フレーム {"n":30,"p50":6.2,"p95":37.9,"max":73.7} ms / 大きさの変更→全体の描き直し 9.9 ms（pane 16 個）
(c) エージェント 起動→サイドバーに出る 440 ms / 止める→消える 198 ms（目安 2000 ms 以内）
端末版が足した遅延（p95 の差の目安）: 4.7 ms（目安 50 ms 以内）
```

## 受け入れ基準ごとの判定（この subtask の分）
- AC11: pass（設定画面・共有の設定・別のマシンを見ている間も手元とだけ同期）
- AC13: pass（通知の経路・トースト・OSC 9/99/777・tmux の包み・prefix+o・知らせの一覧。外側の端末での実際の表示は親の統合 test）
- AC14: pass（マシンの一覧・要約の接続・切り替え・サイドバーの見出し。本物の SSH 先は未確認）
- AC7: pass（OSC 52・手元の道具・画像の貼り付け）
- AC-I1〜AC-I4（設定画面・知らせの一覧）: pass
- AC5・AC8（独自コマンド）: pass

## 失敗の証跡

```
 FAIL  |@sodashitsu/server| src/composeServer.integration.test.ts > composeServer — 名前付き session の表示・一覧・Cookie・ポートの記憶 > 名前付き session は待ち受けたポートを記録し、--port の無い次の起動でそのポートを使う。--port を付ければそのポートで記録も変わる（AC10・AC16 の出所）
AssertionError: expected 39694 not to be 39694 // Object.is equality
 Test Files  1 failed | 319 passed (320)
      Tests  1 failed | 5757 passed (5758)
$ npx vitest run packages/server/src/composeServer.integration.test.ts
      Tests  38 passed (38)
```

空きポートを 2 回選ぶ既存の試験（20260926-named-session のもの。この work では触っていない）が、同じポートを引いたための偶発の失敗と見る。単独の再実行で通る。

### 負の確認（点検の指摘の修正。直した行を戻して落ちることの生の出力）

```
===== 05T1-D10-localOnly (2026-09-28T07:16:12)
mutation: src/settings/SettingsWriter.ts
  - 'if (errorCodeOf(err) === "invalid_params") {'
  + 'if (false) {'
command: (cd packages/tui && npx vitest run src/modes/SettingsDialog.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/SettingsDialog.test.ts > 設定画面の点検の指摘（05 T1） > 大きすぎて受け付けられない変更は、この画面の中だけで効かせたまま 1 回だけ知らせる（D10）
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/modes/SettingsDialog.test.ts:340:33
    338|     w.setShared({ statusSymbols: false });
    339|     await flush();
    340|     expect(prefs.statusSymbols).toBe(false);
       |                                 ^
    341|     w.setShared({ paneGaps: false });
    342|     await flush();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=99674129066d5d02 after=99674129066d5d02 IDENTICAL

===== 05T1-D10-notify-once (2026-09-28T07:16:18)
mutation: src/settings/SettingsWriter.ts
  - '          if (!this.tooLargeShown) {'
  + '          if (true) {'
command: (cd packages/tui && npx vitest run src/modes/SettingsDialog.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/SettingsDialog.test.ts > 設定画面の点検の指摘（05 T1） > 大きすぎて受け付けられない変更は、この画面の中だけで効かせたまま 1 回だけ知らせる（D10）
AssertionError: expected [ …(2) ] to deeply equal [ Array(1) ]

- Expected
+ Received

  [
    "設定が大きすぎるため、サーバに保存できませんでした（この画面の中だけで効きます）",
+   "設定が大きすぎるため、サーバに保存できませんでした（この画面の中だけで効きます）",
  ]

 ❯ src/modes/SettingsDialog.test.ts:343:20
    341|     w.setShared({ paneGaps: false });
    342|     await flush();
    343|     expect(toasts).toEqual(["設定が大きすぎるため、サーバに保存できませんでした（この画面の中だけで効きます）"…
       |                    ^
    344|   });
    345|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=99674129066d5d02 after=99674129066d5d02 IDENTICAL

===== 05T1-tui-base-server (2026-09-28T07:16:24)
mutation: src/settings/SettingsWriter.ts
  - 'const base: Record<string, unknown> = { ...this.deps.prefs.serverTui };'
  + 'const base: Record<string, unknown> = { ...this.deps.prefs.tui };'
command: (cd packages/tui && npx vitest run src/modes/SettingsDialog.test.ts)  exit=0
raw output:
      Tests  17 passed (17)
restored: sha256 before=99674129066d5d02 after=99674129066d5d02 IDENTICAL

===== 05T1-tui-inflight-drop-failed (2026-09-28T07:16:29)
mutation: src/settings/SettingsWriter.ts
  - '      if (this.tuiInflight.get(key)?.token === token) this.tuiInflight.delete(key);'
  + '      void token;'
command: (cd packages/tui && npx vitest run src/modes/SettingsDialog.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/SettingsDialog.test.ts > 設定画面の点検の指摘（05 T1） > tui の項目は、サーバが受け付けた tui に今回の項目（と返事待ちの項目）だけを重ねて送る。失敗した項目は乗せない
AssertionError: expected { tui: { narrowThreshold: 50, …(2) } } to deeply equal { tui: { narrowThreshold: 50, …(1) } }

- Expected
+ Received

  {
    "tui": {
      "copyOnSelect": false,
+     "mouseCapture": false,
      "narrowThreshold": 50,
    },
  }

 ❯ src/modes/SettingsDialog.test.ts:360:21
    358|     w.setTui("copyOnSelect", false);
    359|     await flush();
    360|     expect(sent[1]).toEqual({ tui: { narrowThreshold: 50, copyOnSelect…
       |                     ^
    361|   });
    362|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=99674129066d5d02 after=99674129066d5d02 IDENTICAL

===== 05T1-strict-int (2026-09-28T07:16:35)
mutation: src/settings/sections.ts
  - 'const n = /^\\d+$/.test(t) ? Number(t) : Number.NaN;'
  + 'const n = Number(t);'
command: (cd packages/tui && npx vitest run src/modes/SettingsDialog.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/SettingsDialog.test.ts > 設定画面の点検の指摘（05 T1） > 数の入力は 10 進の数字だけ（空・0x40・1e2 は通さない）
AssertionError: expected [ { id: '10', …(2) }, …(3) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "id": "10",
+     "method": "prefs.set",
+     "params": {
+       "baseRev": 0,
+       "patch": {
+         "tui": {
+           "sidebarCols": 64,
+         },
+       },
+     },
+   },
+   {
+     "id": "12",
+     "method": "prefs.set",
+     "params": {
+       "baseRev": 0,
+       "patch": {
+         "tui": {
+           "sidebarCols": 100,
+         },
+       },
+     },
+   },
+   {
+     "id": "14",
+     "method": "prefs.set",
+     "params": {
+       "baseRev": 0,
+       "patch": {
+         "tui": {
+           "sidebarCols": 50,
+         },
+       },
+     },
+   },
+   {
+     "id": "16",
+     "method": "prefs.set",
+     "params": {
+       "baseRev": 0,
+       "patch": {
+         "tui": {
+           "sidebarCols": 30,
+         },
+       },
+     },
+   },
+ ]

 ❯ src/modes/SettingsDialog.test.ts:377:40
    375|       h.io.type(ENTER + "\x15" + bad + ENTER);
    376|     }
    377|     expect(h.ws.requests("prefs.set")).toEqual([]);
       |                                        ^
    378|   });
    379|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=10521f6c8aac7f63 after=10521f6c8aac7f63 IDENTICAL

===== 05T1-prefix-reset-only-overridden (2026-09-28T07:16:40)
mutation: src/settings/keySection.ts
  - '...(keyPrefs().prefix !== null ? [{ label: "既定に戻す" }] : []),'
  + '{ label: "既定に戻す" },'
command: (cd packages/tui && npx vitest run src/modes/SettingsDialog.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/SettingsDialog.test.ts > 設定画面の点検の指摘（05 T1） > 独自コマンドがあれば一覧に出し、その割り当てとぶつかるキーは「こちらへ移す」を訊く。prefix の「既定に戻す」は上書きしているときだけ
AssertionError: expected ' Spaces       開いた順 + │ 1:t1   +      …' not to contain '既定に戻す'

- Expected
+ Received

- 既定に戻す
+  Spaces       開いた順 + │ 1:t1   +                                                   session: work
+  ┌─ 設定 ─────────────────────────────────────────────────────────────────────────────────────────┐┐
+  │  通知             │  prefix                                                            ctrl+b  ││
+  │  テーマ           │  プリセットを足す                                                          ││
+  │  表示             │ 全体                                                                       ││
+  │  端末             │    キー一覧                                                      prefix+?  ││
+  │  エージェント連携 │    このブラウザを切り離す                                        prefix+q  ││
+  │  キー             │    設定                                                          prefix+s  ││
+  │  端末版           │    次の知らせへ移る                                              prefix+o  ││
+  │                   │    設定を読み直す                                          prefix+shift+r  ││
+  │                   │    サーバを止める                                                    なし  ││
+  │                   │ workspace / tab                                                            ││
+  │                   │    workspace の一覧へ（navigate モ…                              prefix+w  ││
+  │                   │    goto（work┌─ prefix（ctrl+b） ───────┐                        prefix+g  ││
+  │                   │    新規 works│   変更（次に押したキー） │                  prefix+shift+n  ││
+  │                   │    workspace │   既定に戻す             │                  prefix+shift+w  ││
+  │                   │    workspace └──────────────────────────┘                  prefix+shift+d  ││
+  │                   │    新しい worktree                                         prefix+shift+g  ││
+  │                   │    新規 tab                                                      prefix+c  ││
+  │                   │    次の tab                                                      prefix+n  ││
+  │                   │    前の tab                                                      prefix+p  ││
+  │                   │    tab を切り替え（1〜9）                                     prefix+1..9  ││
+  │                   │    tab の名前を変更                                        prefix+shift+t  ││
+  │                   │    tab を閉じる                                            prefix+shift+x↓ ││
+  │ ────────────────────────────────────────────────────────────────────────────────────────────── ││
+  │ prefix には ctrl+英字・alt+1 文字・ctrl+alt+英字・F1〜F12 を使えます。                         ││
+  │                                                                                                ││
+  │                                                                                                ││
+  └────────────────────────────────────────────────────────────────────────────────────────────────┘│
+                        « │└───────────────────────────────────⋯└───────────────────────────────────⋯

 ❯ src/modes/SettingsDialog.test.ts:409:19
    407|     t = await h.screen();
    408|     expect(t).toContain("変更（次に押したキー）");
    409|     expect(t).not.toContain("既定に戻す");
       |                   ^
    410|     h.io.type(ESC + "[B"); // 一覧を閉じる前に Esc だけ送ると確定待ちになるので、矢印と組にして送る
    411|     await new Promise((r) => setTimeout(r, 40));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7342867fb74528ba after=7342867fb74528ba IDENTICAL

===== 05T1-commands-in-keymap (2026-09-28T07:16:47)
mutation: src/app/TuiApp.ts
  - 'resolveKeymap(keyPrefs, commandKeyDefs(this.keymapCommands))'
  + 'resolveKeymap(keyPrefs)'
command: (cd packages/tui && npx vitest run src/modes/SettingsDialog.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/SettingsDialog.test.ts > 設定画面の点検の指摘（05 T1） > 独自コマンドがあれば一覧に出し、その割り当てとぶつかるキーは「こちらへ移す」を訊く。prefix の「既定に戻す」は上書きしているときだけ
AssertionError: expected [] to deeply equal [ 'ctrl+alt+d' ]

- Expected
+ Received

- [
-   "ctrl+alt+d",
- ]
+ []

 ❯ src/modes/SettingsDialog.test.ts:395:70
    393|     h.app.prefs.apply({ keys: { commands: { deploy: ["ctrl+alt+d"] } }…
    394|     const km = () => (h.app as unknown as { keymap: { bindingsOf(id: s…
    395|     await vi.waitFor(() => expect(km().bindingsOf("command:deploy")).t…
       |                                                                      ^
    396|     h.io.type("\x02s");
    397|     await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ ki…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=f6d55f0565e6ab5e after=f6d55f0565e6ab5e IDENTICAL

===== 05T1-prefs-bad-rev (2026-09-28T07:16:53)
mutation: src/model/PrefsModel.ts
  - 'if (typeof rev !== "number" || !Number.isFinite(rev) || rev < this.revision) return;'
  + 'if (rev < this.revision) return;'
command: (cd packages/tui && npx vitest run src/modes/SettingsDialog.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/SettingsDialog.test.ts > 設定画面の点検の指摘（05 T1） > 独自コマンドがあれば一覧に出し、その割り当てとぶつかるキーは「こちらへ移す」を訊く。prefix の「既定に戻す」は上書きしているときだけ
AssertionError: expected [] to deeply equal [ 'ctrl+alt+d' ]

- Expected
+ Received

- [
-   "ctrl+alt+d",
- ]
+ []

 ❯ src/modes/SettingsDialog.test.ts:395:70
    393|     h.app.prefs.apply({ keys: { commands: { deploy: ["ctrl+alt+d"] } }…
    394|     const km = () => (h.app as unknown as { keymap: { bindingsOf(id: s…
    395|     await vi.waitFor(() => expect(km().bindingsOf("command:deploy")).t…
       |                                                                      ^
    396|     h.io.type("\x02s");
    397|     await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ ki…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=449318fecb466bd8 after=449318fecb466bd8 IDENTICAL

===== 05T1-tui-base-server (テストを足した後) (2026-09-28T07:17:14)
mutation: src/settings/SettingsWriter.ts
  - 'const base: Record<string, unknown> = { ...this.deps.prefs.serverTui };'
  + 'const base: Record<string, unknown> = { ...this.deps.prefs.tui };'
command: (cd packages/tui && npx vitest run src/modes/SettingsDialog.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/SettingsDialog.test.ts > 設定画面の点検の指摘（05 T1） > この画面だけで効かせている tui の項目（大きすぎて保存できなかった）も、ほかの項目の要求に乗せない
AssertionError: expected { tui: { narrowThreshold: 50, …(2) } } to deeply equal { tui: { narrowThreshold: 50, …(1) } }

- Expected
+ Received

  {
    "tui": {
      "copyOnSelect": false,
+     "mouseCapture": false,
      "narrowThreshold": 50,
    },
  }

 ❯ src/modes/SettingsDialog.test.ts:376:21
    374|     expect(prefs.mouseCapture).toBe(false); // この画面だけで効いている
    375|     w.setTui("copyOnSelect", false);
    376|     expect(sent[1]).toEqual({ tui: { narrowThreshold: 50, copyOnSelect…
       |                     ^
    377|   });
    378|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=99674129066d5d02 after=99674129066d5d02 IDENTICAL

===== 05T2-partial-reply-guard (2026-09-28T08:13:50)
mutation: src/input/decode.ts
  - '      if (len === null && this.partialReply(s)) return "incomplete";\n'
  + ''
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder：背景色の問い合わせの応答が読みで割れても打鍵にしない（05 T2 の点検） > 問い合わせの直後は、割れた ESC ] 1… を ESC の時間切れでも待ち、続きで明暗として読む
AssertionError: expected [ { kind: 'key', …(2) }, …(12) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "key": {
+       "alt": true,
+       "code": "]",
+       "composing": false,
+       "ctrl": false,
+       "key": "]",
+       "meta": false,
+       "shift": false,
+       "type": "keydown",
+     },
+     "kind": "key",
+     "raw": "]",
+   },
+   {
+     "key": {
+       "alt": false,
+       "code": "Digit1",
+       "composing": false,
+       "ctrl": false,
+       "key": "1",
+       "meta": false,
+       "shift": false,
+       "type": "keydown",
+     },
+     "kind": "key",
+     "raw": "1",
+   },
+   {
+     "key": {
+       "alt": false,
+       "code": "Digit1",
+       "composing": false,
+       "ctrl": false,
+       "key": "1",
+       "meta": false,
+       "shift": false,
+       "type": "keydown",
+     },
+     "kind": "key",
+     "raw": "1",
+   },
+   {
+     "key": {
+       "alt": false,
+       "code": ";",
+       "composing": false,
+       "ctrl": false,
+       "key": ";",
+       "meta": false,
+       "shift": false,
+       "type": "keydown",
+     },
+     "kind": "key",
+     "raw": ";",
+   },
+   {
+     "key": {
+       "alt": false,
+       "code": "KeyR",
+       "composing": false,
+       "ctrl": false,
+       "key": "r",
+       "meta": false,
+       "shift": false,
+       "type": "keydown",
+     },
+     "kind": "key",
+     "raw": "r",
+   },
restored: sha256 before=53b05964ff2a9087 after=53b05964ff2a9087 IDENTICAL

===== 05T2-partial-reply-guard (app) (2026-09-28T08:13:54)
mutation: src/input/decode.ts
  - '      if (len === null && this.partialReply(s)) return "incomplete";\n'
  + ''
command: (cd packages/tui && npx vitest run src/render/theme.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/render/theme.test.ts > 明暗の自動の切り替え > 背景色の応答が読みで割れても（ESC の時間切れをまたいでも）打鍵として pane へ送らない
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/render/theme.test.ts:97:59
     95|     await new Promise((r) => setTimeout(r, 80)); // ESC の時間切れ（25ms・長め …
     96|     h.io.type("ff/ffff\x07");
     97|     await vi.waitFor(() => expect(h.app.prefs.systemDark).toBe(false));
       |                                                           ^
     98|     expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toEqual([…
     99|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/render/theme.test.ts > 明暗の自動の切り替え > 応答が来ないまま締め切りを過ぎたら、待っていた列はいつもの規則で打鍵として送る
AssertionError: expected [ …(2) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   Uint8Array [
+     3,
+     2,
+     112,
+     49,
+     27,
+     93,
+   ],
+   Uint8Array [
+     3,
+     2,
+     112,
+     49,
+     49,
+   ],
+ ]

 ❯ src/render/theme.test.ts:107:62
    105|     h.io.type("\x1b]1"); // 締め切りの内：応答の途中として待つ
    106|     await new Promise((r) => setTimeout(r, 100));
    107|     expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toEqual([…
       |                                                              ^
    108|     // 締め切り（起動から 500ms）を過ぎたら Alt+] と 1 として pane へ。
    109|     await vi.waitFor(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=53b05964ff2a9087 after=53b05964ff2a9087 IDENTICAL

===== 05T2-expect-reply-call (2026-09-28T08:13:58)
mutation: src/app/TuiApp.ts
  - '      this.decoder.expectReply(REPLY_WAIT_MS);\n'
  + ''
command: (cd packages/tui && npx vitest run src/render/theme.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/render/theme.test.ts > 明暗の自動の切り替え > 背景色の応答が読みで割れても（ESC の時間切れをまたいでも）打鍵として pane へ送らない
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/render/theme.test.ts:97:59
     95|     await new Promise((r) => setTimeout(r, 80)); // ESC の時間切れ（25ms・長め …
     96|     h.io.type("ff/ffff\x07");
     97|     await vi.waitFor(() => expect(h.app.prefs.systemDark).toBe(false));
       |                                                           ^
     98|     expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toEqual([…
     99|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/render/theme.test.ts > 明暗の自動の切り替え > 応答が来ないまま締め切りを過ぎたら、待っていた列はいつもの規則で打鍵として送る
AssertionError: expected [ …(2) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   Uint8Array [
+     3,
+     2,
+     112,
+     49,
+     27,
+     93,
+   ],
+   Uint8Array [
+     3,
+     2,
+     112,
+     49,
+     49,
+   ],
+ ]

 ❯ src/render/theme.test.ts:107:62
    105|     h.io.type("\x1b]1"); // 締め切りの内：応答の途中として待つ
    106|     await new Promise((r) => setTimeout(r, 100));
    107|     expect(h.ws.sent.filter((m) => m instanceof Uint8Array)).toEqual([…
       |                                                              ^
    108|     // 締め切り（起動から 500ms）を過ぎたら Alt+] と 1 として pane へ。
    109|     await vi.waitFor(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=e340f19c0a84db65 after=e340f19c0a84db65 IDENTICAL

===== 05T2-waitms-deadline (2026-09-28T08:14:00)
mutation: src/input/decode.ts
  - '    if (this.partialReply(this.pending)) return Math.max(ESC_TIMEOUT_MS, this.replyDeadline - this.now());\n'
  + ''
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder：背景色の問い合わせの応答が読みで割れても打鍵にしない（05 T2 の点検） > 問い合わせの直後は、割れた ESC ] 1… を ESC の時間切れでも待ち、続きで明暗として読む
AssertionError: expected 25 to be greater than or equal to 400
 ❯ src/input/decode.test.ts:334:22
    332|     expect(d.feed("\x1b]11;rgb:ffff/")).toEqual([]);
    333|     expect(d.waiting).toBe(true);
    334|     expect(d.waitMs).toBeGreaterThanOrEqual(400);
       |                      ^
    335|     now += 30;
    336|     expect(d.flush()).toEqual([]); // ESC の時間切れでも確定しない

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=53b05964ff2a9087 after=53b05964ff2a9087 IDENTICAL

===== 05T2-rearm-esc-timer (予備の守り) (2026-09-28T08:14:04)
mutation: src/app/TuiApp.ts
  - '      for (const ev of this.decoder.flush()) this.handleInput(ev);\n      this.armEscTimer();'
  + '      for (const ev of this.decoder.flush()) this.handleInput(ev);'
command: (cd packages/tui && npx vitest run src/render/theme.test.ts)  exit=0
raw output:
      Tests  10 passed (10)
restored: sha256 before=e340f19c0a84db65 after=e340f19c0a84db65 IDENTICAL

===== 05T2-css-4-args (2026-09-28T08:14:08)
mutation: src/render/cssColor.ts
  - '  if (parts.length !== 3) return null;\n'
  + ''
command: (cd packages/tui && npx vitest run src/render/theme.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/render/theme.test.ts > CSS の色の読み取り（色の上書き） > #hex・rgb()・hsl()・色の名前。透明度は捨て、読めないものは null
AssertionError: expected { r: 1, g: 2, b: 3 } to be null

- Expected:
null

+ Received:
{
  "b": 3,
  "g": 2,
  "r": 1,
}

 ❯ src/render/theme.test.ts:21:34
     19|     // web（ブラウザの CSS）が落とす値は通さない。
     20|     for (const bad of ["rgb(1 2 3 4)", "rgb(255, 50%, 0)", "rgb(100% 0…
     21|       expect(parseCssColor(bad)).toBeNull();
       |                                  ^
     22|     expect(parseCssColor("rgb(1 2 3 / 50%)")).toEqual({ r: 1, g: 2, b:…
     23|     expect(parseCssColor("rgba(1, 2, 3, 0.5)")).toEqual({ r: 1, g: 2, …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=097dc72100a6c010 after=097dc72100a6c010 IDENTICAL

===== 05T2-css-mixed-pct (2026-09-28T08:14:11)
mutation: src/render/cssColor.ts
  - '    if (pct.some((x) => x !== pct[0])) return null;\n'
  + ''
command: (cd packages/tui && npx vitest run src/render/theme.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/render/theme.test.ts > CSS の色の読み取り（色の上書き） > #hex・rgb()・hsl()・色の名前。透明度は捨て、読めないものは null
AssertionError: expected { r: 255, g: 128, b: +0 } to be null

- Expected:
null

+ Received:
{
  "b": 0,
  "g": 128,
  "r": 255,
}

 ❯ src/render/theme.test.ts:21:34
     19|     // web（ブラウザの CSS）が落とす値は通さない。
     20|     for (const bad of ["rgb(1 2 3 4)", "rgb(255, 50%, 0)", "rgb(100% 0…
     21|       expect(parseCssColor(bad)).toBeNull();
       |                                  ^
     22|     expect(parseCssColor("rgb(1 2 3 / 50%)")).toEqual({ r: 1, g: 2, b:…
     23|     expect(parseCssColor("rgba(1, 2, 3, 0.5)")).toEqual({ r: 1, g: 2, …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=097dc72100a6c010 after=097dc72100a6c010 IDENTICAL

===== 05T2-css-comma-slash (2026-09-28T08:14:15)
mutation: src/render/cssColor.ts
  - '    if (t.includes("/")) return null;\n'
  + ''
command: (cd packages/tui && npx vitest run src/render/theme.test.ts)  exit=0
raw output:
      Tests  10 passed (10)
restored: sha256 before=097dc72100a6c010 after=097dc72100a6c010 IDENTICAL

===== 05T2-reveal-all-rows (2026-09-28T08:14:19)
mutation: src/render/chrome/sidebar.ts
  - '    const last = reveal + Math.min(Math.max(1, revealRows), height) - 1;'
  + '    const last = reveal;'
command: (cd packages/tui && npx vitest run src/render/theme.test.ts)  exit=0
raw output:
      Tests  10 passed (10)
restored: sha256 before=bf34b270b8c7bacf after=bf34b270b8c7bacf IDENTICAL

===== 05T2-reveal-all-rows (テストを直した後) (2026-09-28T08:14:39)
mutation: src/render/chrome/sidebar.ts
  - '    const last = reveal + Math.min(Math.max(1, revealRows), height) - 1;'
  + '    const last = reveal;'
command: (cd packages/tui && npx vitest run src/render/theme.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/render/theme.test.ts > サイドバーの行の並び（sidebarRows。web と同じ client-core の resolveRows） > 区画を動かして見せるときは、複数行の項目の全部の行を見せる
AssertionError: expected ' Spaces       開いた順 + \n ○ ws-w1      …' to contain 'Agent-w8'

- Expected
+ Received

- Agent-w8
+  Spaces       開いた順 + 
+  ○ ws-w1                 
+  ○ ws-w2                 
+  ○ ws-w3                 
+  ○ ws-w4                 
+  ○ ws-w5                 
+  ○ ws-w6                 
+  ○ ws-w7                 
+  ○ ws-w8                 
+                          
+                          
+                          
+ ─ Agents ─────グループ順─
+    Agent-w5             ↑
+  ○ ws-w6 t-w6            
+    Agent-w6              
+  ○ ws-w7 t-w7            
+    Agent-w7              
+  ○ ws-w8 t-w8           ↓
+                        « 

 ❯ src/render/theme.test.ts:144:18
    142|       .join("\n");
    143|     expect(side).toContain("ws-w8 t-w8");
    144|     expect(side).toContain("Agent-w8"); // 2 行目（枠の名前ではなくサイドバーの中）
       |                  ^
    145|   });
    146|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=bf34b270b8c7bacf after=bf34b270b8c7bacf IDENTICAL

===== 05T2 の変異で通ったものの扱い（手で書いた注記）
- 05T2-rearm-esc-timer：等価の変異。ESC の待ちの時間（waitMs）が問い合わせの締め切りまでの残りを返すので、最初の時間切れの確定は必ず締め切りの後になり、
  待ち直しの経路を通らない。予備の守りとして残す。
- 05T2-css-comma-slash：等価の変異（カンマ区切りの中の `/` は、その成分が数として読めずに落ちる）。守りが要らないのでコードから外した。

===== 05T2-partial-reply-only-osc (ESC ] だけを応答として待つ) (2026-09-28T08:19:31)
mutation: src/input/decode.ts
  - '    if (!this.awaitingReply || !s.startsWith("\\x1b]")) return false;'
  + '    if (!this.awaitingReply) return false;'
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder：応答を待つ間も、ほかの列（CSI 等）の待ちはいつもどおり > 途中まで届いた CSI（ESC [ 1 …）は応答として待たない
AssertionError: expected 500 to be less than 500
 ❯ src/input/decode.test.ts:367:22
    365|     d.expectReply(500);
    366|     expect(d.feed("\x1b[1;")).toEqual([]);
    367|     expect(d.waitMs).toBeLessThan(500);
       |                      ^
    368|     expect(d.flush().length).toBeGreaterThan(0);
    369|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=c18c8f69d7f2b227 after=c18c8f69d7f2b227 IDENTICAL

===== 05T3-sanitize-c0-c1 (2026-09-28T08:38:46)
mutation: src/notify/terminalNotify.ts
  - 'const isControl = (cp: number): boolean => cp <= 0x1f || (cp >= 0x7f && cp <= 0x9f);'
  + 'const isControl = (cp: number): boolean => cp === 0x1b || cp === 0x07 || cp === 0x9c;'
command: (cd packages/tui && npx vitest run src/notify/notify.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/notify/notify.test.ts > 外側の端末の判定と通知の列（herdr の terminal_notify.rs） > 列：OSC 9・99・777・ベル。tmux の中は素通しの包み。ESC・BEL を落とし改行は空白
AssertionError: expected 'x\u009b31my\u0018\u001a\u007f\u0085\u…' to be 'x31myz' // Object.is equality

Expected: "x31myz"
Received: "x31my
 z"

 ❯ src/notify/notify.test.ts:64:60
     62|     expect(sanitizeText("a\n\tb\x1bc\x07\x9c")).toBe("a  bc");
     63|     // C0・DEL・C1 を全部落とす（ESC 無しで効く CSI〔U+009B〕・CAN・SUB も）。
     64|     expect(sanitizeText("x\x9b31my\x18\x1a\x7f\x85\x00z")).toBe("x31my…
       |                                                            ^
     65|   });
     66| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=f074ffa3415b91d1 after=f074ffa3415b91d1 IDENTICAL

===== 05T3-visible-fresh-layout (2026-09-28T08:38:50)
mutation: src/app/TuiApp.ts
  - '      isPaneVisible: (paneId) => this.layout().panes.some((b) => b.paneId === paneId),'
  + '      isPaneVisible: (paneId) => (this.lastLayout ?? this.layout()).panes.some((b) => b.paneId === paneId),'
command: (cd packages/tui && npx vitest run src/notify/notify.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/notify/notify.test.ts > 端末版の通知（組み立て） > 見えているかは今の割り付けで判定する（同じ打鍵の中で移った先の pane の完了は知らせない）
AssertionError: expected [ { id: 1, …(2) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "id": 1,
+     "message": "Claude（w2 / t2）が完了しました",
+     "onClick": [Function onClick],
+   },
+ ]

 ❯ src/notify/notify.test.ts:263:29
    261|     });
    262|     await new Promise((r) => setTimeout(r, 20));
    263|     expect(h.app.ui.toasts).toEqual([]);
       |                             ^
    264|     expect(h.app.notify.queued).toHaveLength(0);
    265|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=3902ad82fd9e39f0 after=3902ad82fd9e39f0 IDENTICAL

===== 05T3-list-clamp-key (2026-09-28T08:38:52)
mutation: src/modes/NotificationList.ts
  - '    this.selected = Math.max(0, Math.min(this.selected, rows.length - 1));\n    if (isDown(k))'
  + '    if (isDown(k))'
command: (cd packages/tui && npx vitest run src/notify/notify.test.ts)  exit=0
raw output:
      Tests  11 passed (11)
restored: sha256 before=a990df887d5b2252 after=a990df887d5b2252 IDENTICAL

===== 05T3-list-guard-row (2026-09-28T08:38:55)
mutation: src/modes/NotificationList.ts
  - '      if (row) this.notify.dismiss(row.key);'
  + '      this.notify.dismiss(row!.key);'
command: (cd packages/tui && npx vitest run src/notify/notify.test.ts)  exit=0
raw output:
      Tests  11 passed (11)
restored: sha256 before=a990df887d5b2252 after=a990df887d5b2252 IDENTICAL

===== 05T3-list-clamp-key (テストを足した後) (2026-09-28T08:39:16)
mutation: src/modes/NotificationList.ts
  - '    this.selected = Math.max(0, Math.min(this.selected, rows.length - 1));\n    if (isDown(k))'
  + '    if (isDown(k))'
command: (cd packages/tui && npx vitest run src/notify/notify.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/notify/notify.test.ts > 端末版の通知（組み立て） > 知らせの一覧を開いている間に行き先が減っても壊れない
AssertionError: expected [ 'a', 'b' ] to deeply equal [ 'b' ]

- Expected
+ Received

  [
+   "a",
    "b",
  ]

 ❯ src/notify/notify.test.ts:293:40
    291|     n.dismiss("c");
    292|     h.io.type("\x1b[3~");
    293|     expect(n.queued.map((q) => q.key)).toEqual(["b"]);
       |                                        ^
    294|   });
    295| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=a990df887d5b2252 after=a990df887d5b2252 IDENTICAL

===== 05T3-list-guard-row の扱い（手で書いた注記）
- 等価の変異：キーの処理の頭で選択を行の数に収めるので、Delete の時点で行は必ずある。`if (row)` は予備の守りとして残す（収める処理を外す変異は、
  テストを足した後に失敗する＝上の 05T3-list-clamp-key）。

===== 05T4-prefs-changed-local-only (2026-09-28T08:59:21)
mutation: src/app/TuiApp.ts
  - '        if (this.machines.selectedId === LOCAL_MACHINE_ID) this.prefs.apply(data.prefs, data.rev);'
  + '        this.prefs.apply(data.prefs, data.rev);'
command: (cd packages/tui && npx vitest run src/net/machines.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/machines.test.ts > 複数ホストの点検の指摘（05 T4） > ほかのマシンを見ている間、共有の設定はローカルのサーバとだけ（読む・書く・知らせを受ける）
AssertionError: expected 'vesper' to be 'nord' // Object.is equality

Expected: "nord"
Received: "vesper"

 ❯ src/net/machines.test.ts:227:31
    225|     // 遠くのサーバの prefs.changed は当てない。ローカルの軽い接続のものは当てる。
    226|     main.event("prefs.changed", { prefs: { theme: "vesper" }, rev: 9, …
    227|     expect(h.app.prefs.theme).toBe("nord");
       |                               ^
    228|     local.event("prefs.changed", { prefs: { theme: "gruvbox" }, rev: 4…
    229|     expect(h.app.prefs.theme).toBe("gruvbox");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=08caf388ccd82d5c after=08caf388ccd82d5c IDENTICAL

===== 05T4-prefs-port-local (2026-09-28T08:59:40)
mutation: src/app/TuiApp.ts
  - '      if (this.machines.selectedId === LOCAL_MACHINE_ID) return this.rpc.request(method, params);'
  + '      if (true) return this.rpc.request(method, params);'
command: (cd packages/tui && npx vitest run src/net/machines.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/machines.test.ts > 複数ホストの点検の指摘（05 T4） > ほかのマシンを見ている間、共有の設定はローカルのサーバとだけ（読む・書く・知らせを受ける）
AssertionError: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ src/net/machines.test.ts:221:64
    219|     await vi.waitFor(() => expect(local.requests("client.hello")).toHa…
    220|     local.reply({ clientId: "s2", snapshot: snapshot() });
    221|     await vi.waitFor(() => expect(local.requests("prefs.get")).toHaveL…
       |                                                                ^
    222|     const get = local.requests("prefs.get")[0]!;
    223|     local.onmessage?.({ data: JSON.stringify({ id: get.id, result: { p…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=08caf388ccd82d5c after=08caf388ccd82d5c IDENTICAL

===== 05T4-local-summary-prefs-get (2026-09-28T08:59:54)
mutation: src/app/TuiApp.ts
  - '      onLocalSummaryOpened: () => this.loadPrefs(),\n'
  + ''
command: (cd packages/tui && npx vitest run src/net/machines.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/machines.test.ts > 複数ホストの点検の指摘（05 T4） > ほかのマシンを見ている間、共有の設定はローカルのサーバとだけ（読む・書く・知らせを受ける）
AssertionError: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ src/net/machines.test.ts:221:64
    219|     await vi.waitFor(() => expect(local.requests("client.hello")).toHa…
    220|     local.reply({ clientId: "s2", snapshot: snapshot() });
    221|     await vi.waitFor(() => expect(local.requests("prefs.get")).toHaveL…
       |                                                                ^
    222|     const get = local.requests("prefs.get")[0]!;
    223|     local.onmessage?.({ data: JSON.stringify({ id: get.id, result: { p…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=08caf388ccd82d5c after=08caf388ccd82d5c IDENTICAL

===== 05T4-local-prefs-changed (2026-09-28T09:00:05)
mutation: src/app/TuiApp.ts
  - '      onLocalPrefsChanged: (data) => this.prefs.apply(data.prefs, data.rev),\n'
  + ''
command: (cd packages/tui && npx vitest run src/net/machines.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/machines.test.ts > 複数ホストの点検の指摘（05 T4） > ほかのマシンを見ている間、共有の設定はローカルのサーバとだけ（読む・書く・知らせを受ける）
AssertionError: expected 'nord' to be 'gruvbox' // Object.is equality

Expected: "gruvbox"
Received: "nord"

 ❯ src/net/machines.test.ts:229:31
    227|     expect(h.app.prefs.theme).toBe("nord");
    228|     local.event("prefs.changed", { prefs: { theme: "gruvbox" }, rev: 4…
    229|     expect(h.app.prefs.theme).toBe("gruvbox");
       |                               ^
    230|     // 書き込み・読み直し（reload_config）もローカルへ。
    231|     (h.app as unknown as { dispatcher: { toggleWorkspaceSort(): void; …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=08caf388ccd82d5c after=08caf388ccd82d5c IDENTICAL

===== 05T4-dispatcher-prefs-conn (2026-09-28T09:00:24)
mutation: src/actions/TuiDispatcher.ts
  - '    (this.host.prefsConn ?? this.conn)\n      .request("prefs.set", { patch })'
  + '    this.conn\n      .request("prefs.set", { patch })'
command: (cd packages/tui && npx vitest run src/net/machines.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/machines.test.ts > 複数ホストの点検の指摘（05 T4） > ほかのマシンを見ている間、共有の設定はローカルのサーバとだけ（読む・書く・知らせを受ける）
AssertionError: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ src/net/machines.test.ts:232:41
    230|     // 書き込み・読み直し（reload_config）もローカルへ。
    231|     (h.app as unknown as { dispatcher: { toggleWorkspaceSort(): void; …
    232|     expect(local.requests("prefs.set")).toHaveLength(1);
       |                                         ^
    233|     expect(main.requests("prefs.set")).toEqual([]);
    234|     (h.app as unknown as { dispatcher: { run(a: unknown): void } }).di…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=9416a4f71be44766 after=9416a4f71be44766 IDENTICAL

===== 05T4-reload-local (2026-09-28T09:00:45)
mutation: src/actions/TuiDispatcher.ts
  - '    (this.host.prefsConn ?? this.conn)\n      .request("prefs.get", {})'
  + '    this.conn\n      .request("prefs.get", {})'
command: (cd packages/tui && npx vitest run src/net/machines.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/machines.test.ts > 複数ホストの点検の指摘（05 T4） > ほかのマシンを見ている間、共有の設定はローカルのサーバとだけ（読む・書く・知らせを受ける）
AssertionError: expected [ { id: '2', …(2) } ] to have a length of 2 but got 1

- Expected
+ Received

- 2
+ 1

 ❯ src/net/machines.test.ts:235:41
    233|     expect(main.requests("prefs.set")).toEqual([]);
    234|     (h.app as unknown as { dispatcher: { run(a: unknown): void } }).di…
    235|     expect(local.requests("prefs.get")).toHaveLength(2);
       |                                         ^
    236|     expect(main.requests("prefs.get")).toEqual([]);
    237|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=9416a4f71be44766 after=9416a4f71be44766 IDENTICAL

===== 05T4-key-mode-reset (2026-09-28T09:01:05)
mutation: src/app/TuiApp.ts
  - '    this.keys.router.setMode("terminal");\n'
  + ''
command: (cd packages/tui && npx vitest run src/net/machines.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/machines.test.ts > 複数ホストの点検の指摘（05 T4） > ほかのマシンを見ている間、共有の設定はローカルのサーバとだけ（読む・書く・知らせを受ける）
AssertionError: expected 'navigate' to be 'terminal' // Object.is equality

Expected: "terminal"
Received: "navigate"

 ❯ onRemote src/net/machines.test.ts:202:29
    200|     await vi.waitFor(() => expect(h.app.keys.mode).toBe("navigate"));
    201|     h.app.switchMachine("m1", { workspaceId: "rw1", tabId: "rt1" });
    202|     expect(h.app.keys.mode).toBe("terminal"); // キーのモードは戻す（web の reset…
       |                             ^
    203|     await vi.waitFor(() => expect(h.sockets.filter((s) => s.url.endsWi…
    204|     const main = h.sockets.filter((s) => s.url.endsWith("/ws?machine=m…
 ❯ src/net/machines.test.ts:216:32

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=08caf388ccd82d5c after=08caf388ccd82d5c IDENTICAL

===== 05T4-seen-scope (2026-09-28T09:01:24)
mutation: src/model/SessionModel.ts
  - '    this.seen = seen;\n'
  + ''
command: (cd packages/tui && npx vitest run src/net/machines.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/machines.test.ts > 既読はマシンごと（05 T4） > 切り替えた先のマシンの同じ id のエージェントに、前のマシンの既読を当てない。戻れば前の既読
AssertionError: expected 'idle' to be 'done' // Object.is equality

Expected: "done"
Received: "idle"

 ❯ src/net/machines.test.ts:251:58
    249|     model.reset("m1");
    250|     model.applySnapshot(snap, "c2");
    251|     expect(model.displayStateOf(model.panes.get("p1")!)).toBe("done");
       |                                                          ^
    252|     model.reset(LOCAL_MACHINE_ID);
    253|     model.applySnapshot(snap, "c3");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=969761ade622c769 after=969761ade622c769 IDENTICAL

===== 05T4-4401-refresh (2026-09-28T09:01:44)
mutation: src/net/TuiNet.ts
  - '      if (code === 4401) void this.refreshCookie();'
  + '      void code;'
command: (cd packages/tui && npx vitest run src/net/machines.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/machines.test.ts > 要約の接続の socket（05 T4） > 4401 で閉じたら cookie を取り直す。作るときに投げたらすぐ閉じる socket を返す
AssertionError: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ src/net/machines.test.ts:293:43
    291|     (ws as unknown as FakeSocket).close(4401);
    292|     expect(closes).toEqual([4401]);
    293|     await vi.waitFor(() => expect(logins).toHaveLength(1));
       |                                           ^
    294|     fail = true;
    295|     const dead = net.createSocket("ws://127.0.0.1:9/ws?machine=m1");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=b3482dad5ca736aa after=b3482dad5ca736aa IDENTICAL

===== 05T4-factory-throw (2026-09-28T09:02:03)
mutation: src/net/TuiNet.ts
  - '    } catch {\n      return closedSocket();\n    }'
  + '    } finally {\n      void 0;\n    }'
command: (cd packages/tui && npx vitest run src/net/machines.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/machines.test.ts > 要約の接続の socket（05 T4） > 4401 で閉じたら cookie を取り直す。作るときに投げたらすぐ閉じる socket を返す
Error: certificate mismatch
 ❯ src/net/machines.test.ts:282:27
    280|       {
    281|         createWebSocket: (ep) => (url) => {
    282|           if (fail) throw new Error("certificate mismatch");
       |                           ^
    283|           return new FakeSocket(url, ep.cookie());
    284|         },
 ❯ TuiNet.socketFactory src/net/TuiNet.ts:103:66
 ❯ TuiNet.createSocket src/net/TuiNet.ts:170:17
 ❯ src/net/machines.test.ts:295:22

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=b3482dad5ca736aa after=b3482dad5ca736aa IDENTICAL

===== 05T5-narrow-overlay-images (2026-09-28T09:33:00)
mutation: src/app/TuiApp.ts
  - '    if (this.ui.overlayOpen || layout.sidebarOverlay) return false;'
  + '    if (this.ui.overlayOpen) return false;'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/image/image.test.ts > 画像とクリップボードの点検の指摘（05 T5） > 出し直しは同期の更新の中へ入れ、全体の描き直しの後は置き直す。狭い幅の navigate の重ねたサイドバーの間は出さない
AssertionError: expected '\u001b[?2026h\u001b[?25l\u001b[0m\u00…' not to contain 'a=p,'

Expected: "a=p,"
Received: "[?2026h[?25l[2J[1;1H NAVIGATE     w1  t1  session: work        switch [2;1H Spaces       開[2;17Hい[2;19Hた[2;21H順[2;23H + │[2;27H─[2;28H─[2;29H─[2;30H─[2;31H─[2;32H─[2;33H─[2;34H─[2;35H─[2;36H─[2;37H─[2;38H─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H┐[3;1H   w1                    │[3;27H                       │[4;1H   w2                    │[4;27H                       │[5;1H                         │[5;27H                       │[6;1H                         │[6;27H                       │[7;1H                         │[7;27H                       │[8;1H                         │[8;27H                       │[9;1H                         │[9;27H                       │[10;1H                         │[10;27H                       │[11;1H                         │[11;27H                       │[12;1H                         │[12;27H                       │[13;1H                         │[13;27H                       │[14;1H                         │[14;27H                       │[15;1H                         │[15;27H                       │[16;1H                         │[16;27H                       │[17;1H                         │[17;27H                       │[18;1H                         │[18;27H                       │[19;1H                         │[19;27H                       │[20;1H                       «[20;25H │[20;27H─[20;28H─[20;29H─[20;30H─[20;31H─[20;32H─[20;33H─[20;34H─[20;35H─[20;36H─[20;37H─[20;38H─[20;39H─[20;40H─[20;41H─[20;42H─[20;43H─[20;44H─[20;45H─[20;46H─[20;47H─[20;48H─[20;49H─[20;50H⋯[4;2H[2 q[?25h7_Ga=d,d=a,q=2\_Ga=t,f=100,t=d,i=3,q=2,m=0;iVBORw==\[3;2H_Ga=p,i=3,p=1,c=8,r=2,C=1,z=-1,q=2\8[?2026l[4;2H"

 ❯ src/image/image.test.ts:444:21
    442|     h.app.renderNow();
    443|     out = h.io.output().slice(before);
    444|     expect(out).not.toContain("a=p,");
       |                     ^
    445|     expect(await h.screen()).not.toContain("[画像]");
    446|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=8fe4540d4f44e960 after=8fe4540d4f44e960 IDENTICAL

===== 05T5-replay-after-2J (2026-09-28T09:33:16)
mutation: src/app/TuiApp.ts
  - '      if (output.includes("\\x1b[2J")) this.kitty.forget();\n'
  + ''
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/image/image.test.ts > 画像とクリップボードの点検の指摘（05 T5） > 出し直しは同期の更新の中へ入れ、全体の描き直しの後は置き直す。狭い幅の navigate の重ねたサイドバーの間は出さない
AssertionError: expected '\u001b[?2026h\u001b[?25l\u001b[0m\u00…' to contain 'a=p,'

Expected: "a=p,"
Received: "[?2026h[?25l[2J[1;1H Spaces       開[1;17Hい[1;19Hた[1;21H順[1;23H + │[1;27H 1:t1   +                                                   session: work [2;1H   w1                    │[2;27H┌[2;28H─[2;29H pane p1 ─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H─[2;51H─[2;52H─[2;53H─[2;54H─[2;55H─[2;56H─[2;57H─[2;58H─[2;59H─[2;60H─[2;61H─[2;62H─[2;63H┐[2;64H┌[2;65H─[2;66H pane p2 ─[2;76H─[2;77H─[2;78H─[2;79H─[2;80H─[2;81H─[2;82H─[2;83H─[2;84H─[2;85H─[2;86H─[2;87H─[2;88H─[2;89H─[2;90H─[2;91H─[2;92H─[2;93H─[2;94H─[2;95H─[2;96H─[2;97H─[2;98H─[2;99H─[2;100H┐[3;1H   w2                    │[3;27H│[3;28H                                   │[3;64H│[3;65H                                   │[4;1H                         │[4;27H│[4;28H                                   │[4;64H│[4;65H                                   │[5;1H                         │[5;27H│[5;28H                                   │[5;64H│[5;65H                                   │[6;1H                         │[6;27H│[6;28H                                   │[6;64H│[6;65H                                   │[7;1H                         │[7;27H│[7;28H                                   │[7;64H│[7;65H                                   │[8;1H                         │[8;27H│[8;28H                                   │[8;64H│[8;65H                                   │[9;1H                         │[9;27H│[9;28H                                   │[9;64H│[9;65H                                   │[10;1H                         │[10;27H│[10;28H                                   │[10;64H│[10;65H                                   │[11;1H                         │[11;27H│[11;28H                                   │[11;64H│[11;65H                                   │[12;1H                         │[12;27H│[12;28H                                   │[12;64H│[12;65H                                   │[13;1H                         │[13;27H│[13;28H                                   │[13;64H│[13;65H                                   │[14;1H                         │[14;27H│[14;28H                                   │[14;64H│[14;65H                                   │[15;1H                         │[15;27H│[15;28H                                   │[15;64H│[15;65H                                   │[16;1H                         │[16;27H│[16;28H                                   │[16;64H│[16;65H                                   │[17;1H                         │[17;27H│[17;28H                                   │[17;64H│[17;65H                                   │[18;1H                         │[18;27H│[18;28H                                   │[18;64H│[18;65H                                   │[19;1H                         │[19;27H│[19;28H                                   │[19;64H│[19;65H                                   │[20;1H                         │[20;27H│[20;28H                                   │[20;64H│[20;65H                                   │[21;1H                         │[21;27H│[21;28H                                   │[21;64H│[21;65H                                   │[22;1H                         │[22;27H│[22;28H                                   │[22;64H│[22;65H                                   │[23;1H                         │[23;27H│[23;28H                                   │[23;64H│[23;65H                                   │[24;1H                         │[24;27H│[24;28H                                   │[24;64H│[24;65H                                   │[25;1H                         │[25;27H│[25;28H                                   │[25;64H│[25;65H                                   │[26;1H                         │[26;27H│[26;28H                                   │[26;64H│[26;65H                                   │[27;1H                         │[27;27H│[27;28H                                   │[27;64H│[27;65H                                   │[28;1H                         │[28;27H│[28;28H                                   │[28;64H│[28;65H                                   │[29;1H                         │[29;27H│[29;28H                                   │[29;64H│[29;65H                                   │[30;1H                       «[30;25H │[30;27H└[30;28H─[30;29H─[30;30H─[30;31H─[30;32H─[30;33H─[30;34H─[30;35H─[30;36H─[30;37H─[30;38H─[30;39H─[30;40H─[30;41H─[30;42H─[30;43H─[30;44H─[30;45H─[30;46H─[30;47H─[30;48H─[30;49H─[30;50H─[30;51H─[30;52H─[30;53H─[30;54H─[30;55H─[30;56H─[30;57H─[30;58H─[30;59H─[30;60H─[30;61H─[30;62H─[30;63H⋯[30;64H└[30;65H─[30;66H─[30;67H─[30;68H─[30;69H─[30;70H─[30;71H─[30;72H─[30;73H─[30;74H─[30;75H─[30;76H─[30;77H─[30;78H─[30;79H─[30;80H─[30;81H─[30;82H─[30;83H─[30;84H─[30;85H─[30;86H─[30;87H─[30;88H─[30;89H─[30;90H─[30;91H─[30;92H─[30;93H─[30;94H─[30;95H─[30;96H─[30;97H─[30;98H─[30;99H─[30;100H⋯[4;28H[2 q[?25h[?2026l[4;28H"

 ❯ src/image/image.test.ts:436:17
    434|     out = h.io.output().slice(before);
    435|     expect(out).toContain("\x1b[2J");
    436|     expect(out).toContain("a=p,");
       |                 ^
    437|     // 狭い幅で navigate：重ねたサイドバーの間は外す。
    438|     h.io.resizeTo(50, 20);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=8fe4540d4f44e960 after=8fe4540d4f44e960 IDENTICAL

===== 05T5-inside-sync-update (2026-09-28T09:33:32)
mutation: src/app/TuiApp.ts
  - '        output = end < 0 ? output + seq : output.slice(0, end) + seq + output.slice(end);'
  + '        output = output + seq;'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/image/image.test.ts > 画像とクリップボードの点検の指摘（05 T5） > 出し直しは同期の更新の中へ入れ、全体の描き直しの後は置き直す。狭い幅の navigate の重ねたサイドバーの間は出さない
AssertionError: expected 27 to be greater than 109
 ❯ src/image/image.test.ts:429:44
    427|     const place = out.indexOf("a=p,");
    428|     expect(place).toBeGreaterThan(0);
    429|     expect(out.lastIndexOf("\x1b[?2026l")).toBeGreaterThan(place);
       |                                            ^
    430|     // 大きさが変わる（全体の描き直し）→ 置き直す。
    431|     before = h.io.output().length;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=8fe4540d4f44e960 after=8fe4540d4f44e960 IDENTICAL

===== 05T5-image-key-hash (2026-09-28T09:33:49)
mutation: src/app/TuiApp.ts
  - '            imageKey: im.hash,'
  + '            imageKey: `${box.paneId}:${im.id}`,'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=0
raw output:
      Tests  18 passed (18)
restored: sha256 before=8fe4540d4f44e960 after=8fe4540d4f44e960 IDENTICAL

===== 05T5-write-no-capture (2026-09-28T09:34:09)
mutation: src/clipboard.ts
  - '{ input: text, capture: false }'
  + '{ input: text }'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/image/image.test.ts > 画像とクリップボードの点検の指摘（05 T5） > 写す道具は出力をつながずに動かす（裏に残る xclip で終われなくならない）。本物でも裏の子を待たない
AssertionError: expected [ undefined ] to deeply equal [ false ]

- Expected
+ Received

  [
-   false,
+   undefined,
  ]

 ❯ src/image/image.test.ts:384:18
    382|     };
    383|     await writeClipboardTool({ platform: "linux", env: { DISPLAY: ":0"…
    384|     expect(seen).toEqual([false]);
       |                  ^
    385|     const started = Date.now();
    386|     const res = await nodeRunner("sh", ["-c", "sleep 3 >/dev/null 2>&1…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=2c52ba46af2608db after=2c52ba46af2608db IDENTICAL

===== 05T5-win-timeout (2026-09-28T09:34:13)
mutation: src/clipboard.ts
  - 'return ce.platform === "win32" || isWsl(ce as ClipboardEnv) ? 8000 : 2000;'
  + 'return 2000;'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/image/image.test.ts > 画像とクリップボードの点検の指摘（05 T5） > Windows・WSL は画像を読む待ちを長く（PowerShell の起動）。遅いと「読んでいます」を出す
AssertionError: expected 2000 to be 8000 // Object.is equality

- Expected
+ Received

- 8000
+ 2000

 ❯ src/image/image.test.ts:392:64
    390|
    391|   it("Windows・WSL は画像を読む待ちを長く（PowerShell の起動）。遅いと「読んでいます」を出す", async (…
    392|     expect(imageReadTimeoutMs({ platform: "win32", env: {} })).toBe(80…
       |                                                                ^
    393|     expect(imageReadTimeoutMs({ platform: "linux", env: { WSL_DISTRO_N…
    394|     expect(imageReadTimeoutMs({ platform: "linux", env: {} })).toBe(20…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=2c52ba46af2608db after=2c52ba46af2608db IDENTICAL

===== 05T5-slow-status (2026-09-28T09:34:19)
mutation: src/image/ImagePaster.ts
  - '        dismiss = this.deps.status?.("クリップボードの画像を読んでいます…") ?? null;'
  + '        dismiss = null;'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/image/image.test.ts > 画像とクリップボードの点検の指摘（05 T5） > Windows・WSL は画像を読む待ちを長く（PowerShell の起動）。遅いと「読んでいます」を出す
AssertionError: expected +0 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 0

 ❯ vi.waitFor.timeout src/image/image.test.ts:413:46
    411|     });
    412|     p.fromKey("p1", "\x16");
    413|     await vi.waitFor(() => expect(dismissed).toBe(1), { timeout: 2000 …
       |                                              ^
    414|     expect(shown).toEqual(["クリップボードの画像を読んでいます…"]);
    415|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=6be0414fd9e39c26 after=6be0414fd9e39c26 IDENTICAL

===== 05T5-osc-can-sub (2026-09-28T09:34:23)
mutation: src/image/inlineImages.ts
  - '      else if (b === 0x18 || b === 0x1a) end = "abort";\n'
  + ''
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/image/image.test.ts > 画像とクリップボードの点検の指摘（05 T5） > OSC の途中で xterm が捨てる終わり（ESC と別の文字・CAN・SUB）では IND を足さない。続く画像は数え直す
AssertionError: expected '\u001b]1337;File=inline=1;width=2;hei…' to be '\u001b]1337;File=inline=1;width=2;hei…' // Object.is equality

Expected: "]1337;File=inline=1;width=2;height=3:AAAAx"
Received: "]1337;File=inline=1;width=2;height=3:AAAADDx"

 ❯ src/image/image.test.ts:348:35
    346|       const f = new InlineImageFilter();
    347|       const s = `\x1b]1337;File=inline=1;width=2;height=3:AAAA${cut}\x…
    348|       expect(dec(f.feed(enc(s)))).toBe(s);
       |                                   ^
    349|     }
    350|     const f = new InlineImageFilter();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7787f1431d13072f after=7787f1431d13072f IDENTICAL

===== 05T5-osc-esc-other (2026-09-28T09:34:27)
mutation: src/image/inlineImages.ts
  - '        end = b === 0x5c ? "image" : "abort";'
  + '        end = "image";'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/image/image.test.ts > 画像とクリップボードの点検の指摘（05 T5） > OSC の途中で xterm が捨てる終わり（ESC と別の文字・CAN・SUB）では IND を足さない。続く画像は数え直す
AssertionError: expected '\u001b]1337;File=inline=1;width=2;hei…' to be '\u001b]1337;File=inline=1;width=2;hei…' // Object.is equality

Expected: "]1337;File=inline=1;width=2;height=3:AAAAx"
Received: "]1337;File=inline=1;width=2;height=3:AAAA[DD0mx"

 ❯ src/image/image.test.ts:348:35
    346|       const f = new InlineImageFilter();
    347|       const s = `\x1b]1337;File=inline=1;width=2;height=3:AAAA${cut}\x…
    348|       expect(dec(f.feed(enc(s)))).toBe(s);
       |                                   ^
    349|     }
    350|     const f = new InlineImageFilter();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7787f1431d13072f after=7787f1431d13072f IDENTICAL

===== 05T5-overwrite-drop (2026-09-28T09:34:31)
mutation: src/term/PaneTerminal.ts
  - '        if (ch !== "" && ch !== " ") return true;'
  + '        void ch;'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/image/image.test.ts > 画像とクリップボードの点検の指摘（05 T5） > 画像の上に文字を書く・ED・EL で消えたら画像も消す（addon-image と同じ）。鍵は中身の指紋
AssertionError: expected [ { id: 1, buffer: 'normal', …(7) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "base64": "iVBORw==",
+     "buffer": "normal",
+     "col": 0,
+     "cols": 4,
+     "hash": "2c009616f1241875",
+     "id": 1,
+     "marker": n {
+       "_disposables": [
+         v {
+           "_deliveryQueue": undefined,
+           "_event": [Function anonymous],
+           "_leakageMon": undefined,
+           "_listeners": g {
+             "id": 297,
+             "value": [Function anonymous],
+           },
+           "_options": undefined,
+           "_perfMon": undefined,
+           "_size": 1,
+         },
+         {
+           "dispose": [Function anonymous],
+         },
+         {
+           "dispose": [Function anonymous],
+         },
+         {
+           "dispose": [Function anonymous],
+         },
+         {
+           "dispose": [Function anonymous],
+         },
+       ],
+       "_id": 5,
+       "_onDispose": v {
+         "_deliveryQueue": undefined,
+         "_event": [Function anonymous],
+         "_leakageMon": undefined,
+         "_listeners": g {
+           "id": 297,
+           "value": [Function anonymous],
+         },
+         "_options": undefined,
+         "_perfMon": undefined,
+         "_size": 1,
+       },
+       "isDisposed": false,
+       "line": 1,
+       "onDispose": [Function anonymous],
+     },
+     "row": 1,
+     "rows": 2,
+   },
+ ]

 ❯ src/image/image.test.ts:363:54
    361|     };
    362|     expect((await mk("")).liveImages()).toHaveLength(1);
    363|     expect((await mk("\x1b[2;1Hxxxx")).liveImages()).toEqual([]); // 上…
       |                                                      ^
    364|     expect((await mk("\x1b[2J")).liveImages()).toEqual([]);
    365|     expect((await mk("\x1b[2;1H\x1b[K")).liveImages()).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=3902f49db200baca after=3902f49db200baca IDENTICAL

===== 05T5-erase-J (2026-09-28T09:34:35)
mutation: src/term/PaneTerminal.ts
  - '        this.eraseImages("J", Number(params[0] ?? 0));'
  + '        void params;'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=0
raw output:
      Tests  18 passed (18)
restored: sha256 before=3902f49db200baca after=3902f49db200baca IDENTICAL

===== 05T5-erase-K (2026-09-28T09:34:39)
mutation: src/term/PaneTerminal.ts
  - '        this.eraseImages("K", 0);'
  + '        void 0;'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/image/image.test.ts > 画像とクリップボードの点検の指摘（05 T5） > 画像の上に文字を書く・ED・EL で消えたら画像も消す（addon-image と同じ）。鍵は中身の指紋
AssertionError: expected [ { id: 1, buffer: 'normal', …(7) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "base64": "iVBORw==",
+     "buffer": "normal",
+     "col": 0,
+     "cols": 4,
+     "hash": "2c009616f1241875",
+     "id": 1,
+     "marker": n {
+       "_disposables": [
+         v {
+           "_deliveryQueue": undefined,
+           "_event": [Function anonymous],
+           "_leakageMon": undefined,
+           "_listeners": g {
+             "id": 353,
+             "value": [Function anonymous],
+           },
+           "_options": undefined,
+           "_perfMon": undefined,
+           "_size": 1,
+         },
+         {
+           "dispose": [Function anonymous],
+         },
+         {
+           "dispose": [Function anonymous],
+         },
+         {
+           "dispose": [Function anonymous],
+         },
+         {
+           "dispose": [Function anonymous],
+         },
+       ],
+       "_id": 7,
+       "_onDispose": v {
+         "_deliveryQueue": undefined,
+         "_event": [Function anonymous],
+         "_leakageMon": undefined,
+         "_listeners": g {
+           "id": 353,
+           "value": [Function anonymous],
+         },
+         "_options": undefined,
+         "_perfMon": undefined,
+         "_size": 1,
+       },
+       "isDisposed": false,
+       "line": 1,
+       "onDispose": [Function anonymous],
+     },
+     "row": 1,
+     "rows": 2,
+   },
+ ]

 ❯ src/image/image.test.ts:365:56
    363|     expect((await mk("\x1b[2;1Hxxxx")).liveImages()).toEqual([]); // 上…
    364|     expect((await mk("\x1b[2J")).liveImages()).toEqual([]);
    365|     expect((await mk("\x1b[2;1H\x1b[K")).liveImages()).toEqual([]);
       |                                                        ^
    366|     expect((await mk("\x1b[9;1H\x1b[K")).liveImages()).toHaveLength(1)…
    367|     const a = (await mk("")).liveImages()[0]!;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=3902f49db200baca after=3902f49db200baca IDENTICAL

===== 05T5-image-key-hash (テストを足した後) (2026-09-28T09:35:23)
mutation: src/app/TuiApp.ts
  - '            imageKey: im.hash,'
  + '            imageKey: `${box.paneId}:${im.id}`,'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=0
raw output:
      Tests  18 passed (18)
restored: sha256 before=8fe4540d4f44e960 after=8fe4540d4f44e960 IDENTICAL

===== 05T5-erase-J (テストを足した後) (2026-09-28T09:35:28)
mutation: src/term/PaneTerminal.ts
  - '        this.eraseImages("J", Number(params[0] ?? 0));'
  + '        void params;'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=0
raw output:
      Tests  18 passed (18)
restored: sha256 before=3902f49db200baca after=3902f49db200baca IDENTICAL

===== 05T5-image-key-hash (テストを直した後) (2026-09-28T09:36:38)
mutation: src/app/TuiApp.ts
  - '            imageKey: im.hash,'
  + '            imageKey: `${box.paneId}:${im.id}`,'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/image/image.test.ts > 画像とクリップボードの点検の指摘（05 T5） > 出し直しは同期の更新の中へ入れ、全体の描き直しの後は置き直す。狭い幅の navigate の重ねたサイドバーの間は出さない
AssertionError: expected '\u001b[?2026h\u001b[?25l\u001b[4;28H\…' to contain ';QUJDRA==\u001b\'

Expected: ";QUJDRA==\"
Received: "[?2026h[?25l[4;28H[?25h[?2026l[4;28H"

 ❯ src/image/image.test.ts:447:41
    445|     before = h.io.output().length;
    446|     h.app.renderNow();
    447|     expect(h.io.output().slice(before)).toContain(";QUJDRA==\x1b\\");
       |                                         ^
    448|     // 出し直す画像の鍵は中身の指紋（pane と番号ではない）。
    449|     const frameImages = (h.app as unknown as { frameImages: { imageKey…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=8fe4540d4f44e960 after=8fe4540d4f44e960 IDENTICAL

===== 05T5-erase-J (ED 1 の試験を足した後) (2026-09-28T09:37:00)
mutation: src/term/PaneTerminal.ts
  - '        this.eraseImages("J", Number(params[0] ?? 0));'
  + '        void params;'
command: (cd packages/tui && npx vitest run src/image/image.test.ts)  exit=0
raw output:
      Tests  18 passed (18)
restored: sha256 before=3902f49db200baca after=3902f49db200baca IDENTICAL

===== 05T5-erase-J の扱い（手で書いた注記）
- 等価の変異：ED（CSI J。0・1・2 とも）で消えた行のマーカーは xterm 自身が捨てる（probe：ED 1 の後に marker.isDisposed=true・line=-1）。
  画像はマーカーが捨てられると liveImages から外れるので、ED の処理は要らない。コードから外した（EL は xterm がマーカーを捨てないので残す＝05T5-erase-K は失敗する）。

===== 05T6-replace-disposes (2026-09-28T09:44:20)
mutation: src/modes/OverlayHost.ts
  - '      prev.dispose?.();\n'
  + ''
command: (cd packages/tui && npx vitest run src/modes/CommandPopup.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/CommandPopup.test.ts > 独自コマンドを走らせる（web の ActionDispatcher.runCommand と同じ） > 別のダイアログが popup を置き換えたら、popup のコマンドを止める（web の watch(ctx) と同じ）
AssertionError: expected [] to deeply equal [ { popupId: 'pp4' } ]

- Expected
+ Received

- [
-   {
-     "popupId": "pp4",
-   },
- ]
+ []

 ❯ src/modes/CommandPopup.test.ts:133:71
    131|     h.app.ui.openDialogWithContext({ kind: "help" });
    132|     h.app.renderNow();
    133|     expect(h.ws.requests("command.popup_close").map((r) => r.params)).…
       |                                                                       ^
    134|     expect(h.app.ui.dialogContext).toEqual({ kind: "help" });
    135|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=0103fe26629fe3b4 after=0103fe26629fe3b4 IDENTICAL

===== 05T6-dispose-closes (2026-09-28T09:44:24)
mutation: src/modes/CommandPopup.ts
  - '    if (!this.finished) this.close();'
  + '    void 0;'
command: (cd packages/tui && npx vitest run src/modes/CommandPopup.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/CommandPopup.test.ts > 独自コマンドを走らせる（web の ActionDispatcher.runCommand と同じ） > 別のダイアログが popup を置き換えたら、popup のコマンドを止める（web の watch(ctx) と同じ）
AssertionError: expected [] to deeply equal [ { popupId: 'pp4' } ]

- Expected
+ Received

- [
-   {
-     "popupId": "pp4",
-   },
- ]
+ []

 ❯ src/modes/CommandPopup.test.ts:133:71
    131|     h.app.ui.openDialogWithContext({ kind: "help" });
    132|     h.app.renderNow();
    133|     expect(h.ws.requests("command.popup_close").map((r) => r.params)).…
       |                                                                       ^
    134|     expect(h.app.ui.dialogContext).toEqual({ kind: "help" });
    135|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=83cc0f480e664a18 after=83cc0f480e664a18 IDENTICAL

===== 05T6-mouse-forward (2026-09-28T09:44:29)
mutation: src/modes/CommandPopup.ts
  - '      if (bytes !== null) this.deps.sendInput(this.popupId, bytes);'
  + '      void bytes;'
command: (cd packages/tui && npx vitest run src/modes/CommandPopup.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/CommandPopup.test.ts > 独自コマンドを走らせる（web の ActionDispatcher.runCommand と同じ） > popup の中のプログラムがマウスを求めていれば渡し、代替画面のホイールは矢印キー
AssertionError: expected [ 'pp5', '\u001b[B\u001b[B\u001b[B' ] to deeply equal [ 'pp5', '\u001b[<0;3;2M' ]

- Expected
+ Received

  [
    "pp5",
-   "[<0;3;2M",
+   "[B[B[B",
  ]

 ❯ src/modes/CommandPopup.test.ts:150:31
    148|     await new Promise((r) => setTimeout(r, 20));
    149|     h.io.type(`\x1b[<0;${c.x + 3};${c.y + 2}M`);
    150|     expect(h.inputs().at(-1)).toEqual(["pp5", "\x1b[<0;3;2M"]);
       |                               ^
    151|   });
    152|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=83cc0f480e664a18 after=83cc0f480e664a18 IDENTICAL

===== 05T6-alt-wheel (2026-09-28T09:44:33)
mutation: src/modes/CommandPopup.ts
  - '        this.deps.sendInput(this.popupId, seq.repeat(3));'
  + '        void seq;'
command: (cd packages/tui && npx vitest run src/modes/CommandPopup.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/CommandPopup.test.ts > 独自コマンドを走らせる（web の ActionDispatcher.runCommand と同じ） > popup の中のプログラムがマウスを求めていれば渡し、代替画面のホイールは矢印キー
AssertionError: expected undefined to deeply equal [ 'pp5', '\u001b[B\u001b[B\u001b[B' ]

- Expected:
[
  "pp5",
  "[B[B[B",
]

+ Received:
undefined

 ❯ src/modes/CommandPopup.test.ts:146:31
    144|     const c = (h.app as unknown as { popup: { content: { x: number; y:…
    145|     h.io.type(`\x1b[<65;${c.x + 3};${c.y + 2}M`); // ホイール（マウスを求めていない代替…
    146|     expect(h.inputs().at(-1)).toEqual(["pp5", "\x1b[B\x1b[B\x1b[B"]);
       |                               ^
    147|     h.ws.onmessage?.({ data: encodeSnapshotFrame("pp5", 40, 8, "\x1b[?…
    148|     await new Promise((r) => setTimeout(r, 20));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=83cc0f480e664a18 after=83cc0f480e664a18 IDENTICAL

===== 05T6-disconnect-starting (2026-09-28T09:44:38)
mutation: src/modes/CommandPopup.ts
  - '    if (this.state === "starting") this.abandoned = true; // 返事が来ても開かない（来ないことが多い）\n'
  + ''
command: (cd packages/tui && npx vitest run src/modes/CommandPopup.test.ts)  exit=0
raw output:
      Tests  7 passed (7)
restored: sha256 before=83cc0f480e664a18 after=83cc0f480e664a18 IDENTICAL

===== 05T6-late-reply-after-finish (2026-09-28T09:44:42)
mutation: src/modes/CommandPopup.ts
  - '    if (this.abandoned || this.finished) {'
  + '    if (this.abandoned) {'
command: (cd packages/tui && npx vitest run src/modes/CommandPopup.test.ts)  exit=0
raw output:
      Tests  7 passed (7)
restored: sha256 before=83cc0f480e664a18 after=83cc0f480e664a18 IDENTICAL

===== 05T6-late-reply-after-finish (重なっていた守りを 1 つにした後) (2026-09-28T09:45:04)
mutation: src/modes/CommandPopup.ts
  - '    if (this.abandoned || this.finished) {'
  + '    if (this.abandoned) {'
command: (cd packages/tui && npx vitest run src/modes/CommandPopup.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/CommandPopup.test.ts > 独自コマンドを走らせる（web の ActionDispatcher.runCommand と同じ） > 接続が切れたら閉じて知らせる（開き終える前でも。後から返事が来ても開かない）
AssertionError: expected [] to deeply equal [ { popupId: 'pp6' } ]

- Expected
+ Received

- [
-   {
-     "popupId": "pp6",
-   },
- ]
+ []

 ❯ src/modes/CommandPopup.test.ts:162:94
    160|     expect(h.app.ui.toasts.map((t) => t.message)).toContain("接続が切れたため …
    161|     resolveRun({ type: "popup", popupId: "pp6", cols: 40, rows: 8 });
    162|     await vi.waitFor(() => expect(h.ws.requests("command.popup_close")…
       |                                                                                              ^
    163|     expect(h.ws.requests("pane.subscribe").some((r) => (r.params as { …
    164|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=27a98594a4a51d4c after=27a98594a4a51d4c IDENTICAL

===== 05T6-disconnect-starting・05T6-late-reply-after-finish の扱い（手で書いた注記）
- 2 つの守り（切断で abandoned を立てる・返事の後に finished を見る）が重なっていて、1 つずつ外しても試験は通った（どちらかで足りる）。
  finished を見る方だけを残し（× で止めた後・切断の後のどちらも覆う）、もう一方をコードから外した。残した方を外す変異は失敗する（上の記録）。

===== 05rv-navigate-remote-ids (2026-09-28T10:06:22)
mutation: src/actions/TuiDispatcher.ts
  - '        const ids = this.navigateIds();'
  + '        const ids = this.visibleWorkspaceIds();'
command: (cd packages/tui && npx vitest run src/app/review05.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/review05.test.ts > 05 review > navigate モード：別のマシンの workspace もサイドバーの並びで選べ、Enter でそのマシンへ切り替える
AssertionError: expected 'w1' to be 'machine:m1:rw1' // Object.is equality

Expected: "machine:m1:rw1"
Received: "w1"

 ❯ src/app/review05.test.ts:42:40
     40|     await vi.waitFor(() => expect(h.app.keys.mode).toBe("navigate"));
     41|     for (let i = 0; i < 2; i++) h.io.type("\x1b[B"); // （今の w1 から）w2 →…
     42|     expect(h.app.ui.navigateSelection).toBe("machine:m1:rw1");
       |                                        ^
     43|     h.app.renderNow();
     44|     expect(await h.screen()).toContain("remote-ws");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=23eca8aeb8f37737 after=23eca8aeb8f37737 IDENTICAL

===== 05rv-navigate-activate-remote (2026-09-28T10:06:43)
mutation: src/actions/TuiDispatcher.ts
  - '        if (remote) this.openRemoteWorkspace(remote.machineId, remote.workspaceId);\n        else if'
  + '        if'
command: (cd packages/tui && npx vitest run src/app/review05.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/review05.test.ts > 05 review > navigate モード：別のマシンの workspace もサイドバーの並びで選べ、Enter でそのマシンへ切り替える
AssertionError: expected 'local' to be 'm1' // Object.is equality

Expected: "m1"
Received: "local"

 ❯ src/app/review05.test.ts:46:62
     44|     expect(await h.screen()).toContain("remote-ws");
     45|     h.io.type("\r");
     46|     await vi.waitFor(() => expect(h.app.machines.selectedId).toBe("m1"…
       |                                                              ^
     47|   });
     48|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=23eca8aeb8f37737 after=23eca8aeb8f37737 IDENTICAL

===== 05rv-goto-remote-rows (2026-09-28T10:06:59)
mutation: src/modes/GotoDialog.ts
  - '  if (machines?.hasMachines) {'
  + '  if (false) {'
command: (cd packages/tui && npx vitest run src/app/review05.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/review05.test.ts > 05 review > goto：別のマシンの workspace の行（@マシン名）を選ぶとそのマシンへ切り替える
AssertionError: expected ' Spaces       開いた順 + │ 1:t1   +      …' to contain '@box'

- Expected
+ Received

- @box
+  Spaces       開いた順 + │ 1:t1   +                                                   session: work
+  ▾┌─ goto ───────────────────────────────────────────────────────────────────────────────────────┐─┐
+   │ / / で絞り込み・b/w/i/d で状態・a で解除                                                     │ │
+   │                                                                                              │ │
+  ▾│   w1                                                                                         │ │
+   │     t1  2 pane                                                                               │ │
+   │       pane 1  /                                                                              │ │
+   │       pane 2  /                                                                              │ │
+   │   w2                                                                                         │ │
+   │     t2  1 pane                                                                               │ │
+   │       pane 1  /                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   │                                                                                              │ │
+   └──────────────────────────────────────────────────────────────────────────────────────────────┘ │
+                        « │└───────────────────────────────────⋯└───────────────────────────────────⋯

 ❯ src/app/review05.test.ts:54:30
     52|     await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ ki…
     53|     h.app.renderNow();
     54|     expect(await h.screen()).toContain("@box");
       |                              ^
     55|     h.io.type("G\r");
     56|     await vi.waitFor(() => expect(h.app.machines.selectedId).toBe("m1"…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=1a63688b6bc33d89 after=1a63688b6bc33d89 IDENTICAL

===== 05rv-goto-accept-remote (2026-09-28T10:07:05)
mutation: src/modes/GotoDialog.ts
  - '    if (t.kind === "remote") actions.openRemoteWorkspace(t.machineId, t.workspaceId);\n    else if'
  + '    if'
command: (cd packages/tui && npx vitest run src/app/review05.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/review05.test.ts > 05 review > goto：別のマシンの workspace の行（@マシン名）を選ぶとそのマシンへ切り替える
AssertionError: expected 'local' to be 'm1' // Object.is equality

Expected: "m1"
Received: "local"

 ❯ src/app/review05.test.ts:56:62
     54|     expect(await h.screen()).toContain("@box");
     55|     h.io.type("G\r");
     56|     await vi.waitFor(() => expect(h.app.machines.selectedId).toBe("m1"…
       |                                                              ^
     57|   });
     58|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=1a63688b6bc33d89 after=1a63688b6bc33d89 IDENTICAL

===== 05rv-tmux-wrap (2026-09-28T10:07:08)
mutation: src/app/TuiApp.ts
  - '      this.io.write(wrapTmux(seq));\n'
  + ''
command: (cd packages/tui && npx vitest run src/app/review05.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/review05.test.ts > 05 review > tmux の中の OSC 52 は素通しの包みでも出し、設定の案内を 1 回だけ出す
AssertionError: expected '\u001b[?1049h\u001b[H\u001b[2J\u001b[…' to contain '\u001bPtmux;\u001b\u001b]52;c;aGk=\u0…'

Expected: "Ptmux;]52;c;aGk=\"
Received: "[?1049h[H[2J[?25l[?2004h[?1004h=[?1000h[?1002h[?1006h[?2031h]11;?\[?2026h[?25l[2J[1;1H Spaces       開[1;17Hい[1;19Hた[1;21H順[1;23H + │[1;27H                                                                  接[1;95H続[1;97H中[1;99H…[1;100H [2;1H                         │[2;27H                                                                          [3;1H                         │[3;27H                                                                          [4;1H                         │[4;27H                                                                          [5;1H                         │[5;27H                                                                          [6;1H                         │[6;27H                                                                          [7;1H                         │[7;27H                                                                          [8;1H                         │[8;27H                                                                          [9;1H                         │[9;27H                                                                          [10;1H                         │[10;27H                                                                          [11;1H                         │[11;27H                                                                          [12;1H                         │[12;27H                                                                          [13;1H                         │[13;27H                                                                          [14;1H                         │[14;27H                                                                          [15;1H                         │[15;27H                                                                          [16;1H                         │[16;27H                                 接[16;62H続[16;64H中[16;66H…[16;67H                                  [17;1H                         │[17;27H                                                                          [18;1H                         │[18;27H                                                                          [19;1H                         │[19;27H                                                                          [20;1H                         │[20;27H                                                                          [21;1H                         │[21;27H                                                                          [22;1H                         │[22;27H                                                                          [23;1H                         │[23;27H                                                                          [24;1H                         │[24;27H                                                                          [25;1H                         │[25;27H                                                                          [26;1H                         │[26;27H                                                                          [27;1H                         │[27;27H                                                                          [28;1H                         │[28;27H                                                                          [29;1H                         │[29;27H                                                                          [30;1H                       «[30;25H │[30;27H                                                                          [1;1H[?2026l[1;1H]52;c;aGk=]52;c;YWdhaW4="

 ❯ src/app/review05.test.ts:68:27
     66|     const b64 = Buffer.from("hi").toString("base64");
     67|     expect(h.io.output()).toContain(`\x1b]52;c;${b64}\x07`);
     68|     expect(h.io.output()).toContain(`\x1bPtmux;\x1b\x1b]52;c;${b64}\x0…
       |                           ^
     69|     expect(h.app.ui.toasts.filter((t) => t.message.includes("set-clipb…
     70|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=f3d893ceb8f48aef after=f3d893ceb8f48aef IDENTICAL

===== 05rv-tmux-hint-once (2026-09-28T10:07:11)
mutation: src/app/TuiApp.ts
  - '      if (!this.tmuxClipboardHinted) {'
  + '      if (true) {'
command: (cd packages/tui && npx vitest run src/app/review05.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/review05.test.ts > 05 review > tmux の中の OSC 52 は素通しの包みでも出し、設定の案内を 1 回だけ出す
AssertionError: expected [ { id: 1, …(1) }, { id: 2, …(1) } ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/app/review05.test.ts:69:80
     67|     expect(h.io.output()).toContain(`\x1b]52;c;${b64}\x07`);
     68|     expect(h.io.output()).toContain(`\x1bPtmux;\x1b\x1b]52;c;${b64}\x0…
     69|     expect(h.app.ui.toasts.filter((t) => t.message.includes("set-clipb…
       |                                                                                ^
     70|   });
     71|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=f3d893ceb8f48aef after=f3d893ceb8f48aef IDENTICAL

===== 05rv-kitty-keep (2026-09-28T10:07:14)
mutation: src/image/kittyOutput.ts
  - '      if (wanted.has(key) || keep.has(key)) continue;'
  + '      if (wanted.has(key)) continue;'
command: (cd packages/tui && npx vitest run src/app/review05.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/review05.test.ts > 05 review > Kitty：置かないとき（ダイアログの間）も、pane が持つ画像の中身は消さない（送り直さない）
AssertionError: expected '\u001b7\u001b_Ga=d,d=a,q=2\u001b\\u00…' not to contain 'd=I'

Expected: "d=I"
Received: "7_Ga=d,d=a,q=2\_Ga=d,d=I,i=1,q=2\8"

 ❯ src/app/review05.test.ts:78:24
     76|     const hidden = k.sync([], new Set(["h1"]));
     77|     expect(hidden).toContain("a=d,d=a");
     78|     expect(hidden).not.toContain("d=I");
       |                        ^
     79|     expect(k.sync([a], new Set(["h1"]))).not.toContain("a=t");
     80|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=6b9ab9c59fdadd45 after=6b9ab9c59fdadd45 IDENTICAL

===== 05rv-grid-c1 (2026-09-28T10:07:18)
mutation: src/render/Screen.ts
  - '      if (cp < 0x20 || (cp >= 0x7f && cp <= 0x9f)) continue;\n'
  + ''
command: (cd packages/tui && npx vitest run src/app/review05.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/review05.test.ts > 05 review > chrome の文字列から C1（U+0080〜009F）と DEL を落とす
AssertionError: expected 'a\u009b31mb\u007fc\u0085d' to be 'a31mbcd' // Object.is equality

Expected: "a31mbcd"
Received: "a31mbc
d"

 ❯ src/app/review05.test.ts:85:36
     83|     const g = new Grid(20, 1);
     84|     g.text(0, 0, "a\u009b31mb\u007fc\u0085d", 0, 0);
     85|     expect(g.rowText(0).trimEnd()).toBe("a31mbcd");
       |                                    ^
     86|   });
     87| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=bd44ae1201fa88f2 after=bd44ae1201fa88f2 IDENTICAL
=== 05 T7 check fix (2026-09-28) ===

===== t7c-divider-content (2026-09-28T10:49:45)
mutation: src/input/mouse.ts
  - '    if (layout.panes.some((b) => this.inContent(b, x, y))) return undefined;\n'
  + ''
command: (cd packages/tui && npx vitest run src/app/t7check.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/t7check.test.ts > 05 T7 の点検 > 枠を描かない（off）：p2 の最初の中身の桁は境界にせず、境目の線（p1 の右）は掴める
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ src/app/t7check.test.ts:43:22
     41|     expect(a!.sides.right).toBe(true);
     42|     h.io.type(down(63, 10) + drag(55, 10) + up(55, 10));
     43|     expect(ratios()).toBe(0);
       |                      ^
     44|     expect(h.app.model.focusedPaneId).toBe("p2");
     45|     h.io.type(down(62, 10) + drag(55, 10) + up(55, 10));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/app/t7check.test.ts > 05 T7 の点検 > 隙間なし：p1 の右端の中身の桁は境界にせず、p2 の左の罫線は掴める
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ src/app/t7check.test.ts:54:22
     52|     expect(a!.content.x + a!.content.w - 1).toBe(62);
     53|     h.io.type(down(62, 10) + drag(55, 10) + up(55, 10));
     54|     expect(ratios()).toBe(0);
       |                      ^
     55|     h.io.type(down(63, 10) + drag(55, 10) + up(55, 10));
     56|     expect(ratios()).toBeGreaterThan(0);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=0cbc6a62d8e1348f after=0cbc6a62d8e1348f IDENTICAL

===== t7c-existing-user (2026-09-28T10:49:55)
mutation: src/app/TuiApp.ts
  - '      (flag !== true && this.prefs.rev > 0) ||\n'
  + ''
command: (cd packages/tui && npx vitest run src/app/t7check.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/t7check.test.ts > 05 T7 の点検 > はじめの案内：設定を前から使っていた既存の利用者（rev が 1 以上で onboarding の項目が無い）には出さない
AssertionError: expected { kind: 'onboarding' } to be null

- Expected:
null

+ Received:
{
  "kind": "onboarding",
}

 ❯ src/app/t7check.test.ts:63:36
     61|     await vi.waitFor(() => expect(h.app.prefs.rev).toBe(4));
     62|     h.app.ui.toast("x");
     63|     expect(h.app.ui.dialogContext).toBeNull();
       |                                    ^
     64|   });
     65|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=429d70c1653b4e29 after=429d70c1653b4e29 IDENTICAL

===== t7c-flag-true (2026-09-28T10:50:03)
mutation: src/app/TuiApp.ts
  - '(flag !== true && this.prefs.rev > 0)'
  + 'this.prefs.rev > 0'
command: (cd packages/tui && npx vitest run src/app/t7check.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/t7check.test.ts > 05 T7 の点検 > はじめの案内：onboarding: true なら rev が 1 以上でも出す
AssertionError: expected null to deeply equal { kind: 'onboarding' }

- Expected:
{
  "kind": "onboarding",
}

+ Received:
null

 ❯ src/app/t7check.test.ts:68:59
     66|   it("はじめの案内：onboarding: true なら rev が 1 以上でも出す", async () => {
     67|     const h = await app({ respond: { "prefs.get": { prefs: { onboardin…
     68|     await vi.waitFor(() => expect(h.app.ui.dialogContext).toEqual({ ki…
       |                                                           ^
     69|   });
     70|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=429d70c1653b4e29 after=429d70c1653b4e29 IDENTICAL

===== t7c-env (2026-09-28T10:50:10)
mutation: src/app/TuiApp.ts
  - 'io.env["SODA_NO_ONBOARDING"] !== "1" && '
  + ''
command: (cd packages/tui && npx vitest run src/app/t7check.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/t7check.test.ts > 05 T7 の点検 > はじめの案内：SODA_NO_ONBOARDING=1 の起動には出さない
AssertionError: expected { kind: 'onboarding' } to be null

- Expected:
null

+ Received:
{
  "kind": "onboarding",
}

 ❯ src/app/t7check.test.ts:78:36
     76|     await vi.waitFor(() => expect(h.app.prefs.rev).toBe(0));
     77|     h.app.ui.toast("x");
     78|     expect(h.app.ui.dialogContext).toBeNull();
       |                                    ^
     79|   });
     80|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=429d70c1653b4e29 after=429d70c1653b4e29 IDENTICAL

===== t7c-tuistate (2026-09-28T10:50:16)
mutation: src/app/TuiApp.ts
  - ' && !tuiStateExists(target.stateDir)'
  + ''
command: (cd packages/tui && npx vitest run src/app/t7check.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/t7check.test.ts > 05 T7 の点検 > はじめの案内：この状態ディレクトリで端末版を前にも使った（tui-state.json がある）なら出さない
AssertionError: expected { kind: 'onboarding' } to be null

- Expected:
null

+ Received:
{
  "kind": "onboarding",
}

 ❯ src/app/t7check.test.ts:88:38
     86|       await vi.waitFor(() => expect(h.app.prefs.rev).toBe(0));
     87|       h.app.ui.toast("x");
     88|       expect(h.app.ui.dialogContext).toBeNull();
       |                                      ^
     89|     } finally {
     90|       await rm(dir, { recursive: true, force: true });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=429d70c1653b4e29 after=429d70c1653b4e29 IDENTICAL

===== t7c-section (2026-09-28T10:50:23)
mutation: src/app/TuiApp.ts
  - '{ kind: "settings", section: "agents" }'
  + '{ kind: "settings" }'
command: (cd packages/tui && npx vitest run src/app/t7check.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/t7check.test.ts > 05 T7 の点検 > はじめの案内の後は設定画面の「エージェント連携」の節を選んで開く（herdr と同じ）
AssertionError: expected { kind: 'settings' } to deeply equal { kind: 'settings', section: 'agents' }

- Expected
+ Received

  {
    "kind": "settings",
-   "section": "agents",
  }

 ❯ src/app/t7check.test.ts:107:38
    105|     h.io.type("\r");
    106|     await vi.waitFor(() =>
    107|       expect(h.app.ui.dialogContext).toEqual({ kind: "settings", secti…
       |                                      ^
    108|     );
    109|     await vi.waitFor(async () => {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=429d70c1653b4e29 after=429d70c1653b4e29 IDENTICAL

===== t7c-initial-section (2026-09-28T10:50:32)
mutation: src/modes/SettingsDialog.ts
  - 'this.sections.findIndex((s) => s.id === initialSection)'
  + '-1'
command: (cd packages/tui && npx vitest run src/app/t7check.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/t7check.test.ts > 05 T7 の点検 > はじめの案内の後は設定画面の「エージェント連携」の節を選んで開く（herdr と同じ）
AssertionError: expected ' Spaces       開いた順 + │ 1:t1   +      …' to contain 'Qwen Code'

- Expected
+ Received

- Qwen Code
+  Spaces       開いた順 + │ 1:t1   +                                                   session: work
+  ┌─ 設定 ─────────────────────────────────────────────────────────────────────────────────────────┐┐
+  │  通知             │  画面の中の知らせ（トースト）                                          入  ││
+  │  テーマ           │  デスクトップの通知                                                    切  ││
+  │  表示             │  音                                                                    切  ││
+  │  端末             │                                                                            ││
+  │  エージェント連携 │                                                                            ││
+  │  キー             │                                                                            ││
+  │  端末版           │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │                   │                                                                            ││
+  │ ────────────────────────────────────────────────────────────────────────────────────────────── ││
+  │ ↑↓ で節・Enter で項目へ・Esc で閉じる                                                          ││
+  │                                                                                                ││
+  │                                                                                                ││
+  └────────────────────────────────────────────────────────────────────────────────────────────────┘│
+                        « │└───────────────────────────────────⋯└───────────────────────────────────⋯

 ❯ src/app/t7check.test.ts:111:32
    109|     await vi.waitFor(async () => {
    110|       h.app.renderNow();
    111|       expect(await h.screen()).toContain("Qwen Code");
       |                                ^
    112|     });
    113|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=484f40d8446aac1d after=484f40d8446aac1d IDENTICAL
```

## 起動確認（smoke）
subtask では打たない（親の統合 test で打つ）。

## 未検証の穴（skip / 環境不足）
- 外側の端末ごとの通知・Kitty graphics・OSC 52 の実際の表示（kitty・WezTerm・Ghostty・Windows Terminal の実機）。
- 本物の SSH 先のマシンとの複数ホスト。
- Windows・WSL での画像の読み取り（PowerShell）。
