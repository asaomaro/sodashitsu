# 共有クリップボードの検証

生成memory clipboardと合成画面のみ。OS clipboard/capture/input/録音、保護service/driverの導入・更新は行わない。

- router7件（所有者排他、text ID/世代衝突、rich UUID/read終了、遅延旧reply、非owner revoke、cancel直後再開、既存wrapper3秒timeout→cancel後再開）、pool1件（input/clipboard所有者分離）、relay5件（viewer/B/helper gate/default無効）追加。focused3files226件＋追加router2件成功。
- source fullは11,920件成功、PTYのbeforeAllだけが整形後sourceのmtime>distを検出して失敗し1件skip。製品実装は変えずfresh build→当該PTY1件成功、合計11,921件の検査を完了。全体を成功1runとは記さない。
- rootはfresh build/typecheck後803files / 11,983tests全件成功。sourceのtypecheck/fresh buildも成功。
- source新browser3件（plain/encryptedの2窓競合拒否→解除→引継ぎ、text/HTML往復、delayed read取消→即write、連続read、first退出、旧helper停止→default復帰）成功。
- 既存rich8件とshared cursor4件も成功、関連browser合計15件。初回既存rich roundtrip/pipe-fallback2件は旧shimがprotocol stringしか識別せず失敗、変更前WTでも同じ2件を再現。専用laneの1要素arrayを同じprotocolとして識別するtest-only修正後、rich8＋新3=11件全て成功。判定は実DOM/canvasまたはブラウザが送受信した専用lane。
- cancel browser追加時のボタン名誤記（正しくは「画像・書式の転送を取り消す」）の試行は中止し成功に数えない。
- root新browserは初回plain/旧helper2成功・暗号化cohort再接続で1失敗（traceのalertは暗号化接続確立失敗）。同じ最終sourceの暗号化1件を再実行し成功。初回の不安定な接続も記録し、製品修正済みとは主張しない。
- 独立check worktree frozen install/fresh build/smoke PASS。負例3件は意図した失敗、finallyでexact bytesに復元。
- 独立taskcheck/全体review2件にmustなし。cancel境界の推奨を追加し再レビュー通過。追加test shim差分も独立再レビュー通過。

## 負例 non-owner

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-clipboard-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedClipboard.test.ts (7 tests | 1 failed | 6 skipped) 18ms
   × keeps a clipboard owner independent and refuses another viewer's grant, revoke, and command 16ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedClipboard.test.ts > keeps a clipboard owner independent and refuses another viewer's grant, revoke, and command
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSharedClipboard.test.ts:19:38
     17|   const f = fixture();
     18|   expect(f.pool.grant("a", true, 1)).toBe(true);
     19|   expect(f.pool.grant("b", true, 1)).toBe(false);
       |                                      ^
     20|   expect(f.pool.grant("b", false, 2)).toBe(false);
     21|   f.pool.command("b", { type: "clipboard", operation: "read", id: 1, g…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  00:40:45
   Duration  1.32s (transform 74%, import 23%, tests 2%, worker 1%)


```

## 負例 text-id

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-clipboard-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedClipboard.test.ts (7 tests | 1 failed | 6 skipped) 12ms
   × translates reused text ids/generations and drops old results after handover 11ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedClipboard.test.ts > translates reused text ids/generations and drops old results after handover
AssertionError: expected 7 not to be 7 // Object.is equality
 ❯ src/desktop/DesktopSharedClipboard.test.ts:38:23
     36|   f.pool.command("b", { type: "clipboard", operation: "read", id: 7, g…
     37|   const next = f.write.mock.calls.at(-1)![0];
     38|   expect(next.id).not.toBe(first.id);
       |                       ^
     39|   expect(next.generation).toBeGreaterThan(first.generation);
     40|   f.pool.receive({ type: "clipboard_result", id: first.id, ok: true, t…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  00:40:48
   Duration  1.29s (transform 74%, import 24%, tests 1%, worker 1%)


```

## 負例 cancel-route

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-clipboard-check

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedClipboard.test.ts (7 tests | 1 failed | 6 skipped) 9ms
   × keeps an immediate new rich transaction after cancel isolated from delayed old replies 7ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedClipboard.test.ts > keeps an immediate new rich transaction after cancel isolated from delayed old replies
AssertionError: expected '92b7ad36-2b4c-414b-9e19-888844575d32' not to be '92b7ad36-2b4c-414b-9e19-888844575d32' // Object.is equality
 ❯ src/desktop/DesktopSharedClipboard.test.ts:118:20
    116|   f.pool.command("a", { type: "clipboard_rich", operation: "read", id:…
    117|   const next = f.write.mock.calls.at(-1)![0].id;
    118|   expect(next).not.toBe(old);
       |                    ^
    119|   for (const stage of ["cancelled", "done", "chunk"] as const)
    120|     f.pool.receive({

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  00:40:50
   Duration  1.14s (transform 72%, import 27%, tests 1%)


```
