# 検証

- 先行メニュー・Statusline対象テスト: 151件、追加journey37件が通過。
- グラフ/端末窓/状況画面/WindowOverlay/アプリ操作: 23件通過（/tmp/graph-terminal-target.log）。
- pnpm typecheck / pnpm build: 全パッケージ通過（/tmp/header-graph-types.log、/tmp/header-graph-build.log）。
- 初回全体: 10599 pass / 4 fail。メニュー増加分の古い期待値1件を更新。拡張一覧3件は実行元PJに手元の.sodaが配置されたことによる外部設定混入。結合テストのデフォルトPJを専用tempへ指定して隔離した（ユーザーの設定は変更していない）。
- 最終全体: 614ファイル/10610テスト通過、1 skipped。実PTY起動suiteのみ開始前のdist freshnessチェックで停止（負の対照で復元したsrcのmtimeがdistを超えた）。端末をforce rebuildし同suiteを単独再実行。
- 最終Web E2E: 4件通過（/tmp/header-menu-colors-e2e.log）。
- GraphTerminal最終: 6件通過（/tmp/graph-terminal-final.log）。

## 負の対照: Esc・狭幅ボタンの修正前挙動

直した条件だけを戻して実行し、失敗を確認。実行後に最終ファイルとバイト一致で復元。

```text
FAIL  |@sodashitsu/tui| src/modes/GraphTerminal.test.ts > Escape belongs to the terminal; delayed navigation never overwrites another dialog
AssertionError: expected "vi.fn()" to be called with arguments: [ 'p1', '\u001b' ]

Number of calls: 0

 ❯ src/modes/GraphTerminal.test.ts:148:19
    146|   await vi.waitFor(() => expect(request).toHaveBeenCalledWith("pane.su…
    147|   k.window.handleKeyEvent({ key: chordToKeyInput("Esc")!, raw: "\x1b" …
    148|   expect(k.input).toHaveBeenCalledWith("p1", "\x1b");
       |                   ^
    149|   expect(k.ui.dialogContext?.kind).toBe("graphTerminal");
    150|   k.window.handleKeyEvent({ key: { ...chordToKeyInput("Enter")!, ctrl:…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/tui| src/modes/GraphTerminal.test.ts > keeps both footer buttons visible and clickable at the minimum window width
AssertionError: expected '                        \n ┌─ 端末 · pa…' to contain '[ 閉じる ]'

- Expected
+ Received

- [ 閉じる ]
+                         
+  ┌─ 端末 · pane p1 ───┐ 
+  │ 接続中…            │ 
+  │                    │ 
+  │                    │ 
+  │                    │ 
+  │                    │ 
+  │                    │ 
+  │                    │ 
+  │ [ 端末へ移動 ]  [ 閉 
+  └────────────────────┘ 
+                         

 ❯ src/modes/GraphTerminal.test.ts:166:28
    164|   const lines = Array.from({ length: grid.h }, (_, y) => grid.rowText(…
    165|   expect(lines.join("\n")).toContain("[ 端末へ移動 ]");
    166|   expect(lines.join("\n")).toContain("[ 閉じる ]");
       |                            ^
    167|   const y = lines.findIndex((s) => s.includes("[ 閉じる ]"));
    168|   window.handleMouse({ action: "down", button: 0, x: 4, y });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯
```

## 負の対照: 遅延goの修正前挙動

直した条件だけを戻して実行し、失敗を確認。実行後に最終ファイルとバイト一致で復元。

```text
FAIL  |@sodashitsu/tui| src/modes/GraphTerminal.test.ts > Escape belongs to the terminal; delayed navigation never overwrites another dialog
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "p1",
    ]


Number of calls: 1

 ❯ src/modes/GraphTerminal.test.ts:155:23
    153|   detachResolve();
    154|   await new Promise((resolve) => setTimeout(resolve, 0));
    155|   expect(k.focus).not.toHaveBeenCalled();
       |                       ^
    156|   expect(k.ui.dialogContext?.kind).toBe("help");
    157|   expect(k.ui.screen).toBe("graph");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯
```

## 最終確認

実PTY起動suiteの再実行は1件通過（/tmp/tui-windows-pty.log）。全体で発生した失敗はすべて切り分け・修正・該当試験の再実行を完了。Web E2E4件、GraphTerminal6件通過。git diff --check通過。

稼働サーバをhandoffし8実PTYを維持。モデル11pane、graph11node、ファイル一覧APIが反映前後で継続。端末クライアントは切り離してsodaを再起動する必要がある。
