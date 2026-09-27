# テスト結果: 03-tui-core

## 実行したもの（03 の最後のコミット c42d81c だけを取り出した作業ツリー。04 の作業中の変更を含まない）
- `pnpm install --offline --frozen-lockfile` — exit 0
- `pnpm build` — exit 0
- `pnpm typecheck` — exit 0
- `pnpm test`（vitest 全体）— 307 files / 5473 passed / 0 failed / 0 skipped
- `npx eslint packages/tui packages/server/src/launch packages/server/src/main.ts packages/server/src/tui.integration.test.ts` — exit 0
- `npx vitest run packages/server/src/launch/soda.pty.integration.test.ts packages/server/src/tui.integration.test.ts --reporter=verbose` — 4 passed（node-pty で dist の `soda` を本物の端末で動かすテストが skip されずに走った）

```
 ✓ src/tui.integration.test.ts > runTui（実サーバ・偽の外側の端末） > サイドバーに workspace 名・pane にコマンドの出力が出て、打鍵が焦点の pane に届き、大きさを申告し、prefix+q で終わってモードが戻り、セッションを返す（AC2・AC3・AC6・AC11） 1182ms
 ✓ src/tui.integration.test.ts > runTui（実サーバ・偽の外側の端末） > もう一度開くと同じ画面（スクロールバックの SNAPSHOT）が戻る。SIGHUP でも終わってモードが戻る（AC3） 139ms
 ✓ src/tui.integration.test.ts > runTui（実サーバ・偽の外側の端末） > prefix+l で右の pane へ焦点が移り、以後の打鍵はその pane へ（focus_pane_right） 1137ms
 ✓ src/launch/soda.pty.integration.test.ts > soda（引数なし）を本物の端末で（node-pty。…） > 起動して描き、pane に打ったコマンドの出力が出て、prefix+q で 0・モードが戻り、もう一度開くと同じ画面が戻る（AC1・AC2・AC3） 4401ms
      Tests  4 passed (4)
```

## ラウンド 2（review の差し戻しの後。b9ed77b を取り出した作業ツリー。04 の T1・T2 のコミットを含む）
- `pnpm build` — exit 0 / `pnpm typecheck` — exit 0
- `pnpm test` — 309 files / 5543 passed / 0 failed（実装者の作業ツリーでは web の KeySettings.test.ts が負荷の時間切れで 2 件落ちたが、ここでは全部通った）
- 端末版 2 つの同時接続の結合テストを足した（AC12・切り取り。新しい試験で不具合の直しではないので負の確認は取っていない）。review の直し (1)(3)(5) の負の確認の生の出力は下の節に追記（(5) の再ログインは最初の変異でテストが落ちなかったので、4401 の試験を足してから落ちることを確かめた）。

## ラウンド 3（review 2 巡目の差し戻しの後。bfd9399）
- 実装者の作業ツリーで `pnpm build`・`pnpm typecheck`・eslint — exit 0、`pnpm test` — 5568/5568 passed・exit 0（実装者の報告。主エージェントは再実行していない——04 の作業中の変更と同じ作業ツリーのため。親の統合 test でまとめて再実行する）

## 受け入れ基準ごとの判定（この subtask の分）
- AC1: pass（引数なしの `soda` → 裏の起動 → 端末版。pty のテスト）
- AC2: pass（サイドバー・tab バー・分割された pane・大きさの追従）
- AC3: pass（prefix+q・SIGHUP で終わりモードが戻る、再び開くと SNAPSHOT で同じ画面）
- AC4: 一部（接続と描画は手元の pty で確認。SSH 越しの実機は親の統合 test〔06 の手順〕）
- AC6: 一部（色・全角・ブラケットペースト・マウスの受け渡しの単体テスト。vim・htop・Claude Code の実物の見た目は親の統合 test）
- AC10: pass（状態の記号と集約の単体テスト。2 秒以内の反映の測定は 06 の bench）
- AC12: pass（端末版 2 つを実物のサーバに同時に繋ぐ結合テスト：両方が描き、打鍵が届き、最後に操作した側の大きさになり、他方は切り取る）
- AC-I5: pass（prefix 以外は pane へ・prefix+prefix・入力の解釈の単体テスト）

## 失敗の証跡
このラウンドでは失敗が発生していない。

### 負の確認（点検の指摘の修正。直した行を戻して落ちることの生の出力）

