# クラシック画面切替とタブの高さ統一

画面切替の高さ基準をタブと同じ継承フォント・上下0.5em余白へ変更。幅に応じてラベルが小さくなっても高さは維持。通常・広い幅・最小幅で実DOMの高さ差1px以内を確認。既存の幅追従と折り畳みも成功。

Web build成功。独立レビュー review_history_usage の追加指摘なし。

## 修正前（変更前にビルド済みの成果物で実行）

```text

Running 1 test using 1 worker

(node:1073656) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-12T13:31:34.756Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T13:31:34.757Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-7ijF6T/commands.json","count":0}
  ✘  1 src/specs/classic-screen-switcher.spec.ts:2:1 › classic screen buttons share the available sidebar width at narrow and wide sizes (5.8s)


  1) src/specs/classic-screen-switcher.spec.ts:2:1 › classic screen buttons share the available sidebar width at narrow and wide sizes

    Error: expect(received).toBeLessThanOrEqual(expected)

    Expected: <= 1
    Received:    3.3125

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      41 |       );
      42 |       return Math.max(...heights.map((height) => Math.abs(height - tab!.height)));
    > 43 |     }).toBeLessThanOrEqual(1);
         |        ^
      44 |   };
      45 |   const before = await check();
      46 |   await checkHeight();
        at checkHeight (/workspaces/sodashitsu/packages/e2e/src/specs/classic-screen-switcher.spec.ts:43:8)
        at /workspaces/sodashitsu/packages/e2e/src/specs/classic-screen-switcher.spec.ts:46:3

    Error Context: test-results/classic-screen-switcher-cl-0acf3-th-at-narrow-and-wide-sizes/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/classic-screen-switcher-cl-0acf3-th-at-narrow-and-wide-sizes/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/classic-screen-switcher-cl-0acf3-th-at-narrow-and-wide-sizes/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/classic-screen-switcher.spec.ts:2:1 › classic screen buttons share the available sidebar width at narrow and wide sizes
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test classic-screen-switcher.spec.ts

```

## 修正後

```text

Running 1 test using 1 worker

(node:1075825) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-12T13:32:53.509Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T13:32:53.511Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-Vuaseu/commands.json","count":0}
  ✓  1 src/specs/classic-screen-switcher.spec.ts:2:1 › classic screen buttons share the available sidebar width at narrow and wide sizes (2.3s)

  1 passed (3.3s)

```
