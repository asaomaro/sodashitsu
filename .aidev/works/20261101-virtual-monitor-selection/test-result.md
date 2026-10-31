# 検証と独立レビュー

- Relay/UI virtual境界: 26 passed。新規のall/所有VM自身×両参加順序4ケースは拒否と既存描画継続を確認。
- build: 最終sourceで成功（selectedMonitor optional型のstrictエラーを型宣言で修正）。typecheck成功。
- 最終build後のブラウザ: 4 passed（共有VM保持、所有解像度一致、単独/別VM窓継続下の物理切替）。DOM/ブラウザWS/canvas画素を観測。
- 全体testは931ファイル・13,431件成功、各1skip。CI22ジョブ成功後にPR368をmainへmerge。配布の結果はcompletion統合記録に記載。
- Windows C#生成コンパイル/既存virtual mode検証: 成功。実driver/画面取得/入力なし。
- taskcheck review_pointer / independent cross review_transfer: VM自身とallの除外不足を修正し、再レビューでmust/shouldなし。文書crossも追加指摘なし。
- 以下のprivateコピー8 guard負例では意図したAssertionErrorを確認し、修正を戻した各1件が成功。production sourceは変更せず、各privateコピーは削除。過去のUI負例の復元試験ではfixtureの再接続後cap再通知不足が判明したため修正し、下記全8件を再実行した。

