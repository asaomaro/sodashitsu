# 検証結果

- `pnpm build`: 成功。
- `pnpm typecheck`: 成功。
- 関連Vitest: 29ファイル・514件成功。server machine/WS、protocol、CLI、Webメニュー/管理/状況/store、TUIメニュー/管理/履歴/利用状況/サイドバーを含む。
- Playwright: 5件成功（secondary-screens 3件、outbound-delegation 2件）。画面メニューと独立した履歴、リモート表示中のローカル接続の無効化・再許可・削除、モバイル画面、既存の委譲・コード交換を確認。
- `/tmp/secondary-screens-browser.png`・`/tmp/secondary-screens-mobile.png` を目視確認。基本端末は大きさを保持し、新画面は表示中だけ内容を持つ。
- TUI管理画面テストは描画待ち前の古い端末フレームを見て初回失敗したため、renderNow後に描画内容を検査するよう修正。実際の上部ボタンのマウス経路もテストする。
- 既存の未コミット9ファイルは保持。稼働中サーバーへのhandoff、Windows実機での確認は未実施。

## 負の対照

3件の修正について、それぞれ修正箇所だけ一時除去し、失敗を確認した後、元のbytesへ復元して一致を確認した。いずれもTS直接実行のため、ビルド済み成果物には依存しない。復元後の29ファイル・514件は成功。

### 操作エラーの直後に必ず再取得する

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-delegation

 ❯ |@sodashitsu/tui| src/modes/ConnectionsView.test.ts (2 tests | 1 failed | 1 skipped) 1020ms
   × keeps operation failures visible instead of erasing them with an immediate refresh 1018ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/ConnectionsView.test.ts > keeps operation failures visible instead of erasing them with an immediate refresh
AssertionError: expected '                                     …' to contain '接続先URLが不正です'

Expected: "接続先URLが不正です"
Received: "                                                                                                                                                                                                                                                                                                               外部接続（このサーバー）                                                                            ↑↓選択 Enter実行 / n委譲申請 / r更新 / Esc端末へ                                                                                                                                                        このセッション全体の操作を委譲します。相手を確認してコードを入力してください                                                                                                                            操作する側のURL: https://bad.example                                                                                                                                                                    このPCの名前: office                                                                                                                                                                                    入力中: PC名 / Tabで移動・Enterで申請                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                "

 ❯ src/modes/ConnectionsView.test.ts:46:43
     44|     view.handlePaste("office");
     45|     view.handleKey(chordToKeyInput("Enter")!);
     46|     await vi.waitFor(() => expect(draw()).toContain("接続先URLが不正です"));
       |                                           ^
     47|   } finally {
     48|     view.dispose();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  10:24:15
   Duration  2.33s (tests 46%, transform 45%, import 9%)

```

### ホイール時に選択位置を追従しない

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-delegation

 ❯ |@sodashitsu/tui| src/modes/ConnectionsView.test.ts (2 tests | 1 failed | 1 skipped) 10ms
   × wheel scrolling changes rendered rows instead of snapping back to the selected row 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/ConnectionsView.test.ts > wheel scrolling changes rendered rows instead of snapping back to the selected row
AssertionError: expected '                                     …' not to be '                                     …' // Object.is equality
 ❯ src/modes/ConnectionsView.test.ts:57:24
     55|     const before = draw();
     56|     view.handleMouse({ action: "wheel", button: 65, x: 5, y: 9 });
     57|     expect(draw()).not.toBe(before);
       |                        ^
     58|   } finally {
     59|     view.dispose();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  10:24:18
   Duration  1.20s (transform 81%, import 18%, tests 1%)

```

### マシン切替時に旧履歴を保持する

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-delegation

 ❯ |@sodashitsu/tui| src/app/TuiApp.controls.test.ts (11 tests | 1 failed | 10 skipped) 87ms
   × leaves old session history before retargeting the terminal connection to another machine 86ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/app/TuiApp.controls.test.ts > leaves old session history before retargeting the terminal connection to another machine
AssertionError: expected 'history' to be 'base' // Object.is equality

Expected: "base"
Received: "history"

 ❯ src/app/TuiApp.controls.test.ts:309:27
    307|   h.app.ui.setScreen("history");await vi.waitFor(()=>expect(h.ws.reque…
    308|   h.app.switchMachine("other-machine",undefined,{force:true});
    309|   expect(h.app.ui.screen).toBe("base");
       |                           ^
    310|   expect(h.ws.requests("agent.resume")).toHaveLength(0);
    311| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 10 skipped (11)
   Start at  10:24:20
   Duration  2.28s (transform 80%, import 16%, tests 4%)

```