```
# 03-tui-core の負の確認の生の出力（直した行だけを戻して走らせ、元に戻して一致を確かめた記録）

===== R2-1 ESC の後の非キー事象 (2026-09-28T04:31:07)
mutation: src/input/decode.ts
  - '        if (inner.event === null || inner.event.kind !== "key") return this.escapeThenRest();'
  + '        if (inner.event === null || inner.event.kind !== "key") return { event: inner.event, length: inner.length + 1 };'
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder（03 ラウンド 2 の指摘） > Esc の直後のマウス・フォーカス・貼り付け・応答は、Esc を単独で出してから事象をそのまま読む
AssertionError: expected [] to deeply equal [ [ 'esc', '\u001b' ] ]

- Expected
+ Received

- [
-   [
-     "esc",
-     "",
-   ],
- ]
+ []

 ❯ src/input/decode.test.ts:243:27
    241|     const esc: [string | null, string] = ["esc", "\x1b"];
    242|     const mouse = decode("\x1b", "\x1b[<0;5;5M");
    243|     expect(chords(mouse)).toEqual([esc]);
       |                           ^
    244|     expect(mouse[1]).toMatchObject({ kind: "mouse", action: "down", x:…
    245|     const focus = decode("\x1b", "\x1b[I");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=2b5f361b4d9e49a3 after=2b5f361b4d9e49a3 IDENTICAL

===== R2-1b ESC の後の貼り付けの始まり (2026-09-28T04:31:09)
mutation: src/input/decode.ts
  - '      if (rest.startsWith(PASTE_START)) return this.escapeThenRest();'
  + ''
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder（03 ラウンド 2 の指摘） > Esc の直後のマウス・フォーカス・貼り付け・応答は、Esc を単独で出してから事象をそのまま読む
AssertionError: expected [ [ null, '\u001b\u001b[200~' ], …(5) ] to deeply equal [ [ 'esc', '\u001b' ] ]

- Expected
+ Received

  [
    [
-     "esc",
-     "",
+     null,
+     "[200~",
+   ],
+   [
+     "h",
+     "h",
+   ],
+   [
+     "i",
+     "i",
+   ],
+   [
+     "ctrl+b",
+     "",
+   ],
+   [
+     "x",
+     "x",
+   ],
+   [
+     null,
+     "[201~",
    ],
  ]

 ❯ src/input/decode.test.ts:249:27
    247|     expect(focus[1]).toEqual({ kind: "focus", focused: true });
    248|     const paste = decode("\x1b", "\x1b[200~hi\x02x\x1b[201~");
    249|     expect(chords(paste)).toEqual([esc]);
       |                           ^
    250|     expect(paste[1]).toEqual({ kind: "paste", text: "hi\x02x" });
    251|     // 貼り付けの始まりが読みで割れても。

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=2b5f361b4d9e49a3 after=2b5f361b4d9e49a3 IDENTICAL

===== R2-2 拡張の列を送らない (2026-09-28T04:31:12)
mutation: src/input/encode.ts
  - '?? legacyBytes({ ...k, ctrl: false, meta: false }) ?? "";'
  + '?? raw;'
command: (cd packages/tui && npx vitest run src/input/encode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/encode.test.ts > encodeKey（03 ラウンド 2 の指摘） > 従来の列に直せない modifyOtherKeys・CSI u は修飾を落として送り（Alt は ESC 前置）、拡張の列のまま送らない
AssertionError: expected '\u001b[27;5;49~' to be '1' // Object.is equality

Expected: "1"
Received: "[27;5;49~"

 ❯ src/input/encode.test.ts:195:55
    193| describe("encodeKey（03 ラウンド 2 の指摘）", () => {
    194|   it("従来の列に直せない modifyOtherKeys・CSI u は修飾を落として送り（Alt は ESC 前置）、拡張の列のまま…
    195|     expect(encodeKey(keyEv("\x1b[27;5;49~"), normal)).toBe("1"); // Ct…
       |                                                       ^
    196|     expect(encodeKey(keyEv("\x1b[44;5u"), normal)).toBe(","); // Ctrl+,
    197|     expect(encodeKey(keyEv("\x1b[44;7u"), normal)).toBe("\x1b,"); // C…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=45baa8dc502f7959 after=45baa8dc502f7959 IDENTICAL

===== R2-3 TuiApp の waitMs (2026-09-28T04:31:15)
mutation: src/app/TuiApp.ts
  - '      }, this.decoder.waitMs);'
  + '      }, 25);'
command: (cd packages/tui && npx vitest run src/app/TuiApp.view.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.view.test.ts > TuiApp：大きさの申告と描画の予約（AC2・AC11） > 確定の待ちは decoder.waitMs：ESC 単独は 25ms、途中まで届いた CSI は 150ms 待ってから送る（偽の時計）
AssertionError: expected '\u001b\u001b[1;5' to be '\u001b' // Object.is equality

Expected: ""
Received: "[1;5"

 ❯ src/app/TuiApp.view.test.ts:148:22
    146|       io.type("\x1b[1;5");
    147|       vi.advanceTimersByTime(100);
    148|       expect(sent()).toBe("\x1b"); // まだ待っている（25ms では確定しない）
       |                      ^
    149|       io.type("A"); // 続きが届けば 1 つのキー（Ctrl+↑）
    150|       expect(sent()).toBe("\x1b\x1b[1;5A");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=1ae6293ae9833002 after=1ae6293ae9833002 IDENTICAL

===== R2-6 待ちの延長は ESC [ より先から (2026-09-28T04:31:19)
mutation: src/input/decode.ts
  - '    return sequence && core.length > 2 ? SEQUENCE_TIMEOUT_MS : ESC_TIMEOUT_MS;'
  + '    return sequence ? SEQUENCE_TIMEOUT_MS : ESC_TIMEOUT_MS;'
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder（03 ラウンド 2 の指摘） > 待ちを 150ms に延ばすのは ESC [ / ESC O より先まで届いてから（Alt+[ / Alt+O は短い待ちで確定）
AssertionError: expected 150 to be 25 // Object.is equality

- Expected
+ Received

- 25
+ 150

 ❯ src/input/decode.test.ts:262:22
    260|     const d = new InputDecoder();
    261|     d.feed("\x1b[");
    262|     expect(d.waitMs).toBe(25);
       |                      ^
    263|     expect(chords(d.flush())).toEqual([
    264|       ["esc", "\x1b"],

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=2b5f361b4d9e49a3 after=2b5f361b4d9e49a3 IDENTICAL

===== R2-7 OSC を待たずに打鍵へ (2026-09-28T04:31:24)
mutation: src/input/decode.ts
  - '      const len = stringSequenceLength(s, next);'
  + '      const len = s.length > 2 ? s.length : null;'
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder（マウス・貼り付け・フォーカス・応答） > 外側の端末の応答（DA・OSC・DCS・DECRPM）は捨てる
AssertionError: expected [] to deeply equal [ ObjectContaining{…} ]

- Expected
+ Received

- [
-   ObjectContaining {
-     "kind": "key",
-     "raw": "a",
-   },
- ]
+ []

 ❯ src/input/decode.test.ts:175:7
    173|         "\x1b[?62;22c\x1b]11;rgb:0000/0000/0000\x1b\\\x1b]10;x\x07\x1b…
    174|       ),
    175|     ).toEqual([expect.objectContaining({ kind: "key", raw: "a" })]);
       |       ^
    176|   });
    177| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/input/decode.test.ts > InputDecoder（03 の点検の指摘） > Alt+] / Alt+P / Alt+_ / Alt+^ は待たずに打鍵として届き、続く文字（Ctrl+G を含む）も消えない
AssertionError: expected [] to deeply equal [ [ 'alt+]', '\u001b]' ], …(2) ]

- Expected
+ Received

- [
-   [
-     "alt+]",
-     "]",
-   ],
-   [
-     "a",
-     "a",
-   ],
-   [
-     "b",
-     "b",
-   ],
- ]
+ []

 ❯ src/input/decode.test.ts:197:39
    195|       expect(d.waiting).toBe(false);
    196|     }
    197|     expect(chords(decode("\x1b]ab"))).toEqual([
       |                                       ^
    198|       ["alt+]", "\x1b]"],
    199|       ["a", "a"],

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=2b5f361b4d9e49a3 after=2b5f361b4d9e49a3 IDENTICAL

===== R2-8 SGR 拡張ボタン (2026-09-28T04:31:32)
mutation: src/input/decode.ts
  - '      if ((b & 128) !== 0) return { event: null, length };'
  + ''
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder（03 ラウンド 2 の指摘） > SGR マウスの拡張ボタン（128〜）は左ボタンにしない（捨てる）
AssertionError: expected [ { kind: 'mouse', …(5) }, …(1) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "action": "down",
+     "button": 0,
+     "kind": "mouse",
+     "mods": {
+       "alt": false,
+       "ctrl": false,
+       "meta": false,
+       "shift": false,
+     },
+     "x": 2,
+     "y": 2,
+   },
+   {
+     "action": "up",
+     "button": 1,
+     "kind": "mouse",
+     "mods": {
+       "alt": false,
+       "ctrl": false,
+       "meta": false,
+       "shift": false,
+     },
+     "x": 2,
+     "y": 2,
+   },
+ ]

 ❯ src/input/decode.test.ts:281:52
    279|
    280|   it("SGR マウスの拡張ボタン（128〜）は左ボタンにしない（捨てる）", () => {
    281|     expect(decode("\x1b[<128;3;3M\x1b[<129;3;3m")).toEqual([]);
       |                                                    ^
    282|   });
    283|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=2b5f361b4d9e49a3 after=2b5f361b4d9e49a3 IDENTICAL

===== R2-9a X10 マウス (2026-09-28T04:31:42)
mutation: src/input/decode.ts
  - '    if (body === "" && final === "M") {'
  + '    if (false) {'
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder（03 ラウンド 2 の指摘） > X10 形式のマウス（CSI M ＋ 3 バイト）を読み、文字として流さない
AssertionError: expected [ { kind: 'key', …(2) }, …(7) ] to deeply equal [ { kind: 'mouse', …(5) }, …(1) ]

- Expected
+ Received

  [
    {
-     "action": "down",
-     "button": 0,
-     "kind": "mouse",
-     "mods": {
+     "key": {
+       "alt": false,
+       "code": "Unidentified",
+       "composing": false,
+       "ctrl": false,
+       "key": "Unidentified",
+       "meta": false,
+       "shift": false,
+       "type": "keydown",
+     },
+     "kind": "key",
+     "raw": "[M",
+   },
+   {
+     "key": {
+       "alt": false,
+       "code": "Space",
+       "composing": false,
+       "ctrl": false,
+       "key": " ",
+       "meta": false,
+       "shift": false,
+       "type": "keydown",
+     },
+     "kind": "key",
+     "raw": " ",
+   },
+   {
+     "key": {
        "alt": false,
+       "code": "!",
+       "composing": false,
        "ctrl": false,
+       "key": "!",
        "meta": false,
        "shift": false,
+       "type": "keydown",
      },
-     "x": 0,
-     "y": 0,
+     "kind": "key",
+     "raw": "!",
    },
    {
-     "action": "up",
-     "button": 0,
-     "kind": "mouse",
-     "mods": {
+     "key": {
        "alt": false,
+       "code": "!",
+       "composing": false,
        "ctrl": false,
+       "key": "!",
        "meta": false,
        "shift": false,
+       "type": "keydown",
      },
-     "x": 0,
-     "y": 0,
+     "kind": "key",
+     "raw": "!",
+   },
+   {
+     "key": {
+       "alt": false,
restored: sha256 before=2b5f361b4d9e49a3 after=2b5f361b4d9e49a3 IDENTICAL

===== R2-9b 未接続の知らせ (2026-09-28T04:31:51)
mutation: src/app/TuiApp.ts
  - '    if (this.connectionState !== "open") this.showAlert(DROPPED_NOTICE);'
  + ''
command: (cd packages/tui && npx vitest run src/app/TuiApp.view.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.view.test.ts > TuiApp：大きさの申告と描画の予約（AC2・AC11） > 接続が開いていない間の打鍵は捨て、tab バーに「未接続のため入力を送れません」と知らせる
AssertionError: expected ' Spaces                  │ 1:t1      …' to contain '未接続のため入力を送れません'

Expected: "未接続のため入力を送れません"
Received: " Spaces                  │ 1:t1                                                           再接続中…"

 ❯ src/app/TuiApp.view.test.ts:173:29
    171|     await vi.waitFor(async () => {
    172|       await outer.write(io.output());
    173|       expect(outer.line(0)).toContain("未接続のため入力を送れません");
       |                             ^
    174|     });
    175|     app.finish(0);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=1ae6293ae9833002 after=1ae6293ae9833002 IDENTICAL

===== R1 ESC ESC (2026-09-28T04:31:54)
mutation: src/input/decode.ts
  - 'key: keyInput("[", { ...NO_MODS, ctrl: true, alt: true }),'
  + 'key: keyInput("Escape", NO_MODS),'
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder（03 の点検の指摘） > ESC ESC は Ctrl+Alt+[（＝Alt+Esc）。同じ読みでも時間切れでも。ESC ESC [ A は Alt+↑
AssertionError: expected [ [ 'esc', '\u001b\u001b' ], …(1) ] to deeply equal [ …(2) ]

- Expected
+ Received

@@ -1,8 +1,8 @@
  [
    [
-     "ctrl+alt+[",
+     "esc",
      "",
    ],
    [
      "x",
      "x",

 ❯ src/input/decode.test.ts:181:41
    179| describe("InputDecoder（03 の点検の指摘）", () => {
    180|   it("ESC ESC は Ctrl+Alt+[（＝Alt+Esc）。同じ読みでも時間切れでも。ESC ESC [ A は Alt+↑"…
    181|     expect(chords(decode("\x1b\x1bx"))).toEqual([
       |                                         ^
    182|       ["ctrl+alt+[", "\x1b\x1b"],
    183|       ["x", "x"],

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=2b5f361b4d9e49a3 after=2b5f361b4d9e49a3 IDENTICAL

===== R1 SS3 の修飾とキーパッド (2026-09-28T04:31:56)
mutation: src/input/decode.ts
  - '    if (next === "O") return this.parseSs3(s, force);'
  + '    if (next === "O") { if (s.length < 3) return "incomplete"; return { event: { kind: "key", key: keyInput(CSI_LETTER_KEYS[s[2]!] ?? "Unidentified", NO_MODS), raw: s.slice(0, 3) }, length: 3 }; }'
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder（03 の点検の指摘） > 修飾つきの SS3（ESC O 5 P・ESC O 1;5 P）とキーパッド（DECKPAM の ESC O p 等）
AssertionError: expected [ [ null, '\u001bO5' ], …(7) ] to deeply equal [ [ 'ctrl+f1', '\u001bO5P' ], …(3) ]

- Expected
+ Received

  [
    [
-     "ctrl+f1",
-     "O5P",
+     null,
+     "O5",
    ],
    [
-     "shift+f2",
-     "O1;2Q",
+     "shift+p",
+     "P",
    ],
    [
-     "1",
+     null,
+     "O1",
+   ],
+   [
+     ";",
+     ";",
+   ],
+   [
+     "2",
+     "2",
+   ],
+   [
+     "shift+q",
+     "Q",
+   ],
+   [
+     null,
      "Oq",
    ],
    [
-     "enter",
+     null,
      "OM",
    ],
  ]

 ❯ src/input/decode.test.ts:216:60
    214|
    215|   it("修飾つきの SS3（ESC O 5 P・ESC O 1;5 P）とキーパッド（DECKPAM の ESC O p 等）", ()…
    216|     expect(chords(decode("\x1bO5P\x1bO1;2Q\x1bOq\x1bOM"))).toEqual([
       |                                                            ^
    217|       ["ctrl+f1", "\x1bO5P"],
    218|       ["shift+f2", "\x1bO1;2Q"],

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/input/decode.test.ts > InputDecoder（03 ラウンド 2 の指摘） > 待ちを 150ms に延ばすのは ESC [ / ESC O より先まで届いてから（Alt+[ / Alt+O は短い待ちで確定）
AssertionError: expected 25 to be 150 // Object.is equality

- Expected
+ Received

- 150
+ 25

 ❯ src/input/decode.test.ts:271:22
    269|     d.flush();
    270|     d.feed("\x1b[1");
    271|     expect(d.waitMs).toBe(150);
       |                      ^
    272|     d.flush();
    273|     d.feed("\x1b[<");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=2b5f361b4d9e49a3 after=2b5f361b4d9e49a3 IDENTICAL

===== R1 Ctrl の表 (2026-09-28T04:32:00)
mutation: src/input/encode.ts
  - '  const special = CTRL_SPECIAL[ch];'
  + '  const special = ch === " " || ch === "@" || ch === "2" ? "\\x00" : undefined;'
command: (cd packages/tui && npx vitest run src/input/encode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/encode.test.ts > encodeKey（03 の点検の指摘） > Ctrl+2〜8・Ctrl+/・Ctrl+- は xterm の従来のバイト。CSI u の Shift＋英字は大文字
AssertionError: expected '3' to be '\u001b' // Object.is equality

Expected: ""
Received: "3"

 ❯ src/input/encode.test.ts:186:74
    184|     ];
    185|     for (const [ch, bytes] of expected) {
    186|       expect(encodeKey(keyEv(`\x1b[27;5;${ch.charCodeAt(0)}~`), normal…
       |                                                                          ^
    187|     }
    188|     expect(encodeKey(keyEv("\x1b[97;2u"), normal)).toBe("A");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=45baa8dc502f7959 after=45baa8dc502f7959 IDENTICAL

===== R1 キーパッドの DECKPAM (2026-09-28T04:32:03)
mutation: src/input/encode.ts
  - '    if (modes.applicationKeypadMode) return raw;'
  + '    return raw;'
command: (cd packages/tui && npx vitest run src/input/encode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/encode.test.ts > encodeKey（03 の点検の指摘） > キーパッドは pane の DECKPAM に合わせる（SS3 のまま／文字）
AssertionError: expected '\u001bOq' to be '1' // Object.is equality

Expected: "1"
Received: "Oq"

 ❯ src/input/encode.test.ts:168:48
    166|   it("キーパッドは pane の DECKPAM に合わせる（SS3 のまま／文字）", () => {
    167|     expect(encodeKey(keyEv("\x1bOq"), app)).toBe("\x1bOq");
    168|     expect(encodeKey(keyEv("\x1bOq"), normal)).toBe("1");
       |                                                ^
    169|     expect(encodeKey(keyEv("\x1bOM"), normal)).toBe("\r");
    170|     expect(encodeKey(keyEv("\x1bOk"), normal)).toBe("+");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=45baa8dc502f7959 after=45baa8dc502f7959 IDENTICAL

===== R1 CSI u の Shift＋英字 (2026-09-28T04:32:06)
mutation: src/input/decode.ts
  - '  if (mods.shift && /^[a-z]$/.test(ch)) ch = ch.toUpperCase();'
  + ''
command: (cd packages/tui && npx vitest run src/input/encode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/encode.test.ts > encodeKey（03 の点検の指摘） > Ctrl+2〜8・Ctrl+/・Ctrl+- は xterm の従来のバイト。CSI u の Shift＋英字は大文字
AssertionError: expected 'a' to be 'A' // Object.is equality

Expected: "A"
Received: "a"

 ❯ src/input/encode.test.ts:188:52
    186|       expect(encodeKey(keyEv(`\x1b[27;5;${ch.charCodeAt(0)}~`), normal…
    187|     }
    188|     expect(encodeKey(keyEv("\x1b[97;2u"), normal)).toBe("A");
       |                                                    ^
    189|     expect(encodeKey(keyEv("\x1b[97;4u"), normal)).toBe("\x1bA");
    190|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=2b5f361b4d9e49a3 after=2b5f361b4d9e49a3 IDENTICAL

===== R2-7b 旧の扱い（BEL まで一律に応答として捨てる） (2026-09-28T04:32:20)
mutation: src/input/decode.ts
  - '      const len = stringSequenceLength(s, next);'
  + '      const len = ((): number | null => { const e = s.indexOf("\\x07", 2); return e >= 0 ? e + 1 : null; })();'
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder（マウス・貼り付け・フォーカス・応答） > 外側の端末の応答（DA・OSC・DCS・DECRPM）は捨てる
AssertionError: expected [ { kind: 'key', …(2) }, …(9) ] to deeply equal [ ObjectContaining{…} ]

- Expected
+ Received

  [
    {
+     "key": {
+       "alt": true,
+       "code": "KeyP",
+       "composing": false,
+       "ctrl": false,
+       "key": "P",
+       "meta": false,
+       "shift": true,
+       "type": "keydown",
+     },
+     "kind": "key",
+     "raw": "P",
+   },
+   {
+     "key": {
+       "alt": false,
+       "code": ">",
+       "composing": false,
+       "ctrl": false,
+       "key": ">",
+       "meta": false,
+       "shift": false,
+       "type": "keydown",
+     },
+     "kind": "key",
+     "raw": ">",
+   },
+   {
+     "key": {
+       "alt": false,
+       "code": "|",
+       "composing": false,
+       "ctrl": false,
+       "key": "|",
+       "meta": false,
+       "shift": false,
+       "type": "keydown",
+     },
+     "kind": "key",
+     "raw": "|",
+   },
+   {
+     "key": {
+       "alt": false,
+       "code": "KeyX",
+       "composing": false,
+       "ctrl": false,
+       "key": "x",
+       "meta": false,
+       "shift": false,
+       "type": "keydown",
+     },
+     "kind": "key",
+     "raw": "x",
+   },
+   {
+     "key": {
+       "alt": false,
+       "code": "KeyT",
+       "composing": false,
+       "ctrl": false,
+       "key": "t",
+       "meta": false,
+       "shift": false,
+       "type": "keydown",
+     },
+     "kind": "key",
+     "raw": "t",
+   },
+   {
restored: sha256 before=2b5f361b4d9e49a3 after=2b5f361b4d9e49a3 IDENTICAL

===== R1 待ち時間（常に 25ms） (2026-09-28T04:32:32)
mutation: src/input/decode.ts
  - '    return sequence && core.length > 2 ? SEQUENCE_TIMEOUT_MS : ESC_TIMEOUT_MS;'
  + '    return sequence && core.length > 2 ? ESC_TIMEOUT_MS : ESC_TIMEOUT_MS;'
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder（03 の点検の指摘） > CSI・SS3 の途中は長く待つ（マウスの列が割れても崩さない）。ESC 単独は短く
AssertionError: expected 25 to be 150 // Object.is equality

- Expected
+ Received

- 150
+ 25

 ❯ src/input/decode.test.ts:229:22
    227|     expect(d.waitMs).toBe(25);
    228|     d.feed("[<0;1");
    229|     expect(d.waitMs).toBe(150);
       |                      ^
    230|     expect(d.feed("0;5M")).toEqual([expect.objectContaining({ kind: "m…
    231|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/input/decode.test.ts > InputDecoder（03 ラウンド 2 の指摘） > 待ちを 150ms に延ばすのは ESC [ / ESC O より先まで届いてから（Alt+[ / Alt+O は短い待ちで確定）
AssertionError: expected 25 to be 150 // Object.is equality

- Expected
+ Received

- 150
+ 25

 ❯ src/input/decode.test.ts:271:22
    269|     d.flush();
    270|     d.feed("\x1b[1");
    271|     expect(d.waitMs).toBe(150);
       |                      ^
    272|     d.flush();
    273|     d.feed("\x1b[<");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=2b5f361b4d9e49a3 after=2b5f361b4d9e49a3 IDENTICAL

===== R2-6b ESC [ / ESC O の時間切れは Alt+[ / Alt+O (2026-09-28T04:34:08)
mutation: src/input/decode.ts
  - '    if ((next === "[" || next === "O") && s.length === 2 && force) {'
  + '    if (false) {'
command: (cd packages/tui && npx vitest run src/input/decode.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/decode.test.ts > InputDecoder（03 ラウンド 2 の指摘） > 待ちを 150ms に延ばすのは ESC [ / ESC O より先まで届いてから（Alt+[ / Alt+O は短い待ちで確定）
AssertionError: expected [ [ 'esc', '\u001b' ], [ '[', '[' ] ] to deeply equal [ [ 'alt+[', '\u001b[' ] ]

- Expected
+ Received

  [
    [
-     "alt+[",
-     "[",
+     "esc",
+     "",
+   ],
+   [
+     "[",
+     "[",
    ],
  ]

 ❯ src/input/decode.test.ts:264:31
    262|     d.feed("\x1b[");
    263|     expect(d.waitMs).toBe(25);
    264|     expect(chords(d.flush())).toEqual([["alt+[", "\x1b["]]); // Alt+[（…
       |                               ^
    265|     d.feed("\x1bO");
    266|     expect(d.waitMs).toBe(25);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=85b032ea1b30df5c after=85b032ea1b30df5c IDENTICAL

===== T6 logout は 1 回・POST /api/logout (2026-09-28T04:46:17)
mutation: src/net/TuiNet.ts
  - '    if (this.cookie === "" || this.loggedOut) return;'
  + '    return;'
command: (cd packages/tui && npx vitest run src/net/TuiNet.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > logout はその cookie で POST /api/logout を 1 回だけ送る（止めた後でも）
AssertionError: expected [] to deeply equal [ Array(1) ]

- Expected
+ Received

- [
-   "POST http://127.0.0.1:9/api/logout sid=7",
- ]
+ []

 ❯ src/net/TuiNet.test.ts:184:60
    182|     await net.logout();
    183|     await net.logout();
    184|     expect(fetchCalls.filter((c) => c.startsWith("POST"))).toEqual(["P…
       |                                                            ^
    185|   });
    186| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=94cef080cc5a8f51 after=94cef080cc5a8f51 IDENTICAL

===== T6 端末版の終了でセッションを返す（TuiApp.finish から logout を外す。tui を作り直して server の結合テスト）
mutation: packages/tui/src/app/TuiApp.ts
  - '    if (net) void net.logout().then(() => this.resolveExit(code));'
  + '    if (net) this.resolveExit(code);'
command: (cd packages/tui && npx tsc -b) && (cd packages/server && npx vitest run src/tui.integration.test.ts)
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/tui.integration.test.ts > runTui（実サーバ・偽の外側の端末） > サイドバーに workspace 名・pane にコマンドの出力が出て、打鍵が焦点の pane に届き、大きさを申告し、prefix+q で終わってモードが戻り、セッションを返す（AC2・AC3・AC6・AC11）
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/tui.integration.test.ts:210:64
    208|       // 切り離したらセッションを返している（起動のたびにセッションが増えない。POST /api/logout）。
    209|       const cookie = local.cookies[local.cookies.length - 1]!;
    210|       expect(await sessionAlive(local.target.baseUrl, cookie)).toBe(fa…
       |                                                                ^
    211|       // 切り離してもサーバと pane は動き続ける。
    212|       expect(local.server.session.getPane(paneId)).toBeDefined();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Start at  04:46:20
   Duration  4.52s (tests 45%, transform 45%, import 11%)

exit=1
restored: sha256 before=3ae02147b88811b1 after=3ae02147b88811b1 IDENTICAL

===== T6r (1) 端末版の読み込みをサーバの起動の後に戻す (2026-09-28T04:55:35)
mutation: src/launch/tuiCommand.ts
  - '    entry = await loadEntry();'
  + '    entry = async (t) => (await loadEntry())(t);'
command: (cd packages/tui && npx vitest run src/launch/findOrStart.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/launch/findOrStart.test.ts > findOrStart > runTuiCommand: 端末版を読み込めなければサーバを起動せずに案内して 1
Error: must not spawn
 ❯ spawnServe src/launch/findOrStart.test.ts:556:17
    554|         spawnServe: async (req) => {
    555|           spawned.push(req);
    556|           throw new Error("must not spawn");
       |                 ^
    557|         },
    558|       },
 ❯ findOrStart src/launch/findOrStart.ts:122:23
 ❯ runTuiCommand src/launch/tuiCommand.ts:50:14
 ❯ src/launch/findOrStart.test.ts:538:18

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=bd5513bbda34d005 after=bd5513bbda34d005 IDENTICAL

===== 03r (1) 再接続の確かめ：ログインの失敗だけで終える (2026-09-28T05:30:03)
mutation: src/net/TuiNet.ts
  - 'if (await this.serverGone()) this.fatal('
  + 'if (true) this.fatal('
command: (cd packages/tui && npx vitest run src/net/TuiNet.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > ログインできなくてもサーバが居れば（isServerAlive）終えずに繋ぎ直しを続ける
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "soda: the server has stopped (run `soda` again to start it)
    ",
    ]


Number of calls: 1

 ❯ src/net/TuiNet.test.ts:257:29
    255|     for (let i = 0; i < 8; i++) await flush();
    256|     expect(calls).toBeGreaterThan(1);
    257|     expect(t.h.onFatal).not.toHaveBeenCalled();
       |                             ^
    258|   });
    259|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > handoff の入れ替えの空白（一度だけ居ないと見える）では終えない。居ないままなら終える
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "soda: the server has stopped (run `soda` again to start it)
    ",
    ]


Number of calls: 1

 ❯ src/net/TuiNet.test.ts:288:31
    286|     gap.sockets[0]!.close(1006);
    287|     for (let i = 0; i < 8; i++) await flush();
    288|     expect(gap.h.onFatal).not.toHaveBeenCalled();
       |                               ^
    289|
    290|     let n = 0;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=c6934d155492b648 after=c6934d155492b648 IDENTICAL

===== 03r (1) 再ログインの失敗：サーバが居ても終える (2026-09-28T05:30:05)
mutation: src/net/TuiNet.ts
  - '        if (await this.serverGone()) {\n          this.fatal('
  + '        if (true) {\n          this.fatal('
command: (cd packages/tui && npx vitest run src/net/TuiNet.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > ログインできなくてもサーバが居れば（isServerAlive）終えずに繋ぎ直しを続ける
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "soda: could not log in again: refused
    ",
    ]


Number of calls: 1

 ❯ src/net/TuiNet.test.ts:257:29
    255|     for (let i = 0; i < 8; i++) await flush();
    256|     expect(calls).toBeGreaterThan(1);
    257|     expect(t.h.onFatal).not.toHaveBeenCalled();
       |                             ^
    258|   });
    259|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=c6934d155492b648 after=c6934d155492b648 IDENTICAL

===== 03r (1) handoff の空白：もう一度確かめない (2026-09-28T05:30:08)
mutation: src/net/TuiNet.ts
  - '    await this.sleep(SERVER_GONE_GRACE_MS);\n    if (this.stopped) return false;\n    return !(await check());'
  + '    return true;'
command: (cd packages/tui && npx vitest run src/net/TuiNet.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > handoff の入れ替えの空白（一度だけ居ないと見える）では終えない。居ないままなら終える
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "soda: the server has stopped (run `soda` again to start it)
    ",
    ]


Number of calls: 1

 ❯ src/net/TuiNet.test.ts:288:31
    286|     gap.sockets[0]!.close(1006);
    287|     for (let i = 0; i < 8; i++) await flush();
    288|     expect(gap.h.onFatal).not.toHaveBeenCalled();
       |                               ^
    289|
    290|     let n = 0;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=c6934d155492b648 after=c6934d155492b648 IDENTICAL

===== 03r (5) 今の cookie が通っても作り直す (2026-09-28T05:30:10)
mutation: src/net/TuiNet.ts
  - '    if (await this.sessionAccepted()) return;'
  + ''
command: (cd packages/tui && npx vitest run src/net/TuiNet.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > 停止が長引いても 10 秒ごとにログインで確かめ直し、途中でサーバが止まれば終える
AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
 ❯ src/net/TuiNet.test.ts:176:19
    174|     sockets[0]!.close(1006);
    175|     await vi.advanceTimersByTimeAsync(0);
    176|     expect(login).toHaveBeenCalledTimes(1); // 停止の確かめは今の cookie が通るのでロ…
       |                   ^
    177|     alive = false;
    178|     srv.down = true;

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > 再接続中の確かめ：今の cookie がまだ通ればログインし直さない（セッションを増やさない）
AssertionError: expected "vi.fn()" to be called 1 times, but got 2 times
 ❯ src/net/TuiNet.test.ts:216:19
    214|     const t = setup(login);
    215|     await openThenDrop(t);
    216|     expect(login).toHaveBeenCalledTimes(1);
       |                   ^
    217|     expect(t.fetchCalls.filter((c) => c.startsWith("POST"))).toEqual([…
    218|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=c6934d155492b648 after=c6934d155492b648 IDENTICAL

===== 03r (5) 入れ替えた古い cookie をログアウトしない（再ログイン） (2026-09-28T05:30:12)
mutation: src/net/TuiNet.ts
  - '      if (old !== "" && old !== cookie) void this.logoutCookie(old);\n      this.conn.connect();'
  + '      this.conn.connect();'
command: (cd packages/tui && npx vitest run src/net/TuiNet.test.ts)  exit=0
raw output:
      Tests  13 passed (13)
restored: sha256 before=c6934d155492b648 after=c6934d155492b648 IDENTICAL

===== 03r (3) WT_SESSION を見ない (2026-09-28T05:30:14)
mutation: src/render/color.ts
  - '  if (env["WT_SESSION"]) return "truecolor";'
  + ''
command: (cd packages/tui && npx vitest run src/render/Renderer.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/render/Renderer.test.ts > color・width > truecolor の判定を広げる（WT_SESSION・TERM の -direct・TERM_PROGRAM・kitty・SODA_TRUECOLOR）と設定の上書き
AssertionError: expected '256' to be 'truecolor' // Object.is equality

Expected: "truecolor"
Received: "256"

 ❯ src/render/Renderer.test.ts:211:46
    209|
    210|   it("truecolor の判定を広げる（WT_SESSION・TERM の -direct・TERM_PROGRAM・kitty・S…
    211|     expect(colorModeOf({ WT_SESSION: "x" })).toBe("truecolor");
       |                                              ^
    212|     expect(colorModeOf({ TERM: "xterm-direct" })).toBe("truecolor");
    213|     for (const p of ["iTerm.app", "WezTerm", "vscode", "ghostty"]) exp…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=ad9f6909555888c4 after=ad9f6909555888c4 IDENTICAL

===== 03r (3) 設定の上書きを見ない (2026-09-28T05:30:17)
mutation: src/render/color.ts
  - '  if (pref !== "auto") return pref;'
  + ''
command: (cd packages/tui && npx vitest run src/render/Renderer.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/render/Renderer.test.ts > color・width > truecolor の判定を広げる（WT_SESSION・TERM の -direct・TERM_PROGRAM・kitty・SODA_TRUECOLOR）と設定の上書き
AssertionError: expected 'truecolor' to be '256' // Object.is equality

Expected: "256"
Received: "truecolor"

 ❯ src/render/Renderer.test.ts:218:60
    216|     expect(colorModeOf({ SODA_TRUECOLOR: "1" })).toBe("truecolor");
    217|     expect(colorModeOf({ SODA_TRUECOLOR: "0", COLORTERM: "truecolor" }…
    218|     expect(colorModeOf({ COLORTERM: "truecolor" }, "256")).toBe("256");
       |                                                            ^
    219|     expect(colorModeOf({}, "truecolor")).toBe("truecolor");
    220|     expect(colorModeOf({ COLORTERM: "truecolor" }, "auto")).toBe("true…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=ad9f6909555888c4 after=ad9f6909555888c4 IDENTICAL

===== 03r (3) 設定の変更で色の出し方を替えない (2026-09-28T05:30:21)
mutation: src/app/TuiApp.ts
  - '    this.renderer.setColorMode(colorModeOf(this.io.env, this.prefs.colorMode));'
  + ''
command: (cd packages/tui && npx vitest run src/app/TuiApp.view.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.view.test.ts > TuiApp：大きさの申告と描画の予約（AC2・AC11） > 共有の設定の tui.colorMode で色の出し方を切り替える（256 色 ⇄ truecolor。全部描き直す）
AssertionError: expected '\u001b[?2026h\u001b[?25l\u001b[1;27H\…' to contain '\u001b[2J'

Expected: "[2J"
Received: "[?2026h[?25l[1;27H 1:t1 [1;87Hsession[1;94H: [1;96Hwo[1;98Hrk[2;1H   w1                    [2;27H┌[2;28H─[2;29H pane p1 ─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H─[2;51H─[2;52H─[2;53H─[2;54H─[2;55H─[2;56H─[2;57H─[2;58H─[2;59H─[2;60H─[2;61H─[2;62H─[2;63H┐[2;64H┌[2;65H─[2;66H pane p2 ─[2;76H─[2;77H─[2;78H─[2;79H─[2;80H─[2;81H─[2;82H─[2;83H─[2;84H─[2;85H─[2;86H─[2;87H─[2;88H─[2;89H─[2;90H─[2;91H─[2;92H─[2;93H─[2;94H─[2;95H─[2;96H─[2;97H─[2;98H─[2;99H─[2;100H┐[3;4Hw2[3;27H│[3;28H                                   │[3;64H│[3;65H                                   │[4;27H│[4;28H                                   │[4;64H│[4;65H                                   │[5;27H│[5;28H                                   │[5;64H│[5;65H                                   │[6;27H│[6;28H                                   │[6;64H│[6;65H                                   │[7;27H│[7;28H                                   │[7;64H│[7;65H                                   │[8;27H│[8;28H                                   │[8;64H│[8;65H                                   │[9;27H│[9;28H                                   │[9;64H│[9;65H                                   │[10;27H│[10;28H                                   │[10;64H│[10;65H                                   │[11;27H│[11;28H                                   │[11;64H│[11;65H                                   │[12;27H│[12;28H                                   │[12;64H│[12;65H                                   │[13;27H│[13;28H                                   │[13;64H│[13;65H                                   │[14;27H│[14;28H                                   │[14;64H│[14;65H                                   │[15;27H│[15;28H                                   │[15;64H│[15;65H                                   │[16;27H│[16;28H                                 [16;61H  [16;63H│[16;64H│[16;65H                                   │[17;27H│[17;28H                                   │[17;64H│[17;65H                                   │[18;27H│[18;28H                                   │[18;64H│[18;65H                                   │[19;27H│[19;28H                                   │[19;64H│[19;65H                                   │[20;27H│[20;28H                                   │[20;64H│[20;65H                                   │[21;27H│[21;28H                                   │[21;64H│[21;65H                                   │[22;27H│[22;28H                                   │[22;64H│[22;65H                                   │[23;27H│[23;28H                                   │[23;64H│[23;65H                                   │[24;27H│[24;28H                                   │[24;64H│[24;65H                                   │[25;27H│[25;28H                                   │[25;64H│[25;65H                                   │[26;27H│[26;28H                                   │[26;64H│[26;65H                                   │[27;27H│[27;28H                                   │[27;64H│[27;65H                                   │[28;27H│[28;28H                                   │[28;64H│[28;65H                                   │[29;27H│[29;28H                                   │[29;64H│[29;65H                                   │[30;27H└[30;28H─[30;29H─[30;30H─[30;31H─[30;32H─[30;33H─[30;34H─[30;35H─[30;36H─[30;37H─[30;38H─[30;39H─[30;40H─[30;41H─[30;42H─[30;43H─[30;44H─[30;45H─[30;46H─[30;47H─[30;48H─[30;49H─[30;50H─[30;51H─[30;52H─[30;53H─[30;54H─[30;55H─[30;56H─[30;57H─[30;58H─[30;59H─[30;60H─[30;61H─[30;62H─[30;63H⋯[30;64H└[30;65H─[30;66H─[30;67H─[30;68H─[30;69H─[30;70H─[30;71H─[30;72H─[30;73H─[30;74H─[30;75H─[30;76H─[30;77H─[30;78H─[30;79H─[30;80H─[30;81H─[30;82H─[30;83H─[30;84H─[30;85H─[30;86H─[30;87H─[30;88H─[30;89H─[30;90H─[30;91H─[30;92H─[30;93H─[30;94H─[30;95H─[30;96H─[30;97H─[30;98H─[30;99H─[30;100H⋯[3;28H[2 q[?25h[?2026l[3;28H"

 ❯ src/app/TuiApp.view.test.ts:200:60
    198|     ws.event("prefs.changed", { prefs: { tui: { colorMode: "256" } }, …
    199|     const mark = io.output().length;
    200|     await vi.waitFor(() => expect(io.output().slice(mark)).toContain("…
       |                                                            ^
    201|     expect(io.output().slice(mark)).not.toContain("38;2;");
    202|     expect(io.output().slice(mark)).toContain("38;5;");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=ebd932b300a38221 after=ebd932b300a38221 IDENTICAL

===== 03r (5) 入れ替えた古い cookie をログアウトしない（4401 の再ログイン） (2026-09-28T05:30:37)
mutation: src/net/TuiNet.ts
  - '      if (old !== "" && old !== cookie) void this.logoutCookie(old);\n      this.conn.connect();'
  + '      this.conn.connect();'
command: (cd packages/tui && npx vitest run src/net/TuiNet.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > 4401 の再ログインで cookie が替わったら、古い cookie はログアウトする
AssertionError: expected [] to deeply equal [ Array(1) ]

- Expected
+ Received

- [
-   "POST http://127.0.0.1:9/api/logout sid=1",
- ]
+ []

 ❯ src/net/TuiNet.test.ts:320:62
    318|     t.sockets[0]!.close(4401);
    319|     for (let i = 0; i < 5; i++) await flush();
    320|     expect(t.fetchCalls.filter((c) => c.startsWith("POST"))).toEqual([…
       |                                                              ^
    321|     expect(t.sockets[1]!.cookie).toBe("sid=2");
    322|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=c6934d155492b648 after=c6934d155492b648 IDENTICAL

===== 03r (5) 入れ替えた古い cookie をログアウトしない（再接続の確かめ） (2026-09-28T05:30:40)
mutation: src/net/TuiNet.ts
  - '      if (old !== "" && old !== cookie) void this.logoutCookie(old);\n      return;'
  + '      return;'
command: (cd packages/tui && npx vitest run src/net/TuiNet.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > 再接続中の確かめ：cookie が通らなければログインし直し、古い cookie はログアウトする
AssertionError: expected [ …(5) ] to include 'POST http://127.0.0.1:9/api/logout si…'
 ❯ src/net/TuiNet.test.ts:234:26
    232|     t.sockets[0]!.close(1006);
    233|     for (let i = 0; i < 5; i++) await flush();
    234|     expect(t.fetchCalls).toContain("POST http://127.0.0.1:9/api/logout…
       |                          ^
    235|     expect(t.h.onFatal).not.toHaveBeenCalled();
    236|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=c6934d155492b648 after=c6934d155492b648 IDENTICAL

===== 03r2 (1) サーバが居てログインできないままでも終えない (2026-09-28T05:55:04)
mutation: src/net/TuiNet.ts
  - '    if (now - this.loginFailingSince >= LOGIN_FAIL_LIMIT_MS) {'
  + '    if (false) {'
command: (cd packages/tui && npx vitest run src/net/TuiNet.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > サーバは居るのにログインできないまま 30 秒続いたら、知らせてから理由を添えて終える
AssertionError: expected "vi.fn()" to be called with arguments: [ StringContaining{…} ]

Number of calls: 0

 ❯ src/net/TuiNet.test.ts:352:25
    350|     expect(t.h.onFatal).not.toHaveBeenCalled();
    351|     await vi.advanceTimersByTimeAsync(31_000);
    352|     expect(t.h.onFatal).toHaveBeenCalledWith(expect.stringContaining("…
       |                         ^
    353|   });
    354| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7c7e65eeccf77e22 after=7c7e65eeccf77e22 IDENTICAL

===== 03r2 (1) 知らせを出さない (2026-09-28T05:55:06)
mutation: src/net/TuiNet.ts
  - '    this.h.onStatus?.("サーバは動いていますが、手元からログインできません。やり直しています…");'
  + ''
command: (cd packages/tui && npx vitest run src/net/TuiNet.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/net/TuiNet.test.ts > TuiNet（接続・再ログイン。AC10・AC11・AC12） > サーバは居るのにログインできないまま 30 秒続いたら、知らせてから理由を添えて終える
AssertionError: expected "vi.fn()" to be called with arguments: [ StringContaining "手元からログインできません" ]

Number of calls: 0

 ❯ src/net/TuiNet.test.ts:349:22
    347|     t.sockets[0]!.close(1006);
    348|     await vi.advanceTimersByTimeAsync(100);
    349|     expect(onStatus).toHaveBeenCalledWith(expect.stringContaining("手元か…
       |                      ^
    350|     expect(t.h.onFatal).not.toHaveBeenCalled();
    351|     await vi.advanceTimersByTimeAsync(31_000);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7c7e65eeccf77e22 after=7c7e65eeccf77e22 IDENTICAL

===== 03r2 (2) SODA_TRUECOLOR を手元の設定より後にする (2026-09-28T05:55:08)
mutation: src/render/color.ts
  - '  if (forced === "1") return "truecolor";'
  + '  if (forced === "1" && pref === "auto") return "truecolor";'
command: (cd packages/tui && npx vitest run src/render/Renderer.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/render/Renderer.test.ts > color・width > truecolor の判定を広げる（WT_SESSION・TERM の -direct・TERM_PROGRAM・kitty・SODA_TRUECOLOR）と設定の上書き
AssertionError: expected '256' to be 'truecolor' // Object.is equality

Expected: "truecolor"
Received: "256"

 ❯ src/render/Renderer.test.ts:226:57
    224|     expect(colorModeOf({ COLORTERM: "truecolor" }, "256")).toBe("256");
    225|     // SODA_TRUECOLOR は手元の設定より優先する。
    226|     expect(colorModeOf({ SODA_TRUECOLOR: "1" }, "256")).toBe("truecolo…
       |                                                         ^
    227|     expect(colorModeOf({ SODA_TRUECOLOR: "0" }, "truecolor")).toBe("25…
    228|     expect(colorModeOf({}, "truecolor")).toBe("truecolor");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=23152c7836490dff after=23152c7836490dff IDENTICAL

===== 03r2 (2) 共有の設定の tui.colorMode を見る（旧の扱い） (2026-09-28T05:55:11)
mutation: src/model/PrefsModel.ts
  - '    return this.local.colorMode ?? "auto";'
  + '    return this.local.colorMode ?? (((this.raw.tui as Record<string, unknown> | undefined)?.["colorMode"] as ColorModePref | undefined) ?? "auto");'
command: (cd packages/tui && npx vitest run src/model/PrefsModel.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/model/PrefsModel.test.ts > PrefsModel（共有の設定と手元の状態） > 色の出し方は手元の tui-state.json の colorMode（端末ごと）。共有の設定の tui.colorMode は見ない
AssertionError: expected '256' to be 'auto' // Object.is equality

Expected: "auto"
Received: "256"

 ❯ src/model/PrefsModel.test.ts:32:25
     30|     expect(p.colorMode).toBe("auto");
     31|     p.apply({ tui: { colorMode: "256" } }, 1);
     32|     expect(p.colorMode).toBe("auto");
       |                         ^
     33|     p.setLocal({ colorMode: "256" });
     34|     expect(p.colorMode).toBe("256");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=5b8c9021b296da4b after=5b8c9021b296da4b IDENTICAL

===== 03r2 (3) 色の出し方が変わらなくても描き直す (2026-09-28T05:55:14)
mutation: src/render/Renderer.ts
  - '    if (mode === this.screen.colorMode) return; // 変わらなければ描き直さない'
  + ''
command: (cd packages/tui && npx vitest run src/render/Renderer.test.ts)  exit=0
raw output:
      Tests  14 passed (14)
restored: sha256 before=e13ae9dc8f16989f after=e13ae9dc8f16989f IDENTICAL

===== 03r2 (3) 色の出し方が変わらなくても描き直す（写しの手がかりを捨てる） (2026-09-28T05:55:33)
mutation: src/render/Renderer.ts
  - '    if (mode === this.screen.colorMode) return; // 変わらなければ描き直さない'
  + ''
command: (cd packages/tui && npx vitest run src/render/Renderer.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/render/Renderer.test.ts > Renderer（pane の中身と最小限の chrome。AC2・AC6・AC10） > 中身が変わっていない pane は前の格子を写し、変わった pane だけ読み直す
AssertionError: expected ' Spaces          + │ 1:t1   +        …' not to contain 'NEW'

- Expected
+ Received

- NEW
+  Spaces          + │ 1:t1   +                                     session: work
+    w1              │┌─ pane p1 ──────────────────┐┌─ pane p2 ──────────────────┐
+    w2              ││content-p1                  ││content-p2                  │
+                    ││                            ││NEW                         │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    ││                            ││                            │
+                    │└────────────────────────────┘└────────────────────────────┘

 ❯ src/render/Renderer.test.ts:163:30
    161|     renderer.setColorMode("truecolor");
    162|     await draw();
    163|     expect(outer.text()).not.toContain("NEW");
       |                              ^
    164|     p2.dirty = true;
    165|     await draw();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=e13ae9dc8f16989f after=e13ae9dc8f16989f IDENTICAL
```

## 起動確認（smoke）
subtask では打たない（親の統合 test で打つ）。

## 未検証の穴（skip / 環境不足）
- Windows（ConPTY・Windows Terminal ネイティブの入力・WMI の起動）。
- 実際の端末エミュレータでの見た目・IME の候補窓の位置。
- https のサーバでの `soda` からの起動（指紋の照合は tui の TLS のテストで確認）。
- `rm -rf packages/*/dist` だけでは `pnpm build` が失敗する（`tsconfig.tsbuildinfo` が残るため。今回の変更より前からの問題。実装者の報告）。
