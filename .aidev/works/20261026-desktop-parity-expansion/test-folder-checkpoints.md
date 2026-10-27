# フォルダ切断後再開の検証

新managerは8job/各100MiB/15分、root/owner/config/source epochの固定、fresh grantとmanual attach、live owner拒否、old pending finish失効、lost write/final response、ZIP巻戻し/変更検査を生成データで検査。browser保存は既存合計100MiB/8件・WebLocks・atomic chunkを利用する。B再起動/handoff保持は対象外。

独立taskcheck: review_pointerの内側TTL指摘をinspectのtouchと期限直前attach回帰で修正し再点検通過。独立全体review: review_transferのtoken取得前cancelが別workerへ届かない指摘をcancelStart/root-owner-UUIDの即失効と開始前queue guardで修正、hash中取消のfinally/UI状態と通常2件60秒/saved8件15分の説明も修正。再点検でforgetによる取消記録の消失を指摘され、folder専用sticky ledger/4096上限と同UUIDの2本保留＋遅延start拒否回帰で修正、再レビュー通過。

source/root build/typecheckは通過。修正中のpre-final build/typecheckは最終全体テストが始まる前に停止し、sourceを固定してfresh build/typecheck/fullを実行した。全体結果は後記。

focused: manager9＋UI3は通過、Relay viewer新hint/legacy/旧B3を含むfolder関連16通過。最初のRelay新fixtureにfileRoot指定がなく3失敗したため前提を修正。UI新testは取消buttonを「取消」と誤指定した1失敗を「取り消す」へ修正。いずれもfixture修正で製品変更ではない。

browser: 新folder checkpointsはplain/encrypted upload/download・shared別窓lease・IDB不可・容量上限7件、既存folder7＋file checkpoints7、さらにZIP最終chunk保存後に処理を中断→再読込→0byte最終応答から復元する1件。rootは21＋1通過。sourceは最初upload3件がVue proxy manifestのIDB DataCloneErrorを捕捉し、manifestをschema parseしてplain object化し修正。その後21件通過。最終cancel修正後、同じWT内で追加browserを並行起動したためPlaywright artifact directoryが削除競合し、既存file sharedと追加final ZIPでENOENTになった。20/21通過＋該当既存sharedと追加final ZIP/新sharedの3件を単独processで再実行し通過（最終sourceでunique22件）。このartifact競合を製品不具合とは扱わず、同WT内のbrowser実行を順次化した。

独立check WTはbase9817730aからpatch/追加file適用、fresh build/smoke PASS。sticky cancelのサーバ差分適用後にserver fresh build/smoke再確認。

## 負例

check WTで該当実装だけを取り除き、次の回帰が失敗することを確認。finallyで各ファイルの元bytesを復元・一致確認。tokenless immediateの回帰は保留guard解放前の同期失効を確認し、失敗時もfinallyでgateを解放する。

### attach-ttl

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-folder-checkpoints-check

 ❯ |@sodashitsu/server| src/desktop/DesktopFolderCheckpoints.test.ts (9 tests | 1 failed | 8 skipped) 100ms
   × renews both lease deadlines when attaching just before expiry 97ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderCheckpoints.test.ts > renews both lease deadlines when attaching just before expiry
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopFolderCheckpoints.test.ts:193:73
    191|   );
    192|   now = 900002;
    193|   expect((await b.run(req(token, { action: "folder_status", id }))).ok…
       |                                                                         ^
    194|   now += 900001;
    195|   expect((await b.run(req(token, { action: "folder_status", id }))).ok…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  02:42:10
   Duration  1.63s (transform 70%, import 22%, tests 7%)


```

### sticky-cancel

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-folder-checkpoints-check

 ❯ |@sodashitsu/server| src/desktop/DesktopFolderCheckpoints.test.ts (9 tests | 2 failed | 7 skipped) 133ms
   × cancels tokenless starts synchronously before queued preparation: prequeued 86ms
   × cancels tokenless starts synchronously before queued preparation: preparing 44ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderCheckpoints.test.ts > cancels tokenless starts synchronously before queued preparation: prequeued
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopFolderCheckpoints.test.ts:328:30
    326|     const cancelled = a.run({ action: "folder_abort", id });
    327|     try { expect((f.registry as any).jobs.size).toBe(0); } finally { r…
    328|     expect((await start).ok).toBe(false);
       |                              ^
    329|     expect((await cancelled).ok).toBe(true);
    330|     expect((await duplicate).ok).toBe(false);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderCheckpoints.test.ts > cancels tokenless starts synchronously before queued preparation: preparing
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopFolderCheckpoints.test.ts:330:34
    328|     expect((await start).ok).toBe(false);
    329|     expect((await cancelled).ok).toBe(true);
    330|     expect((await duplicate).ok).toBe(false);
       |                                  ^
    331|     expect((await a.run({action:"folder_resume_start",request:{action:…
    332|     expect((f.registry as any).jobs.size).toBe(0);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 7 skipped (9)
   Start at  02:42:13
   Duration  1.74s (transform 69%, import 22%, tests 9%)


```

### tokenless-immediate

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-folder-checkpoints-check

 ❯ |@sodashitsu/server| src/desktop/DesktopFolderCheckpoints.test.ts (9 tests | 1 failed | 8 skipped) 67ms
   × cancels tokenless starts synchronously before queued preparation: preparing 65ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopFolderCheckpoints.test.ts > cancels tokenless starts synchronously before queued preparation: preparing
AssertionError: expected 1 to be +0 // Object.is equality

- Expected
+ Received

- 0
+ 1

 ❯ src/desktop/DesktopFolderCheckpoints.test.ts:327:49
    325|     });
    326|     const cancelled = a.run({ action: "folder_abort", id });
    327|     try { expect((f.registry as any).jobs.size).toBe(0); } finally { r…
       |                                                 ^
    328|     expect((await start).ok).toBe(false);
    329|     expect((await cancelled).ok).toBe(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  02:42:17
   Duration  1.79s (transform 73%, import 23%, tests 4%)


```

### old-provider

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-folder-checkpoints-check

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (196 tests | 1 failed | 195 skipped) 234ms
   × requires folder checkpoint viewer hint and B proof: old-provider 229ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > requires folder checkpoint viewer hint and B proof: old-provider
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopRelay.test.ts:1400:337


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 195 skipped (196)
   Start at  02:42:20
   Duration  2.56s (transform 73%, import 17%, tests 10%)


```

source全体: 11961件/797filesすべて通過。root全体は実行中。
