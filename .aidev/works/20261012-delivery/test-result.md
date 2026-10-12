# 最終検証

pnpm build / pnpm typecheck: 成功。最終安全修正後はserver build/typecheckを再確認。

## 安全境界の回帰
修正後 ArtifactFiles.test.ts: 3 passed。
修正箇所のみ戻すとFIFO差し替えテストが失敗。復元後cmp一致。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu

 ❯ |@sodashitsu/server| src/http/ArtifactFiles.test.ts (3 tests | 1 failed | 2 skipped) 24ms
   × rejects a FIFO swapped in immediately before open without blocking 23ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/http/ArtifactFiles.test.ts > rejects a FIFO swapped in immediately before open without blocking
AssertionError: expected [Function] to throw error including '成果物の表示が終了しました' but got 'spawnSync mkfifo EPERM'

Expected: "成果物の表示が終了しました"
Received: "spawnSync mkfifo EPERM"

 ❯ src/http/ArtifactFiles.test.ts:22:75
     20|   return original(file,flags,mode);
     21|  });
     22|  try{await expect(files.register('owner',root,path,stamp,'html',()=>tr…
       |                                                                           ^
     23|  finally{spy.mockImplementation(original);files.close();await rm(root,…
     24| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  18:40:42
   Duration  3.32s (transform 84%, import 16%, tests 1%)

  Transform  |@sodashitsu/server| transforming modules took 2.67s · 84% of tracked time, re-done on every run
             persist transforms across runs with fsModuleCache: true
             learn more: https://vitest.dev/guide/improving-performance#caching-between-reruns


```

## 最終確認結果

- 全体テスト: 616ファイル成功、10636テスト成功、1skip。並走した修正前検証とビルド時刻によりArtifactFiles/PTYの2ファイルが失敗。
- 最終コードに復元しserver build/typecheck成功後、失敗2ファイルを再実行: ArtifactFiles 3 passed、実PTY起動 1 passed。残る失敗なし。
- pnpm smoke: PASS（サーバー認証・実シェル入出力・実ブラウザ表示/入力・初回案内/フォーカス）。
- 関連最終E2E statusline.spec.ts: 8 passed（帯/パネルの字体・アイコン寸法・余白の実DOM比較、折り畳みトレイ、フローティング開閉）。
- git diff --cached --check: 成功。
- 個別工程のE2E/negative control結果は各workのtest-result.mdを参照。
