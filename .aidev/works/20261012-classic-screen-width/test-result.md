# クラシック画面切替の幅調整

4ボタンの幅を均等に分け、サイドバー幅へ追従。折り畳み時はflex:noneで従来の縦並びを維持。狭い幅では余白と文字サイズを調整し最長グラフも収める。高さ用pseudo要素の横borderのみ除去。

実DOMで幅差1px以内・全幅利用・幅変更追従・最小幅のラベル省略なし・折り畳みの高さを検証。独立レビューreview_history_usageは追加指摘なし。修正前（既にビルド済みの旧CSS）で実際に失敗することを確認した。

```text

Running 1 test using 1 worker

(node:1019626) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-12T13:10:33.354Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T13:10:33.354Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-MaRYXK/commands.json","count":0}
  ✘  1 src/specs/classic-screen-switcher.spec.ts:2:1 › classic screen buttons share the available sidebar width at narrow and wide sizes (5.5s)


  1) src/specs/classic-screen-switcher.spec.ts:2:1 › classic screen buttons share the available sidebar width at narrow and wide sizes

    Error: expect(received).toBeLessThanOrEqual(expected)

    Expected: <= 1
    Received:    16

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      27 |         return Math.max(...r.widths) - Math.min(...r.widths);
      28 |       })
    > 29 |       .toBeLessThanOrEqual(1);
         |        ^
      30 |     const r = await sizes();
      31 |     expect(Math.abs(r.right - r.edge)).toBeLessThanOrEqual(1);
      32 |     expect(Math.abs(r.left - r.start)).toBeLessThanOrEqual(1);
        at check (/workspaces/sodashitsu/packages/e2e/src/specs/classic-screen-switcher.spec.ts:29:8)
        at /workspaces/sodashitsu/packages/e2e/src/specs/classic-screen-switcher.spec.ts:35:24

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

Webビルド、E2E型チェック、差分チェックが成功。最小幅のスクリーンショットでも全4ラベルを確認。独立レビューは指摘なし。

```text

Running 1 test using 1 worker

(node:1035796) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-12T13:18:51.987Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T13:18:51.988Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-oPjVYZ/commands.json","count":0}
  ✓  1 src/specs/classic-screen-switcher.spec.ts:2:1 › classic screen buttons share the available sidebar width at narrow and wide sizes (2.7s)

  1 passed (4.1s)

```
