# 保護画面の複数viewer共有の検証

実装base 726110ad / 696a2b96。生成画面・生成入力だけで検証。実OS入力・UAC表示・サービス導入/更新・実音声は実行していない。

- 新実ブラウザ3件成功: elevated-default/elevated-uac/old-worker。2窓、使用中からの参加選択、canvas描画、排他control、first退出後継続、入力ACK、scope失効後clear、旧worker拒否。
- 既存ブラウザ6件成功: protected 4件、shared/native shared各1件。
- SharedCapture/Relay関連179件のうち178件成功、1件は新テストのfeaturesと期待code/true literalの誤りを修正後成功。製品変更なし。fresh build後の最終全体は787ファイル・11810件すべて成功。
- fresh build/typecheck成功。独立worktreeでoffline install/build/smoke成功。
- Windows CI boundaries SUCCESS: https://github.com/asaomaro/sodashitsu/actions/runs/40493044208 。ValidateOnly/生成scope・proof・worker検証のみ。
- 独立レビュー2件、should対応差分の再レビュー通過。

## 負例（guardを外した場合）

各試行で元のバイト列をfinallyで復元し完全一致を確認。source直接読込のvitestで検証。

### proof

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-protected

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (28 tests | 1 failed | 27 skipped) 1014ms
   × rejects an incompatible protected source before any image: unproved 1013ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > rejects an incompatible protected source before any image: unproved
AssertionError: expected null to be +0 // Object.is equality

- Expected:
0

+ Received:
null

 ❯ src/desktop/DesktopSharedCapture.test.ts:220:590


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 27 skipped (28)
   Start at  20:00:35
   Duration  1.81s (tests 59%, transform 32%, import 9%)


```

### scope

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-protected

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (28 tests | 5 failed | 23 skipped) 274ms
   × ends every protected member before accepting more data on protected_desktop_failure 64ms
   × ends every protected member before accepting more data on session_locked 53ms
   × ends every protected member before accepting more data on session_unlocked 52ms
   × ends every protected member before accepting more data on lock_screen_changed 52ms
   × ends every protected member before accepting more data on unlock_failure 52ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 5 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > ends every protected member before accepting more data on protected_desktop_failure
 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > ends every protected member before accepting more data on session_unlocked
 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > ends every protected member before accepting more data on lock_screen_changed
AssertionError: expected { type: 'ready', …(10) } to match object { …(2) }
(10 matching properties omitted from actual)

- Expected
+ Received

  {
-   "code": "source_changed",
-   "type": "protected_desktop_failure",
+   "type": "ready",
  }

 ❯ src/desktop/DesktopSharedCapture.test.ts:217:506


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/5]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > ends every protected member before accepting more data on session_locked
AssertionError: expected { type: 'session_locked' } to match object { …(2) }

- Expected
+ Received

  {
-   "code": "source_changed",
-   "type": "protected_desktop_failure",
+   "type": "session_locked",
  }

 ❯ src/desktop/DesktopSharedCapture.test.ts:217:506


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/5]⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > ends every protected member before accepting more data on unlock_failure
AssertionError: expected { type: 'ready', …(10) } to match object { …(2) }
(10 matching properties omitted from actual)

- Expected
+ Received

  {
-   "code": "worker_unavailable",
-   "type": "protected_desktop_failure",
+   "type": "ready",
  }

 ❯ src/desktop/DesktopSharedCapture.test.ts:217:506


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/5]⎯


 Test Files  1 failed (1)
      Tests  5 failed | 23 skipped (28)
   Start at  20:00:38
   Duration  1.09s (transform 56%, tests 27%, import 17%)


```

### lifetime

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-protected

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (28 tests | 2 failed | 26 skipped) 14ms
   × owns the elevated-default worker until the last viewer and keeps input exclusive 11ms
   × owns the elevated-uac worker until the last viewer and keeps input exclusive 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > owns the elevated-default worker until the last viewer and keeps input exclusive
 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > owns the elevated-uac worker until the last viewer and keeps input exclusive
AssertionError: expected +0 to be null

- Expected:
null

+ Received:
0

 ❯ src/desktop/DesktopSharedCapture.test.ts:214:743


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 26 skipped (28)
   Start at  20:00:39
   Duration  786ms (transform 76%, import 22%, tests 2%)


```
