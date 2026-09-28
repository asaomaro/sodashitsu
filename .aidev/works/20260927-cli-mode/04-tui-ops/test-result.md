# テスト結果: 04-tui-ops

## 実行したもの（df65107 だけを取り出した作業ツリー。05 の作業中の変更を含まない）
- `pnpm build` — exit 0 / `pnpm typecheck` — exit 0 / `npx eslint packages/tui` — exit 0
- `pnpm test` — 314 files / 5672 passed / 0 failed / 0 skipped
- `node scripts/tui-pty-verify.mjs`（疑似端末で dist の `soda` を一巡。06 で作った確かめ）— exit 0、`tui-pty-verify: OK`

## ラウンド 2（review の差し戻しの後。fcb94c3 を取り出した作業ツリー。05 の T1〔3e7c9f3〕を含む）
- `pnpm build`・`pnpm typecheck` — exit 0
- `pnpm test` — 315 files / 5688 passed / 0 failed
- `node scripts/tui-pty-verify.mjs` — exit 0

## ラウンド 3（review 2 巡目の差し戻しの後。6c65ebb を取り出した作業ツリー）
- `pnpm build`・`pnpm typecheck` — exit 0
- `pnpm test` — 315 files / 5698 passed / 0 failed
- `node scripts/tui-pty-verify.mjs` — exit 0

## 受け入れ基準ごとの判定（この subtask の分）
- AC5: pass（全 56 操作の RPC と引数を web と表で照合する試験・実物のサーバでの結合）
- AC7: pass（copy モードとマウスの選択・写し。全角・絵文字・折り返し・検索・切り詰め。クリップボードへの書き出しは OSC 52・手元の道具は 05）
- AC8: pass（client-core の KeyRouter・keymap を共有。D-7 の操作を含む）
- AC9: pass（herdr の M1〜M14 と Web の拡張 W01〜W03。当たり・ドラッグ・符号化の単体テスト）
- AC-I1〜AC-I5: pass（オーバーレイの開閉・確定・取り消し・キーだけの操作・焦点の戻り先・pane へ漏らさない）
- AC2（狭い幅）: pass（1 列表示・境界の 63/64・双方向の切り替え）

## 失敗の証跡
このラウンドでは失敗が発生していない。

### 負の確認（点検の指摘の修正。直した行を戻して落ちることの生の出力）

