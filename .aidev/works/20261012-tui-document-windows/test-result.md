# 検証

- 全体テスト: 586ファイル、10520件成功・1件skip。PTY起動のsuite開始前検査だけ、最終編集より古いdistを検出したため最終build後に再実行。
- 新規の外側端末での確認: TuiApp.displays.test.ts。実際のアプリ入力ルートと出力をheadless外側端末に流し、HTMLフォームの入力・display.action送信・Markdown更新・削除表示を確認。FakeSocketは接続先のfixtureであり、表示判定は外側端末の描画で行う。
- DisplayModel.test.tsで取得中の切断・版変更、初期購読と更新の競合を検証。
- WindowOverlay.test.tsでマウス/キーボードの移動とリサイズ、入力座標変換、画面縮小を検証。
- document/DisplayDialogの回帰テストは、該当修正を外すとAssertionErrorになることを確認。原ファイルをバイト単位一致で復元。
- 最終build/typecheck: 成功。negative control復元後の関連9ファイル192件成功。最新distで実端末の起動検証1件成功（3.79秒）。主要な新規コードのESLintも成功。
- ログ: `/tmp/tui-windows-all.log`、`/tmp/tui-windows-restored-target.log`、`/tmp/tui-windows-final-build.log`、`/tmp/tui-windows-final-types.log`、`/tmp/tui-windows-pty.log`。
- 先行変更はPR #145でmain（c78041cb）にマージ。今回の端末ウィンドウ実装はfeature/tui-document-windowsで管理し、ビルド済み。既存のTabViews変更と未追跡のユーザーファイルは維持。

