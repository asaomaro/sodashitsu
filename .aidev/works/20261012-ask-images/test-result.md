# 検証記録

Web/server/TUIを含む全体build/typecheck成功（最終再実行も後述）。対象9ファイル95テストpass。端末版起動配線で日本語入力保持・ask.answer返却、画像base→graph持ち越しなし、セル画素応答のpane漏れなしを確認。

ブラウザ実表示：通常/成果物付きask-formのリサイズ・最大化・復元・入力保持・回答返却は2 pass。画像Sixel/iTerm2/KittyとCSPは5 pass。pnpm smoke PASS。

最初の全体テストはsandbox内でソケット拒否が出たため中止しsandbox外へ。全体チェックで通常末尾ESC遅延を検出し修正した。TerminalHost/Sixel/WindowOverlayの42テストpass。

## 回帰の陰性対照

修正だけを除いた6ファイルで実行し10テストが失敗。復元後の各ファイルをbyte-for-byte比較し一致を確認。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/client-core| src/imageCodec.test.ts (5 tests | 1 failed) 35ms
   × clips the last sixel band to declared raster height 11ms
 ❯ |@sodashitsu/server| src/terminal/SixelGraphics.test.ts (4 tests | 3 failed) 44ms
   × keeps ordinary DCS and split ESC sequences, and discards aborted or over-limit images 15ms
   × recognizes C1 ST without consuming following text 11ms
   × does not delay a trailing ESC and cancels its emitted prefix if the next chunk is Sixel 3ms
 ❯ |@sodashitsu/server| src/terminal/TerminalHost.test.ts (26 tests | 1 failed) 226ms
   ❯ DefaultTerminalHost と Kitty graphics（20260926-kitty-graphics の AC1・AC3・AC7・AC12） (5)
     × 画像を含まない出力は、割れた ESC も含め、元の文字列のままミラーとブラウザの両方へ渡る 13ms
 ❯ |@sodashitsu/tui| src/modes/AskController.test.ts (3 tests | 1 failed) 11ms
   × cancels active interactions once when a form opens 4ms
 ❯ |@sodashitsu/tui| src/modes/AskFormDialog.test.ts (2 tests | 1 failed) 20ms
   × keeps the editing cursor and tail visible after a narrow resize 7ms
 ❯ |@sodashitsu/tui| src/modes/WindowOverlay.test.ts (12 tests | 2 failed) 43ms
   × restores maximized state when a resize drag is cancelled 10ms
   × interrupts an active window drag without cancelling the dialog or losing its initial size 2ms
 ❯ |@sodashitsu/tui| src/app/TuiApp.askImages.test.ts (2 tests | 1 failed) 304ms
   × clears pane image placements when switching to graph and consumes cell pixel reports locally 117ms

⎯⎯⎯⎯⎯⎯ Failed Tests 10 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/client-core| src/imageCodec.test.ts > clips the last sixel band to declared raster height
AssertionError: expected 18 to be 17 // Object.is equality

- Expected
+ Received

