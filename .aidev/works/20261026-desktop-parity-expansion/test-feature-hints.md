# 固定長機能ヒントの検証

128bit/32hex、未知bit無視、不正・重複拒否、旧v1/新hint/未知bit/旧Bの実WSを確認。B/helper/明示許可の必要条件は維持。独立taskcheck review_pointerと全体review_transferはmust/shouldなし。

source build/typecheck・全体11948件/796files通過。既存shared delta5/shared clipboard3/native platform3の生成browser計11件通過。独立check worktreeは最初の適用対象ディレクトリを誤りbuild中にsource適用したためexport未解決、対象を修正しfresh build/smoke PASSを確認。製品修正ではない。

負例はcheck WTで実施、各変更をfinallyで元のbytesへ復元照合。

## new-hint

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-feature-hints-check

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (193 tests | 1 failed | 192 skipped) 1047ms
   × uses client feature hints without bypassing provider proof: hint 1044ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > uses client feature hints without bypassing provider proof: hint
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.test.ts:1393:99


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:1393:39

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 192 skipped (193)
   Start at  02:23:50
   Duration  3.22s (transform 50%, tests 34%, import 15%)


```

## malformed-hint

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-feature-hints-check

 ❯ |@sodashitsu/protocol| src/desktopFeatures.test.ts (9 tests | 3 failed | 4 skipped) 24ms
   × declines malformed feature hints without enabling anything:  8ms
   × declines malformed feature hints without enabling anything: 1 11ms
   × declines malformed feature hints without enabling anything: gggggggggggggggggggggggggggggggg 1ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/desktopFeatures.test.ts > declines malformed feature hints without enabling anything: 
SyntaxError: Cannot convert 0x to a BigInt
 ❯ desktopFeaturesFromProtocols src/desktopFeatures.ts:20:16
     18|   const suffix = hints[0]!.slice(DESKTOP_FEATURES_PREFIX.length);
     19|
     20|   const bits = BigInt("0x" + suffix);
       |                ^
     21|   for (const name of Object.keys(featureBits) as DesktopFeature[])
     22|     if ((bits & (1n << BigInt(featureBits[name]))) !== 0n) features.ad…
 ❯ src/desktopFeatures.test.ts:10:148

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯

 FAIL  |@sodashitsu/protocol| src/desktopFeatures.test.ts > declines malformed feature hints without enabling anything: 1
AssertionError: expected [ 'sharedDeltas' ] to deeply equal []

- Expected
+ Received

- []
+ [
+   "sharedDeltas",
+ ]

 ❯ src/desktopFeatures.test.ts:10:212


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯

 FAIL  |@sodashitsu/protocol| src/desktopFeatures.test.ts > declines malformed feature hints without enabling anything: gggggggggggggggggggggggggggggggg
SyntaxError: Cannot convert 0xgggggggggggggggggggggggggggggggg to a BigInt
 ❯ desktopFeaturesFromProtocols src/desktopFeatures.ts:20:16
     18|   const suffix = hints[0]!.slice(DESKTOP_FEATURES_PREFIX.length);
     19|
     20|   const bits = BigInt("0x" + suffix);
       |                ^
     21|   for (const name of Object.keys(featureBits) as DesktopFeature[])
     22|     if ((bits & (1n << BigInt(featureBits[name]))) !== 0n) features.ad…
 ❯ src/desktopFeatures.test.ts:10:148

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 2 passed | 4 skipped (9)
   Start at  02:23:54
   Duration  745ms (transform 61%, import 32%, tests 5%, worker 2%)


```

root反映後: build/typecheck、全体12010件/804files、関連browser11件すべて通過。