## negative control 0（生出力）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/document.test.ts (9 tests | 1 failed | 8 skipped) 12ms
   × preserves all quoted text within width instead of clipping the last cells 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/document.test.ts > preserves all quoted text within width instead of clipping the last cells
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/modes/document.test.ts:58:79
     56| it("preserves all quoted text within width instead of clipping the las…
     57|   const rows = markdownRows("> abcdefghij", 10);
     58|   expect(rows.every((r) => stringWidth(r.map((s) => s.text).join("")) …
       |                                                                               ^
     59|   expect(
     60|     rows

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  00:20:08
   Duration  869ms (transform 78%, import 20%, tests 2%)


```

## negative control 1（生出力）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/document.test.ts (9 tests | 1 failed | 8 skipped) 7ms
   × does not turn an undirected Mermaid connection into a directed arrow 5ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/document.test.ts > does not turn an undirected Mermaid connection into a directed arrow
AssertionError: expected 'Mermaid · 接続ごとの図（LR）\n┌───┐   ┌───┐\n…' not to contain '→'

- Expected
+ Received

- →
+ Mermaid · 接続ごとの図（LR）
+ ┌───┐   ┌───┐
+ │ A │ → │ B │
+ └───┘   └───┘
+

 ❯ src/modes/document.test.ts:73:20
     71|   const source = "flowchart LR\nA --- B";
     72|   const rows = mermaidText(source).join("\n");
     73|   expect(rows).not.toContain("→");
       |                    ^
     74|   expect(rows).toContain("未対応");
     75|   expect(rows).toContain(source);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  00:20:09
   Duration  771ms (transform 79%, import 20%, tests 1%)


```

## negative control 2（生出力）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/document.test.ts (9 tests | 1 failed | 8 skipped) 10ms
   × disables incomplete forms on nesting, row truncation and external ownership 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/document.test.ts > disables incomplete forms on nesting, row truncation and external ownership
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/modes/document.test.ts:89:85
     87|     '<form data-soda-action="a"><button>送信</button><input form="other"…
     88|   ])
     89|     expect(simpleForm(content).controls.find((c) => c.type === "button…
       |                                                                                     ^
     90| });
     91| it("reset and non-submit input buttons never submit a form implicitly"…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  00:20:11
   Duration  828ms (transform 79%, import 19%, tests 1%)


```

## negative control 3（生出力）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/DisplayDialog.test.ts (1 test | 1 failed) 63ms
   × allows scrolling away from a form input, rejects stale submission, and reloads after reconnect 62ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/DisplayDialog.test.ts > allows scrolling away from a form input, rejects stale submission, and reloads after reconnect
AssertionError: expected '                                     …' not to contain 'answer:'

- Expected
+ Received

- answer:
+                                                             
+  ┌─ view ─────────────────────────────────────────────────┐ 
+  │ answer: yes                                            │ 
+  │ [ 送信 ]                                               │ 
+  │ 説明0                                                  │ 
+  │ 説明1                                                  │ 
+  │ 説明2                                                  │ 
+  │ 説明3                                                  │ 
+  │                                                        │ 
+  │ Tab欄移動・Enter送信・Alt+矢印サイズ・Esc戻る          │ 
+  └────────────────────────────────────────────────────────┘ 
+                                                             

 ❯ src/modes/DisplayDialog.test.ts:60:24
     58|   await vi.waitFor(() => expect(render()).toContain("answer:"));
     59|   dialog.handleMouse({ action: "wheel", button: 65, x: 3, y: 3 });
     60|   expect(render()).not.toContain("answer:");
       |                        ^
     61|   expect(render()).toContain("説明");
     62|   dialog.handleKey(chordToKeyInput("Tab"));

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  00:20:12
   Duration  871ms (transform 74%, import 18%, tests 8%)


```


## 利用者による実機確認

Windows Terminalで端末版を起動し、Markdown／Mermaidのサンプル表示を利用者が確認。窓の移動・リサイズも「試しました。機能しました。」と確認済み。静的HTMLフォームへ利用者が入力し、CLIのdisplay waitでdisplay.actionを受信。日本語文字列「あいうえお」、choice=approve、checked=yesを確認。受信結果を同じウィンドウのMarkdownに更新。

```json
{"type":"display.action","name":"window-input-test","rev":1,"action":"input-test","data":{"message":"あいうえお","choice":"approve","checked":"yes"},"source":"static","seq":2}
```

## 送信後に閉じる追補

端末版フォームは送信成功後に窓を閉じ、失敗時に入力を保持する。成功の返答より先に別の窓を開いた場合は、その窓を閉じない。作成プログラムが表示を削除した際も窓を閉じるが、再接続中の台帳取得待ちには閉じない。関連4ファイル7件成功、TUI build/typecheck成功。

### negative control 0（生出力）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/DisplayDialog.test.ts (2 tests | 1 failed | 1 skipped) 1135ms
   × closes a form only after successful submission and never closes a replacement dialog 1134ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/DisplayDialog.test.ts > closes a form only after successful submission and never closes a replacement dialog
AssertionError: expected { kind: 'display', paneId: 'p', …(1) } to be null

- Expected:
null

+ Received:
{
  "displayId": "d",
  "kind": "display",
  "paneId": "p",
}

 ❯ src/modes/DisplayDialog.test.ts:137:51
    135|   fail = false;
    136|   dialog.handleKey(chordToKeyInput("Enter"));
    137|   await vi.waitFor(() => expect(ui.dialogContext).toBeNull());
       |                                                   ^
    138|   dialog.dispose();
    139|   ui.openDialogWithContext({ kind: "display", paneId: "p", displayId: …

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  00:43:15
   Duration  2.61s (tests 46%, transform 43%, import 10%)


```

### negative control 1（生出力）

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/DisplayDialog.test.ts (2 tests | 1 failed | 1 skipped) 69ms
   × allows scrolling away from a form input, rejects stale submission, and reloads after reconnect 68ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/DisplayDialog.test.ts > allows scrolling away from a form input, rejects stale submission, and reloads after reconnect
AssertionError: expected undefined to be 'display' // Object.is equality

- Expected:
"display"

+ Received:
undefined

 ❯ src/modes/DisplayDialog.test.ts:73:34
     71|   const reconnecting = displays.connect();
     72|   render();
     73|   expect(ui.dialogContext?.kind).toBe("display");
       |                                  ^
     74|   expect(displays.ready).toBe(false);
     75|   finishSubscribe({ displays: [info] });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  00:43:18
   Duration  1.49s (transform 76%, import 18%, tests 5%)


```

