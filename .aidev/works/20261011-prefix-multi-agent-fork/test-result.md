# 検証

- pnpm build: 成功。
- pnpm test: 562 files、10430 passed、9 failed、1 skipped。失敗は削除した「新規」項目・常時番号表示・操作件数の古い期待値と、追加ActionをgraphTerminalKeysの網羅switchへ反映する前の結果。関連テストを更新して対象ファイルを再実行（下に最終結果を追記）。
- Copilot RPC transport: 4 passed（分割フレーム、CLI非対応、元ID返却拒否、abort）。実CLIは手元に古いCopilot版しかなく、認証した実会話の分岐は未検証。
- Codex/Copilot Runner起動: 2 passed。新ペインの種類・引数・分岐IDを確認。
- TUI fork dialog: 3 passed（編集、確定、閉じた後の応答）。
- prefix browser E2E: classic/modern 2 passed（DOMの番号・位置と操作後の焦点を観測）。
- /tmp から compiled smoke: PASS（Web入力→PTYまで）。

## レビューで見つかったブランチ編集不具合の負例

初期設定ガードだけを除去し、テストが落ちることを確認。修正版に戻しcmp一致。生の出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/tui| src/modes/AgentForkDialog.test.ts (3 tests | 1 failed) 11ms
   ❯ 端末のfork画面 (3)
     × 初期名を消しても勝手に復活せず、カーソル移動だけでは要求しない 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/tui| src/modes/AgentForkDialog.test.ts > 端末のfork画面 > 初期名を消しても勝手に復活せず、カーソル移動だけでは要求しない
AssertionError: expected [ 'agent.fork_preview', …(1) ] to deeply equal [ 'agent.fork_preview', …(1) ]

- Expected
+ Received

  [
    "agent.fork_preview",
    {
-     "branch": "a",
+     "branch": "fork/topica",
      "paneId": "p1",
    },
  ]

 ❯ src/modes/AgentForkDialog.test.ts:18:71
     16|  it("初期名を消しても勝手に復活せず、カーソル移動だけでは要求しない",async()=>{
     17|   const {d,calls}=setup();await tick();d.handleKey(chordToKeyInput("Ta…
     18|   d.handleKey(chordToKeyInput("a"));await tick();expect(calls.at(-1)).…
       |                                                                       ^
     19|   const n=calls.length;d.handleKey(chordToKeyInput("Left"));await tick…
     20|  });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Start at  17:36:46
   Duration  937ms (transform 80%, import 18%, tests 1%)


```

## 最終結果

- 全パッケージ型チェック: 成功（/tmp/fork-all-types5.log）。
- 全体テストの失敗対象6ファイルを再実行: 185 passed、1 failed（TUI実端末テストに追加したEscをデコーダが確定する前に次のprefixを送り、キーが結合したテスト手順の問題）。描画でprefix解除を待つ形に修正し、TUI実端末結合5 passed。残り5ファイル181 passed。
- fork transport/Runner/dialog 最終対象再実行: 4 files、27 passed（/tmp/fork-final-target.log）。
- 前段のサイドバー/D&D/ベル/情報先頭の検証結果は ../20261011-sidebar-drag-notify/test-result.md。
