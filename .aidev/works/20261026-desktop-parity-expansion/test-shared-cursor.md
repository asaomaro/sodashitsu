# 共有独立カーソルの検証

生成画像・cursor・H.264だけを使用。OS画面の取得・入力・clipboard・実録音・ドライバー/サービス変更は行っていない。

- focused unit16件成功。新規10件: pool4（shape/pose/late join/hidden/unknown/malformed/ACK独立）＋relay6（新旧viewer/B/helper、非表示、default off）。
- browser新規4件成功（plain/encrypted/native2窓、old helper停止→default off復帰）。実canvasの画素を検査し、nativeでは実動画4枚超を待って縮小後XORをbase実画素と比較。混在cohort拒否後の明示参加とfirst退出後の継続、source spawn数を確認。
- 既存cursor/shared browser2件成功。
- 初期old helper検査はstatus欄にエラー本文を期待して失敗し、実alertへ変更。nativeは縮小を考慮せず緑1pxを期待して失敗、実画素XORに変更。その編集の範囲ミス（native開始とoverlay2宣言の削除）は独立レビューで検知し復元。最終browser4件とtest型検査成功。これらはtest側のみで製品コード変更なし。
- source/typecheck、独立check worktree fresh buildとsmoke PASS。
- 独立レビュー2件: 製品のmustなし。混在cohort検証を追加、test修正の再レビュー通過。
- 負例2件は意図した失敗を確認。独立worktreeのみ変更し、finallyでexact source bytesへ復元。
- 全体検証とroot反映/配備の結果は末尾へ追記する。

## 負例 late-shape

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-cursor-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (36 tests | 1 failed | 35 skipped) 1017ms
   × sends a current cursor shape to late subscribers without replaying image frames 1015ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > sends a current cursor shape to late subscribers without replaying image frames
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopSharedCapture.test.ts:254:120


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 35 skipped (36)
   Start at  00:20:35
   Duration  2.37s (tests 47%, transform 41%, import 12%)


```

## 負例 old-provider-gate

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-cursor-check

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (179 tests | 1 failed | 174 skipped) 1384ms
   × requires the viewer/B/helper cursor proof for opt-in shared cursors: provider 1021ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > requires the viewer/B/helper cursor proof for opt-in shared cursors: provider
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.test.ts:1352:67


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:1352:7

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 passed | 174 skipped (179)
   Start at  00:20:39
   Duration  3.12s (tests 47%, transform 43%, import 11%)


```

## 最終結果

- source: 794files / 11,908tests成功、pnpm build/typecheck成功。
- root（既存変更保持）: 802files / 11,970tests成功、pnpm build/typecheck成功、新browser4件成功。
- check worktree fresh build/smoke PASS。
- PR #247。両端配備の結果はlocal receiptへ追記する。