- 17
+ 18

 ❯ src/imageCodec.test.ts:40:20
     38| it("clips the last sixel band to declared raster height", () => {
     39|   const r = decodeSixel('"1;1;9;17#1;2;100;0;0!9~-!9~-!9~');
     40|   expect(r.height).toBe(17);
       |                    ^
     41|   expect(r.rgba.length).toBe(9 * 17 * 4);
     42| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/10]⎯

 FAIL  |@sodashitsu/server| src/terminal/SixelGraphics.test.ts > keeps ordinary DCS and split ESC sequences, and discards aborted or over-limit images
AssertionError: expected [] to deeply equal [ { kind: 'text', text: '\u001b' } ]

- Expected
+ Received

- [
-   {
-     "kind": "text",
-     "text": "",
-   },
- ]
+ []

 ❯ src/terminal/SixelGraphics.test.ts:17:29
     15|   const t = new SixelGraphicsTranslator();
     16|   expect(t.process("\x1bP1$r\x1b\\")).toEqual([{ kind: "text", text: "…
     17|   expect(t.process("\x1b")).toEqual([{ kind: "text", text: "\x1b" }]);
       |                             ^
     18|   expect(t.process("[31mX")).toEqual([{ kind: "text", text: "[31mX" }]…
     19|   expect(t.process("\x1bPq!999999~\x1b\\ok")).toEqual([{ kind: "text",…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/10]⎯

 FAIL  |@sodashitsu/server| src/terminal/SixelGraphics.test.ts > recognizes C1 ST without consuming following text
AssertionError: expected [] to deeply equal [ { kind: 'text', …(1) } ]

- Expected
+ Received

- [
-   {
-     "kind": "text",
-     "text": "P1$r\\prompt",
-   },
- ]
+ []

 ❯ src/terminal/SixelGraphics.test.ts:24:43
     22| it("recognizes C1 ST without consuming following text", () => {
     23|   const t = new SixelGraphicsTranslator();
     24|   expect(t.process("\x1bP1$r\x9cprompt")).toEqual([{ kind: "text", tex…
       |                                           ^
     25|   expect(t.process("\x90q#1;2;100;0;0!9~\x9cafter")[1]).toEqual({ kind…
     26| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/10]⎯

 FAIL  |@sodashitsu/server| src/terminal/SixelGraphics.test.ts > does not delay a trailing ESC and cancels its emitted prefix if the next chunk is Sixel
AssertionError: expected [ { kind: 'text', text: 'text' } ] to deeply equal [ Array(1) ]

- Expected
+ Received

  [
    {
      "kind": "text",
-     "text": "text",
+     "text": "text",
    },
  ]

 ❯ src/terminal/SixelGraphics.test.ts:29:33
     27| it("does not delay a trailing ESC and cancels its emitted prefix if th…
     28|   const t = new SixelGraphicsTranslator();
     29|   expect(t.process("text\x1b")).toEqual([{ kind: "text", text: "text\x…
       |                                 ^
     30|   const out = t.process("Pq#1;2;100;0;0!9~\x1b\\");
     31|   expect(out[0]).toEqual({ kind: "text", text: "\x18" });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[4/10]⎯

 FAIL  |@sodashitsu/server| src/terminal/TerminalHost.test.ts > DefaultTerminalHost と Kitty graphics（20260926-kitty-graphics の AC1・AC3・AC7・AC12） > 画像を含まない出力は、割れた ESC も含め、元の文字列のままミラーとブラウザの両方へ渡る
AssertionError: expected [ 'hello ', …(3) ] to deeply equal [ 'hello \u001b', …(3) ]

- Expected
+ Received

  [
-   "hello ",
-   "[31mred_",
+   "hello ",
+   "[31mred_",
    "Xignored\\",
    "]0;tend",
  ]

 ❯ src/terminal/TerminalHost.test.ts:262:20
    260|       pty.output(chunk);
    261|     await vi.advanceTimersByTimeAsync(10);
    262|     expect(client).toEqual(["hello \x1b", "[31mred\x1b_", "Xignored\x1…
       |                    ^
    263|     expect(mirror).toEqual(client);
    264|     expect(pty.writes).toEqual([]);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[5/10]⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.askImages.test.ts > clears pane image placements when switching to graph and consumes cell pixel reports locally
AssertionError: expected '\u001b[?2026h\u001b[?25l\u001b[0m\u00…' not to contain '\u001bP0;1q'

Expected: "P0;1q"
Received: "[?2026h[?25l[0m[2J[1;1H[0;38;2;248;248;242;48;2;40;42;54m 端[1;4H末[1;6H [0;38;2;248;248;242;48;2;68;71;90mグ[1;9Hラ[1;11Hフ[1;13H[0;38;2;248;248;242;48;2;40;42;54m 状[1;16H況[1;18H 予[1;21H約[1;23H   [0;38;2;68;71;90;48;2;40;42;54m│[1;27H[0;1;38;2;248;248;242;48;2;68;71;90m t1 [0;38;2;248;248;242;48;2;30;31;41m [0;38;2;248;248;242;48;2;68;71;90m + [0;38;2;248;248;242;48;2;30;31;41m                                         [0;38;2;248;248;242;48;2;68;71;90m[ビ[1;79Hュ[1;81Hー[1;83H＋[1;85H][0;38;2;248;248;242;48;2;30;31;41m session: work [2;1H[0;38;2;248;248;242;48;2;40;42;54m [0;2;38;2;248;248;242;48;2;40;42;54m▾[2;3H Spaces[0;38;2;248;248;242;48;2;40;42;54m     [0;4;38;2;248;248;242;48;2;40;42;54m開[2;17Hい[2;19Hた[2;21H順[2;23H[0;38;2;248;248;242;48;2;40;42;54m   [0;38;2;68;71;90;48;2;40;42;54m│[2;27H[0;38;2;248;248;242;48;2;40;42;54m グ[2;30Hラ[2;32Hフ[2;34H ·[2;36H 稼[2;39H働[2;41H ·[2;43H 0ノ[2;47Hー[2;49Hド[2;51H / 0線[2;57H                [0;38;2;248;248;242;48;2;68;71;90m[ ペ[2;77Hイ[2;79Hン[2;81H追[2;83H加[2;85H ][0;38;2;248;248;242;48;2;40;42;54m [0;38;2;248;248;242;48;2;68;71;90m[ 連[2;92H携[2;94H設[2;96H定[2;98H ][0;38;2;248;248;242;48;2;40;42;54m [3;1H[0;38;2;248;248;242;48;2;68;71;90m [0;1;38;2;248;248;242;48;2;68;71;90m [0;38;2;248;248;242;48;2;68;71;90m [0;38;2;138;154;208;48;2;68;71;90m [0;38;2;248;248;242;48;2;68;71;90m [0;1;38;2;248;248;242;48;2;68;71;90mw1[0;38;2;248;248;242;48;2;68;71;90m                  [0;38;2;68;71;90;48;2;40;42;54m│[3;27H[0;38;2;248;248;242;48;2;40;42;54m [0;38;2;255;184;108;48;2;40;42;54mノ[3;30Hー[3;32Hド[3;34Hは[3;36Hあ[3;38Hり[3;40Hま[3;42Hせ[3;44Hん[3;46H[0;38;2;248;248;242;48;2;40;42;54m                                                       [4;1H   [0;38;2;138;154;208;48;2;40;42;54m [0;38;2;248;248;242;48;2;40;42;54m w2                  [0;38;2;68;71;90;48;2;40;42;54m│[4;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [5;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[5;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [6;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[6;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [7;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[7;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [8;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[8;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [9;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[9;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [10;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[10;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [11;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[11;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [12;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[12;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [13;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[13;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [14;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[14;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [15;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[15;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [16;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[16;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [17;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[17;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [18;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[18;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [19;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[19;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [20;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[20;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [21;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[21;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [22;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[22;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [23;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[23;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [24;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[24;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [25;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[25;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [26;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[26;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [27;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[27;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [28;1H                         [0;38;2;68;71;90;48;2;40;42;54m│[28;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [29;1H ＋[29;4H新[29;6H規[29;8H ⋯[29;10H           🔔[29;23H0  [0;38;2;68;71;90;48;2;40;42;54m│[29;27H[0;38;2;248;248;242;48;2;40;42;54m                                                                          [30;1H                       [0;38;2;248;248;242;48;2;68;71;90m«[30;25H[0;38;2;248;248;242;48;2;40;42;54m [0;38;2;68;71;90;48;2;40;42;54m│[30;27H[0;38;2;248;248;242;48;2;40;42;54mタ[30;29Hグ[30;31H選[30;33H択[30;35H ·[30;37H a ペ[30;42Hイ[30;44Hン[30;46H追[30;48H加[30;50H ·[30;52H l 連[30;57H携[30;59H ·[30;61H t タ[30;66Hブ[30;68H ·[30;70H D&D 移[30;77H動[30;79H ·[30;81H Tab 選[30;88H択[30;90H ·[30;92H ↑[30;94H↓[30;95H←[30;96H→[30;97H 移[30;100H [0m[1;1H7[3;28HP0;1q"1;1;18;17#224;2;100;0;0#224!18~$-#224!18~$-#224!18^$\8[?2026l[1;1H"

 ❯ src/app/TuiApp.askImages.test.ts:57:38
     55|   h.app.ui.setScreen("graph");
     56|   h.app.renderNow();
     57|   expect(h.io.output().slice(n)).not.toContain("\x1bP0;1q");
       |                                      ^
     58|   const sent = h.ws.sent.filter((x) => x instanceof Uint8Array).length;
     59|   h.io.type("\x1b[6;20;10t");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[6/10]⎯

 FAIL  |@sodashitsu/tui| src/modes/AskController.test.ts > cancels active interactions once when a form opens
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/modes/AskController.test.ts:51:18
     49|   c.onOpened();
     50|   await settle();
     51|   expect(onShow).toHaveBeenCalledOnce();
       |                  ^
     52| });
     53|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[7/10]⎯

 FAIL  |@sodashitsu/tui| src/modes/AskFormDialog.test.ts > keeps the editing cursor and tail visible after a narrow resize
AssertionError: expected ' │ 回答: abcdefghijabcdefgh │ ' to contain 'END'

Expected: "END"
Received: " │ 回答: abcdefghijabcdefgh │ "

 ❯ src/modes/AskFormDialog.test.ts:64:35
     62|   const grid = new Grid(30, 18);
     63|   const cursor = d.render({ grid, theme: new ThemeColors("dracula") });
     64|   expect(grid.rowText(cursor!.y)).toContain("END");
       |                                   ^
     65|   expect(cursor!.x).toBeLessThan(29);
     66| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[8/10]⎯

 FAIL  |@sodashitsu/tui| src/modes/WindowOverlay.test.ts > restores maximized state when a resize drag is cancelled
AssertionError: expected ' ┌─ MAX ─────────────────────────────…' to contain '[▣]'

Expected: "[▣]"
Received: " ┌─ MAX ──────────────────────────────────────────────────────────────────────────────────────[□]─┐                     "

 ❯ src/modes/WindowOverlay.test.ts:274:38
    272|   win.handleMouse({ action: "move", button: 32, x: 90, y: 35 });
    273|   win.handleKey(chordToKeyInput("esc"));
    274|   expect(render(120, 50).rowText(1)).toContain("[▣]");
       |                                      ^
    275|   expect(render(120, 50).rowText(48)).toContain("┘");
    276| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[9/10]⎯

 FAIL  |@sodashitsu/tui| src/modes/WindowOverlay.test.ts > interrupts an active window drag without cancelling the dialog or losing its initial size
AssertionError: expected '                                     …' to contain 'TEST'

Expected: "TEST"
Received: "                                                                                                    "

 ❯ src/modes/WindowOverlay.test.ts:278:301


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[10/10]⎯


 Test Files  7 failed (7)
      Tests  10 failed | 44 passed (54)
   Start at  22:01:39
   Duration  3.83s (transform 79%, import 15%, tests 5%)

  Transform  |@sodashitsu/tui| transforming modules took 9.06s · 81% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

Web最大化のmax-width修正のみを外してWebを再buildしてE2Eを実行。UA幅制限で失敗することを確認した。修正版を復元しcmpで一致を確認。

```text

Running 1 test using 1 worker

(node:982697) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-12T13:03:42.954Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T13:03:42.954Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-kfZIB9/commands.json","count":0}
{"ts":"2026-10-12T13:03:44.456Z","level":"info","msg":"ask opened","askId":"4d14c2a1e645e4ac2dd7763117d386bd","paneId":"aad5fa31-6211-40aa-87b5-c05aa3e4c679","questions":1,"media":0}
{"ts":"2026-10-12T13:03:48.854Z","level":"info","msg":"ask closed","askId":"4d14c2a1e645e4ac2dd7763117d386bd","paneId":"aad5fa31-6211-40aa-87b5-c05aa3e4c679","status":"cancelled"}
  ✘  1 src/specs/ask-form.spec.ts:848:1 › 質問窓はリサイズ・最大化・復元しても入力を保持する (6.2s)


  1) src/specs/ask-form.spec.ts:848:1 › 質問窓はリサイズ・最大化・復元しても入力を保持する ──────────────────────────────────

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: 1264
    Received: 1242

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      870 |   await expect
      871 |     .poll(async () => (await win.boundingBox())!.width)
    > 872 |     .toBe(page.viewportSize()!.width - 16);
          |      ^
      873 |   await expect(field).toHaveValue("保持する本文");
      874 |   await win.getByRole("button", { name: "元のサイズに戻す", exact: true }).click();
      875 |   await expect.poll(async () => (await win.boundingBox())!.width).toBe(resized.width);
        at /workspaces/sodashitsu/packages/e2e/src/specs/ask-form.spec.ts:872:6

    Error Context: test-results/ask-form-質問窓はリサイズ・最大化・復元しても入力を保持する/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/ask-form-質問窓はリサイズ・最大化・復元しても入力を保持する/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/ask-form-質問窓はリサイズ・最大化・復元しても入力を保持する/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/ask-form.spec.ts:848:1 › 質問窓はリサイズ・最大化・復元しても入力を保持する ───────────────────────────────────
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test ask-form.spec.ts --grep リサイズ・最大化

```

## 最終チェック

全体build/typecheck成功。全体vitestは626ファイル、10673 pass / 1 fail。失敗はaskに追加したresizeボタンに対する既存DOM形状の期待が古いものだった。AskDialog.test.tsを新構造へ更新し、当該AskDialog・form・Sidebarとnative6種類の関連250テストはpass。追加native6種類・multi customの4テストもpass。製品側の残るテスト失敗はない。

最終ブラウザask最大化/リサイズ2 pass、画像プロトコル/CSP5 pass、smoke PASS。独立レビューは全指摘の修正を確認し追加重大指摘なし。
