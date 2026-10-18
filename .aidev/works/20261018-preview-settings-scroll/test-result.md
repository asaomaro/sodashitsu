# Webプレビュー設定欄の不要なスクロール

原因: preview-toolsに残ったmax-height:35%とoverflow:autoが、設定欄内に小さなスクロール領域を作り、十分な高さでも項目が切れる。内側の制限を削除し、preview-controlsにmin-height:0/overflow:autoを指定。狭い場合は設定欄全体を一つの領域としてスクロールする。

## 検証

- Web build（vue-tsc含む）、E2E typecheck PASS。
- WebPreview unit 3件PASS。
- 実ブラウザremote-web-preview E2E 1件PASS（11.6s）。通常setup・アプリ表示後の設定で内側scrollなし。高さ220pxでは外側がscrollし、末尾helpへ到達。元の高さでは不要barなし。iframe寸法/状態保持・既存HTTP/WS動作も通過。
- 独立レビューreview_view_maximizeに必須指摘なし。修正版成功を確認してクローズ。git diff --check PASS。
- ログ: /workspaces/sodashitsu-check-logs/20261018-maximize/ のbuild-preview-settings-scroll.log、typecheck-preview-settings-scroll.log、unit-preview-settings-scroll.log、e2e-preview-settings-scroll.log。

## 旧ビルドの負対照

修正前のビルドで、内側のscrollHeight-clientHeightが期待<=1に対し16となり失敗。生出力:

```text
  1) src/specs/remote-web-preview.spec.ts:12:1 › agent registers and opens a real HTTP/WS app through B's outbound-only delegation

    Error: expect(received).toBeLessThanOrEqual(expected)

    Expected: <= 1
    Received:    16

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      62 |     const settings = page.locator("[data-web-preview] .preview-controls");
      63 |     // With ample space, setup fields must not be clipped by a nested scrollbar.
    > 64 |     await expect.poll(() => settings.locator(".preview-tools").evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
         |                                                                                                                   ^
      65 |     await expect.poll(() => settings.evaluate(el => el.scrollHeight - el.clientHeight)).toBeLessThanOrEqual(1);
      66 |     const callerEnv = { SODA_PANE_ID: paneId, SODA_SERVER_URL: provider.origin, SODA_PANE_SOCKET: join(provider.stateDir, "pane.sock"), ...(process.platform === "win32" ? { SODACTL_TOKEN: provider.token } : {}) };
      67 |     const registered = JSON.parse(await run(["preview", "register", "--name", "frontend", "--port", String(webPort)], callerEnv)) as { id: string };
        at /workspaces/sodashitsu/packages/e2e/src/specs/remote-web-preview.spec.ts:64:115

    Error Context: test-results/remote-web-preview-agent-r-237e1--s-outbound-only-delegation/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-web-preview-agent-r-237e1--s-outbound-only-delegation/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-web-preview-agent-r-237e1--s-outbound-only-delegation/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-web-preview.spec.ts:12:1 › agent registers and opens a real HTTP/WS app through B's outbound-only delegation
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL  @sodashitsu/e2e@0.1.0 test: `playwright test src/specs/remote-web-preview.spec.ts`
Exit status 1

```
