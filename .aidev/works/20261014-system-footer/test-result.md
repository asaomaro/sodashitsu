# 検証

- 全パッケージbuild / typecheck: PASS
- TUI全体と変更関連: 80 files / 877 tests PASS
- 機能ユニット: 6 files / 11 tests PASS
- 実Chromium: 設定保存・表示項目・2画面で共有・再読込・PC最下部・モバイル・予約切替時のPTY寸法・予約フッター、PASS
- 既存レイアウト安定化と低いログイン画面のE2E: PASS
- 修正版の起動確認は作業フォルダ外の/tmpから実行

## 全体テストの既存不整合

初回全体10724件では2件失敗。設定注記位置による退行は修正して該当テストを再実行し成功。残るagent.promptテストは、origin/mainの実装300msに対してorigin/mainのテスト1000msという既存不整合（対象3ファイルのmainとの差分なし）。この作業では他セッションの未コミット入力修正を取り込まない。

```text
 FAIL  |@sodashitsu/server| src/surface/methods/agent.test.ts > agent.prompt > 本文と Enter を 2 部分にして1000msの間を置くモード付き入力として書き、送信を始めた時点のエージェントを返す（AC2・AC4）
AssertionError: expected 300 to be 1000 // Object.is equality

- Expected
+ Received

- 1000
+ 300

 ❯ src/surface/methods/agent.test.ts:88:38
     86|     expect(result).toEqual({ ok: true, result: { agent: agent() } });
     87|     expect(s.host.modal).toHaveLength(1);
     88|     expect(s.host.modal[0]!.delayMs).toBe(1000);
       |                                      ^
     89|     expect(s.host.written).toEqual(["line1\nline2", "\r"]);
     90|     expect(s.noteInteraction).toHaveBeenCalledWith("c1", "p1");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/2]⎯


```

## 負の対照: 未対応項目の表示

修正だけを戻して回帰テストが失敗。元のバイト列に戻して一致を確認。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-system-footer

 ❯ |@sodashitsu/protocol| src/systemFooter.test.ts (3 tests | 1 failed) 7ms
   × distinguishes loaded but unsupported fields from loading and connection failure 4ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/systemFooter.test.ts > distinguishes loaded but unsupported fields from loading and connection failure
AssertionError: expected 'サーバー情報を読み込み中…' to be '選択した情報は利用できません' // Object.is equality

Expected: "選択した情報は利用できません"
Received: "サーバー情報を読み込み中…"

 ❯ src/systemFooter.test.ts:37:65
     35|
     36| it("distinguishes loaded but unsupported fields from loading and conne…
     37|   expect(systemFooterPlaceholder({} as SystemResources, false)).toBe(
       |                                                                 ^
     38|     "選択した情報は利用できません",
     39|   );

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 passed (3)
   Start at  20:13:36
   Duration  135ms (transform 64%, import 18%, tests 13%, worker 5%)

```

## 負の対照: モバイル予約切替

プレースホルダーだけを外してWebを再ビルド。実Chromiumで裏側の端末が24px拡大したことを検知し失敗。元のバイト列に復元・一致確認し、Webを再ビルド。

```text

Running 1 test using 1 worker

(node:251561) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-14T11:13:49.572Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-14T11:13:49.572Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-QxHzB4/commands.json","count":0}
  ✘  1 src/specs/system-footer.spec.ts:3:1 › system footer settings persist, share across clients, and reserve desktop/mobile space (10.0s)


  1) src/specs/system-footer.spec.ts:3:1 › system footer settings persist, share across clients, and reserve desktop/mobile space 

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: 575
    Received: 599

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      45 |   const underlyingHeight = (await page.locator(".mobile-shell-pane").boundingBox())!.height;
      46 |   await page.getByRole("button", { name: "予約", exact: true }).click();
    > 47 |   await expect.poll(async () => (await page.locator(".mobile-shell-pane").boundingBox())!.height).toBe(underlyingHeight);
         |                                                                                                   ^
      48 |   await expect(page.locator(".mobile-schedules [data-system-footer]")).toContainText("メモリ");
      49 |   await expect(footer).toHaveCount(1);
      50 |   const schedulesFooter = (await footer.boundingBox())!,
        at /workspaces/sodashitsu-system-footer/packages/e2e/src/specs/system-footer.spec.ts:47:99

    Error Context: test-results/system-footer-system-foote-3bf0a-eserve-desktop-mobile-space/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/system-footer-system-foote-3bf0a-eserve-desktop-mobile-space/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/system-footer-system-foote-3bf0a-eserve-desktop-mobile-space/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/system-footer.spec.ts:3:1 › system footer settings persist, share across clients, and reserve desktop/mobile space 
undefined
/workspaces/sodashitsu-system-footer/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test src/specs/system-footer.spec.ts
```
