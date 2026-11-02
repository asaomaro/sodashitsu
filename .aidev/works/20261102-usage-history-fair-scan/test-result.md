# 検証

- server build / typecheck PASS。
- usageHistory.test.ts + usageReport.test.ts: 12 tests PASS。
- negative control: productionのusageHistory.tsのみHEAD版へ戻すと、新規2ケースともCodexが欠落してFAIL。修正版へバイト一致で復元し再実行PASS。
- 実記録の修正後集計: 42files、byKindにclaude / codex双方。上限によるpartial表示は維持。
- live handoff: 実行中PTY 5件を継続し、helloで7ペインの全ID保持を確認。
- 実ブラウザ: 保存済みセッションを使う独立Chromiumの履歴カードDOMでClaude Code/Codexを確認。期間は既定30日。画像 /tmp/soda-usage-fair-browser.png、スクリプト /tmp/soda-usage-fair-browser.mjs。個人の会話や認証情報は出力しない。
- 作業ブランチ: fix/usage-history-fair-scan。別worktreeの変更は触れていない。

## negative control 生出力

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-main-live-assistant-agents

 ❯ |@sodashitsu/server| src/usage/usageHistory.test.ts (9 tests | 2 failed | 7 skipped) 576ms
   × reserves Codex scanning after Claude reaches the bytes limit 175ms
   × reserves Codex scanning after Claude reaches the files limit 400ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/usage/usageHistory.test.ts > reserves Codex scanning after Claude reaches the bytes limit
 FAIL  |@sodashitsu/server| src/usage/usageHistory.test.ts > reserves Codex scanning after Claude reaches the files limit
AssertionError: expected [ 'claude' ] to deeply equal [ 'claude', 'codex' ]

- Expected
+ Received

  [
    "claude",
-   "codex",
  ]

 ❯ src/usage/usageHistory.test.ts:104:54
    102|   const result = await f.reader.read(range);
    103|   expect(result.partial).toBe(true);
    104|   expect(result.byKind.map(row => row.label).sort()).toEqual(["claude"…
       |                                                      ^
    105|   expect(result.byKind.find(row => row.label === "codex")?.total).toBe…
    106|   expect(result.files).toBeLessThanOrEqual(512);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 7 skipped (9)
   Start at  08:14:55
   Duration  1.30s (tests 47%, transform 42%, import 11%)


```