```
===== M-divider-down-split (2026-09-28T06:15:20)
mutation: src/input/mouse.ts
  - 'y === d.y - 1 && x >= d.x && x < d.x + d.len,'
  + '(y === d.y || y === d.y - 1) && x >= d.x && x < d.x + d.len,'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 上下の分割：下の pane の上辺（名前の行）は名前のドラッグ・焦点で、境界は上の pane の下辺（04 の点検）
AssertionError: expected 'p1' to be 'p2' // Object.is equality

Expected: "p2"
Received: "p1"

 ❯ src/input/mouse.test.ts:234:39
    232|     const lower = (h.app as unknown as { lastLayout: { panes: { paneId…
    233|     h.io.type(down(70, lower.frame.y) + up(70, lower.frame.y));
    234|     expect(h.app.model.focusedPaneId).toBe("p2");
       |                                       ^
    235|     expect(h.ws.requests("layout.set_split_ratio")).toEqual([]);
    236|     h.io.type(down(70, lower.frame.y - 1) + drag(70, 10) + up(70, 10));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-stuck-drag-cancel (2026-09-28T06:15:23)
mutation: src/input/mouse.ts
  - 'if (this.drag && ev.action === "down") this.cancel();'
  + 'if (false) this.cancel();'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 離す事象を取りこぼしたドラッグは次の押下・外側の端末を離れたときに捨てる（04 の点検）
AssertionError: expected 'p1' to be 'p2' // Object.is equality

Expected: "p2"
Received: "p1"

 ❯ src/input/mouse.test.ts:245:39
    243|     const n = h.ws.requests("layout.set_split_ratio").length;
    244|     h.io.type(down(70, 10) + up(70, 10));
    245|     expect(h.app.model.focusedPaneId).toBe("p2");
       |                                       ^
    246|     expect(h.ws.requests("layout.set_split_ratio")).toHaveLength(n);
    247|     h.io.type(down(63, 10) + "\x1b[O" + drag(40, 10));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-alt-wheel-arrows (2026-09-28T06:15:26)
mutation: src/input/mouse.ts
  - 'if (term.term.buffer.active.type === "alternate") {'
  + 'if (false) {'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 代替画面でマウスを求めていない pane のホイールは矢印キー（04 の点検）
AssertionError: expected [] to deeply equal [ '\u001b[B\u001b[B\u001b[B', …(1) ]

- Expected
+ Received

- [
-   "[B[B[B",
-   "[A[A[A",
- ]
+ []

 ❯ src/input/mouse.test.ts:257:24
    255|     await t.flush();
    256|     h.io.type(wheelDown(30, 5) + `\x1b[<64;31;6M`);
    257|     expect(h.inputs()).toEqual(["\x1b[B\x1b[B\x1b[B", "\x1b[A\x1b[A\x1…
       |                        ^
    258|   });
    259|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-alt-wheel-decckm (2026-09-28T06:15:29)
mutation: src/input/mouse.ts
  - 'term.modes.applicationCursorKeysMode ? "\\x1bO" : "\\x1b["'
  + '"\\x1b["'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=0
raw output:
      Tests  20 passed (20)
restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-clamp-cols (2026-09-28T06:15:32)
mutation: src/input/mouse.ts
  - 'Math.min(box.content.w, term.cols) - 1'
  + 'box.content.w - 1'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > pane の実際の大きさより外（切り取りの余白）の座標は端に寄せて送る（04 の点検）
AssertionError: expected [ Array(2) ] to deeply equal [ Array(2) ]

- Expected
+ Received

  [
-   "[<0;10;5M",
-   "[<0;10;5m",
+   "[<0;24;5M",
+   "[<0;24;5m",
  ]

 ❯ src/input/mouse.test.ts:267:24
    265|     await t.flush();
    266|     h.io.type(down(50, 20) + up(50, 20));
    267|     expect(h.inputs()).toEqual(["\x1b[<0;10;5M", "\x1b[<0;10;5m"]);
       |                        ^
    268|   });
    269|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-clamp-rows (2026-09-28T06:15:36)
mutation: src/input/mouse.ts
  - 'Math.min(box.content.h, term.rows) - 1'
  + 'box.content.h - 1'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > pane の実際の大きさより外（切り取りの余白）の座標は端に寄せて送る（04 の点検）
AssertionError: expected [ '\u001b[<0;10;19M', …(1) ] to deeply equal [ Array(2) ]

- Expected
+ Received

  [
-   "[<0;10;5M",
-   "[<0;10;5m",
+   "[<0;10;19M",
+   "[<0;10;19m",
  ]

 ❯ src/input/mouse.test.ts:267:24
    265|     await t.flush();
    266|     h.io.type(down(50, 20) + up(50, 20));
    267|     expect(h.inputs()).toEqual(["\x1b[<0;10;5M", "\x1b[<0;10;5m"]);
       |                        ^
    268|   });
    269|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-motion-any (2026-09-28T06:15:39)
mutation: src/input/mouse.ts
  - 'else if (ev.action === "move") this.motion(ev);'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 全部の動きを求める pane（?1003）があれば外側の端末にも ?1003 を出し、ボタンを押していない動きを送る（04 の点検）
AssertionError: expected [] to deeply equal [ '\u001b[<35;4;4M' ]

- Expected
+ Received

- [
-   "[<35;4;4M",
- ]
+ []

 ❯ src/input/mouse.test.ts:278:24
    276|     expect(h.io.output()).toContain("\x1b[?1003h");
    277|     h.io.type("\x1b[<35;31;6M");
    278|     expect(h.inputs()).toEqual(["\x1b[<35;4;4M"]);
       |                        ^
    279|     t.output(new TextEncoder().encode("\x1b[?1003l"));
    280|     await t.flush();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-ctrl-click-link (2026-09-28T06:15:42)
mutation: src/input/mouse.ts
  - 'this.host.openLink?.(url);'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > Ctrl＋クリックで URL を開く（M6）
AssertionError: expected [] to deeply equal [ 'https://example.com/a?b=1' ]

- Expected
+ Received

- [
-   "https://example.com/a?b=1",
- ]
+ []

 ❯ src/input/mouse.test.ts:292:20
    290|     await t.flush();
    291|     h.io.type("\x1b[<16;35;3M\x1b[<16;35;3m"); // Ctrl＋左（桁 34 は URL の中）
    292|     expect(opened).toEqual(["https://example.com/a?b=1"]);
       |                    ^
    293|   });
    294|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-url-trailing-punct (2026-09-28T06:15:45)
mutation: src/input/mouse.ts
  - 'm[0].replace(/[.,;:!?)\\]]+$/, "")'
  + 'm[0]'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > Ctrl＋クリックで URL を開く（M6）
AssertionError: expected [ 'https://example.com/a?b=1.' ] to deeply equal [ 'https://example.com/a?b=1' ]

- Expected
+ Received

  [
-   "https://example.com/a?b=1",
+   "https://example.com/a?b=1.",
  ]

 ❯ src/input/mouse.test.ts:292:20
    290|     await t.flush();
    291|     h.io.type("\x1b[<16;35;3M\x1b[<16;35;3m"); // Ctrl＋左（桁 34 は URL の中）
    292|     expect(opened).toEqual(["https://example.com/a?b=1"]);
       |                    ^
    293|   });
    294|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-section-drag (2026-09-28T06:15:48)
mutation: src/input/mouse.ts
  - 'this.host.setSidebarSpacesRows?.(Math.max(2, ev.y - drag.top), done);'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > サイドバーの spaces と agents の区切りのドラッグで区画の高さ（H19b・04 の点検）
AssertionError: expected undefined to be 9 // Object.is equality

- Expected:
9

+ Received:
undefined

 ❯ src/input/mouse.test.ts:302:43
    300|     const div = hits.find((x) => x.kind === "sectionDivider")!;
    301|     h.io.type(down(3, div.y) + drag(3, div.y + 5) + up(3, div.y + 5));
    302|     expect(h.app.prefs.sidebarSpacesRows).toBe(div.y + 5);
       |                                           ^
    303|   });
    304|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-word-cells (2026-09-28T06:15:53)
mutation: src/input/mouse.ts
  - 'wordRange(term.term, abs, col, "mouse")'
  + '[col, col] as [number, number]'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > マウスを求めていない pane：ドラッグで選んで離すとコピー（M4）、ダブルクリックで単語（M5）、ホイールでスクロールバック（M8）
AssertionError: expected '\u001b[?1049h\u001b[H\u001b[2J\u001b[…' to contain '\u001b]52;c;d29ybGQ=\u0007'

Expected: "]52;c;d29ybGQ="
Received: "[?1049h[H[2J[?25l[?2004h[?1004h=[?1000h[?1002h[?1006h[?2026h[?25l[2J[1;1H Spaces                + │[1;27H                                                                  接[1;95H続[1;97H中[1;99H…[1;100H [2;1H                         │[2;27H                                                                          [3;1H                         │[3;27H                                                                          [4;1H                         │[4;27H                                                                          [5;1H                         │[5;27H                                                                          [6;1H                         │[6;27H                                                                          [7;1H                         │[7;27H                                                                          [8;1H                         │[8;27H                                                                          [9;1H                         │[9;27H                                                                          [10;1H                         │[10;27H                                                                          [11;1H                         │[11;27H                                                                          [12;1H                         │[12;27H                                                                          [13;1H                         │[13;27H                                                                          [14;1H                         │[14;27H                                                                          [15;1H                         │[15;27H                                                                          [16;1H                         │[16;27H                                 接[16;62H続[16;64H中[16;66H…[16;67H                                  [17;1H                         │[17;27H                                                                          [18;1H                         │[18;27H                                                                          [19;1H                         │[19;27H                                                                          [20;1H                         │[20;27H                                                                          [21;1H                         │[21;27H                                                                          [22;1H                         │[22;27H                                                                          [23;1H                         │[23;27H                                                                          [24;1H                         │[24;27H                                                                          [25;1H                         │[25;27H                                                                          [26;1H                         │[26;27H                                                                          [27;1H                         │[27;27H                                                                          [28;1H                         │[28;27H                                                                          [29;1H                         │[29;27H                                                                          [30;1H                         │[30;27H                                                                          [1;1H[?2026l[1;1H[?2026h[?25l[1;27H 1:t1 [1;34H + [1;87Hsession[1;94H: [1;96Hwo[1;98Hrk[2;1H   w1                    [2;27H┌[2;28H─[2;29H pane p1 ─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H─[2;51H─[2;52H─[2;53H─[2;54H─[2;55H─[2;56H─[2;57H─[2;58H─[2;59H─[2;60H─[2;61H─[2;62H─[2;63H┐[2;64H┌[2;65H─[2;66H pane p2 ─[2;76H─[2;77H─[2;78H─[2;79H─[2;80H─[2;81H─[2;82H─[2;83H─[2;84H─[2;85H─[2;86H─[2;87H─[2;88H─[2;89H─[2;90H─[2;91H─[2;92H─[2;93H─[2;94H─[2;95H─[2;96H─[2;97H─[2;98H─[2;99H─[2;100H┐[3;4Hw2[3;27H│[3;28H                                   │[3;64H│[3;65H                                   │[4;27H│[4;28H                                   │[4;64H│[4;65H                                   │[5;27H│[5;28H                                   │[5;64H│[5;65H                                   │[6;27H│[6;28H                                   │[6;64H│[6;65H                                   │[7;27H│[7;28H                                   │[7;64H│[7;65H                                   │[8;27H│[8;28H                                   │[8;64H│[8;65H                                   │[9;27H│[9;28H                                   │[9;64H│[9;65H                                   │[10;27H│[10;28H                                   │[10;64H│[10;65H                                   │[11;27H│[11;28H                                   │[11;64H│[11;65H                                   │[12;27H│[12;28H                                   │[12;64H│[12;65H                                   │[13;27H│[13;28H                                   │[13;64H│[13;65H                                   │[14;27H│[14;28H                                   │[14;64H│[14;65H                                   │[15;27H│[15;28H                                   │[15;64H│[15;65H                                   │[16;27H│[16;28H                                 [16;61H  [16;63H│[16;64H│[16;65H                                   │[17;27H│[17;28H                                   │[17;64H│[17;65H                                   │[18;27H│[18;28H                                   │[18;64H│[18;65H                                   │[19;27H│[19;28H                                   │[19;64H│[19;65H                                   │[20;27H│[20;28H                                   │[20;64H│[20;65H                                   │[21;27H│[21;28H                                   │[21;64H│[21;65H                                   │[22;27H│[22;28H                                   │[22;64H│[22;65H                                   │[23;27H│[23;28H                                   │[23;64H│[23;65H                                   │[24;27H│[24;28H                                   │[24;64H│[24;65H                                   │[25;27H│[25;28H                                   │[25;64H│[25;65H                                   │[26;27H│[26;28H                                   │[26;64H│[26;65H                                   │[27;27H│[27;28H                                   │[27;64H│[27;65H                                   │[28;27H│[28;28H                                   │[28;64H│[28;65H                                   │[29;27H│[29;28H                                   │[29;64H│[29;65H                                   │[30;27H└[30;28H─[30;29H─[30;30H─[30;31H─[30;32H─[30;33H─[30;34H─[30;35H─[30;36H─[30;37H─[30;38H─[30;39H─[30;40H─[30;41H─[30;42H─[30;43H─[30;44H─[30;45H─[30;46H─[30;47H─[30;48H─[30;49H─[30;50H─[30;51H─[30;52H─[30;53H─[30;54H─[30;55H─[30;56H─[30;57H─[30;58H─[30;59H─[30;60H─[30;61H─[30;62H─[30;63H⋯[30;64H└[30;65H─[30;66H─[30;67H─[30;68H─[30;69H─[30;70H─[30;71H─[30;72H─[30;73H─[30;74H─[30;75H─[30;76H─[30;77H─[30;78H─[30;79H─[30;80H─[30;81H─[30;82H─[30;83H─[30;84H─[30;85H─[30;86H─[30;87H─[30;88H─[30;89H─[30;90H─[30;91H─[30;92H─[30;93H─[30;94H─[30;95H─[30;96H─[30;97H─[30;98H─[30;99H─[30;100H⋯[3;28H[2 q[?25h[?2026l[3;28H[?2026h[?25l[3;28H[?25h[?2026l[3;28H]52;c;aGVsbG8=]52;c;bw==[?2026h[?25l[3;28Hhello[3;34Hworld[3;40Hfoo[30;63H┘[3;43H[?25h[?2026l[3;43H"

 ❯ src/input/mouse.test.ts:162:50
    160|     await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;…
    161|     h.io.type(down(34, 2) + up(34, 2) + down(34, 2) + up(34, 2));
    162|     await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;…
       |                                                  ^
    163|     t.output(new TextEncoder().encode("\r\n".repeat(60)));
    164|     await t.flush();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 全角の行でもダブルクリックの単語と選択の写しがセルの列で合う（04 の点検）
AssertionError: expected '\u001b[?1049h\u001b[H\u001b[2J\u001b[…' to contain '\u001b]52;c;Zm9vLWJhci9iYXo=\u0007'

Expected: "]52;c;Zm9vLWJhci9iYXo="
Received: "[?1049h[H[2J[?25l[?2004h[?1004h=[?1000h[?1002h[?1006h[?2026h[?25l[2J[1;1H Spaces                + │[1;27H                                                                  接[1;95H続[1;97H中[1;99H…[1;100H [2;1H                         │[2;27H                                                                          [3;1H                         │[3;27H                                                                          [4;1H                         │[4;27H                                                                          [5;1H                         │[5;27H                                                                          [6;1H                         │[6;27H                                                                          [7;1H                         │[7;27H                                                                          [8;1H                         │[8;27H                                                                          [9;1H                         │[9;27H                                                                          [10;1H                         │[10;27H                                                                          [11;1H                         │[11;27H                                                                          [12;1H                         │[12;27H                                                                          [13;1H                         │[13;27H                                                                          [14;1H                         │[14;27H                                                                          [15;1H                         │[15;27H                                                                          [16;1H                         │[16;27H                                 接[16;62H続[16;64H中[16;66H…[16;67H                                  [17;1H                         │[17;27H                                                                          [18;1H                         │[18;27H                                                                          [19;1H                         │[19;27H                                                                          [20;1H                         │[20;27H                                                                          [21;1H                         │[21;27H                                                                          [22;1H                         │[22;27H                                                                          [23;1H                         │[23;27H                                                                          [24;1H                         │[24;27H                                                                          [25;1H                         │[25;27H                                                                          [26;1H                         │[26;27H                                                                          [27;1H                         │[27;27H                                                                          [28;1H                         │[28;27H                                                                          [29;1H                         │[29;27H                                                                          [30;1H                         │[30;27H                                                                          [1;1H[?2026l[1;1H[?2026h[?25l[1;27H 1:t1 [1;34H + [1;87Hsession[1;94H: [1;96Hwo[1;98Hrk[2;1H   w1                    [2;27H┌[2;28H─[2;29H pane p1 ─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H─[2;51H─[2;52H─[2;53H─[2;54H─[2;55H─[2;56H─[2;57H─[2;58H─[2;59H─[2;60H─[2;61H─[2;62H─[2;63H┐[2;64H┌[2;65H─[2;66H pane p2 ─[2;76H─[2;77H─[2;78H─[2;79H─[2;80H─[2;81H─[2;82H─[2;83H─[2;84H─[2;85H─[2;86H─[2;87H─[2;88H─[2;89H─[2;90H─[2;91H─[2;92H─[2;93H─[2;94H─[2;95H─[2;96H─[2;97H─[2;98H─[2;99H─[2;100H┐[3;4Hw2[3;27H│[3;28H                                   │[3;64H│[3;65H                                   │[4;27H│[4;28H                                   │[4;64H│[4;65H                                   │[5;27H│[5;28H                                   │[5;64H│[5;65H                                   │[6;27H│[6;28H                                   │[6;64H│[6;65H                                   │[7;27H│[7;28H                                   │[7;64H│[7;65H                                   │[8;27H│[8;28H                                   │[8;64H│[8;65H                                   │[9;27H│[9;28H                                   │[9;64H│[9;65H                                   │[10;27H│[10;28H                                   │[10;64H│[10;65H                                   │[11;27H│[11;28H                                   │[11;64H│[11;65H                                   │[12;27H│[12;28H                                   │[12;64H│[12;65H                                   │[13;27H│[13;28H                                   │[13;64H│[13;65H                                   │[14;27H│[14;28H                                   │[14;64H│[14;65H                                   │[15;27H│[15;28H                                   │[15;64H│[15;65H                                   │[16;27H│[16;28H                                 [16;61H  [16;63H│[16;64H│[16;65H                                   │[17;27H│[17;28H                                   │[17;64H│[17;65H                                   │[18;27H│[18;28H                                   │[18;64H│[18;65H                                   │[19;27H│[19;28H                                   │[19;64H│[19;65H                                   │[20;27H│[20;28H                                   │[20;64H│[20;65H                                   │[21;27H│[21;28H                                   │[21;64H│[21;65H                                   │[22;27H│[22;28H                                   │[22;64H│[22;65H                                   │[23;27H│[23;28H                                   │[23;64H│[23;65H                                   │[24;27H│[24;28H                                   │[24;64H│[24;65H                                   │[25;27H│[25;28H                                   │[25;64H│[25;65H                                   │[26;27H│[26;28H                                   │[26;64H│[26;65H                                   │[27;27H│[27;28H                                   │[27;64H│[27;65H                                   │[28;27H│[28;28H                                   │[28;64H│[28;65H                                   │[29;27H│[29;28H                                   │[29;64H│[29;65H                                   │[30;27H└[30;28H─[30;29H─[30;30H─[30;31H─[30;32H─[30;33H─[30;34H─[30;35H─[30;36H─[30;37H─[30;38H─[30;39H─[30;40H─[30;41H─[30;42H─[30;43H─[30;44H─[30;45H─[30;46H─[30;47H─[30;48H─[30;49H─[30;50H─[30;51H─[30;52H─[30;53H─[30;54H─[30;55H─[30;56H─[30;57H─[30;58H─[30;59H─[30;60H─[30;61H─[30;62H─[30;63H⋯[30;64H└[30;65H─[30;66H─[30;67H─[30;68H─[30;69H─[30;70H─[30;71H─[30;72H─[30;73H─[30;74H─[30;75H─[30;76H─[30;77H─[30;78H─[30;79H─[30;80H─[30;81H─[30;82H─[30;83H─[30;84H─[30;85H─[30;86H─[30;87H─[30;88H─[30;89H─[30;90H─[30;91H─[30;92H─[30;93H─[30;94H─[30;95H─[30;96H─[30;97H─[30;98H─[30;99H─[30;100H⋯[3;28H[2 q[?25h[?2026l[3;28H[?2026h[?25l[3;28H[?25h[?2026l[3;28H]52;c;bw==[?2026h[?25l[3;28Hあ[3;30Hい[3;32Hう[3;35Hfoo-bar/baz[3;47Hend[30;63H┘[3;50H[?25h[?2026l[3;50H"

 ❯ src/input/mouse.test.ts:313:50
    311|     h.io.type(down(27 + 9, 2) + up(27 + 9, 2) + down(27 + 9, 2) + up(2…
    312|     const b64 = (s: string) => Buffer.from(s).toString("base64");
    313|     await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;…
       |                                                  ^
    314|     // 「い」（桁 2・3）から「う」の右半分（桁 5）まで：全角の組ごと写す。
    315|     h.io.type(down(27 + 2, 2) + drag(27 + 5, 2) + up(27 + 5, 2));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-select-wide-right-half (2026-09-28T06:15:57)
mutation: src/input/mouse.ts
  - 'col: to.col + Math.max(0, tw - 1)'
  + 'col: to.col'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=0
raw output:
      Tests  20 passed (20)
restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-copy-wrap-join (2026-09-28T06:16:02)
mutation: src/input/mouse.ts
  - 'rangeText(term.term, sel.from, sel.to, false)'
  + 'rangeText(term.term, sel.from, sel.to, true)'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > マウスを求めていない pane：ドラッグで選んで離すとコピー（M4）、ダブルクリックで単語（M5）、ホイールでスクロールバック（M8）
AssertionError: expected '\u001b[?1049h\u001b[H\u001b[2J\u001b[…' to contain '\u001b]52;c;aGVsbG8=\u0007'

Expected: "]52;c;aGVsbG8="
Received: "[?1049h[H[2J[?25l[?2004h[?1004h=[?1000h[?1002h[?1006h[?2026h[?25l[2J[1;1H Spaces                + │[1;27H                                                                  接[1;95H続[1;97H中[1;99H…[1;100H [2;1H                         │[2;27H                                                                          [3;1H                         │[3;27H                                                                          [4;1H                         │[4;27H                                                                          [5;1H                         │[5;27H                                                                          [6;1H                         │[6;27H                                                                          [7;1H                         │[7;27H                                                                          [8;1H                         │[8;27H                                                                          [9;1H                         │[9;27H                                                                          [10;1H                         │[10;27H                                                                          [11;1H                         │[11;27H                                                                          [12;1H                         │[12;27H                                                                          [13;1H                         │[13;27H                                                                          [14;1H                         │[14;27H                                                                          [15;1H                         │[15;27H                                                                          [16;1H                         │[16;27H                                 接[16;62H続[16;64H中[16;66H…[16;67H                                  [17;1H                         │[17;27H                                                                          [18;1H                         │[18;27H                                                                          [19;1H                         │[19;27H                                                                          [20;1H                         │[20;27H                                                                          [21;1H                         │[21;27H                                                                          [22;1H                         │[22;27H                                                                          [23;1H                         │[23;27H                                                                          [24;1H                         │[24;27H                                                                          [25;1H                         │[25;27H                                                                          [26;1H                         │[26;27H                                                                          [27;1H                         │[27;27H                                                                          [28;1H                         │[28;27H                                                                          [29;1H                         │[29;27H                                                                          [30;1H                         │[30;27H                                                                          [1;1H[?2026l[1;1H[?2026h[?25l[1;27H 1:t1 [1;34H + [1;87Hsession[1;94H: [1;96Hwo[1;98Hrk[2;1H   w1                    [2;27H┌[2;28H─[2;29H pane p1 ─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H─[2;51H─[2;52H─[2;53H─[2;54H─[2;55H─[2;56H─[2;57H─[2;58H─[2;59H─[2;60H─[2;61H─[2;62H─[2;63H┐[2;64H┌[2;65H─[2;66H pane p2 ─[2;76H─[2;77H─[2;78H─[2;79H─[2;80H─[2;81H─[2;82H─[2;83H─[2;84H─[2;85H─[2;86H─[2;87H─[2;88H─[2;89H─[2;90H─[2;91H─[2;92H─[2;93H─[2;94H─[2;95H─[2;96H─[2;97H─[2;98H─[2;99H─[2;100H┐[3;4Hw2[3;27H│[3;28H                                   │[3;64H│[3;65H                                   │[4;27H│[4;28H                                   │[4;64H│[4;65H                                   │[5;27H│[5;28H                                   │[5;64H│[5;65H                                   │[6;27H│[6;28H                                   │[6;64H│[6;65H                                   │[7;27H│[7;28H                                   │[7;64H│[7;65H                                   │[8;27H│[8;28H                                   │[8;64H│[8;65H                                   │[9;27H│[9;28H                                   │[9;64H│[9;65H                                   │[10;27H│[10;28H                                   │[10;64H│[10;65H                                   │[11;27H│[11;28H                                   │[11;64H│[11;65H                                   │[12;27H│[12;28H                                   │[12;64H│[12;65H                                   │[13;27H│[13;28H                                   │[13;64H│[13;65H                                   │[14;27H│[14;28H                                   │[14;64H│[14;65H                                   │[15;27H│[15;28H                                   │[15;64H│[15;65H                                   │[16;27H│[16;28H                                 [16;61H  [16;63H│[16;64H│[16;65H                                   │[17;27H│[17;28H                                   │[17;64H│[17;65H                                   │[18;27H│[18;28H                                   │[18;64H│[18;65H                                   │[19;27H│[19;28H                                   │[19;64H│[19;65H                                   │[20;27H│[20;28H                                   │[20;64H│[20;65H                                   │[21;27H│[21;28H                                   │[21;64H│[21;65H                                   │[22;27H│[22;28H                                   │[22;64H│[22;65H                                   │[23;27H│[23;28H                                   │[23;64H│[23;65H                                   │[24;27H│[24;28H                                   │[24;64H│[24;65H                                   │[25;27H│[25;28H                                   │[25;64H│[25;65H                                   │[26;27H│[26;28H                                   │[26;64H│[26;65H                                   │[27;27H│[27;28H                                   │[27;64H│[27;65H                                   │[28;27H│[28;28H                                   │[28;64H│[28;65H                                   │[29;27H│[29;28H                                   │[29;64H│[29;65H                                   │[30;27H└[30;28H─[30;29H─[30;30H─[30;31H─[30;32H─[30;33H─[30;34H─[30;35H─[30;36H─[30;37H─[30;38H─[30;39H─[30;40H─[30;41H─[30;42H─[30;43H─[30;44H─[30;45H─[30;46H─[30;47H─[30;48H─[30;49H─[30;50H─[30;51H─[30;52H─[30;53H─[30;54H─[30;55H─[30;56H─[30;57H─[30;58H─[30;59H─[30;60H─[30;61H─[30;62H─[30;63H⋯[30;64H└[30;65H─[30;66H─[30;67H─[30;68H─[30;69H─[30;70H─[30;71H─[30;72H─[30;73H─[30;74H─[30;75H─[30;76H─[30;77H─[30;78H─[30;79H─[30;80H─[30;81H─[30;82H─[30;83H─[30;84H─[30;85H─[30;86H─[30;87H─[30;88H─[30;89H─[30;90H─[30;91H─[30;92H─[30;93H─[30;94H─[30;95H─[30;96H─[30;97H─[30;98H─[30;99H─[30;100H⋯[3;28H[2 q[?25h[?2026l[3;28H[?2026h[?25l[3;28H[?25h[?2026l[3;28H]52;c;aGVsbG8gd29ybGQgZm9v[?2026h[?25l[3;28Hhello[3;34Hworld[3;40Hfoo[30;63H┘[3;43H[?25h[?2026l[3;43H"

 ❯ src/input/mouse.test.ts:160:50
    158|     h.io.type(down(27, 2) + drag(31, 2) + up(31, 2));
    159|     const b64 = (s: string) => Buffer.from(s).toString("base64");
    160|     await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;…
       |                                                  ^
    161|     h.io.type(down(34, 2) + up(34, 2) + down(34, 2) + up(34, 2));
    162|     await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 全角の行でもダブルクリックの単語と選択の写しがセルの列で合う（04 の点検）
AssertionError: expected '\u001b[?1049h\u001b[H\u001b[2J\u001b[…' to contain '\u001b]52;c;Zm9vLWJhci9iYXo=\u0007'

Expected: "]52;c;Zm9vLWJhci9iYXo="
Received: "[?1049h[H[2J[?25l[?2004h[?1004h=[?1000h[?1002h[?1006h[?2026h[?25l[2J[1;1H Spaces                + │[1;27H                                                                  接[1;95H続[1;97H中[1;99H…[1;100H [2;1H                         │[2;27H                                                                          [3;1H                         │[3;27H                                                                          [4;1H                         │[4;27H                                                                          [5;1H                         │[5;27H                                                                          [6;1H                         │[6;27H                                                                          [7;1H                         │[7;27H                                                                          [8;1H                         │[8;27H                                                                          [9;1H                         │[9;27H                                                                          [10;1H                         │[10;27H                                                                          [11;1H                         │[11;27H                                                                          [12;1H                         │[12;27H                                                                          [13;1H                         │[13;27H                                                                          [14;1H                         │[14;27H                                                                          [15;1H                         │[15;27H                                                                          [16;1H                         │[16;27H                                 接[16;62H続[16;64H中[16;66H…[16;67H                                  [17;1H                         │[17;27H                                                                          [18;1H                         │[18;27H                                                                          [19;1H                         │[19;27H                                                                          [20;1H                         │[20;27H                                                                          [21;1H                         │[21;27H                                                                          [22;1H                         │[22;27H                                                                          [23;1H                         │[23;27H                                                                          [24;1H                         │[24;27H                                                                          [25;1H                         │[25;27H                                                                          [26;1H                         │[26;27H                                                                          [27;1H                         │[27;27H                                                                          [28;1H                         │[28;27H                                                                          [29;1H                         │[29;27H                                                                          [30;1H                         │[30;27H                                                                          [1;1H[?2026l[1;1H[?2026h[?25l[1;27H 1:t1 [1;34H + [1;87Hsession[1;94H: [1;96Hwo[1;98Hrk[2;1H   w1                    [2;27H┌[2;28H─[2;29H pane p1 ─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H─[2;51H─[2;52H─[2;53H─[2;54H─[2;55H─[2;56H─[2;57H─[2;58H─[2;59H─[2;60H─[2;61H─[2;62H─[2;63H┐[2;64H┌[2;65H─[2;66H pane p2 ─[2;76H─[2;77H─[2;78H─[2;79H─[2;80H─[2;81H─[2;82H─[2;83H─[2;84H─[2;85H─[2;86H─[2;87H─[2;88H─[2;89H─[2;90H─[2;91H─[2;92H─[2;93H─[2;94H─[2;95H─[2;96H─[2;97H─[2;98H─[2;99H─[2;100H┐[3;4Hw2[3;27H│[3;28H                                   │[3;64H│[3;65H                                   │[4;27H│[4;28H                                   │[4;64H│[4;65H                                   │[5;27H│[5;28H                                   │[5;64H│[5;65H                                   │[6;27H│[6;28H                                   │[6;64H│[6;65H                                   │[7;27H│[7;28H                                   │[7;64H│[7;65H                                   │[8;27H│[8;28H                                   │[8;64H│[8;65H                                   │[9;27H│[9;28H                                   │[9;64H│[9;65H                                   │[10;27H│[10;28H                                   │[10;64H│[10;65H                                   │[11;27H│[11;28H                                   │[11;64H│[11;65H                                   │[12;27H│[12;28H                                   │[12;64H│[12;65H                                   │[13;27H│[13;28H                                   │[13;64H│[13;65H                                   │[14;27H│[14;28H                                   │[14;64H│[14;65H                                   │[15;27H│[15;28H                                   │[15;64H│[15;65H                                   │[16;27H│[16;28H                                 [16;61H  [16;63H│[16;64H│[16;65H                                   │[17;27H│[17;28H                                   │[17;64H│[17;65H                                   │[18;27H│[18;28H                                   │[18;64H│[18;65H                                   │[19;27H│[19;28H                                   │[19;64H│[19;65H                                   │[20;27H│[20;28H                                   │[20;64H│[20;65H                                   │[21;27H│[21;28H                                   │[21;64H│[21;65H                                   │[22;27H│[22;28H                                   │[22;64H│[22;65H                                   │[23;27H│[23;28H                                   │[23;64H│[23;65H                                   │[24;27H│[24;28H                                   │[24;64H│[24;65H                                   │[25;27H│[25;28H                                   │[25;64H│[25;65H                                   │[26;27H│[26;28H                                   │[26;64H│[26;65H                                   │[27;27H│[27;28H                                   │[27;64H│[27;65H                                   │[28;27H│[28;28H                                   │[28;64H│[28;65H                                   │[29;27H│[29;28H                                   │[29;64H│[29;65H                                   │[30;27H└[30;28H─[30;29H─[30;30H─[30;31H─[30;32H─[30;33H─[30;34H─[30;35H─[30;36H─[30;37H─[30;38H─[30;39H─[30;40H─[30;41H─[30;42H─[30;43H─[30;44H─[30;45H─[30;46H─[30;47H─[30;48H─[30;49H─[30;50H─[30;51H─[30;52H─[30;53H─[30;54H─[30;55H─[30;56H─[30;57H─[30;58H─[30;59H─[30;60H─[30;61H─[30;62H─[30;63H⋯[30;64H└[30;65H─[30;66H─[30;67H─[30;68H─[30;69H─[30;70H─[30;71H─[30;72H─[30;73H─[30;74H─[30;75H─[30;76H─[30;77H─[30;78H─[30;79H─[30;80H─[30;81H─[30;82H─[30;83H─[30;84H─[30;85H─[30;86H─[30;87H─[30;88H─[30;89H─[30;90H─[30;91H─[30;92H─[30;93H─[30;94H─[30;95H─[30;96H─[30;97H─[30;98H─[30;99H─[30;100H⋯[3;28H[2 q[?25h[?2026l[3;28H[?2026h[?25l[3;28H[?25h[?2026l[3;28H]52;c;44GC44GE44GGIGZvby1iYXIvYmF6IGVuZA==[?2026h[?25l[3;28Hあ[3;30Hい[3;32Hう[3;35Hfoo-bar/baz[3;47Hend[30;63H┘[3;50H[?25h[?2026l[3;50H"

 ❯ src/input/mouse.test.ts:313:50
    311|     h.io.type(down(27 + 9, 2) + up(27 + 9, 2) + down(27 + 9, 2) + up(2…
    312|     const b64 = (s: string) => Buffer.from(s).toString("base64");
    313|     await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;…
       |                                                  ^
    314|     // 「い」（桁 2・3）から「う」の右半分（桁 5）まで：全角の組ごと写す。
    315|     h.io.type(down(27 + 2, 2) + drag(27 + 5, 2) + up(27 + 5, 2));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-alt-wheel-decckm (テストを足した後) (2026-09-28T06:16:36)
mutation: src/input/mouse.ts
  - 'term.modes.applicationCursorKeysMode ? "\\x1bO" : "\\x1b["'
  + '"\\x1b["'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 代替画面でマウスを求めていない pane のホイールは矢印キー（04 の点検）
AssertionError: expected '\u001b[B\u001b[B\u001b[B' to be '\u001bOB\u001bOB\u001bOB' // Object.is equality

Expected: "OBOBOB"
Received: "[B[B[B"

 ❯ src/input/mouse.test.ts:262:31
    260|     await t.flush();
    261|     h.io.type(wheelDown(30, 5));
    262|     expect(h.inputs().at(-1)).toBe("\x1bOB\x1bOB\x1bOB");
       |                               ^
    263|   });
    264|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== M-select-wide-right-half (テストを足した後) (2026-09-28T06:16:39)
mutation: src/input/mouse.ts
  - 'col: to.col + Math.max(0, tw - 1)'
  + 'col: to.col'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 全角の行でもダブルクリックの単語と選択の写しがセルの列で合う（04 の点検）
AssertionError: expected { paneId: 'p1', …(2) } to match object { from: { row: +0, col: +0 }, …(1) }
(1 matching property omitted from actual)

- Expected
+ Received

@@ -2,9 +2,9 @@
    "from": {
      "col": 0,
      "row": 0,
    },
    "to": {
-     "col": 5,
+     "col": 4,
      "row": 0,
    },
  }

 ❯ src/input/mouse.test.ts:325:35
    323|     h.io.type(down(27 + 0, 2) + drag(27 + 4, 2));
    324|     const top = t.term.buffer.active.viewportY;
    325|     expect(h.app.mouse.selection).toMatchObject({ from: { row: top, co…
       |                                   ^
    326|     h.io.type(up(27 + 4, 2));
    327|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=688274ecadbfe1fc after=688274ecadbfe1fc IDENTICAL

===== A-focus-out-cancel (2026-09-28T06:16:54)
mutation: src/app/TuiApp.ts
  - 'if (!ev.focused) this.mouse.cancel();'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 離す事象を取りこぼしたドラッグは次の押下・外側の端末を離れたときに捨てる（04 の点検）
AssertionError: expected [ Array(2) ] to have a length of 1 but got 2

- Expected
+ Received

- 1
+ 2

 ❯ src/input/mouse.test.ts:248:53
    246|     expect(h.ws.requests("layout.set_split_ratio")).toHaveLength(n);
    247|     h.io.type(down(63, 10) + "\x1b[O" + drag(40, 10));
    248|     expect(h.ws.requests("layout.set_split_ratio")).toHaveLength(n);
       |                                                     ^
    249|   });
    250|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=436384d287fb3524 after=436384d287fb3524 IDENTICAL

===== A-overlay-open-cancel (2026-09-28T06:16:57)
mutation: src/app/TuiApp.ts
  - 'if (this.ui.overlayOpen) this.mouse?.cancel();'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=0
raw output:
      Tests  20 passed (20)
restored: sha256 before=436384d287fb3524 after=436384d287fb3524 IDENTICAL

===== A-1003-sync (2026-09-28T06:17:00)
mutation: src/app/TuiApp.ts
  - 'this.io.write(want ? "\\x1b[?1003h" : "\\x1b[?1003l");'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 全部の動きを求める pane（?1003）があれば外側の端末にも ?1003 を出し、ボタンを押していない動きを送る（04 の点検）
AssertionError: expected '\u001b[?1049h\u001b[H\u001b[2J\u001b[…' to contain '\u001b[?1003h'

Expected: "[?1003h"
Received: "[?1049h[H[2J[?25l[?2004h[?1004h=[?1000h[?1002h[?1006h[?2026h[?25l[2J[1;1H Spaces                + │[1;27H                                                                  接[1;95H続[1;97H中[1;99H…[1;100H [2;1H                         │[2;27H                                                                          [3;1H                         │[3;27H                                                                          [4;1H                         │[4;27H                                                                          [5;1H                         │[5;27H                                                                          [6;1H                         │[6;27H                                                                          [7;1H                         │[7;27H                                                                          [8;1H                         │[8;27H                                                                          [9;1H                         │[9;27H                                                                          [10;1H                         │[10;27H                                                                          [11;1H                         │[11;27H                                                                          [12;1H                         │[12;27H                                                                          [13;1H                         │[13;27H                                                                          [14;1H                         │[14;27H                                                                          [15;1H                         │[15;27H                                                                          [16;1H                         │[16;27H                                 接[16;62H続[16;64H中[16;66H…[16;67H                                  [17;1H                         │[17;27H                                                                          [18;1H                         │[18;27H                                                                          [19;1H                         │[19;27H                                                                          [20;1H                         │[20;27H                                                                          [21;1H                         │[21;27H                                                                          [22;1H                         │[22;27H                                                                          [23;1H                         │[23;27H                                                                          [24;1H                         │[24;27H                                                                          [25;1H                         │[25;27H                                                                          [26;1H                         │[26;27H                                                                          [27;1H                         │[27;27H                                                                          [28;1H                         │[28;27H                                                                          [29;1H                         │[29;27H                                                                          [30;1H                         │[30;27H                                                                          [1;1H[?2026l[1;1H[?2026h[?25l[1;27H 1:t1 [1;34H + [1;87Hsession[1;94H: [1;96Hwo[1;98Hrk[2;1H   w1                    [2;27H┌[2;28H─[2;29H pane p1 ─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H─[2;51H─[2;52H─[2;53H─[2;54H─[2;55H─[2;56H─[2;57H─[2;58H─[2;59H─[2;60H─[2;61H─[2;62H─[2;63H┐[2;64H┌[2;65H─[2;66H pane p2 ─[2;76H─[2;77H─[2;78H─[2;79H─[2;80H─[2;81H─[2;82H─[2;83H─[2;84H─[2;85H─[2;86H─[2;87H─[2;88H─[2;89H─[2;90H─[2;91H─[2;92H─[2;93H─[2;94H─[2;95H─[2;96H─[2;97H─[2;98H─[2;99H─[2;100H┐[3;4Hw2[3;27H│[3;28H                                   │[3;64H│[3;65H                                   │[4;27H│[4;28H                                   │[4;64H│[4;65H                                   │[5;27H│[5;28H                                   │[5;64H│[5;65H                                   │[6;27H│[6;28H                                   │[6;64H│[6;65H                                   │[7;27H│[7;28H                                   │[7;64H│[7;65H                                   │[8;27H│[8;28H                                   │[8;64H│[8;65H                                   │[9;27H│[9;28H                                   │[9;64H│[9;65H                                   │[10;27H│[10;28H                                   │[10;64H│[10;65H                                   │[11;27H│[11;28H                                   │[11;64H│[11;65H                                   │[12;27H│[12;28H                                   │[12;64H│[12;65H                                   │[13;27H│[13;28H                                   │[13;64H│[13;65H                                   │[14;27H│[14;28H                                   │[14;64H│[14;65H                                   │[15;27H│[15;28H                                   │[15;64H│[15;65H                                   │[16;27H│[16;28H                                 [16;61H  [16;63H│[16;64H│[16;65H                                   │[17;27H│[17;28H                                   │[17;64H│[17;65H                                   │[18;27H│[18;28H                                   │[18;64H│[18;65H                                   │[19;27H│[19;28H                                   │[19;64H│[19;65H                                   │[20;27H│[20;28H                                   │[20;64H│[20;65H                                   │[21;27H│[21;28H                                   │[21;64H│[21;65H                                   │[22;27H│[22;28H                                   │[22;64H│[22;65H                                   │[23;27H│[23;28H                                   │[23;64H│[23;65H                                   │[24;27H│[24;28H                                   │[24;64H│[24;65H                                   │[25;27H│[25;28H                                   │[25;64H│[25;65H                                   │[26;27H│[26;28H                                   │[26;64H│[26;65H                                   │[27;27H│[27;28H                                   │[27;64H│[27;65H                                   │[28;27H│[28;28H                                   │[28;64H│[28;65H                                   │[29;27H│[29;28H                                   │[29;64H│[29;65H                                   │[30;27H└[30;28H─[30;29H─[30;30H─[30;31H─[30;32H─[30;33H─[30;34H─[30;35H─[30;36H─[30;37H─[30;38H─[30;39H─[30;40H─[30;41H─[30;42H─[30;43H─[30;44H─[30;45H─[30;46H─[30;47H─[30;48H─[30;49H─[30;50H─[30;51H─[30;52H─[30;53H─[30;54H─[30;55H─[30;56H─[30;57H─[30;58H─[30;59H─[30;60H─[30;61H─[30;62H─[30;63H⋯[30;64H└[30;65H─[30;66H─[30;67H─[30;68H─[30;69H─[30;70H─[30;71H─[30;72H─[30;73H─[30;74H─[30;75H─[30;76H─[30;77H─[30;78H─[30;79H─[30;80H─[30;81H─[30;82H─[30;83H─[30;84H─[30;85H─[30;86H─[30;87H─[30;88H─[30;89H─[30;90H─[30;91H─[30;92H─[30;93H─[30;94H─[30;95H─[30;96H─[30;97H─[30;98H─[30;99H─[30;100H⋯[3;28H[2 q[?25h[?2026l[3;28H[?2026h[?25l[3;28H[?25h[?2026l[3;28H[?2026h[?25l[3;28H[?25h[?2026l[3;28H"

 ❯ src/input/mouse.test.ts:281:27
    279|     await t.flush();
    280|     h.app.renderNow();
    281|     expect(h.io.output()).toContain("\x1b[?1003h");
       |                           ^
    282|     h.io.type("\x1b[<35;31;6M");
    283|     expect(h.inputs()).toEqual(["\x1b[<35;4;4M"]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=436384d287fb3524 after=436384d287fb3524 IDENTICAL

===== A-copy-leave-on-focus-change (2026-09-28T06:17:03)
mutation: src/app/TuiApp.ts
  - 'this.copyTargetOf(this.copyPaneId)?.leave();'
  + ''
command: (cd packages/tui && npx vitest run src/app/TuiApp.modes.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.modes.test.ts > TuiApp：モード（navigate・copy・resize・goto。AC5・AC7・AC-I1・AC-I3） > copy モードのまま別の pane へ移ると、元の pane の選択を消して末尾へ戻す（04 の点検）
AssertionError: expected 39 to be 53 // Object.is equality

- Expected
+ Received

- 53
+ 39

 ❯ src/app/TuiApp.modes.test.ts:120:44
    118|     h.io.type("\x02l"); // copy モードの中でも prefix は効く
    119|     await vi.waitFor(() => expect(h.app.model.focusedPaneId).toBe("p2"…
    120|     expect(t.term.buffer.active.viewportY).toBe(bottom);
       |                                            ^
    121|   });
    122| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=436384d287fb3524 after=436384d287fb3524 IDENTICAL

===== A-overlay-open-cancel (テストを足した後) (2026-09-28T06:17:23)
mutation: src/app/TuiApp.ts
  - 'if (this.ui.overlayOpen) this.mouse?.cancel();'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > 離す事象を取りこぼしたドラッグは次の押下・外側の端末を離れたときに捨てる（04 の点検）
AssertionError: expected [ { id: '7', …(2) }, …(2) ] to have a length of 1 but got 3

- Expected
+ Received

- 1
+ 3

 ❯ src/input/mouse.test.ts:254:53
    252|     h.app.ui.closeDialog();
    253|     h.io.type(drag(40, 10) + up(40, 10));
    254|     expect(h.ws.requests("layout.set_split_ratio")).toHaveLength(n);
       |                                                     ^
    255|   });
    256|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=436384d287fb3524 after=436384d287fb3524 IDENTICAL

===== C-stepChar-wide (2026-09-28T06:17:49)
mutation: src/term/CopyTarget.ts
  - 'Math.max(1, cells[c.col]?.width ?? 1)'
  + '1'
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 全角の行でもセルの列で動き、選んだ範囲と写す文字が合う（04 の点検）
AssertionError: expected { row: +0, col: +0 } to deeply equal { row: +0, col: 2 }

- Expected
+ Received

  {
-   "col": 2,
+   "col": 0,
    "row": 0,
  }

 ❯ src/term/CopyTarget.test.ts:93:22
     91|     c.apply({ op: "move", unit: "lineStart", dir: -1 });
     92|     c.apply({ op: "move", unit: "char", dir: 1 });
     93|     expect(c.cursor).toEqual({ row: 0, col: 2 }); // 全角 1 文字＝2 セルを 1 歩で
       |                      ^
     94|     c.apply({ op: "selectStart", linewise: false });
     95|     c.apply({ op: "move", unit: "char", dir: 1 });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=f5da0e6b222a8062 after=f5da0e6b222a8062 IDENTICAL

===== C-clamp-snap (2026-09-28T06:17:50)
mutation: src/term/CopyTarget.ts
  - 'const col = snapCol(this.term, row, Math.min(end - 1, Math.max(0, p.col)));'
  + 'const col = Math.min(end - 1, Math.max(0, p.col));'
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=0
raw output:
      Tests  9 passed (9)
restored: sha256 before=f5da0e6b222a8062 after=f5da0e6b222a8062 IDENTICAL

===== C-sel-wide-right-half (2026-09-28T06:17:51)
mutation: src/term/CopyTarget.ts
  - 'return [x, { row: y.row, col: y.col + Math.max(0, w - 1) }];'
  + 'return [x, y];'
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 全角の行でもセルの列で動き、選んだ範囲と写す文字が合う（04 の点検）
AssertionError: expected { from: { row: +0, col: 2 }, …(2) } to deeply equal { from: { row: +0, col: 2 }, …(2) }

- Expected
+ Received

@@ -3,9 +3,9 @@
      "col": 2,
      "row": 0,
    },
    "linewise": false,
    "to": {
-     "col": 5,
+     "col": 4,
      "row": 0,
    },
  }

 ❯ src/term/CopyTarget.test.ts:96:27
     94|     c.apply({ op: "selectStart", linewise: false });
     95|     c.apply({ op: "move", unit: "char", dir: 1 });
     96|     expect(c.selection()).toEqual({ from: { row: 0, col: 2 }, to: { ro…
       |                           ^
     97|     expect(c.selectedText()).toBe("いう");
     98|     c.apply({ op: "searchStart", dir: 1 });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=f5da0e6b222a8062 after=f5da0e6b222a8062 IDENTICAL

===== C-search-selects (2026-09-28T06:17:52)
mutation: src/term/CopyTarget.ts
  - '      this.setAnchor(start);\n      this.setCursor(end);'
  + '      this.clearAnchor();\n      this.setCursor(start);'
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > / の検索（大小無視）と n/N。見つかった所を選んだ状態にし、そのまま y で写せる。Esc はまず選択を消す
AssertionError: expected null to match object { from: { row: 1, col: +0 }, …(1) }

- Expected:
{
  "from": {
    "col": 0,
    "row": 1,
  },
  "to": {
    "col": 3,
    "row": 1,
  },
}

+ Received:
null

 ❯ src/term/CopyTarget.test.ts:64:27
     62|     c.apply({ op: "searchStart", dir: 1 });
     63|     c.apply({ op: "searchInput", text: "beta" });
     64|     expect(c.selection()).toMatchObject({ from: { row: 1, col: 0 }, to…
       |                           ^
     65|     c.apply({ op: "searchNext", reverse: false });
     66|     expect(c.selection()).toMatchObject({ from: { row: 2, col: 6 }, to…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 全角の行でもセルの列で動き、選んだ範囲と写す文字が合う（04 の点検）
AssertionError: expected null to match object { from: { row: +0, col: 10 }, …(1) }

- Expected:
{
  "from": {
    "col": 10,
    "row": 0,
  },
  "to": {
    "col": 12,
    "row": 0,
  },
}

+ Received:
null

 ❯ src/term/CopyTarget.test.ts:100:27
     98|     c.apply({ op: "searchStart", dir: 1 });
     99|     c.apply({ op: "searchInput", text: "xyz" });
    100|     expect(c.selection()).toMatchObject({ from: { row: 0, col: 10 }, t…
       |                           ^
    101|     expect(c.selectedText()).toBe("XYZ");
    102|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 折り返しの続きの行へは改行を入れずに写し、検索は折り返しをまたぐ（04 の点検）
AssertionError: expected null to match object { from: { row: +0, col: 9 }, …(1) }

- Expected:
{
  "from": {
    "col": 9,
    "row": 0,
  },
  "to": {
    "col": 2,
    "row": 1,
  },
}

+ Received:
null

 ❯ src/term/CopyTarget.test.ts:115:27
    113|     c.apply({ op: "searchStart", dir: 1 });
    114|     c.apply({ op: "searchInput", text: "9abc" });
    115|     expect(c.selection()).toMatchObject({ from: { row: 0, col: 9 }, to…
restored: sha256 before=f5da0e6b222a8062 after=f5da0e6b222a8062 IDENTICAL

===== C-search-wrap (2026-09-28T06:17:54)
mutation: src/term/bufferText.ts
  - '    if (!continuesOnNext(term, row)) break;\n    row++;'
  + '    break;'
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 折り返しの続きの行へは改行を入れずに写し、検索は折り返しをまたぐ（04 の点検）
AssertionError: expected null to match object { from: { row: +0, col: 9 }, …(1) }

- Expected:
{
  "from": {
    "col": 9,
    "row": 0,
  },
  "to": {
    "col": 2,
    "row": 1,
  },
}

+ Received:
null

 ❯ src/term/CopyTarget.test.ts:115:27
    113|     c.apply({ op: "searchStart", dir: 1 });
    114|     c.apply({ op: "searchInput", text: "9abc" });
    115|     expect(c.selection()).toMatchObject({ from: { row: 0, col: 9 }, to…
       |                           ^
    116|     expect(c.selectedText()).toBe("9abc");
    117|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=49df5f218c6dfc20 after=49df5f218c6dfc20 IDENTICAL

===== C-wrap-join-yank (2026-09-28T06:17:55)
mutation: src/term/bufferText.ts
  - '    if (row < to.row && !cont) out += "\\n";'
  + '    if (row < to.row) out += "\\n";'
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 折り返しの続きの行へは改行を入れずに写し、検索は折り返しをまたぐ（04 の点検）
AssertionError: expected '0123456789\nabcdefNEED\nLE' to be '0123456789abcdefNEEDLE' // Object.is equality

- Expected
+ Received

- 0123456789abcdefNEEDLE
+ 0123456789
+ abcdefNEED
+ LE

 ❯ src/term/CopyTarget.test.ts:110:30
    108|     c.apply({ op: "move", unit: "line", dir: 1 });
    109|     c.apply({ op: "move", unit: "line", dir: 1 });
    110|     expect(c.selectedText()).toBe("0123456789abcdefNEEDLE");
       |                              ^
    111|     c.apply({ op: "clearOrExit" });
    112|     c.apply({ op: "move", unit: "bufferTop", dir: -1 });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=49df5f218c6dfc20 after=49df5f218c6dfc20 IDENTICAL

===== C-empty-yank (2026-09-28T06:17:56)
mutation: src/term/CopyTarget.ts
  - 'return text === "" ? { exited: true } : { copiedText: text, exited: true };'
  + 'return { copiedText: text, exited: true };'
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 選んでいないときの y は何も写さない（空を写して「コピーしました」を出さない）
AssertionError: expected { copiedText: '', exited: true } to deeply equal { exited: true }

- Expected
+ Received

  {
+   "copiedText": "",
    "exited": true,
  }

 ❯ src/term/CopyTarget.test.ts:121:37
    119|   it("選んでいないときの y は何も写さない（空を写して「コピーしました」を出さない）", async () => {
    120|     const { c } = await withText("abc");
    121|     expect(c.apply({ op: "yank" })).toEqual({ exited: true });
       |                                     ^
    122|   });
    123|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=f5da0e6b222a8062 after=f5da0e6b222a8062 IDENTICAL

===== C-esc-clears-first (2026-09-28T06:17:57)
mutation: src/term/CopyTarget.ts
  - '        if (this.anchor) {\n          this.clearAnchor();\n          return {};\n        }'
  + ''
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > w・b・e の単語の移動と、Esc は選択を消してから抜ける
AssertionError: expected { exited: true } to deeply equal {}

- Expected
+ Received

- {}
+ {
+   "exited": true,
+ }

 ❯ src/term/CopyTarget.test.ts:55:44
     53|     expect(c.cursor.col).toBe(6);
     54|     c.apply({ op: "selectStart", linewise: false });
     55|     expect(c.apply({ op: "clearOrExit" })).toEqual({});
       |                                            ^
     56|     expect(c.apply({ op: "clearOrExit" })).toEqual({ exited: true });
     57|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > / の検索（大小無視）と n/N。見つかった所を選んだ状態にし、そのまま y で写せる。Esc はまず選択を消す
AssertionError: expected { exited: true } to deeply equal {}

- Expected
+ Received

- {}
+ {
+   "exited": true,
+ }

 ❯ src/term/CopyTarget.test.ts:69:44
     67|     c.apply({ op: "searchNext", reverse: true });
     68|     expect(c.selection()).toMatchObject({ from: { row: 1, col: 0 } });
     69|     expect(c.apply({ op: "clearOrExit" })).toEqual({});
       |                                            ^
     70|     expect(c.selection()).toBeNull();
     71|     c.apply({ op: "searchNext", reverse: false });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=f5da0e6b222a8062 after=f5da0e6b222a8062 IDENTICAL

===== C-marker-trim (2026-09-28T06:17:58)
mutation: src/term/CopyTarget.ts
  - '    if (!this.marker) return this.fallbackRow;'
  + '    return this.fallbackRow;'
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > スクロールバックの切り詰めに位置が追従する
AssertionError: expected 'X2' to be 'L6' // Object.is equality

Expected: "L6"
Received: "X2"

 ❯ src/term/CopyTarget.test.ts:135:30
    133|     t.output(new TextEncoder().encode("\r\nX1\r\nX2\r\nX3"));
    134|     await t.flush();
    135|     expect(c.selectedText()).toBe(before);
       |                              ^
    136|   });
    137| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=f5da0e6b222a8062 after=f5da0e6b222a8062 IDENTICAL

===== C-leave-scroll (2026-09-28T06:18:02)
mutation: src/term/CopyTarget.ts
  - '    this.clearAnchor();\n    this.term.scrollToBottom();'
  + '    this.clearAnchor();'
command: (cd packages/tui && npx vitest run src/app/TuiApp.modes.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.modes.test.ts > TuiApp：モード（navigate・copy・resize・goto。AC5・AC7・AC-I1・AC-I3） > copy モードのまま別の pane へ移ると、元の pane の選択を消して末尾へ戻す（04 の点検）
AssertionError: expected 39 to be 53 // Object.is equality

- Expected
+ Received

- 53
+ 39

 ❯ src/app/TuiApp.modes.test.ts:120:44
    118|     h.io.type("\x02l"); // copy モードの中でも prefix は効く
    119|     await vi.waitFor(() => expect(h.app.model.focusedPaneId).toBe("p2"…
    120|     expect(t.term.buffer.active.viewportY).toBe(bottom);
       |                                            ^
    121|   });
    122| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=f5da0e6b222a8062 after=f5da0e6b222a8062 IDENTICAL

===== O-textinput-del (2026-09-28T06:18:03)
mutation: src/modes/TextInput.ts
  - 'cp >= 0x20 && cp !== 0x7f && !(cp >= 0x80 && cp <= 0x9f)'
  + 'cp >= 0x20'
command: (cd packages/tui && npx vitest run src/modes/overlays.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/overlays.test.ts > オーバーレイの点検の指摘（04） > 入力欄は DEL・C1 の制御文字を入れない
AssertionError: expected [ [ 'tab.rename', …(1) ] ] to deeply equal [ [ 'tab.rename', …(1) ] ]

- Expected
+ Received

  [
    [
      "tab.rename",
      {
-       "label": "abc",
+       "label": "ab
c",
        "tabId": "t1",
      },
    ],
  ]

 ❯ src/modes/overlays.test.ts:362:21
    360|     s.overlays.handleKey(ch("\x7f"));
    361|     s.overlays.handleKey(key("enter"));
    362|     expect(s.calls).toEqual([["tab.rename", { tabId: "t1", label: "abc…
       |                     ^
    363|   });
    364|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=69bc51923fd47cad after=69bc51923fd47cad IDENTICAL

===== O-help-q (2026-09-28T06:18:05)
mutation: src/modes/HelpDialog.ts
  - 'if (isEsc(k) || isEnter(k) || k.key === "?") return this.cancel();'
  + 'if (isEsc(k) || isEnter(k) || k.key === "?" || k.key === "q") return this.cancel();'
command: (cd packages/tui && npx vitest run src/modes/overlays.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/overlays.test.ts > オーバーレイの点検の指摘（04） > キー一覧：q では閉じない（web と同じ）。絞り込みの欄は全角の見出しの幅の後ろから（カーソルも）
AssertionError: expected null to deeply equal { kind: 'help' }

- Expected:
{
  "kind": "help",
}

+ Received:
null

 ❯ src/modes/overlays.test.ts:369:32
    367|     s.actions.run({ type: "help" });
    368|     s.type("q");
    369|     expect(s.ui.dialogContext).toEqual({ kind: "help" });
       |                                ^
    370|     s.type("/");
    371|     const g = new Grid(100, 30);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=0c0482d5ce2eef25 after=0c0482d5ce2eef25 IDENTICAL

===== O-help-label-width (2026-09-28T06:18:07)
mutation: src/modes/HelpDialog.ts
  - 'const fieldX = inner.x + stringWidth(label);'
  + 'const fieldX = inner.x + label.length;'
command: (cd packages/tui && npx vitest run src/modes/overlays.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/overlays.test.ts > オーバーレイの点検の指摘（04） > キー一覧：q では閉じない（web と同じ）。絞り込みの欄は全角の見出しの幅の後ろから（カーソルも）
AssertionError: expected { x: 9, y: 2, visible: true, …(2) } to match object { x: 13, visible: true }
(3 matching properties omitted from actual)

- Expected
+ Received

  {
    "visible": true,
-   "x": 13,
+   "x": 9,
  }

 ❯ src/modes/overlays.test.ts:374:17
    372|     const cur = s.overlays.render(g, new ThemeColors("dracula"));
    373|     // 箱は x=1、内側は x=3。「絞り込み: 」は幅 10。
    374|     expect(cur).toMatchObject({ x: 13, visible: true });
       |                 ^
    375|   });
    376|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=0c0482d5ce2eef25 after=0c0482d5ce2eef25 IDENTICAL

===== O-list-visible-bound (2026-09-28T06:18:09)
mutation: src/modes/dialogs.ts
  - 'ev.y >= this.rowsTop && ev.y < this.rowsTop + this.visibleRows && index < this.rows().length'
  + 'ev.y >= this.rowsTop && index < this.rows().length'
command: (cd packages/tui && npx vitest run src/modes/overlays.test.ts)  exit=0
raw output:
      Tests  21 passed (21)
restored: sha256 before=f8870685fa63c505 after=f8870685fa63c505 IDENTICAL

===== O-menu-scroll (2026-09-28T06:18:11)
mutation: src/modes/ContextMenu.ts
  - '    if (this.active >= this.scroll + this.visible) this.scroll = this.active - this.visible + 1;\n'
  + ''
command: (cd packages/tui && npx vitest run src/modes/overlays.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/overlays.test.ts > オーバーレイの点検の指摘（04） > 短い端末のメニュー：見える分だけ出し、選んだ項目までずらす（見えない項目を実行しない）
AssertionError: expected '┌────────────────────────────┐       …' to contain '閉じる'

- Expected
+ Received

- 閉じる
+ ┌────────────────────────────┐          
+ │ 名前の変更                 │          
+ │ 右へ分割                   │          
+ │ 下へ分割                   │          
+ │ 拡大表示                   │          
+ └────────────────────────────┘          

 ❯ src/modes/overlays.test.ts:398:18
    396|     s.overlays.render(small, theme);
    397|     const rows = Array.from({ length: 6 }, (_, y) => small.rowText(y))…
    398|     expect(rows).toContain("閉じる"); // 7 番目（0 始まりの 6）が見えている
       |                  ^
    399|     expect(rows).not.toContain("名前の変更");
    400|     s.overlays.handleMouse({ action: "down", button: 0, x: 3, y: 1 });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=a3110059b61035d9 after=a3110059b61035d9 IDENTICAL

===== O-menu-below-frame (2026-09-28T06:18:13)
mutation: src/modes/ContextMenu.ts
  - '    if (index >= this.visible) return true; // 枠の下の罫線\n'
  + ''
command: (cd packages/tui && npx vitest run src/modes/overlays.test.ts)  exit=0
raw output:
      Tests  21 passed (21)
restored: sha256 before=a3110059b61035d9 after=a3110059b61035d9 IDENTICAL

===== O-menu-item-offset (2026-09-28T06:18:14)
mutation: src/modes/ContextMenu.ts
  - 'const item = this.scroll + index;'
  + 'const item = index;'
command: (cd packages/tui && npx vitest run src/modes/overlays.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/overlays.test.ts > オーバーレイの点検の指摘（04） > 短い端末のメニュー：見える分だけ出し、選んだ項目までずらす（見えない項目を実行しない）
AssertionError: expected [] to deeply equal [ [ 'pane.zoom', …(1) ] ]

- Expected
+ Received

- [
-   [
-     "pane.zoom",
-     {
-       "mode": "toggle",
-       "paneId": "p1",
-     },
-   ],
- ]
+ []

 ❯ src/modes/overlays.test.ts:403:21
    401|     s.overlays.handleMouse({ action: "up", button: 0, x: 3, y: 1 });
    402|     // いちばん上に見えている項目（拡大表示）を実行した
    403|     expect(s.calls).toEqual([["pane.zoom", { paneId: "p1", mode: "togg…
       |                     ^
    404|   });
    405| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=a3110059b61035d9 after=a3110059b61035d9 IDENTICAL

===== D-rollback (2026-09-28T06:18:16)
mutation: src/actions/TuiDispatcher.ts
  - 'if (this.host.prefs.rev === rev) this.host.prefs.apply(before, rev);'
  + ''
command: (cd packages/tui && npx vitest run src/actions/TuiDispatcher.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループ > 自動グループの折りたたみを保存できなければ元に戻して知らせる（04 の点検）
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/actions/TuiDispatcher.test.ts:883:54
    881|     expect(h.prefs.collapsedAutoGroups.has("/repo")).toBe(true);
    882|     await flush();
    883|     expect(h.prefs.collapsedAutoGroups.has("/repo")).toBe(false);
       |                                                      ^
    884|     expect(h.ui.toasts.map((t) => t.message)).toEqual(["折りたたみを保存できませんで…
    885|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=9978a535a0c21b95 after=9978a535a0c21b95 IDENTICAL

===== D-rollback-toast (2026-09-28T06:18:18)
mutation: src/actions/TuiDispatcher.ts
  - 'this.ui.toast("折りたたみを保存できませんでした");'
  + ''
command: (cd packages/tui && npx vitest run src/actions/TuiDispatcher.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループ > 自動グループの折りたたみを保存できなければ元に戻して知らせる（04 の点検）
AssertionError: expected [] to deeply equal [ '折りたたみを保存できませんでした' ]

- Expected
+ Received

- [
-   "折りたたみを保存できませんでした",
- ]
+ []

 ❯ src/actions/TuiDispatcher.test.ts:884:47
    882|     await flush();
    883|     expect(h.prefs.collapsedAutoGroups.has("/repo")).toBe(false);
    884|     expect(h.ui.toasts.map((t) => t.message)).toEqual(["折りたたみを保存できませんで…
       |                                               ^
    885|   });
    886|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=9978a535a0c21b95 after=9978a535a0c21b95 IDENTICAL

===== C-clamp-snap (テストを足した後) (2026-09-28T06:19:05)
mutation: src/term/CopyTarget.ts
  - 'const col = snapCol(this.term, row, Math.min(end - 1, Math.max(0, p.col)));'
  + 'const col = Math.min(end - 1, Math.max(0, p.col));'
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 上下に動いて全角の右半分に当たったら、その文字の本体（左）へ寄せる（04 の点検）
AssertionError: expected { row: 1, col: 3 } to deeply equal { row: 1, col: 2 }

- Expected
+ Received

  {
-   "col": 2,
+   "col": 3,
    "row": 1,
  }

 ❯ src/term/CopyTarget.test.ts:111:22
    109|     expect(c.cursor).toEqual({ row: 0, col: 3 });
    110|     c.apply({ op: "move", unit: "line", dir: 1 });
    111|     expect(c.cursor).toEqual({ row: 1, col: 2 }); // 桁 3 は「い」の右半分
       |                      ^
    112|   });
    113|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=f5da0e6b222a8062 after=f5da0e6b222a8062 IDENTICAL

===== O-list-visible-bound (テストを直した後) (2026-09-28T06:19:07)
mutation: src/modes/dialogs.ts
  - 'ev.y >= this.rowsTop && ev.y < this.rowsTop + this.visibleRows && index < this.rows().length'
  + 'ev.y >= this.rowsTop && index < this.rows().length'
command: (cd packages/tui && npx vitest run src/modes/overlays.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/overlays.test.ts > オーバーレイの点検の指摘（04） > 一覧：見えている行の外（下の案内の行）を押しても実行しない
AssertionError: expected [ [ 'group.add_member', …(1) ] ] to deeply equal []

- Expected
+ Received

- []
+ [
+   [
+     "group.add_member",
+     {
+       "groupId": "g26",
+       "workspaceId": "w2",
+     },
+   ],
+ ]

 ❯ src/modes/overlays.test.ts:385:21
    383|     const helpRow = text.findIndex((l) => l.includes("Enter で追加"));
    384|     s.overlays.handleMouse({ action: "down", button: 0, x: 40, y: help…
    385|     expect(s.calls).toEqual([]);
       |                     ^
    386|     const row = text.findIndex((l) => /\bG1\b/.test(l));
    387|     s.overlays.handleMouse({ action: "down", button: 0, x: 40, y: row …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=f8870685fa63c505 after=f8870685fa63c505 IDENTICAL

===== O-menu-below-frame (テストを足した後) (2026-09-28T06:19:09)
mutation: src/modes/ContextMenu.ts
  - '    if (index >= this.visible) return true; // 枠の下の罫線\n'
  + ''
command: (cd packages/tui && npx vitest run src/modes/overlays.test.ts)  exit=0
raw output:
      Tests  21 passed (21)
restored: sha256 before=a3110059b61035d9 after=a3110059b61035d9 IDENTICAL

===== O-menu-below-frame (テストを直した後) (2026-09-28T06:19:24)
mutation: src/modes/ContextMenu.ts
  - '    if (index >= this.visible) return true; // 枠の下の罫線\n'
  + ''
command: (cd packages/tui && npx vitest run src/modes/overlays.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/overlays.test.ts > オーバーレイの点検の指摘（04） > 短い端末のメニュー：見える分だけ出し、選んだ項目までずらす（見えない項目を実行しない）
AssertionError: expected '┌────────────────────────────┐       …' to contain '閉じる'

- Expected
+ Received

- 閉じる
+ ┌────────────────────────────┐          
+ │ 右へ分割                   │          
+ │ 下へ分割                   │          
+ │ 拡大表示                   │          
+ │ 右クリックを pane に送る   │          
+ └────────────────────────────┘          

 ❯ src/modes/overlays.test.ts:406:18
    404|     s.overlays.render(small, theme);
    405|     const rows = Array.from({ length: 6 }, (_, y) => small.rowText(y))…
    406|     expect(rows).toContain("閉じる"); // 7 番目（0 始まりの 6）が見えている
       |                  ^
    407|     expect(rows).not.toContain("名前の変更");
    408|     s.overlays.handleMouse({ action: "down", button: 0, x: 3, y: 1 });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=a3110059b61035d9 after=a3110059b61035d9 IDENTICAL

===== D-silent-empty-paste (2026-09-28T06:19:38)
mutation: src/actions/TuiDispatcher.ts
  - '      if (text) this.host.pasteText(paneId, text);\n'
  + '      if (text) this.host.pasteText(paneId, text);\n      else this.ui.toast("クリップボードを読めませんでした（外側の端末の貼り付けを使ってください）");\n'
command: (cd packages/tui && npx vitest run src/actions/TuiDispatcher.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループ > メニューの貼り付け：クリップボードが空・読めないなら黙って何もしない
AssertionError: expected [ { id: 1, …(1) } ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "id": 1,
+     "message": "クリップボードを読めませんでした（外側の端末の貼り付けを使ってください）",
+   },
+ ]

 ❯ src/actions/TuiDispatcher.test.ts:893:25
    891|     await flush();
    892|     expect(h.host.pasteText).not.toHaveBeenCalled();
    893|     expect(h.ui.toasts).toEqual([]);
       |                         ^
    894|   });
    895|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=9978a535a0c21b95 after=9978a535a0c21b95 IDENTICAL

===== D-table-rpc-params (2026-09-28T06:19:40)
mutation: src/actions/TuiDispatcher.ts
  - 'void this.conn.request("pane.zoom", { paneId, mode: "toggle" })'
  + 'void this.conn.request("pane.zoom", { paneId, mode: "on" })'
command: (cd packages/tui && npx vitest run src/actions/TuiDispatcher.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — 全操作の効果（web の 56 操作と同じ RPC・引数・ダイアログ） > zoom
AssertionError: expected [ 'pane.zoom', …(1) ] to deeply equal [ 'pane.zoom', …(1) ]

- Expected
+ Received

  [
    "pane.zoom",
    {
-     "mode": "toggle",
+     "mode": "on",
      "paneId": "p1",
    },
  ]

 ❯ src/actions/TuiDispatcher.test.ts:185:35
    183|     h.d.run(action);
    184|     const e = EFFECTS[id]!;
    185|     if (e.rpc) expect(h.calls[0]).toEqual(e.rpc);
       |                                   ^
    186|     else if (!e.none && !e.mode) expect(h.calls).toEqual([]);
    187|     if (e.dialog) expect(h.ui.dialogContext?.kind).toBe(e.dialog);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — 分割・焦点・入れ替え > swap・zoom・resizeBy・cyclePane・moveTab
AssertionError: expected [ [ 'pane.swap', …(1) ], …(3) ] to deeply equal [ [ 'pane.swap', …(1) ], …(3) ]

- Expected
+ Received

@@ -7,11 +7,11 @@
      },
    ],
    [
      "pane.zoom",
      {
-       "mode": "toggle",
+       "mode": "on",
        "paneId": "p1",
      },
    ],
    [
      "pane.resize",

 ❯ src/actions/TuiDispatcher.test.ts:249:21
    247|     h.d.run({ type: "resizeBy", dir: "left", amount: 0.05 });
    248|     h.d.run({ type: "moveTab", direction: "next" });
    249|     expect(h.calls).toEqual([
       |                     ^
    250|       ["pane.swap", { paneId: "p1", direction: "right" }],
    251|       ["pane.zoom", { paneId: "p1", mode: "toggle" }],

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=9978a535a0c21b95 after=9978a535a0c21b95 IDENTICAL

===== D-table-rpc-method (2026-09-28T06:19:42)
mutation: src/actions/TuiDispatcher.ts
  - 'void this.conn.request("pane.swap", { paneId, direction: dir })'
  + 'void this.conn.request("pane.move", { paneId, direction: dir })'
command: (cd packages/tui && npx vitest run src/actions/TuiDispatcher.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — 全操作の効果（web の 56 操作と同じ RPC・引数・ダイアログ） > swap_pane_left
AssertionError: expected [ 'pane.move', { paneId: 'p1', …(1) } ] to deeply equal [ 'pane.swap', { paneId: 'p1', …(1) } ]

- Expected
+ Received

  [
-   "pane.swap",
+   "pane.move",
    {
      "direction": "left",
      "paneId": "p1",
    },
  ]

 ❯ src/actions/TuiDispatcher.test.ts:185:35
    183|     h.d.run(action);
    184|     const e = EFFECTS[id]!;
    185|     if (e.rpc) expect(h.calls[0]).toEqual(e.rpc);
       |                                   ^
    186|     else if (!e.none && !e.mode) expect(h.calls).toEqual([]);
    187|     if (e.dialog) expect(h.ui.dialogContext?.kind).toBe(e.dialog);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — 全操作の効果（web の 56 操作と同じ RPC・引数・ダイアログ） > swap_pane_down
AssertionError: expected [ 'pane.move', { paneId: 'p1', …(1) } ] to deeply equal [ 'pane.swap', { paneId: 'p1', …(1) } ]

- Expected
+ Received

  [
-   "pane.swap",
+   "pane.move",
    {
      "direction": "down",
      "paneId": "p1",
    },
  ]

 ❯ src/actions/TuiDispatcher.test.ts:185:35
    183|     h.d.run(action);
    184|     const e = EFFECTS[id]!;
    185|     if (e.rpc) expect(h.calls[0]).toEqual(e.rpc);
       |                                   ^
    186|     else if (!e.none && !e.mode) expect(h.calls).toEqual([]);
    187|     if (e.dialog) expect(h.ui.dialogContext?.kind).toBe(e.dialog);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — 全操作の効果（web の 56 操作と同じ RPC・引数・ダイアログ） > swap_pane_up
AssertionError: expected [ 'pane.move', …(1) ] to deeply equal [ 'pane.swap', …(1) ]

- Expected
+ Received

  [
-   "pane.swap",
+   "pane.move",
    {
      "direction": "up",
      "paneId": "p1",
    },
  ]

 ❯ src/actions/TuiDispatcher.test.ts:185:35
    183|     h.d.run(action);
    184|     const e = EFFECTS[id]!;
    185|     if (e.rpc) expect(h.calls[0]).toEqual(e.rpc);
       |                                   ^
    186|     else if (!e.none && !e.mode) expect(h.calls).toEqual([]);
    187|     if (e.dialog) expect(h.ui.dialogContext?.kind).toBe(e.dialog);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — 全操作の効果（web の 56 操作と同じ RPC・引数・ダイアログ） > swap_pane_right
AssertionError: expected [ 'pane.move', { paneId: 'p1', …(1) } ] to deeply equal [ 'pane.swap', { paneId: 'p1', …(1) } ]

restored: sha256 before=9978a535a0c21b95 after=9978a535a0c21b95 IDENTICAL

===== S-section-rows-pref (2026-09-28T06:19:45)
mutation: src/render/chrome/sidebar.ts
  - 'prefs.sidebarSpacesRows ?? natural'
  + 'natural'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=0
raw output:
      Tests  20 passed (20)
restored: sha256 before=3a3f7c3a8cbb1a94 after=3a3f7c3a8cbb1a94 IDENTICAL

===== S-section-rows-pref (テストを足した後) (2026-09-28T06:20:00)
mutation: src/render/chrome/sidebar.ts
  - 'prefs.sidebarSpacesRows ?? natural'
  + 'natural'
command: (cd packages/tui && npx vitest run src/input/mouse.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.test.ts > マウスの操作（AC9・AC-I5） > サイドバーの spaces と agents の区切りのドラッグで区画の高さ（H19b・04 の点検）
AssertionError: expected 4 to be 9 // Object.is equality

- Expected
+ Received

- 9
+ 4

 ❯ src/input/mouse.test.ts:317:63
    315|     h.app.renderNow();
    316|     const after = (h.app as unknown as { sidebarHits: { kind: string; …
    317|     expect(after.find((x) => x.kind === "sectionDivider")!.y).toBe(div…
       |                                                               ^
    318|   });
    319|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=3a3f7c3a8cbb1a94 after=3a3f7c3a8cbb1a94 IDENTICAL

===== A-copy-reset-cursor-on-target-change (2026-09-28T06:20:11)
mutation: src/app/TuiApp.ts
  - '      if (focused) this.copyTargetOf(focused)?.resetCursor();\n'
  + ''
command: (cd packages/tui && npx vitest run src/app/TuiApp.modes.test.ts)  exit=0
raw output:
      Tests  7 passed (7)
restored: sha256 before=436384d287fb3524 after=436384d287fb3524 IDENTICAL

===== A-copy-reset-cursor-on-target-change (テストを足した後) (2026-09-28T06:20:36)
mutation: src/app/TuiApp.ts
  - '      if (focused) this.copyTargetOf(focused)?.resetCursor();\n'
  + ''
command: (cd packages/tui && npx vitest run src/app/TuiApp.modes.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.modes.test.ts > TuiApp：モード（navigate・copy・resize・goto。AC5・AC7・AC-I1・AC-I3） > copy モードのまま別の pane へ移ると、元の pane の選択を消して末尾へ戻す（04 の点検）
AssertionError: expected { row: +0, col: +0 } to deeply equal { row: 39, col: 6 }

- Expected
+ Received

  {
-   "col": 6,
-   "row": 39,
+   "col": 0,
+   "row": 0,
  }

 ❯ src/app/TuiApp.modes.test.ts:141:33
    139|     h.io.type("\x02l");
    140|     await vi.waitFor(() => expect(h.app.model.focusedPaneId).toBe("p2"…
    141|     expect(copyOf("p2").cursor).toEqual({
       |                                 ^
    142|       row: t2.term.buffer.active.baseY + t2.term.buffer.active.cursorY,
    143|       col: t2.term.buffer.active.cursorX,

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=436384d287fb3524 after=436384d287fb3524 IDENTICAL

===== r2-B-utf16-pos (copy) (2026-09-28T06:43:33)
mutation: src/term/bufferText.ts
  - '      for (let i = 0; i < ch.length; i++) {\n        text += ch[i];'
  + '      for (const u of ch) {\n        text += u;'
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 絵文字（サロゲートの組）の後の検索の一致も、その文字を選ぶ（04 ラウンド 2）
AssertionError: expected { from: { row: +0, col: 11 }, …(2) } to match object { from: { row: +0, col: 8 }, …(1) }
(1 matching property omitted from actual)

- Expected
+ Received

  {
    "from": {
-     "col": 8,
+     "col": 11,
      "row": 0,
    },
    "to": {
-     "col": 10,
+     "col": 13,
      "row": 0,
    },
  }

 ❯ src/term/CopyTarget.test.ts:156:27
    154|     c.apply({ op: "searchStart", dir: 1 });
    155|     c.apply({ op: "searchInput", text: "bar" });
    156|     expect(c.selection()).toMatchObject({ from: { row: 0, col: 8 }, to…
       |                           ^
    157|     expect(c.selectedText()).toBe("bar");
    158|     c.apply({ op: "searchNext", reverse: false });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=ee520cfa286d6cac after=ee520cfa286d6cac IDENTICAL

===== r2-B-utf16-pos (link) (2026-09-28T06:43:36)
mutation: src/term/bufferText.ts
  - '      for (let i = 0; i < ch.length; i++) {\n        text += ch[i];'
  + '      for (const u of ch) {\n        text += u;'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > リンクの当たりは絵文字の後・全角の右半分でもずれない
AssertionError: expected [] to deeply equal [ 'https://a.example/x' ]

- Expected
+ Received

- [
-   "https://a.example/x",
- ]
+ []

 ❯ src/input/mouse.r2.test.ts:115:20
    113|     // 😀😀 は 4 セル＋空白 → URL は桁 5〜。桁 5 を Ctrl＋押下。
    114|     h.io.type(down(27 + 5, 2, 16) + up(27 + 5, 2, 16));
    115|     expect(opened).toEqual(["https://a.example/x"]);
       |                    ^
    116|     // URL の直後の空白（桁 24）は外。
    117|     h.io.type(down(27 + 24, 2, 16) + up(27 + 24, 2, 16));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=ee520cfa286d6cac after=ee520cfa286d6cac IDENTICAL

===== r2-B-wrap-pad-logical (2026-09-28T06:43:38)
mutation: src/term/bufferText.ts
  - '      if (pad && col === term.cols - 1) return; // 次の行へ送った全角の前の空き\n'
  + ''
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 行末に入らず次の行へ送った全角の前の空きは写さず、検索でもまたげる（xterm と同じ）
AssertionError: expected '' to be 'dあ' // Object.is equality

- Expected
+ Received

- dあ

 ❯ src/term/CopyTarget.test.ts:173:30
    171|     c.apply({ op: "searchStart", dir: 1 });
    172|     c.apply({ op: "searchInput", text: "dあ" });
    173|     expect(c.selectedText()).toBe("dあ");
       |                              ^
    174|   });
    175|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=ee520cfa286d6cac after=ee520cfa286d6cac IDENTICAL

===== r2-B-wrap-pad-range (2026-09-28T06:43:40)
mutation: src/term/bufferText.ts
  - '    if (cont && wrapPadAtEnd(term, row)) end = Math.min(end, term.cols - 2);\n'
  + ''
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 行末に入らず次の行へ送った全角の前の空きは写さず、検索でもまたげる（xterm と同じ）
AssertionError: expected 'abcd あいz' to be 'abcdあいz' // Object.is equality

Expected: "abcdあいz"
Received: "abcd あいz"

 ❯ src/term/CopyTarget.test.ts:168:30
    166|     c.apply({ op: "selectStart", linewise: true });
    167|     c.apply({ op: "move", unit: "line", dir: 1 });
    168|     expect(c.selectedText()).toBe("abcdあいz");
       |                              ^
    169|     c.apply({ op: "clearOrExit" });
    170|     c.apply({ op: "move", unit: "bufferTop", dir: -1 });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=ee520cfa286d6cac after=ee520cfa286d6cac IDENTICAL

===== r2-B-foldcase (2026-09-28T06:43:41)
mutation: src/term/bufferText.ts
  - '    out += lower.length === ch.length ? lower : ch;'
  + '    out += lower;'
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 小文字にすると長さの変わる文字（İ）の後の一致もずれない
AssertionError: expected 'r' to be 'bar' // Object.is equality

Expected: "bar"
Received: "r"

 ❯ src/term/CopyTarget.test.ts:181:30
    179|     c.apply({ op: "searchStart", dir: 1 });
    180|     c.apply({ op: "searchInput", text: "BAR" });
    181|     expect(c.selectedText()).toBe("bar");
       |                              ^
    182|   });
    183|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=ee520cfa286d6cac after=ee520cfa286d6cac IDENTICAL

===== r2-C-anchor-lost (2026-09-28T06:43:42)
mutation: src/term/CopyTarget.ts
  - '    if (this.anchor?.lost) this.clearAnchor();\n'
  + ''
command: (cd packages/tui && npx vitest run src/term/CopyTarget.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/CopyTarget.test.ts > TuiCopyTarget（copy モード。AC7） > 選び始めの行が切り詰めで消えたら、選択ごと捨てる（無関係な文字を写さない）
AssertionError: expected { from: { row: +0, col: +0 }, …(2) } to be null

- Expected:
null

+ Received:
{
  "from": {
    "col": 0,
    "row": 0,
  },
  "linewise": true,
  "to": {
    "col": 0,
    "row": 0,
  },
}

 ❯ src/term/CopyTarget.test.ts:195:27
    193|     t.output(new TextEncoder().encode("\r\nX1\r\nX2\r\nX3\r\nX4\r\nX5\…
    194|     await t.flush();
    195|     expect(c.selection()).toBeNull();
       |                           ^
    196|     expect(c.apply({ op: "yank" })).toEqual({ exited: true });
    197|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=fd1263c322089745 after=fd1263c322089745 IDENTICAL

===== r2-A-copy-leave-on-mode (2026-09-28T06:43:46)
mutation: src/app/TuiApp.ts
  - '          if (this.keys.mode !== "copy") target?.leave();'
  + '          void target;'
command: (cd packages/tui && npx vitest run src/app/TuiApp.modes.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.modes.test.ts > TuiApp：モード（navigate・copy・resize・goto。AC5・AC7・AC-I1・AC-I3） > copy モードから prefix で navigate・resize へ移っても、copy の pane を末尾へ戻す（04 ラウンド 2）
AssertionError: expected 39 to be 53 // Object.is equality

- Expected
+ Received

- 53
+ 39

 ❯ src/app/TuiApp.modes.test.ts:164:69
    162|       h.io.type(`\x02${next}`);
    163|       await vi.waitFor(() => expect(h.app.keys.mode).not.toBe("copy"));
    164|       await vi.waitFor(() => expect(t.term.buffer.active.viewportY).to…
       |                                                                     ^
    165|       h.io.type("\x1b");
    166|       await vi.waitFor(() => expect(h.app.keys.mode).toBe("terminal"));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=b6b157e6ebc81a9e after=b6b157e6ebc81a9e IDENTICAL

===== r2-A-1003l-reenable (2026-09-28T06:43:49)
mutation: src/app/TuiApp.ts
  - '`\\x1b[?1003l${capture ? ENABLE_MOUSE : ""}`'
  + '"\\x1b[?1003l"'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > 全部の動き（?1003）をやめるときはボタンとドラッグの報告を出し直す。mouseCapture が切なら ?1003h も出さない
AssertionError: expected '\u001b[?1049h\u001b[H\u001b[2J\u001b[…' to contain '\u001b[?1003l\u001b[?1000h\u001b[?100…'

Expected: "[?1003l[?1000h[?1002h[?1006h"
Received: "[?1049h[H[2J[?25l[?2004h[?1004h=[?1000h[?1002h[?1006h[?2026h[?25l[2J[1;1H Spaces       開[1;17Hい[1;19Hた[1;21H順[1;23H + │[1;27H                                                                  接[1;95H続[1;97H中[1;99H…[1;100H [2;1H                         │[2;27H                                                                          [3;1H                         │[3;27H                                                                          [4;1H                         │[4;27H                                                                          [5;1H                         │[5;27H                                                                          [6;1H                         │[6;27H                                                                          [7;1H                         │[7;27H                                                                          [8;1H                         │[8;27H                                                                          [9;1H                         │[9;27H                                                                          [10;1H                         │[10;27H                                                                          [11;1H                         │[11;27H                                                                          [12;1H                         │[12;27H                                                                          [13;1H                         │[13;27H                                                                          [14;1H                         │[14;27H                                                                          [15;1H                         │[15;27H                                                                          [16;1H                         │[16;27H                                 接[16;62H続[16;64H中[16;66H…[16;67H                                  [17;1H                         │[17;27H                                                                          [18;1H                         │[18;27H                                                                          [19;1H                         │[19;27H                                                                          [20;1H                         │[20;27H                                                                          [21;1H                         │[21;27H                                                                          [22;1H                         │[22;27H                                                                          [23;1H                         │[23;27H                                                                          [24;1H                         │[24;27H                                                                          [25;1H                         │[25;27H                                                                          [26;1H                         │[26;27H                                                                          [27;1H                         │[27;27H                                                                          [28;1H                         │[28;27H                                                                          [29;1H                         │[29;27H                                                                          [30;1H                       «[30;25H │[30;27H                                                                          [1;1H[?2026l[1;1H[?2026h[?25l[1;27H 1:t1 [1;34H + [1;87Hsession[1;94H: [1;96Hwo[1;98Hrk[2;1H   w1                    [2;27H┌[2;28H─[2;29H pane p1 ─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H─[2;51H─[2;52H─[2;53H─[2;54H─[2;55H─[2;56H─[2;57H─[2;58H─[2;59H─[2;60H─[2;61H─[2;62H─[2;63H┐[2;64H┌[2;65H─[2;66H pane p2 ─[2;76H─[2;77H─[2;78H─[2;79H─[2;80H─[2;81H─[2;82H─[2;83H─[2;84H─[2;85H─[2;86H─[2;87H─[2;88H─[2;89H─[2;90H─[2;91H─[2;92H─[2;93H─[2;94H─[2;95H─[2;96H─[2;97H─[2;98H─[2;99H─[2;100H┐[3;4Hw2[3;27H│[3;28H                                   │[3;64H│[3;65H                                   │[4;27H│[4;28H                                   │[4;64H│[4;65H                                   │[5;27H│[5;28H                                   │[5;64H│[5;65H                                   │[6;27H│[6;28H                                   │[6;64H│[6;65H                                   │[7;27H│[7;28H                                   │[7;64H│[7;65H                                   │[8;27H│[8;28H                                   │[8;64H│[8;65H                                   │[9;27H│[9;28H                                   │[9;64H│[9;65H                                   │[10;27H│[10;28H                                   │[10;64H│[10;65H                                   │[11;27H│[11;28H                                   │[11;64H│[11;65H                                   │[12;27H│[12;28H                                   │[12;64H│[12;65H                                   │[13;27H│[13;28H                                   │[13;64H│[13;65H                                   │[14;27H│[14;28H                                   │[14;64H│[14;65H                                   │[15;27H│[15;28H                                   │[15;64H│[15;65H                                   │[16;27H│[16;28H                                 [16;61H  [16;63H│[16;64H│[16;65H                                   │[17;27H│[17;28H                                   │[17;64H│[17;65H                                   │[18;27H│[18;28H                                   │[18;64H│[18;65H                                   │[19;27H│[19;28H                                   │[19;64H│[19;65H                                   │[20;27H│[20;28H                                   │[20;64H│[20;65H                                   │[21;27H│[21;28H                                   │[21;64H│[21;65H                                   │[22;27H│[22;28H                                   │[22;64H│[22;65H                                   │[23;27H│[23;28H                                   │[23;64H│[23;65H                                   │[24;27H│[24;28H                                   │[24;64H│[24;65H                                   │[25;27H│[25;28H                                   │[25;64H│[25;65H                                   │[26;27H│[26;28H                                   │[26;64H│[26;65H                                   │[27;27H│[27;28H                                   │[27;64H│[27;65H                                   │[28;27H│[28;28H                                   │[28;64H│[28;65H                                   │[29;27H│[29;28H                                   │[29;64H│[29;65H                                   │[30;27H└[30;28H─[30;29H─[30;30H─[30;31H─[30;32H─[30;33H─[30;34H─[30;35H─[30;36H─[30;37H─[30;38H─[30;39H─[30;40H─[30;41H─[30;42H─[30;43H─[30;44H─[30;45H─[30;46H─[30;47H─[30;48H─[30;49H─[30;50H─[30;51H─[30;52H─[30;53H─[30;54H─[30;55H─[30;56H─[30;57H─[30;58H─[30;59H─[30;60H─[30;61H─[30;62H─[30;63H⋯[30;64H└[30;65H─[30;66H─[30;67H─[30;68H─[30;69H─[30;70H─[30;71H─[30;72H─[30;73H─[30;74H─[30;75H─[30;76H─[30;77H─[30;78H─[30;79H─[30;80H─[30;81H─[30;82H─[30;83H─[30;84H─[30;85H─[30;86H─[30;87H─[30;88H─[30;89H─[30;90H─[30;91H─[30;92H─[30;93H─[30;94H─[30;95H─[30;96H─[30;97H─[30;98H─[30;99H─[30;100H⋯[3;28H[2 q[?25h[?2026l[3;28H[?2026h[?25l[3;28H[?25h[?2026l[3;28H[?1003h[?2026h[?25l[3;28H[?25h[?2026l[3;28H[?1003l[?2026h[?25l[3;28H[?25h[?2026l[3;28H"

 ❯ src/input/mouse.r2.test.ts:257:27
    255|     await t.flush();
    256|     h.app.renderNow();
    257|     expect(h.io.output()).toContain("\x1b[?1003l\x1b[?1000h\x1b[?1002h…
       |                           ^
    258|     const before = h.io.output().length;
    259|     h.app.prefs.apply({ tui: { mouseCapture: false } }, 99);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=b6b157e6ebc81a9e after=b6b157e6ebc81a9e IDENTICAL

===== r2-A-1003-mousecapture (2026-09-28T06:43:52)
mutation: src/app/TuiApp.ts
  - '      capture &&\n'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > 全部の動き（?1003）をやめるときはボタンとドラッグの報告を出し直す。mouseCapture が切なら ?1003h も出さない
AssertionError: expected '\u001b[?1003h\u001b[?2026h\u001b[?25l…' not to contain '\u001b[?1003h'

Expected: "[?1003h"
Received: "[?1003h[?2026h[?25l[3;28H[?25h[?2026l[3;28H"

 ❯ src/input/mouse.r2.test.ts:263:45
    261|     await t.flush();
    262|     h.app.renderNow();
    263|     expect(h.io.output().slice(before)).not.toContain("\x1b[?1003h");
       |                                             ^
    264|   });
    265| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=b6b157e6ebc81a9e after=b6b157e6ebc81a9e IDENTICAL

===== r2-A-link-win32 (2026-09-28T06:43:55)
mutation: src/app/TuiApp.ts
  - 'if (platform === "win32") return { cmd: "rundll32", args: ["url.dll,FileProtocolHandler", href] };'
  + 'if (platform === "win32") return { cmd: "cmd", args: ["/c", "start", "", href] };'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > リンクを開く道具：シェルを通さない（Windows は rundll32）。http・https・file だけ
AssertionError: expected { cmd: 'cmd', …(1) } to deeply equal { cmd: 'rundll32', args: [ …(2) ] }

- Expected
+ Received

  {
    "args": [
-     "url.dll,FileProtocolHandler",
+     "/c",
+     "start",
+     "",
      "https://example.com/a?x=1&calc.exe",
    ],
-   "cmd": "rundll32",
+   "cmd": "cmd",
  }

 ❯ src/input/mouse.r2.test.ts:234:39
    232|   it("リンクを開く道具：シェルを通さない（Windows は rundll32）。http・https・file だけ", () =>…
    233|     const url = "https://example.com/a?x=1&calc.exe";
    234|     expect(linkCommand("win32", url)).toEqual({
       |                                       ^
    235|       cmd: "rundll32",
    236|       args: ["url.dll,FileProtocolHandler", "https://example.com/a?x=1…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=b6b157e6ebc81a9e after=b6b157e6ebc81a9e IDENTICAL

===== r2-A-link-scheme (2026-09-28T06:43:58)
mutation: src/app/TuiApp.ts
  - '    if (u.protocol !== "http:" && u.protocol !== "https:" && u.protocol !== "file:") return null;\n'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > リンクを開く道具：シェルを通さない（Windows は rundll32）。http・https・file だけ
AssertionError: expected { cmd: 'rundll32', args: [ …(2) ] } to be null

- Expected:
null

+ Received:
{
  "args": [
    "url.dll,FileProtocolHandler",
    "javascript:alert(1)",
  ],
  "cmd": "rundll32",
}

 ❯ src/input/mouse.r2.test.ts:244:57
    242|       args: ["file:///tmp/a%20b"],
    243|     });
    244|     expect(linkCommand("win32", "javascript:alert(1)")).toBeNull();
       |                                                         ^
    245|     expect(linkCommand("linux", "--help")).toBeNull();
    246|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=b6b157e6ebc81a9e after=b6b157e6ebc81a9e IDENTICAL

===== r2-M-divider-nomove (2026-09-28T06:44:01)
mutation: src/input/mouse.ts
  - '        if (at === drag.start) break; // 掴んだ所から動いていない\n'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > 境界は掴んだだけでは動かさず、掴んだ位置との差を保って動かす
AssertionError: expected [ Array(2) ] to deeply equal []

- Expected
+ Received

- []
+ [
+   {
+     "id": "7",
+     "method": "layout.set_split_ratio",
+     "params": {
+       "ratio": 0.5,
+       "splitId": "s1",
+       "tabId": "t1",
+     },
+   },
+   {
+     "id": "8",
+     "method": "layout.set_split_ratio",
+     "params": {
+       "ratio": 0.5,
+       "splitId": "s1",
+       "tabId": "t1",
+     },
+   },
+ ]

 ❯ src/input/mouse.r2.test.ts:39:53
     37|     const h = await start();
     38|     h.io.type(down(62, 10) + drag(62, 10) + up(62, 10)); // p1 の右の罫線（境…
     39|     expect(h.ws.requests("layout.set_split_ratio")).toEqual([]);
       |                                                     ^
     40|     h.io.type(down(62, 10) + drag(52, 10) + up(52, 10));
     41|     // 境界（63）から 1 桁左を掴んだので、境界は 52+1=53 へ。

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-divider-grab (2026-09-28T06:44:04)
mutation: src/input/mouse.ts
  - 'const pos = at - drag.grab - '
  + 'const pos = at - '
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > 境界は掴んだだけでは動かさず、掴んだ位置との差を保って動かす
AssertionError: expected 0.35135135135135137 to be close to 0.36486486486486486, received difference is 0.013513513513513487, but expected 0.005
 ❯ src/input/mouse.r2.test.ts:43:21
     41|     // 境界（63）から 1 桁左を掴んだので、境界は 52+1=53 へ。
     42|     const r = h.ws.requests("layout.set_split_ratio").at(-1)!.params a…
     43|     expect(r.ratio).toBeCloseTo((53 - 26) / 74);
       |                     ^
     44|   });
     45|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-wheel-clamp (2026-09-28T06:44:07)
mutation: src/input/mouse.ts
  - '      const p = this.paneCoords(box, term, ev.x, ev.y);\n      if (p) this.forward(box.paneId, term, tracking, ev, p.col, p.row);\n      return;'
  + '      this.forward(box.paneId, term, tracking, ev, ev.x - box.content.x, ev.y - box.content.y);\n      return;'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > ホイールの座標も pane の大きさに収め、横のホイールはマウスを求める pane にだけ渡す
AssertionError: expected [ '\u001b[<65;24;19M', …(1) ] to deeply equal [ '\u001b[<65;10;5M', …(1) ]

- Expected
+ Received

  [
-   "[<65;10;5M",
-   "[<66;10;5M",
+   "[<65;24;19M",
+   "[<66;24;19M",
  ]

 ❯ src/input/mouse.r2.test.ts:58:24
     56|     await t.flush();
     57|     h.io.type(wheel(50, 20, 65) + wheel(50, 20, 66));
     58|     expect(h.inputs()).toEqual(["\x1b[<65;10;5M", "\x1b[<66;10;5M"]);
       |                        ^
     59|   });
     60|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-horizontal (2026-09-28T06:44:10)
mutation: src/input/mouse.ts
  - '    if (horizontal) return;\n'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > ホイールの座標も pane の大きさに収め、横のホイールはマウスを求める pane にだけ渡す
AssertionError: expected 29 to be 35 // Object.is equality

- Expected
+ Received

- 35
+ 29

 ❯ src/input/mouse.r2.test.ts:54:44
     52|     const bottom = t.term.buffer.active.viewportY;
     53|     h.io.type(wheel(30, 3, 66) + wheel(30, 3, 67));
     54|     expect(t.term.buffer.active.viewportY).toBe(bottom);
       |                                            ^
     55|     t.output(new TextEncoder().encode("\x1b[?1000;1006h"));
     56|     await t.flush();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-cancel-release (2026-09-28T06:44:12)
mutation: src/input/mouse.ts
  - '    if (drag?.kind === "forward") {'
  + '    if (false) {'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > pane へ渡している押下を捨てるときは離しも送る
AssertionError: expected [ '\u001b[<0;4;4M', '\u001b[<32;5;4M' ] to deeply equal [ '\u001b[<0;4;4M', …(2) ]

- Expected
+ Received

  [
    "[<0;4;4M",
    "[<32;5;4M",
-   "[<0;5;4m",
  ]

 ❯ src/input/mouse.r2.test.ts:68:24
     66|     h.io.type(down(30, 5) + drag(31, 5));
     67|     h.io.type("\x1b[O"); // 外側の端末を離れた
     68|     expect(h.inputs()).toEqual(["\x1b[<0;4;4M", "\x1b[<32;5;4M", "\x1b…
       |                        ^
     69|   });
     70|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-crop-margin-row (2026-09-28T06:44:16)
mutation: src/input/mouse.ts
  - '    const row = inPane?.row ?? y - box.content.y;'
  + '    const row = y - box.content.y;'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > 遡っているときも、切り取りの余白の行は pane の最後の行として選ぶ
AssertionError: expected { paneId: 'p1', …(2) } to match object { from: { row: 12, col: +0 }, …(1) }
(2 matching properties omitted from actual)

- Expected
+ Received

@@ -2,8 +2,8 @@
    "from": {
      "col": 0,
      "row": 12,
    },
    "to": {
-     "row": 14,
+     "row": 32,
    },
  }

 ❯ src/input/mouse.r2.test.ts:80:35
     78|     // 中身の 20 行目（pane は 3 行しかない）から 0 行目の頭まで。
     79|     h.io.type(down(27 + 5, 2 + 20) + drag(27, 2) + up(27, 2));
     80|     expect(h.app.mouse.selection).toMatchObject({
       |                                   ^
     81|       from: { row: top, col: 0 },
     82|       to: { row: top + 2 },

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-dblclick-cell (2026-09-28T06:44:20)
mutation: src/input/mouse.ts
  - '      this.lastClick.col === cell;'
  + '      this.lastClick.col === col;'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > 全角の左右どちらの半分を押してもダブルクリック。押したまま動かすと単語単位に広げる（M5）
AssertionError: expected '\u001b[?1049h\u001b[H\u001b[2J\u001b[…' to contain '\u001b]52;c;6Kqe\u0007'

Expected: "]52;c;6Kqe"
Received: "[?1049h[H[2J[?25l[?2004h[?1004h=[?1000h[?1002h[?1006h[?2026h[?25l[2J[1;1H Spaces       開[1;17Hい[1;19Hた[1;21H順[1;23H + │[1;27H                                                                  接[1;95H続[1;97H中[1;99H…[1;100H [2;1H                         │[2;27H                                                                          [3;1H                         │[3;27H                                                                          [4;1H                         │[4;27H                                                                          [5;1H                         │[5;27H                                                                          [6;1H                         │[6;27H                                                                          [7;1H                         │[7;27H                                                                          [8;1H                         │[8;27H                                                                          [9;1H                         │[9;27H                                                                          [10;1H                         │[10;27H                                                                          [11;1H                         │[11;27H                                                                          [12;1H                         │[12;27H                                                                          [13;1H                         │[13;27H                                                                          [14;1H                         │[14;27H                                                                          [15;1H                         │[15;27H                                                                          [16;1H                         │[16;27H                                 接[16;62H続[16;64H中[16;66H…[16;67H                                  [17;1H                         │[17;27H                                                                          [18;1H                         │[18;27H                                                                          [19;1H                         │[19;27H                                                                          [20;1H                         │[20;27H                                                                          [21;1H                         │[21;27H                                                                          [22;1H                         │[22;27H                                                                          [23;1H                         │[23;27H                                                                          [24;1H                         │[24;27H                                                                          [25;1H                         │[25;27H                                                                          [26;1H                         │[26;27H                                                                          [27;1H                         │[27;27H                                                                          [28;1H                         │[28;27H                                                                          [29;1H                         │[29;27H                                                                          [30;1H                       «[30;25H │[30;27H                                                                          [1;1H[?2026l[1;1H[?2026h[?25l[1;27H 1:t1 [1;34H + [1;87Hsession[1;94H: [1;96Hwo[1;98Hrk[2;1H   w1                    [2;27H┌[2;28H─[2;29H pane p1 ─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H─[2;51H─[2;52H─[2;53H─[2;54H─[2;55H─[2;56H─[2;57H─[2;58H─[2;59H─[2;60H─[2;61H─[2;62H─[2;63H┐[2;64H┌[2;65H─[2;66H pane p2 ─[2;76H─[2;77H─[2;78H─[2;79H─[2;80H─[2;81H─[2;82H─[2;83H─[2;84H─[2;85H─[2;86H─[2;87H─[2;88H─[2;89H─[2;90H─[2;91H─[2;92H─[2;93H─[2;94H─[2;95H─[2;96H─[2;97H─[2;98H─[2;99H─[2;100H┐[3;4Hw2[3;27H│[3;28H                                   │[3;64H│[3;65H                                   │[4;27H│[4;28H                                   │[4;64H│[4;65H                                   │[5;27H│[5;28H                                   │[5;64H│[5;65H                                   │[6;27H│[6;28H                                   │[6;64H│[6;65H                                   │[7;27H│[7;28H                                   │[7;64H│[7;65H                                   │[8;27H│[8;28H                                   │[8;64H│[8;65H                                   │[9;27H│[9;28H                                   │[9;64H│[9;65H                                   │[10;27H│[10;28H                                   │[10;64H│[10;65H                                   │[11;27H│[11;28H                                   │[11;64H│[11;65H                                   │[12;27H│[12;28H                                   │[12;64H│[12;65H                                   │[13;27H│[13;28H                                   │[13;64H│[13;65H                                   │[14;27H│[14;28H                                   │[14;64H│[14;65H                                   │[15;27H│[15;28H                                   │[15;64H│[15;65H                                   │[16;27H│[16;28H                                 [16;61H  [16;63H│[16;64H│[16;65H                                   │[17;27H│[17;28H                                   │[17;64H│[17;65H                                   │[18;27H│[18;28H                                   │[18;64H│[18;65H                                   │[19;27H│[19;28H                                   │[19;64H│[19;65H                                   │[20;27H│[20;28H                                   │[20;64H│[20;65H                                   │[21;27H│[21;28H                                   │[21;64H│[21;65H                                   │[22;27H│[22;28H                                   │[22;64H│[22;65H                                   │[23;27H│[23;28H                                   │[23;64H│[23;65H                                   │[24;27H│[24;28H                                   │[24;64H│[24;65H                                   │[25;27H│[25;28H                                   │[25;64H│[25;65H                                   │[26;27H│[26;28H                                   │[26;64H│[26;65H                                   │[27;27H│[27;28H                                   │[27;64H│[27;65H                                   │[28;27H│[28;28H                                   │[28;64H│[28;65H                                   │[29;27H│[29;28H                                   │[29;64H│[29;65H                                   │[30;27H└[30;28H─[30;29H─[30;30H─[30;31H─[30;32H─[30;33H─[30;34H─[30;35H─[30;36H─[30;37H─[30;38H─[30;39H─[30;40H─[30;41H─[30;42H─[30;43H─[30;44H─[30;45H─[30;46H─[30;47H─[30;48H─[30;49H─[30;50H─[30;51H─[30;52H─[30;53H─[30;54H─[30;55H─[30;56H─[30;57H─[30;58H─[30;59H─[30;60H─[30;61H─[30;62H─[30;63H⋯[30;64H└[30;65H─[30;66H─[30;67H─[30;68H─[30;69H─[30;70H─[30;71H─[30;72H─[30;73H─[30;74H─[30;75H─[30;76H─[30;77H─[30;78H─[30;79H─[30;80H─[30;81H─[30;82H─[30;83H─[30;84H─[30;85H─[30;86H─[30;87H─[30;88H─[30;89H─[30;90H─[30;91H─[30;92H─[30;93H─[30;94H─[30;95H─[30;96H─[30;97H─[30;98H─[30;99H─[30;100H⋯[3;28H[2 q[?25h[?2026l[3;28H[?2026h[?25l[3;28H[?25h[?2026l[3;28H[?2026h[?25l[3;28H語[3;31Halpha[3;37Hbeta[3;42Hgamma[30;63H┘[3;47H[?25h[?2026l[3;47H"

 ❯ src/input/mouse.r2.test.ts:92:50
     90|     await t.flush();
     91|     h.io.type(down(27, 2) + up(27, 2) + down(28, 2) + up(28, 2));
     92|     await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;…
       |                                                  ^
     93|     // alpha（桁 3〜7）をダブルクリックして、beta の途中まで押したまま動かす → alpha beta。
     94|     h.io.type(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-word-drag (2026-09-28T06:44:25)
mutation: src/input/mouse.ts
  - '          if (drag.word) {'
  + '          if (false) {'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > 全角の左右どちらの半分を押してもダブルクリック。押したまま動かすと単語単位に広げる（M5）
AssertionError: expected '\u001b[?1049h\u001b[H\u001b[2J\u001b[…' to contain '\u001b]52;c;YWxwaGEgYmV0YQ==\u0007'

Expected: "]52;c;YWxwaGEgYmV0YQ=="
Received: "[?1049h[H[2J[?25l[?2004h[?1004h=[?1000h[?1002h[?1006h[?2026h[?25l[2J[1;1H Spaces       開[1;17Hい[1;19Hた[1;21H順[1;23H + │[1;27H                                                                  接[1;95H続[1;97H中[1;99H…[1;100H [2;1H                         │[2;27H                                                                          [3;1H                         │[3;27H                                                                          [4;1H                         │[4;27H                                                                          [5;1H                         │[5;27H                                                                          [6;1H                         │[6;27H                                                                          [7;1H                         │[7;27H                                                                          [8;1H                         │[8;27H                                                                          [9;1H                         │[9;27H                                                                          [10;1H                         │[10;27H                                                                          [11;1H                         │[11;27H                                                                          [12;1H                         │[12;27H                                                                          [13;1H                         │[13;27H                                                                          [14;1H                         │[14;27H                                                                          [15;1H                         │[15;27H                                                                          [16;1H                         │[16;27H                                 接[16;62H続[16;64H中[16;66H…[16;67H                                  [17;1H                         │[17;27H                                                                          [18;1H                         │[18;27H                                                                          [19;1H                         │[19;27H                                                                          [20;1H                         │[20;27H                                                                          [21;1H                         │[21;27H                                                                          [22;1H                         │[22;27H                                                                          [23;1H                         │[23;27H                                                                          [24;1H                         │[24;27H                                                                          [25;1H                         │[25;27H                                                                          [26;1H                         │[26;27H                                                                          [27;1H                         │[27;27H                                                                          [28;1H                         │[28;27H                                                                          [29;1H                         │[29;27H                                                                          [30;1H                       «[30;25H │[30;27H                                                                          [1;1H[?2026l[1;1H[?2026h[?25l[1;27H 1:t1 [1;34H + [1;87Hsession[1;94H: [1;96Hwo[1;98Hrk[2;1H   w1                    [2;27H┌[2;28H─[2;29H pane p1 ─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H─[2;51H─[2;52H─[2;53H─[2;54H─[2;55H─[2;56H─[2;57H─[2;58H─[2;59H─[2;60H─[2;61H─[2;62H─[2;63H┐[2;64H┌[2;65H─[2;66H pane p2 ─[2;76H─[2;77H─[2;78H─[2;79H─[2;80H─[2;81H─[2;82H─[2;83H─[2;84H─[2;85H─[2;86H─[2;87H─[2;88H─[2;89H─[2;90H─[2;91H─[2;92H─[2;93H─[2;94H─[2;95H─[2;96H─[2;97H─[2;98H─[2;99H─[2;100H┐[3;4Hw2[3;27H│[3;28H                                   │[3;64H│[3;65H                                   │[4;27H│[4;28H                                   │[4;64H│[4;65H                                   │[5;27H│[5;28H                                   │[5;64H│[5;65H                                   │[6;27H│[6;28H                                   │[6;64H│[6;65H                                   │[7;27H│[7;28H                                   │[7;64H│[7;65H                                   │[8;27H│[8;28H                                   │[8;64H│[8;65H                                   │[9;27H│[9;28H                                   │[9;64H│[9;65H                                   │[10;27H│[10;28H                                   │[10;64H│[10;65H                                   │[11;27H│[11;28H                                   │[11;64H│[11;65H                                   │[12;27H│[12;28H                                   │[12;64H│[12;65H                                   │[13;27H│[13;28H                                   │[13;64H│[13;65H                                   │[14;27H│[14;28H                                   │[14;64H│[14;65H                                   │[15;27H│[15;28H                                   │[15;64H│[15;65H                                   │[16;27H│[16;28H                                 [16;61H  [16;63H│[16;64H│[16;65H                                   │[17;27H│[17;28H                                   │[17;64H│[17;65H                                   │[18;27H│[18;28H                                   │[18;64H│[18;65H                                   │[19;27H│[19;28H                                   │[19;64H│[19;65H                                   │[20;27H│[20;28H                                   │[20;64H│[20;65H                                   │[21;27H│[21;28H                                   │[21;64H│[21;65H                                   │[22;27H│[22;28H                                   │[22;64H│[22;65H                                   │[23;27H│[23;28H                                   │[23;64H│[23;65H                                   │[24;27H│[24;28H                                   │[24;64H│[24;65H                                   │[25;27H│[25;28H                                   │[25;64H│[25;65H                                   │[26;27H│[26;28H                                   │[26;64H│[26;65H                                   │[27;27H│[27;28H                                   │[27;64H│[27;65H                                   │[28;27H│[28;28H                                   │[28;64H│[28;65H                                   │[29;27H│[29;28H                                   │[29;64H│[29;65H                                   │[30;27H└[30;28H─[30;29H─[30;30H─[30;31H─[30;32H─[30;33H─[30;34H─[30;35H─[30;36H─[30;37H─[30;38H─[30;39H─[30;40H─[30;41H─[30;42H─[30;43H─[30;44H─[30;45H─[30;46H─[30;47H─[30;48H─[30;49H─[30;50H─[30;51H─[30;52H─[30;53H─[30;54H─[30;55H─[30;56H─[30;57H─[30;58H─[30;59H─[30;60H─[30;61H─[30;62H─[30;63H⋯[30;64H└[30;65H─[30;66H─[30;67H─[30;68H─[30;69H─[30;70H─[30;71H─[30;72H─[30;73H─[30;74H─[30;75H─[30;76H─[30;77H─[30;78H─[30;79H─[30;80H─[30;81H─[30;82H─[30;83H─[30;84H─[30;85H─[30;86H─[30;87H─[30;88H─[30;89H─[30;90H─[30;91H─[30;92H─[30;93H─[30;94H─[30;95H─[30;96H─[30;97H─[30;98H─[30;99H─[30;100H⋯[3;28H[2 q[?25h[?2026l[3;28H[?2026h[?25l[3;28H[?25h[?2026l[3;28H]52;c;6Kqe]52;c;YWxwaGEgYmU=[?2026h[?25l[3;28H語[3;31Halpha beta[3;42Hgamma[30;63H┘[3;47H[?25h[?2026l[3;47H"

 ❯ src/input/mouse.r2.test.ts:97:50
     95|       down(27 + 4, 2) + up(27 + 4, 2) + down(27 + 4, 2) + drag(27 + 10…
     96|     );
     97|     await vi.waitFor(() => expect(h.io.output()).toContain(`\x1b]52;c;…
       |                                                  ^
     98|     // 左へ広げる：gamma から alpha の途中へ。
     99|     h.io.type(

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-url-snap (2026-09-28T06:44:28)
mutation: src/input/mouse.ts
  - '  const idx = line.pos.findIndex((p) => p.row === row && p.col === cell);'
  + '  const idx = line.pos.findIndex((p) => p.row === row && p.col >= col);'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=0
raw output:
      Tests  13 passed (13)
restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-tab-wheel (2026-09-28T06:44:32)
mutation: src/input/mouse.ts
  - '      if (!horizontal) this.host.actions.run({ type: "tabDelta", delta: down ? 1 : -1 });'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > tab バーのホイールで前後の tab へ（H22b）。あふれたら「‹」「›」でずらす
AssertionError: expected 't1' to be 't2' // Object.is equality

Expected: "t2"
Received: "t1"

 ❯ src/input/mouse.r2.test.ts:130:54
    128|     const h = await start({ snapshot: snap });
    129|     h.io.type(wheel(40, 0, 65));
    130|     await vi.waitFor(() => expect(h.app.model.tabId).toBe("t2"));
       |                                                      ^
    131|     h.io.type(wheel(40, 0, 64));
    132|     await vi.waitFor(() => expect(h.app.model.tabId).toBe("t1"));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-tab-scroll-right (2026-09-28T06:44:35)
mutation: src/input/mouse.ts
  - '        this.host.scrollTabs?.(1);'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=0
raw output:
      Tests  13 passed (13)
restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-scrollbar-press (2026-09-28T06:44:38)
mutation: src/input/mouse.ts
  - '    const bar = left ? this.scrollbarAt(layout, x, y) : undefined;'
  + '    const bar = left && false ? this.scrollbarAt(layout, x, y) : undefined;'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > pane の右の罫線のスクロールバー（M9）：つまみを出し、溝を押すと飛び、つまみを動かすとスクロールする
AssertionError: expected 273 to be less than 10
 ❯ src/input/mouse.r2.test.ts:161:44
    159|     // 溝の上の端を押す → いちばん上の近くへ。
    160|     h.io.type(down(62, 2));
    161|     expect(t.term.buffer.active.viewportY).toBeLessThan(10);
       |                                            ^
    162|     // そのままつまみを下の端まで動かす → 末尾へ。
    163|     h.io.type(drag(62, 28) + up(62, 28));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-R-scrollbar-paint (2026-09-28T06:44:41)
mutation: src/render/Renderer.ts
  - '      paintScrollbar(grid, box, term, focused, theme);\n'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > pane の右の罫線のスクロールバー（M9）：つまみを出し、溝を押すと飛び、つまみを動かすとスクロールする
AssertionError: expected '│' to be '┃' // Object.is equality

Expected: "┃"
Received: "│"

 ❯ src/input/mouse.r2.test.ts:157:29
    155|     const screen = (await h.screen()).split("\n");
    156|     // 末尾にいるので、つまみは溝（2〜28 行）の下の端。
    157|     expect(screen[28]![62]).toBe("┃");
       |                             ^
    158|     expect(screen[2]![62]).toBe("│");
    159|     // 溝の上の端を押す → いちばん上の近くへ。

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=3c843afc4dbb441f after=3c843afc4dbb441f IDENTICAL

===== r2-M-sort-click (2026-09-28T06:44:44)
mutation: src/input/mouse.ts
  - '        if (hit.section === "spaces") actions.toggleWorkspaceSort();'
  + '        if (hit.section === "spaces") void 0;'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > サイドバーのボタン（M14）：並び順の切り替え・畳む「«」、畳んだら tab バーの「»」で開く
AssertionError: expected [ Array(1) ] to deeply equal [ …(2) ]

- Expected
+ Received

  [
    {
      "patch": {
-       "workspaceSort": "name",
-     },
-   },
-   {
-     "patch": {
        "agentSort": "priority",
      },
    },
  ]

 ❯ src/input/mouse.r2.test.ts:189:61
    187|     h.io.type(down(sortSpaces.x!, sortSpaces.y) + up(sortSpaces.x!, so…
    188|     h.io.type(down(sortAgents.x!, sortAgents.y) + up(sortAgents.x!, so…
    189|     expect(h.ws.requests("prefs.set").map((r) => r.params)).toEqual([
       |                                                             ^
    190|       { patch: { workspaceSort: "name" } },
    191|       { patch: { agentSort: "priority" } },

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-collapse-click (2026-09-28T06:44:46)
mutation: src/input/mouse.ts
  - '      } else if (hit.kind === "collapse") actions.run({ type: "toggleSidebar" });'
  + '      }'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > サイドバーのボタン（M14）：並び順の切り替え・畳む「«」、畳んだら tab バーの「»」で開く
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/input/mouse.r2.test.ts:196:42
    194|     const collapse = hits.find((x) => x.kind === "collapse")!;
    195|     h.io.type(down(collapse.x!, collapse.y) + up(collapse.x!, collapse…
    196|     expect(h.app.prefs.sidebarCollapsed).toBe(true);
       |                                          ^
    197|     h.app.renderNow();
    198|     expect((await h.screen()).split("\n")[0]!.startsWith("»")).toBe(tr…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-expand-click (2026-09-28T06:44:49)
mutation: src/input/mouse.ts
  - '      if (bar.expandSidebar && x === bar.expandSidebar.x) {'
  + '      if (false) {'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > サイドバーのボタン（M14）：並び順の切り替え・畳む「«」、畳んだら tab バーの「»」で開く
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/input/mouse.r2.test.ts:200:42
    198|     expect((await h.screen()).split("\n")[0]!.startsWith("»")).toBe(tr…
    199|     h.io.type(down(0, 0) + up(0, 0));
    200|     expect(h.app.prefs.sidebarCollapsed).toBe(false);
       |                                          ^
    201|   });
    202|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-S-reveal (2026-09-28T06:44:53)
mutation: src/render/chrome/sidebar.ts
  - '    if (reveal < o) o = reveal;\n    else if (reveal >= o + height) o = reveal - height + 1;\n'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > spaces の区画が一覧より低ければ、選んだ workspace が見える所までずらし、ホイールで動かせる
AssertionError: expected ' Spaces       開いた順 + │ NAVIGATE   1:t…' to contain 'space-w13'

- Expected
+ Received

- space-w13
+  Spaces       開いた順 + │ NAVIGATE   1:t-w1   +                                      session: work
+    space-w1              │┌─ pane p-w1 ────────────────────────────────────────────────────────────┐
+    space-w2              ││                                                                        │
+    space-w3              ││                                                                        │
+    space-w4              ││                                                                        │
+    space-w5             ↓││                                                                        │
+ ─ Agents ─────グループ順─││                                                                        │
+  ○ Claude                ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                        « │└────────────────────────────────────────────────────────────────────────⋯

 ❯ src/input/mouse.r2.test.ts:224:18
    222|     h.app.renderNow();
    223|     text = await h.screen();
    224|     expect(text).toContain("space-w13");
       |                  ^
    225|     h.io.type("\x1b");
    226|     // ホイールで上へ戻せる。

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=0ec06bc7489749d5 after=0ec06bc7489749d5 IDENTICAL

===== r2-M-sidebar-wheel (2026-09-28T06:44:56)
mutation: src/input/mouse.ts
  - '        this.host.scrollSidebar?.(section, down ? WHEEL_LINES : -WHEEL_LINES);'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=0
raw output:
      Tests  13 passed (13)
restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-url-snap (テストを足した後) (2026-09-28T06:45:38)
mutation: src/input/mouse.ts
  - '  const idx = line.pos.findIndex((p) => p.row === row && p.col === cell);'
  + '  const idx = line.pos.findIndex((p) => p.row === row && p.col >= col);'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > 全角の右半分を Ctrl＋押下しても、その文字の後の URL を開かない
AssertionError: expected [ 'https://b.example/y' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "https://b.example/y",
+ ]

 ❯ src/input/mouse.r2.test.ts:128:20
    126|     await t.flush();
    127|     h.io.type(down(27 + 1, 2, 16) + up(27 + 1, 2, 16)); // 「語」の右半分
    128|     expect(opened).toEqual([]);
       |                    ^
    129|     h.io.type(down(27 + 2, 2, 16) + up(27 + 2, 2, 16));
    130|     expect(opened).toEqual(["https://b.example/y"]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-tab-scroll-right (テストを直した後) (2026-09-28T06:45:41)
mutation: src/input/mouse.ts
  - '        this.host.scrollTabs?.(1);'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > tab バーのホイールで前後の tab へ（H22b）。あふれたら「‹」「›」でずらす
AssertionError: expected ' Spaces       開いた順 + │   1:long-tab-n…' to contain '‹'

Expected: "‹"
Received: " Spaces       開いた順 + │   1:long-tab-name-t1  2:long-tab-name-t2  3:long-ta… ›  +  session: work"

 ❯ src/input/mouse.r2.test.ts:155:21
    153|     h.app.renderNow();
    154|     const shifted = (await h.screen()).split("\n")[0]!;
    155|     expect(shifted).toContain("‹");
       |                     ^
    156|     expect(shifted).not.toContain("1:long-tab-name-t1 ");
    157|     expect(h.app.model.tabId).toBe("t1"); // ずらすだけで tab は替えない

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-M-sidebar-wheel (テストを直した後) (2026-09-28T06:45:44)
mutation: src/input/mouse.ts
  - '        this.host.scrollSidebar?.(section, down ? WHEEL_LINES : -WHEEL_LINES);'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > spaces の区画が一覧より低ければ、選んだ workspace が見える所までずらし、ホイールで動かせる
AssertionError: expected ' Spaces       開いた順 + │ 1:t-w1   +    …' not to contain 'space-w1 '

- Expected
+ Received

- space-w1 
+  Spaces       開いた順 + │ 1:t-w1   +                                                 session: work
+    space-w1              │┌─ pane p-w1 ────────────────────────────────────────────────────────────┐
+    space-w2              ││                                                                        │
+    space-w3              ││                                                                        │
+    space-w4              ││                                                                        │
+    space-w5             ↓││                                                                        │
+ ─ Agents ─────グループ順─││                                                                        │
+  ○ Claude                ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                          ││                                                                        │
+                        « │└────────────────────────────────────────────────────────────────────────⋯

 ❯ src/input/mouse.r2.test.ts:249:22
    247|     h.app.renderNow();
    248|     text = await h.screen();
    249|     expect(text).not.toContain("space-w1 ");
       |                      ^
    250|     expect(text).toContain("space-w10");
    251|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=7f89ac33f59ede22 after=7f89ac33f59ede22 IDENTICAL

===== r2-N-mode-badge (2026-09-28T06:46:04)
mutation: src/render/chrome/narrowHeader.ts
  - '  const badge = MODE_BADGES[ctx.mode];'
  + '  const badge = ctx.mode === "prefix" ? "PREFIX" : null;'
command: (cd packages/tui && npx vitest run src/app/TuiApp.narrow.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.narrow.test.ts > TuiApp：狭い幅の 1 列表示 > 上辺：モードの印（tab バーと同じ）・tab の名前・接続の状態と session 名
AssertionError: expected '   w1  t1  session: work             …' to contain 'COPY'

Expected: "COPY"
Received: "   w1  t1  session: work                             switch"

 ❯ src/app/TuiApp.narrow.test.ts:106:19
    104|     h.app.renderNow();
    105|     line0 = (await h.screen()).split("\n")[0]!;
    106|     expect(line0).toContain("COPY");
       |                   ^
    107|     h.io.type("q");
    108|     h.app.connectionState = "rejected";

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=233112e80056c1c1 after=233112e80056c1c1 IDENTICAL

===== r2-N-status-rejected (2026-09-28T06:46:06)
mutation: src/render/chrome/narrowHeader.ts
  - '  const urgent = ctx.connection !== "open" || !!ctx.alert;'
  + '  const urgent = ctx.connection === "reconnecting" || ctx.connection === "connecting" || !!ctx.alert;'
command: (cd packages/tui && npx vitest run src/app/TuiApp.narrow.test.ts)  exit=0
raw output:
      Tests  6 passed (6)
restored: sha256 before=233112e80056c1c1 after=233112e80056c1c1 IDENTICAL

===== r2-N-tab-label (2026-09-28T06:46:10)
mutation: src/render/chrome/narrowHeader.ts
  - '      : tab.label\n'
  + '      : ""\n'
command: (cd packages/tui && npx vitest run src/app/TuiApp.narrow.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.narrow.test.ts > TuiApp：狭い幅の 1 列表示 > 上辺：モードの印（tab バーと同じ）・tab の名前・接続の状態と session 名
AssertionError: expected '   w1  session: work                 …' to contain 't1'

Expected: "t1"
Received: "   w1  session: work                                 switch"

 ❯ src/app/TuiApp.narrow.test.ts:100:19
     98|     h.app.renderNow();
     99|     let line0 = (await h.screen()).split("\n")[0]!;
    100|     expect(line0).toContain("t1"); // tab が 1 つなら名前だけ
       |                   ^
    101|     expect(line0).toContain("session: work");
    102|     h.io.type("\x02[");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=233112e80056c1c1 after=233112e80056c1c1 IDENTICAL

===== r2-L-first-pane (2026-09-28T06:46:12)
mutation: src/layout/computeLayout.ts
  - '      soloId = firstPane(tab.layout);\n'
  + ''
command: (cd packages/tui && npx vitest run src/layout/computeLayout.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 8 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/layout/computeLayout.test.ts > computeLayout（AC2） > サイドバー（左・全高）・tab バー（上 1 行）・pane の枠と中身
AssertionError: expected [] to deeply equal [ { paneId: 'p1', …(2) } ]

- Expected
+ Received

- [
-   {
-     "content": {
-       "h": 27,
-       "w": 72,
-       "x": 27,
-       "y": 2,
-     },
-     "frame": {
-       "h": 29,
-       "w": 74,
-       "x": 26,
-       "y": 1,
-     },
-     "paneId": "p1",
-   },
- ]
+ []

 ❯ src/layout/computeLayout.test.ts:21:21
     19|     expect(r.sidebar).toEqual({ x: 0, y: 0, w: 26, h: 30 });
     20|     expect(r.tabBar).toEqual({ x: 26, y: 0, w: 74, h: 1 });
     21|     expect(r.panes).toEqual([
       |                     ^
     22|       {
     23|         paneId: "p1",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/8]⎯

 FAIL  src/layout/computeLayout.test.ts > computeLayout（AC2） > 左右の分割は比率で桁を分け、境界を返す
TypeError: Cannot read properties of undefined (reading 'frame')
 ❯ src/layout/computeLayout.test.ts:36:15
     34|     });
     35|     const [a, b] = r.panes;
     36|     expect(a!.frame).toEqual({ x: 26, y: 1, w: 19, h: 29 }); // round(…
       |               ^
     37|     expect(b!.frame).toEqual({ x: 45, y: 1, w: 55, h: 29 });
     38|     expect(r.dividers).toEqual([

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/8]⎯

 FAIL  src/layout/computeLayout.test.ts > computeLayout（AC2） > 上下の分割と入れ子
AssertionError: expected [] to deeply equal [ [ 'p1', …(1) ], …(2) ]

- Expected
+ Received

- [
-   [
-     "p1",
-     {
-       "h": 15,
-       "w": 74,
-       "x": 26,
-       "y": 1,
-     },
-   ],
-   [
-     "p2",
-     {
-       "h": 14,
-       "w": 37,
-       "x": 26,
-       "y": 16,
-     },
-   ],
-   [
-     "p3",
-     {
-       "h": 14,
-       "w": 37,
-       "x": 63,
restored: sha256 before=986c9dd2cde47b0d after=986c9dd2cde47b0d IDENTICAL

===== r2-L-nav-overlay (2026-09-28T06:46:14)
mutation: src/layout/computeLayout.ts
  - '    narrow && input.navigateOverlay === true'
  + '    false'
command: (cd packages/tui && npx vitest run src/app/TuiApp.narrow.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.narrow.test.ts > TuiApp：狭い幅の 1 列表示 > navigate モードではサイドバーを pane の上に重ね、選んでいる workspace が見える（herdr の switcher）
AssertionError: expected ' NAVIGATE     w1  t1  session: work  …' to contain 'Spaces'

- Expected
+ Received

- Spaces
+  NAVIGATE     w1  t1  session: work        switch
+ ┌─ pane p1 ──────────────────────────────────────┐
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ │                                                │
+ └────────────────────────────────────────────────⋯

 ❯ src/app/TuiApp.narrow.test.ts:123:18
    121|     h.app.renderNow();
    122|     const text = await h.screen();
    123|     expect(text).toContain("Spaces");
       |                  ^
    124|     expect(h.app.ui.navigateSelection).toBe("w2");
    125|     // 重ねたサイドバーの行を押すとその workspace へ。

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=986c9dd2cde47b0d after=986c9dd2cde47b0d IDENTICAL

===== r2-D-legacy-motion (2026-09-28T06:46:17)
mutation: src/input/decode.ts
  - 'button: wheel ? 64 + button : motion && button === 3 ? -1 : button === 3 ? 0 : button,'
  + 'button: wheel ? 64 + button : button === 3 ? 0 : button,'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > 従来形式（X10）のマウスの動き > ボタンを押していない動き（ボタン 3）は -1（左ボタンのドラッグと取り違えない）
AssertionError: expected [ { kind: 'mouse', …(5) } ] to deeply equal [ { kind: 'mouse', …(5) } ]

- Expected
+ Received

@@ -1,9 +1,9 @@
  [
    {
      "action": "move",
-     "button": -1,
+     "button": 0,
      "kind": "mouse",
      "mods": {
        "alt": false,
        "ctrl": false,
        "meta": false,

 ❯ src/input/mouse.r2.test.ts:294:16
    292|       new TextEncoder().encode("\x1b[M" + String.fromCharCode(32 + 35,…
    293|     );
    294|     expect(ev).toEqual([
       |                ^
    295|       {
    296|         kind: "mouse",

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=3201674cac131856 after=3201674cac131856 IDENTICAL

===== r2-N-status-rejected (テストを直した後) (2026-09-28T06:46:31)
mutation: src/render/chrome/narrowHeader.ts
  - '  const urgent = ctx.connection !== "open" || !!ctx.alert;'
  + '  const urgent = ctx.connection === "reconnecting" || ctx.connection === "connecting" || !!ctx.alert;'
command: (cd packages/tui && npx vitest run src/app/TuiApp.narrow.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/app/TuiApp.narrow.test.ts > TuiApp：狭い幅の 1 列表示 > 上辺：モードの印（tab バーと同じ）・tab の名前・接続の状態と session 名
AssertionError: expected '   w1  t1  接続できません                   …' not to contain 't1'

Expected: "t1"
Received: "   w1  t1  接続できません                            switch"

 ❯ src/app/TuiApp.narrow.test.ts:113:23
    111|     expect(line0).toContain("接続できません");
    112|     // 繋がっていないときは名前より先に（名前・tab は出さない。tab バーと同じく警告を優先）。
    113|     expect(line0).not.toContain("t1");
       |                       ^
    114|   });
    115|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=233112e80056c1c1 after=233112e80056c1c1 IDENTICAL

===== rv1-link-http-only (2026-09-28T07:06:09)
mutation: src/app/TuiApp.ts
  - '    if (u.protocol !== "http:" && u.protocol !== "https:") return null;'
  + '    if (u.protocol !== "http:" && u.protocol !== "https:" && u.protocol !== "file:") return null;'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > リンクを開く道具：シェルを通さない（Windows は rundll32）。http・https だけ
AssertionError: expected { cmd: 'xdg-open', …(1) } to be null

- Expected:
null

+ Received:
{
  "args": [
    "file:///tmp/a",
  ],
  "cmd": "xdg-open",
}

 ❯ src/input/mouse.r2.test.ts:262:51
    260|     expect(linkCommand("linux", url)).toEqual({ cmd: "xdg-open", args:…
    261|     // file: は開かない（web の D110 と同じ。Windows では実行ファイルを起動しうる）。
    262|     expect(linkCommand("linux", "file:///tmp/a")).toBeNull();
       |                                                   ^
    263|     expect(linkCommand("win32", "file:///C:/Windows/System32/calc.exe"…
    264|     expect(linkCommand("win32", "javascript:alert(1)")).toBeNull();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=217c3d2f42cdf957 after=217c3d2f42cdf957 IDENTICAL

===== rv2-osc8-track (2026-09-28T07:06:15)
mutation: src/term/PaneTerminal.ts
  - '        this.onHyperlink(data);\n'
  + ''
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > 04 review（リンク・境界の送り方） > OSC 8 のリンク（見える文字に URL が無い）も Ctrl＋押下で開く
AssertionError: expected [] to deeply equal [ 'https://docs.example/p' ]

- Expected
+ Received

- [
-   "https://docs.example/p",
- ]
+ []

 ❯ src/input/mouse.r2.test.ts:322:20
    320|     h.app.renderNow();
    321|     h.io.type(down(27 + 5, 2, 16) + up(27 + 5, 2, 16)); // 「the docs」の中
    322|     expect(opened).toEqual(["https://docs.example/p"]);
       |                    ^
    323|     h.io.type(down(27 + 14, 2, 16) + up(27 + 14, 2, 16)); // リンクの後
    324|     expect(opened).toHaveLength(1);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=ece3ebd1b68fb51d after=ece3ebd1b68fb51d IDENTICAL

===== rv2-osc8-use (2026-09-28T07:06:19)
mutation: src/input/mouse.ts
  - 'term.hyperlinkAt(abs, snapCol(term.term, abs, col)) ?? urlAt(term, abs, col)'
  + 'urlAt(term, abs, col)'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > 04 review（リンク・境界の送り方） > OSC 8 のリンク（見える文字に URL が無い）も Ctrl＋押下で開く
AssertionError: expected [] to deeply equal [ 'https://docs.example/p' ]

- Expected
+ Received

- [
-   "https://docs.example/p",
- ]
+ []

 ❯ src/input/mouse.r2.test.ts:322:20
    320|     h.app.renderNow();
    321|     h.io.type(down(27 + 5, 2, 16) + up(27 + 5, 2, 16)); // 「the docs」の中
    322|     expect(opened).toEqual(["https://docs.example/p"]);
       |                    ^
    323|     h.io.type(down(27 + 14, 2, 16) + up(27 + 14, 2, 16)); // リンクの後
    324|     expect(opened).toHaveLength(1);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=82c8b56eea2f9705 after=82c8b56eea2f9705 IDENTICAL

===== rv3-copy-on-select (2026-09-28T07:06:24)
mutation: src/input/mouse.ts
  - '    if (!sel || this.host.copyOnSelect?.() === false) return;'
  + '    if (!sel) return;'
command: (cd packages/tui && npx vitest run src/modes/SettingsDialog.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/SettingsDialog.test.ts > 設定画面 > マウスで選んだらコピーを切にすると、選んでも写さない
AssertionError: expected '\u001b[?1049h\u001b[H\u001b[2J\u001b[…' not to contain '\u001b]52;'

- Expected
+ Received

- ]52;
+ [?1049h[H[2J[?25l[?2004h[?1004h=[?1000h[?1002h[?1006h[?2026h[?25l[2J[1;1H Spaces       開[1;17Hい[1;19Hた[1;21H順[1;23H + │[1;27H                                                                  接[1;95H続[1;97H中[1;99H…[1;100H [2;1H                         │[2;27H                                                                          [3;1H                         │[3;27H                                                                          [4;1H                         │[4;27H                                                                          [5;1H                         │[5;27H                                                                          [6;1H                         │[6;27H                                                                          [7;1H                         │[7;27H                                                                          [8;1H                         │[8;27H                                                                          [9;1H                         │[9;27H                                                                          [10;1H                         │[10;27H                                                                          [11;1H                         │[11;27H                                                                          [12;1H                         │[12;27H                                                                          [13;1H                         │[13;27H                                                                          [14;1H                         │[14;27H                                                                          [15;1H                         │[15;27H                                                                          [16;1H                         │[16;27H                                 接[16;62H続[16;64H中[16;66H…[16;67H                                  [17;1H                         │[17;27H                                                                          [18;1H                         │[18;27H                                                                          [19;1H                         │[19;27H                                                                          [20;1H                         │[20;27H                                                                          [21;1H                         │[21;27H                                                                          [22;1H                         │[22;27H                                                                          [23;1H                         │[23;27H                                                                          [24;1H                         │[24;27H                                                                          [25;1H                         │[25;27H                                                                          [26;1H                         │[26;27H                                                                          [27;1H                         │[27;27H                                                                          [28;1H                         │[28;27H                                                                          [29;1H                         │[29;27H                                                                          [30;1H                       «[30;25H │[30;27H                                                                          [1;1H[?2026l[1;1H[?2026h[?25l[1;27H 1:t1 [1;34H + [1;87Hsession[1;94H: [1;96Hwo[1;98Hrk[2;1H ┌[2;3H─[2;4H 設[2;7H定[2;9H ─[2;11H─[2;12H─[2;13H─[2;14H─[2;15H─[2;16H─[2;17H─[2;18H─[2;19H─[2;20H─[2;21H─[2;22H─[2;23H─[2;24H─[2;25H─[2;26H─[2;27H─[2;28H─[2;29H─[2;30H─[2;31H─[2;32H─[2;33H─[2;34H─[2;35H─[2;36H─[2;37H─[2;38H─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H─[2;51H─[2;52H─[2;53H─[2;54H─[2;55H─[2;56H─[2;57H─[2;58H─[2;59H─[2;60H─[2;61H─[2;62H─[2;63H─[2;64H─[2;65H─[2;66H─[2;67H─[2;68H─[2;69H─[2;70H─[2;71H─[2;72H─[2;73H─[2;74H─[2;75H─[2;76H─[2;77H─[2;78H─[2;79H─[2;80H─[2;81H─[2;82H─[2;83H─[2;84H─[2;85H─[2;86H─[2;87H─[2;88H─[2;89H─[2;90H─[2;91H─[2;92H─[2;93H─[2;94H─[2;95H─[2;96H─[2;97H─[2;98H─[2;99H┐[2;100H┐[3;2H│[3;4H 通[3;7H知[3;9H             │[3;25H画[3;27H面[3;29Hの[3;31H中[3;33Hの[3;35H知[3;37Hら[3;39Hせ[3;41H（[3;43Hト[3;45Hー[3;47Hス[3;49Hト[3;51H）[3;53H                                          入[3;97H  │[3;100H│[4;2H│[4;5Hテ[4;7Hー[4;9Hマ[4;22H│[4;25Hデ[4;27Hス[4;29Hク[4;31Hト[4;33Hッ[4;35Hプ[4;37Hの[4;39H通[4;41H知[4;43H                                                    切[4;97H  │[4;100H│[5;2H│[5;5H表[5;7H示[5;22H│[5;25H音[5;27H                                                                    切[5;97H  │[5;100H│[6;2H│[6;5H端[6;7H末[6;22H│[6;26H                                                                         │[6;100H│[7;2H│[7;5Hエ[7;7Hー[7;9Hジ[7;11Hェ[7;13Hン[7;15Hト[7;17H連[7;19H携[7;22H│[7;26H                                                                         │[7;100H│[8;2H│[8;5Hキ[8;7Hー[8;22H│[8;26H                                                                         │[8;100H│[9;2H│[9;5H端[9;7H末[9;9H版[9;22H│[9;26H                                                                         │[9;100H│[10;2H│[10;22H│[10;26H                                                                         │[10;100H│[11;2H│[11;22H│[11;26H                                                                         │[11;100H│[12;2H│[12;22H│[12;26H                                                                         │[12;100H│[13;2H│[13;22H│[13;26H                                                                         │[13;100H│[14;2H│[14;22H│[14;26H                                                                         │[14;100H│[15;2H│[15;22H│[15;26H                                                                         │[15;100H│[16;2H│[16;22H│[16;26H                                   [16;61H  [16;63H  [16;65H                                  │[16;100H│[17;2H│[17;22H│[17;26H                                                                         │[17;100H│[18;2H│[18;22H│[18;26H                                                                         │[18;100H│[19;2H│[19;22H│[19;26H                                                                         │[19;100H│[20;2H│[20;22H│[20;26H                                                                         │[20;100H│[21;2H│[21;22H│[21;26H                                                                         │[21;100H│[22;2H│[22;22H│[22;26H                                                                         │[22;100H│[23;2H│[23;22H│[23;26H                                                                         │[23;100H│[24;2H│[24;22H│[24;26H                                                                         │[24;100H│[25;2H│[25;4H─[25;5H─[25;6H─[25;7H─[25;8H─[25;9H─[25;10H─[25;11H─[25;12H─[25;13H─[25;14H─[25;15H─[25;16H─[25;17H─[25;18H─[25;19H─[25;20H─[25;21H─[25;22H─[25;23H─[25;24H─[25;25H─[25;26H─[25;27H─[25;28H─[25;29H─[25;30H─[25;31H─[25;32H─[25;33H─[25;34H─[25;35H─[25;36H─[25;37H─[25;38H─[25;39H─[25;40H─[25;41H─[25;42H─[25;43H─[25;44H─[25;45H─[25;46H─[25;47H─[25;48H─[25;49H─[25;50H─[25;51H─[25;52H─[25;53H─[25;54H─[25;55H─[25;56H─[25;57H─[25;58H─[25;59H─[25;60H─[25;61H─[25;62H─[25;63H─[25;64H─[25;65H─[25;66H─[25;67H─[25;68H─[25;69H─[25;70H─[25;71H─[25;72H─[25;73H─[25;74H─[25;75H─[25;76H─[25;77H─[25;78H─[25;79H─[25;80H─[25;81H─[25;82H─[25;83H─[25;84H─[25;85H─[25;86H─[25;87H─[25;88H─[25;89H─[25;90H─[25;91H─[25;92H─[25;93H─[25;94H─[25;95H─[25;96H─[25;97H─[25;98H │[25;100H│[26;2H│[26;4H↑[26;5H↓[26;6H で[26;9H節[26;11H・[26;13HEnter で[26;21H項[26;23H目[26;25Hへ[26;27H・[26;29HEsc で[26;35H閉[26;37Hじ[26;39Hる[26;41H                                                          │[26;100H│[27;2H│[27;26H                                                                         │[27;100H│[28;2H│[28;26H                                                                         │[28;100H│[29;2H└[29;3H─[29;4H─[29;5H─[29;6H─[29;7H─[29;8H─[29;9H─[29;10H─[29;11H─[29;12H─[29;13H─[29;14H─[29;15H─[29;16H─[29;17H─[29;18H─[29;19H─[29;20H─[29;21H─[29;22H─[29;23H─[29;24H─[29;25H─[29;26H─[29;27H─[29;28H─[29;29H─[29;30H─[29;31H─[29;32H─[29;33H─[29;34H─[29;35H─[29;36H─[29;37H─[29;38H─[29;39H─[29;40H─[29;41H─[29;42H─[29;43H─[29;44H─[29;45H─[29;46H─[29;47H─[29;48H─[29;49H─[29;50H─[29;51H─[29;52H─[29;53H─[29;54H─[29;55H─[29;56H─[29;57H─[29;58H─[29;59H─[29;60H─[29;61H─[29;62H─[29;63H─[29;64H─[29;65H─[29;66H─[29;67H─[29;68H─[29;69H─[29;70H─[29;71H─[29;72H─[29;73H─[29;74H─[29;75H─[29;76H─[29;77H─[29;78H─[29;79H─[29;80H─[29;81H─[29;82H─[29;83H─[29;84H─[29;85H─[29;86H─[29;87H─[29;88H─[29;89H─[29;90H─[29;91H─[29;92H─[29;93H─[29;94H─[29;95H─[29;96H─[29;97H─[29;98H─[29;99H┘[29;100H│[30;27H└[30;28H─[30;29H─[30;30H─[30;31H─[30;32H─[30;33H─[30;34H─[30;35H─[30;36H─[30;37H─[30;38H─[30;39H─[30;40H─[30;41H─[30;42H─[30;43H─[30;44H─[30;45H─[30;46H─[30;47H─[30;48H─[30;49H─[30;50H─[30;51H─[30;52H─[30;53H─[30;54H─[30;55H─[30;56H─[30;57H─[30;58H─[30;59H─[30;60H─[30;61H─[30;62H─[30;63H⋯[30;64H└[30;65H─[30;66H─[30;67H─[30;68H─[30;69H─[30;70H─[30;71H─[30;72H─[30;73H─[30;74H─[30;75H─[30;76H─[30;77H─[30;78H─[30;79H─[30;80H─[30;81H─[30;82H─[30;83H─[30;84H─[30;85H─[30;86H─[30;87H─[30;88H─[30;89H─[30;90H─[30;91H─[30;92H─[30;93H─[30;94H─[30;95H─[30;96H─[30;97H─[30;98H─[30;99H─[30;100H⋯[1;1H[?2026l[1;1H[?2026h[?25l[1;1H[?2026l[1;1H[?2026h[?25l[2;2H  w1[2;6H  [2;8H                  │[2;27H┌[2;28H─[2;29H pane p1 ─[2;39H─[2;40H─[2;41H─[2;42H─[2;43H─[2;44H─[2;45H─[2;46H─[2;47H─[2;48H─[2;49H─[2;50H─[2;51H─[2;52H─[2;53H─[2;54H─[2;55H─[2;56H─[2;57H─[2;58H─[2;59H─[2;60H─[2;61H─[2;62H─[2;63H┐[2;64H┌[2;65H─[2;66H pane p2 ─[2;76H─[2;77H─[2;78H─[2;79H─[2;80H─[2;81H─[2;82H─[2;83H─[2;84H─[2;85H─[2;86H─[2;87H─[2;88H─[2;89H─[2;90H─[2;91H─[2;92H─[2;93H─[2;94H─[2;95H─[2;96H─[2;97H─[2;98H─[2;99H─[3;2H [3;4Hw2[3;6H  [3;8H               [3;25H [3;26H│[3;27H│[3;28H  [3;30H  [3;32H  [3;34H  [3;36H  [3;38H  [3;40H  [3;42H  [3;44H  [3;46H  [3;48H  [3;50H  [3;52H [3;63H│[3;64H│[3;95H [3;96H [3;99H [4;2H [4;5H [4;6H  [4;8H  [4;10H [4;22H [4;25H [4;26H│[4;27H│[4;28H  [4;30H  [4;32H  [4;34H  [4;36H  [4;38H  [4;40H  [4;42H [4;63H│[4;64H│[4;95H [4;96H [4;99H [5;2H [5;5H [5;6H  [5;8H [5;22H [5;25H [5;26H│[5;27H│[5;63H│[5;64H│[5;95H [5;96H [5;99H [6;2H [6;5H [6;6H  [6;8H [6;22H [6;26H│[6;27H│[6;63H│[6;64H│[6;99H [7;2H [7;5H [7;6H  [7;8H  [7;10H  [7;12H  [7;14H  [7;16H  [7;18H  [7;20H [7;22H [7;26H│[7;27H│[7;63H│[7;64H│[7;99H [8;2H [8;5H [8;6H  [8;8H [8;22H [8;26H│[8;27H│[8;63H│[8;64H│[8;99H [9;2H [9;5H [9;6H  [9;8H  [9;10H [9;22H [9;26H│[9;27H│[9;63H│[9;64H│[9;99H [10;2H [10;22H [10;26H│[10;27H│[10;63H│[10;64H│[10;99H [11;2H [11;22H [11;26H│[11;27H│[11;63H│[11;64H│[11;99H [12;2H [12;22H [12;26H│[12;27H│[12;63H│[12;64H│[12;99H [13;2H [13;22H [13;26H│[13;27H│[13;63H│[13;64H│[13;99H [14;2H [14;22H [14;26H│[14;27H│[14;63H│[14;64H│[14;99H [15;2H [15;22H [15;26H│[15;27H│[15;63H│[15;64H│[15;99H [16;2H [16;22H [16;26H│[16;27H│[16;63H│[16;64H│[16;99H [17;2H [17;22H [17;26H│[17;27H│[17;63H│[17;64H│[17;99H [18;2H [18;22H [18;26H│[18;27H│[18;63H│[18;64H│[18;99H [19;2H [19;22H [19;26H│[19;27H│[19;63H│[19;64H│[19;99H [20;2H [20;22H [20;26H│[20;27H│[20;63H│[20;64H│[20;99H [21;2H [21;22H [21;26H│[21;27H│[21;63H│[21;64H│[21;99H [22;2H [22;22H [22;26H│[22;27H│[22;63H│[22;64H│[22;99H [23;2H [23;22H [23;26H│[23;27H│[23;63H│[23;64H│[23;99H [24;2H [24;22H [24;26H│[24;27H│[24;63H│[24;64H│[24;99H [25;2H [25;4H                      │[25;27H│[25;28H                                   │[25;64H│[25;65H                                 [25;99H [26;2H [26;4H    [26;8H  [26;10H  [26;12H        [26;20H  [26;22H  [26;24H  [26;26H│[26;27H│[26;28H      [26;34H  [26;36H  [26;38H  [26;40H [26;63H│[26;64H│[26;99H [27;2H [27;26H│[27;27H│[27;63H│[27;64H│[27;99H [28;2H [28;26H│[28;27H│[28;63H│[28;64H│[28;99H [29;2H                        │[29;27H│[29;28H                                   │[29;64H│[29;65H                                   [3;28H[2 q[?25h[?2026l[3;28H[?2026h[?25l[30;63H┘[3;28H[?25h[?2026l[3;28H[?2026h[?25l[3;28Hcopy[3;33Hme[3;35H[?25h[?2026l[3;35H]52;c;Y29weQ==

 ❯ src/modes/SettingsDialog.test.ts:202:31
    200|     h.io.type("\x1b[<0;28;3M\x1b[<32;32;3M\x1b[<0;32;3m");
    201|     expect(h.app.mouse.selection).not.toBeNull();
    202|     expect(h.io.output()).not.toContain("\x1b]52;");
       |                               ^
    203|   });
    204|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=82c8b56eea2f9705 after=82c8b56eea2f9705 IDENTICAL

===== rv4-alt-bf (2026-09-28T07:06:27)
mutation: src/modes/TextInput.ts
  - '    if (k.alt && !k.ctrl && !k.meta && (k.key === "b" || k.key === "f")) {'
  + '    if (false) {'
command: (cd packages/tui && npx vitest run src/modes/overlays.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/modes/overlays.test.ts > 入力欄の Alt+B・Alt+F（readline。04 review） > 語の頭へ戻り、語の終わりへ進む（空白・記号は飛ばす）
AssertionError: expected 15 to be 12 // Object.is equality

- Expected
+ Received

- 12
+ 15

 ❯ src/modes/overlays.test.ts:423:26
    421|     const input = new TextInput("foo bar-baz qux");
    422|     input.handleKey(key("alt+b"));
    423|     expect(input.cursor).toBe(12); // qux の頭
       |                          ^
    424|     input.handleKey(key("alt+b"));
    425|     expect(input.cursor).toBe(8); // baz の頭

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=e47c20e70df068ef after=e47c20e70df068ef IDENTICAL

===== rv6-paste-unavailable (2026-09-28T07:06:30)
mutation: src/actions/TuiDispatcher.ts
  - '      if (text === null) this.ui.toast(PASTE_UNAVAILABLE);\n      else if'
  + '      if'
command: (cd packages/tui && npx vitest run src/actions/TuiDispatcher.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/actions/TuiDispatcher.test.ts > TuiDispatcher — グループ > メニューの貼り付け：空なら黙って何もしない。読めなければ外側の端末の貼り付けを案内する。読めたら貼る
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "p1",
      null,
    ]


Number of calls: 1

 ❯ src/actions/TuiDispatcher.test.ts:916:34
    914|     h.d.pasteIntoPane("p1");
    915|     await flush();
    916|     expect(h.host.pasteText).not.toHaveBeenCalled();
       |                                  ^
    917|     expect(h.ui.toasts.map((t) => t.message)).toEqual([PASTE_UNAVAILAB…
    918|     h.host.readClipboard.mockResolvedValueOnce("abc");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=952ee89b6bd65dbc after=952ee89b6bd65dbc IDENTICAL

===== rv8-throttle (2026-09-28T07:06:34)
mutation: src/input/mouse.ts
  - '        else if (drag.pending !== null && drag.timer === null)'
  + '        else if (this.flushRatio(drag), false)'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > 04 review（リンク・境界の送り方） > 境界のドラッグの比率は 50ms 間隔にまとめて送り、離したら最後の値をすぐ送る
AssertionError: expected [ { id: '7', …(2) }, …(9) ] to have a length of +0 but got 10

- Expected
+ Received

- 0
+ 10

 ❯ src/input/mouse.r2.test.ts:334:53
    332|     h.io.type(down(63, 10));
    333|     for (let x = 62; x > 52; x--) h.io.type(drag(x, 10));
    334|     expect(h.ws.requests("layout.set_split_ratio")).toHaveLength(0);
       |                                                     ^
    335|     await new Promise((r) => setTimeout(r, 80));
    336|     expect(h.ws.requests("layout.set_split_ratio")).toHaveLength(1);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=82c8b56eea2f9705 after=82c8b56eea2f9705 IDENTICAL

===== rv8-final-on-release (2026-09-28T07:06:39)
mutation: src/input/mouse.ts
  - '        if (done) this.flushRatio(drag);\n        else if'
  + '        if (false) this.flushRatio(drag);\n        else if'
command: (cd packages/tui && npx vitest run src/input/mouse.r2.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/input/mouse.r2.test.ts > マウス（04 ラウンド 2） > 境界は掴んだだけでは動かさず、掴んだ位置との差を保って動かす
TypeError: Cannot read properties of undefined (reading 'params')
 ❯ src/input/mouse.r2.test.ts:42:61
     40|     h.io.type(down(62, 10) + drag(52, 10) + up(52, 10));
     41|     // 境界（63）から 1 桁左を掴んだので、境界は 52+1=53 へ。
     42|     const r = h.ws.requests("layout.set_split_ratio").at(-1)!.params a…
       |                                                             ^
     43|     expect(r.ratio).toBeCloseTo((53 - 26) / 74);
     44|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  src/input/mouse.r2.test.ts > 04 review（リンク・境界の送り方） > 境界のドラッグの比率は 50ms 間隔にまとめて送り、離したら最後の値をすぐ送る
AssertionError: expected [ { id: '7', …(2) } ] to have a length of 2 but got 1

- Expected
+ Received

- 2
+ 1

 ❯ src/input/mouse.r2.test.ts:339:17
    337|     h.io.type(drag(50, 10) + up(50, 10));
    338|     const all = h.ws.requests("layout.set_split_ratio");
    339|     expect(all).toHaveLength(2);
       |                 ^
    340|     expect((all[1]!.params as { ratio: number }).ratio).toBeCloseTo((5…
    341|   });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯

restored: sha256 before=82c8b56eea2f9705 after=82c8b56eea2f9705 IDENTICAL

===== rv2r2-cell-urlid (セルのリンクを見ずに最後のリンクを当てる＝位置だけで覚えるのと同じ誤り) (2026-09-28T07:28:57)
mutation: src/term/PaneTerminal.ts
  - '      const id = cell.extended?.urlId;'
  + '      const id = (core._oscLinkService as unknown as { _dataByLinkId?: Map<number, unknown> })._dataByLinkId?.size ?? cell.extended?.urlId;'
command: (cd packages/tui && npx vitest run src/term/PaneTerminal.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/PaneTerminal.test.ts > OSC 8 のハイパーリンク（今見えている文字がそのリンクで書かれた文字のときだけ。04 review ラウンド 2） > リンクの中で書いた文字だけ。前後の文字には付かない
AssertionError: expected 'https://x.example/' to be null

- Expected:
null

+ Received:
"https://x.example/"

 ❯ src/term/PaneTerminal.test.ts:130:33
    128|     t.output(e(`ab${link("https://x.example/", "click")} tail`));
    129|     await t.flush();
    130|     expect(t.hyperlinkAt(0, 1)).toBeNull();
       |                                 ^
    131|     expect(t.hyperlinkAt(0, 2)).toBe("https://x.example/");
    132|     expect(t.hyperlinkAt(0, 6)).toBe("https://x.example/");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  src/term/PaneTerminal.test.ts > OSC 8 のハイパーリンク（今見えている文字がそのリンクで書かれた文字のときだけ。04 review ラウンド 2） > 上書き（\r の後の書き直し・画面の消去）で外れる
AssertionError: expected 'https://evil.example/y' to be null

- Expected:
null

+ Received:
"https://evil.example/y"

 ❯ src/term/PaneTerminal.test.ts:141:33
    139|     t.output(e(`${link("https://evil.example/y", "progress")}\rDONE!!!…
    140|     await t.flush();
    141|     expect(t.hyperlinkAt(0, 2)).toBeNull();
       |                                 ^
    142|     t.output(e(`\r\n${link("https://evil.example/x", "click")}\x1b[H\x…
    143|     await t.flush();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  src/term/PaneTerminal.test.ts > OSC 8 のハイパーリンク（今見えている文字がそのリンクで書かれた文字のときだけ。04 review ラウンド 2） > 代替画面のリンクは通常の画面と別（代替画面の文字に通常の画面のリンクを当てない）
AssertionError: expected 'https://evil.example/z' to be null

- Expected:
null

+ Received:
"https://evil.example/z"

 ❯ src/term/PaneTerminal.test.ts:155:33
    153|     await t.flush();
    154|     expect(t.term.buffer.active.type).toBe("alternate");
    155|     expect(t.hyperlinkAt(0, 2)).toBeNull();
       |                                 ^
    156|     t.output(e("\x1b[?1049l"));
    157|     await t.flush();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯

 FAIL  src/term/PaneTerminal.test.ts > OSC 8 のハイパーリンク（今見えている文字がそのリンクで書かれた文字のときだけ。04 review ラウンド 2） > 開いてから閉じるまでにカーソルが動いても、その間に書いていない行には付かない
AssertionError: expected 'https://evil.example/w' to be null

- Expected:
null

+ Received:
"https://evil.example/w"

 ❯ src/term/PaneTerminal.test.ts:167:33
    165|     await t.flush();
    166|     expect(t.hyperlinkAt(0, 0)).toBe("https://evil.example/w");
    167|     expect(t.hyperlinkAt(1, 2)).toBeNull();
       |                                 ^
    168|     expect(t.hyperlinkAt(2, 1)).toBeNull();
    169|     t.dispose();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/5]⎯

 FAIL  src/term/PaneTerminal.test.ts > OSC 8 のハイパーリンク（今見えている文字がそのリンクで書かれた文字のときだけ。04 review ラウンド 2） > 大きさを変えて折り返し直すと、リンクは文字と一緒に動く
AssertionError: expected 'https://a.example/' to be null
restored: sha256 before=6a5af5e0000df819 after=6a5af5e0000df819 IDENTICAL

===== rv2r2-active-buffer (代替画面でも通常の画面のバッファを見る) (2026-09-28T07:29:07)
mutation: src/term/PaneTerminal.ts
  - '      const buffer = core?.buffer;'
  + '      const buffer = (core as unknown as { buffers?: { normal?: XtermCore["buffer"] } })?.buffers?.normal ?? core?.buffer;'
command: (cd packages/tui && npx vitest run src/term/PaneTerminal.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/PaneTerminal.test.ts > OSC 8 のハイパーリンク（今見えている文字がそのリンクで書かれた文字のときだけ。04 review ラウンド 2） > 代替画面のリンクは通常の画面と別（代替画面の文字に通常の画面のリンクを当てない）
AssertionError: expected 'https://evil.example/z' to be null

- Expected:
null

+ Received:
"https://evil.example/z"

 ❯ src/term/PaneTerminal.test.ts:155:33
    153|     await t.flush();
    154|     expect(t.term.buffer.active.type).toBe("alternate");
    155|     expect(t.hyperlinkAt(0, 2)).toBeNull();
       |                                 ^
    156|     t.output(e("\x1b[?1049l"));
    157|     await t.flush();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯

restored: sha256 before=6a5af5e0000df819 after=6a5af5e0000df819 IDENTICAL

===== rv2r2-id-zero-guard (等価の変異の確認：id 0 は getLinkData が無いので同じ結果) (2026-09-28T07:29:15)
mutation: src/term/PaneTerminal.ts
  - '      if (typeof id !== "number" || id === 0) return null;'
  + '      if (typeof id !== "number") return null;'
command: (cd packages/tui && npx vitest run src/term/PaneTerminal.test.ts)  exit=0
raw output:
      Tests  14 passed (14)
restored: sha256 before=6a5af5e0000df819 after=6a5af5e0000df819 IDENTICAL

===== rv2r2-revert-fix（PaneTerminal.ts を直す前〔HEAD fcb94c3 以降の始まりと終わりの位置で覚える形〕に戻す） (2026-09-28T07:29:39+09:00)
command: (cd packages/tui && npx vitest run src/term/PaneTerminal.test.ts)  exit=1
raw output:
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 4 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  src/term/PaneTerminal.test.ts > OSC 8 のハイパーリンク（今見えている文字がそのリンクで書かれた文字のときだけ。04 review ラウンド 2） > 上書き（\r の後の書き直し・画面の消去）で外れる
AssertionError: expected 'https://evil.example/y' to be null

- Expected:
null

+ Received:
"https://evil.example/y"

 ❯ src/term/PaneTerminal.test.ts:141:33
    139|     t.output(e(`${link("https://evil.example/y", "progress")}\rDONE!!!…
    140|     await t.flush();
    141|     expect(t.hyperlinkAt(0, 2)).toBeNull();
       |                                 ^
    142|     t.output(e(`\r\n${link("https://evil.example/x", "click")}\x1b[H\x…
    143|     await t.flush();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/4]⎯

 FAIL  src/term/PaneTerminal.test.ts > OSC 8 のハイパーリンク（今見えている文字がそのリンクで書かれた文字のときだけ。04 review ラウンド 2） > 代替画面のリンクは通常の画面と別（代替画面の文字に通常の画面のリンクを当てない）
AssertionError: expected 'https://evil.example/z' to be null

- Expected:
null

+ Received:
"https://evil.example/z"

 ❯ src/term/PaneTerminal.test.ts:155:33
    153|     await t.flush();
    154|     expect(t.term.buffer.active.type).toBe("alternate");
    155|     expect(t.hyperlinkAt(0, 2)).toBeNull();
       |                                 ^
    156|     t.output(e("\x1b[?1049l"));
    157|     await t.flush();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/4]⎯

 FAIL  src/term/PaneTerminal.test.ts > OSC 8 のハイパーリンク（今見えている文字がそのリンクで書かれた文字のときだけ。04 review ラウンド 2） > 開いてから閉じるまでにカーソルが動いても、その間に書いていない行には付かない
AssertionError: expected 'https://evil.example/w' to be null

- Expected:
null

+ Received:
"https://evil.example/w"

 ❯ src/term/PaneTerminal.test.ts:167:33
    165|     await t.flush();
    166|     expect(t.hyperlinkAt(0, 0)).toBe("https://evil.example/w");
    167|     expect(t.hyperlinkAt(1, 2)).toBeNull();
       |                                 ^
    168|     expect(t.hyperlinkAt(2, 1)).toBeNull();
    169|     t.dispose();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/4]⎯

 FAIL  src/term/PaneTerminal.test.ts > OSC 8 のハイパーリンク（今見えている文字がそのリンクで書かれた文字のときだけ。04 review ラウンド 2） > 大きさを変えて折り返し直すと、リンクは文字と一緒に動く
AssertionError: expected null to be 'https://a.example/' // Object.is equality

- Expected:
"https://a.example/"

+ Received:
null

 ❯ src/term/PaneTerminal.test.ts:186:51
    184|     }
    185|     expect(found).not.toBeNull();
    186|     expect(t.hyperlinkAt(found!.row, found!.col)).toBe("https://a.exam…
       |                                                   ^
    187|     expect(t.hyperlinkAt(found!.row, found!.col - 1)).toBeNull();
    188|     t.dispose();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/4]⎯


 Test Files  1 failed (1)
restored: sha256 before=6a5af5e0000df819 after=6a5af5e0000df819 IDENTICAL
```

## 起動確認（smoke）
subtask では打たない（親の統合 test で打つ）。

## 未検証の穴（skip / 環境不足）
- Windows（リンクの `rundll32` の起動・ConPTY・Windows Terminal の入力）。
- 実際の端末エミュレータでのマウスの見た目・操作感。