```text
NEGATIVE client-feature
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts (303 tests | 1 failed | 302 skipped) 139ms
   × keeps virtual monitor metadata private without the client gate 137ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts > keeps virtual monitor metadata private without the client gate
AssertionError: expected { type: 'ready', …(11) } to not have property "virtualMonitors"

- Expected:
undefined

+ Received:
true

 ❯ src/desktop/DesktopRelay.test.generatedNegative.test.ts:1894:784


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 302 skipped (303)
   Start at  03:44:09
   Duration  1.72s (transform 75%, import 16%, tests 9%)


RESTORED client-feature
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection


 Test Files  1 passed (1)
      Tests  1 passed | 302 skipped (303)
   Start at  03:44:11
   Duration  1.74s (transform 75%, import 17%, tests 8%)


NEGATIVE helper-proof
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts (303 tests | 1 failed | 302 skipped) 1035ms
   × refuses missing helper virtual-monitor proof before exposing a roster 1033ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts > refuses missing helper virtual-monitor proof before exposing a roster
AssertionError: expected 1 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 1

 ❯ src/desktop/DesktopRelay.test.generatedNegative.test.ts:1895:503


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.generatedNegative.test.ts:1895:464

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 302 skipped (303)
   Start at  03:44:13
   Duration  2.55s (transform 47%, tests 42%, import 11%)


RESTORED helper-proof
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection


 Test Files  1 passed (1)
      Tests  1 passed | 302 skipped (303)
   Start at  03:44:17
   Duration  1.62s (transform 75%, import 17%, tests 8%)


NEGATIVE legacy-single
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts (303 tests | 1 failed | 302 skipped) 1033ms
   × does not expose a single virtual roster through the legacy ordinary monitor hint 1031ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts > does not expose a single virtual roster through the legacy ordinary monitor hint
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.test.generatedNegative.test.ts:1898:510


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.generatedNegative.test.ts:1898:450

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 302 skipped (303)
   Start at  03:44:19
   Duration  2.48s (transform 46%, tests 43%, import 11%)


RESTORED legacy-single
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection


 Test Files  1 passed (1)
      Tests  1 passed | 302 skipped (303)
   Start at  03:44:22
   Duration  1.62s (transform 74%, import 17%, tests 9%)


NEGATIVE explicit-purpose
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection

 ❯ |@sodashitsu/web| src/components/RemoteDesktopNativeSharing.test.generatedNegative.test.ts (6 tests | 1 failed | 5 skipped) 68ms
   × switches from an owned virtual monitor only on explicit physical selection and clears virtual purpose 67ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/RemoteDesktopNativeSharing.test.generatedNegative.test.ts > switches from an owned virtual monitor only on explicit physical selection and clears virtual purpose
AssertionError: expected { sharedDesktop: true, …(9) } to match object { sharedDesktop: true, …(3) }
(11 matching properties omitted from actual)

- Expected
+ Received

  {
-   "independentMonitors": true,
-   "monitorDevice": "left",
    "sharedDesktop": true,
-   "sharedMonitors": true,
  }

 ❯ src/components/RemoteDesktopNativeSharing.test.generatedNegative.test.ts:40:1776


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  03:44:25
   Duration  1.77s (transform 71%, import 15%, environment 10%, tests 4%)


RESTORED explicit-purpose
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection


 Test Files  1 passed (1)
      Tests  1 passed | 5 skipped (6)
   Start at  03:44:27
   Duration  1.64s (transform 71%, import 14%, environment 10%, tests 4%)


NEGATIVE actual-peer-authority
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts (303 tests | 1 failed | 302 skipped) 1316ms
   × pairs a fenced owned virtual group with independent physical sources but never a regular combined source 1314ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts > pairs a fenced owned virtual group with independent physical sources but never a regular combined source
AssertionError: expected 1 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 1

 ❯ src/desktop/DesktopRelay.test.generatedNegative.test.ts:1907:168


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.generatedNegative.test.ts:1907:124

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 302 skipped (303)
   Start at  03:44:29
   Duration  2.74s (tests 50%, transform 41%, import 9%)


RESTORED actual-peer-authority
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection


 Test Files  1 passed (1)
      Tests  1 passed | 302 skipped (303)
   Start at  03:44:33
   Duration  1.90s (transform 62%, tests 24%, import 14%)


NEGATIVE actual-fence
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts (303 tests | 1 failed | 302 skipped) 1035ms
   × rejects virtual monitor metadata without actual resource fencing support 1033ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts > rejects virtual monitor metadata without actual resource fencing support
AssertionError: expected 1 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 1

 ❯ src/desktop/DesktopRelay.test.generatedNegative.test.ts:1909:505


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.generatedNegative.test.ts:1909:466

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 302 skipped (303)
   Start at  03:44:35
   Duration  2.46s (transform 45%, tests 44%, import 11%)


RESTORED actual-fence
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection


 Test Files  1 passed (1)
      Tests  1 passed | 302 skipped (303)
   Start at  03:44:39
   Duration  1.74s (transform 75%, import 17%, tests 8%)


NEGATIVE global-quota
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts (303 tests | 1 failed | 302 skipped) 36ms
   × keeps retiring physical helpers within the global quota before starting a normal source 34ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts > keeps retiring physical helpers within the global quota before starting a normal source
AssertionError: expected RpcError: 共有用の接続を開始できませんでした { …(1) } to match object { code: 'server_busy' }
(1 matching property omitted from actual)

- Expected
+ Received

- {
-   "code": "server_busy",
+ RpcError {
+   "code": "spawn_failed",
  }

 ❯ src/desktop/DesktopRelay.test.generatedNegative.test.ts:1910:361


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 302 skipped (303)
   Start at  03:44:41
   Duration  1.61s (transform 80%, import 18%, tests 2%)


RESTORED global-quota
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection


 Test Files  1 passed (1)
      Tests  1 passed | 302 skipped (303)
   Start at  03:44:43
   Duration  1.52s (transform 81%, import 18%, tests 1%)


NEGATIVE physical-identity
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts (303 tests | 1 failed | 302 skipped) 1153ms
   × refuses nonphysical owned-virtual coexistence in both join orders 1151ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.generatedNegative.test.ts > refuses nonphysical owned-virtual coexistence in both join orders
AssertionError: expected 1 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 1

 ❯ src/desktop/DesktopRelay.test.generatedNegative.test.ts:1918:78


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.generatedNegative.test.ts:1918:34

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 302 skipped (303)
   Start at  03:44:46
   Duration  2.58s (tests 47%, transform 43%, import 10%)


RESTORED physical-identity
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-virtual-desktop-monitor-selection


 Test Files  1 passed (1)
      Tests  1 passed | 302 skipped (303)
   Start at  03:44:49
   Duration  1.92s (transform 62%, tests 24%, import 14%)


virtual_monitors_8_source_negative_controls_and_restore_passed

```
