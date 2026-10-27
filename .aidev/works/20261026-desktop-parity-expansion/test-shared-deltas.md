# 共有差分画像の検証

合成画面・fake入力だけを使用。OS capture/input/clipboard/録音、保護service/driver変更は行わない。

- source fresh build/typecheck、795files / 11,933tests全件成功。
- root（既存変更を保持）fresh build/typecheck、803files / 11,995tests全件成功。
- pool新7件を含む44件（late join fresh full、slow ACKとfast継続、不正source base/content/旧cohort delta拒否、合計keyframe制限、旧helper full継続）、relay gate5件成功。
- 新browser5件成功: plain/encrypted、2.5秒ACK待ちviewerからの復帰、片方native→他窓patch変更→native停止→両窓画像更新、保存差分OFFから共有中設定変更。両窓の実canvas画素とframe更新を観測、ソースspawn数も確認。
- rootでも同5件全て成功。
- gate試験の初回はテスト側の存在しないisDesktopFrame参照、次回はfixtureの画像ACK不足により失敗。参照を除去し実ACKを送って再検査、製品の修正は不要だった。
- UIの差分転送が共有中に常時disabledだった点を独立点検で検知し、新cap対応の通常共有で設定できるよう修正。native混在復帰とsaved-off検証を追加し再点検通過。
- 独立taskcheck/全体review2件とUI/browser/docsの追加差分再点検通過。
- 独立check worktree frozen install/fresh build/smoke PASS。consumer base検査/合計keyframe制限/旧B gateを1つずつ外す負例3件で意図した失敗。finallyでexact source bytesへ復元。

## 負例 consumer-base

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-deltas-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (44 tests | 1 failed | 43 skipped) 41ms
   × aggregates keyframe requests and never sends an unmatched delta to a late subscriber 38ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > aggregates keyframe requests and never sends an unmatched delta to a late subscriber
AssertionError: expected [ { type: 'keyframe' } ] to have a length of 2 but got 1

- Expected
+ Received

- 2
+ 1

 ❯ src/desktop/DesktopSharedCapture.test.ts:296:469


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 43 skipped (44)
   Start at  01:04:41
   Duration  2.96s (transform 75%, import 23%, tests 2%)


```

## 負例 keyframe-rate

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-deltas-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (44 tests | 1 failed | 43 skipped) 49ms
   × aggregates keyframe requests and never sends an unmatched delta to a late subscriber 44ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > aggregates keyframe requests and never sends an unmatched delta to a late subscriber
AssertionError: expected [ { type: 'keyframe' }, …(50) ] to have a length of 1 but got 51

- Expected
+ Received

- 1
+ 51

 ❯ src/desktop/DesktopSharedCapture.test.ts:296:283


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 43 skipped (44)
   Start at  01:04:46
   Duration  2.29s (transform 74%, import 23%, tests 2%)


```

## 負例 old-provider

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-deltas-check

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (189 tests | 1 failed | 185 skipped) 2463ms
   × requires viewer/B proof and enabled deltas for shared delta images: provider 1031ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > requires viewer/B proof and enabled deltas for shared delta images: provider
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.test.ts:1381:67


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:1381:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 passed | 185 skipped (189)
   Start at  01:04:50
   Duration  5.26s (tests 49%, transform 39%, import 12%)


```
