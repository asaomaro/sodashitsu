# 検証

- 全体build/typecheck、実A/Bサーバ＋CLI子プロセス＋MCP＋ChromiumのE2E、関連単体テストで確認。最終集計は着地時に追記。
- E2EではA画面の起動要求と承認を操作し、BアプリのDOMで進捗とlaunched、AのDOMでask-formを確認。Bにフォームがないことも確認。
- 初回全体試験は40件のtimeout等が発生したため、並列数を3にして再実行。これだけを根拠に既存失敗とは判定しない。

## 負例

idle-onlyの内部guardとmemory名の再検証だけを外した。対象2件が失敗することを確認し、保存したbytesと一致するよう復元。Vitestはserverソースを読むため再ビルド不要（protocolの変更は戻していない）。生出力:

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-work-agent

 ❯ |@sodashitsu/server| src/surface/methods/work.test.ts (2 tests | 1 failed | 1 skipped) 13ms
   × retains memory filename and file-search validation when using a fixed plugin lease 11ms
 ❯ |@sodashitsu/server| src/surface/methods/agent.test.ts (29 tests | 1 failed | 28 skipped) 9ms
   × enforces an internal idle-only guard after queued input while ordinary prompts retain working support 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/surface/methods/agent.test.ts > enforces an internal idle-only guard after queued input while ordinary prompts retain working support
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/surface/methods/agent.test.ts:82:21
     80|   const s=setup();s.changeAgentBeforeWrite(agent({state:"working"}));
     81|   const result=await s.surface.invoke({...s.ctx,agentPromptGuard:a=>{i…
     82|   expect(result.ok).toBe(false);expect(s.host.written).toEqual([]);
       |                     ^
     83|   expect((await s.call("agent.prompt",{paneId:"p1",text:"ordinary prom…
     84| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/surface/methods/work.test.ts > retains memory filename and file-search validation when using a fixed plugin lease
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/surface/methods/work.test.ts:41:70
     39|   const call=(tool:object)=>surface.invoke(ctx,"work.agent_tool",{id,c…
     40|   for(const name of ["../../../outside.md","CON","NUL.txt","bad.","fol…
     41|     expect((await call({operation:"memory",action:"read",name})).ok).t…
       |                                                                      ^
     42|   expect(work.memory).not.toHaveBeenCalled();
     43|   expect((await call({operation:"memory",action:"list",name:"MEMORY.md…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  2 failed (2)
      Tests  2 failed | 29 skipped (31)
   Start at  23:37:20
   Duration  1.56s (transform 81%, import 18%, tests 1%)

  Transform  |@sodashitsu/server| transforming modules took 2.33s · 81% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## 最終結果

- `pnpm build`: PASS。修正後server/CLIも再ビルド済み。
- `pnpm typecheck`: PASS（最終追加テストの型も修正後確認）。
- `pnpm exec vitest run --maxWorkers=3`: 734 files / 11,234 tests PASS。初回は28 files / 40 testsがtimeout等で失敗したが、並列数を制限した全体再実行で全件通過。
- `plugin-operator-agent.spec.ts` / `work-agent-ask.spec.ts`: Chromium 2 E2E PASS。
- 操作元のpaneへ初期タスク引数が渡ること、Bの固定アプリへのMCP報告、Aのask-form、Bに質問が出ないことを確認。
- `/tmp/soda-plugin-operator-smoke` の別worktreeでビルド成果物を使った起動・Web端末入力・案内のfocus/再表示確認: PASS。
- 元の作業ディレクトリへ差分だけを適用し、protocol/server/CLI/Web build PASS。利用中のSodashitsuサーバは再起動していない。
- 外部 `public_docs` のaidevプラグイン: 118 tests / pack PASS、独立レビューとshould修正の再点検APPROVE。
