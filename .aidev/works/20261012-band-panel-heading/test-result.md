# 検証

修正前ソースを復元してWebを再ビルド、E2Eで寸法比較の失敗を確認。修正ソースを復元しcmp一致確認して再ビルド。

## 負の対照 生出力

```text

Running 1 test using 1 worker

(node:425122) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-12T09:22:19.215Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T09:22:19.216Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-o3xtw6/commands.json","count":0}
{"ts":"2026-10-12T09:22:19.675Z","level":"info","msg":"display set","paneId":"17c1bc22-95d9-45f9-aa72-4d16bc0a2826","name":"view-688392144121426b8d569801989","kind":"panel","format":"html","bytes":444,"rev":1}
{"ts":"2026-10-12T09:22:19.682Z","level":"info","msg":"display set","paneId":"17c1bc22-95d9-45f9-aa72-4d16bc0a2826","name":"view-e2e19c242fd146a3bf6eeda18bf","kind":"band","format":"html","bytes":1025,"rev":1}
{"ts":"2026-10-12T09:22:19.838Z","level":"info","msg":"display set","paneId":"17c1bc22-95d9-45f9-aa72-4d16bc0a2826","name":"view-e2e19c242fd146a3bf6eeda18bf","kind":"band","format":"html","bytes":1067,"rev":2}
  ✘  1 src/specs/statusline.spec.ts:162:1 › collapsed views use an independent tray beside an open band and title visibility is configurable (1.8s)


  1) src/specs/statusline.spec.ts:162:1 › collapsed views use an independent tray beside an open band and title visibility is configurable 

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 6
    + Received  + 6

      Object {
    -   "fontSize": "12px",
    -   "fontWeight": "700",
    -   "iconHeight": 12,
    -   "iconWidth": 9,
    -   "leftInset": 8,
    -   "minHeight": "24px",
    +   "fontSize": "16px",
    +   "fontWeight": "400",
    +   "iconHeight": 16,
    +   "iconWidth": 12,
    +   "leftInset": 0,
    +   "minHeight": "auto",
      }

      203 |       };
      204 |     }, container);
    > 205 |   expect(await appearance(bandGrip, "[data-pane-band]")).toEqual(
          |                                                          ^
      206 |     await appearance(panelGrip, "[data-display-head]"),
      207 |   );
      208 |   await page.screenshot({ path: "/tmp/band-panel-heading-matched.png" });
        at /workspaces/sodashitsu/packages/e2e/src/specs/statusline.spec.ts:205:58

    Error Context: test-results/statusline-collapsed-views-097a1--visibility-is-configurable/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/statusline-collapsed-views-097a1--visibility-is-configurable/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/statusline-collapsed-views-097a1--visibility-is-configurable/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/statusline.spec.ts:162:1 › collapsed views use an independent tray beside an open band and title visibility is configurable 
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test statusline.spec.ts --grep collapsed views use

```

Web build・E2E typecheck成功。部品テスト15件成功。statusline E2E8件成功（実DOMの寸法一致を含む）。/tmp/band-panel-heading-matched.pngを目視確認。git diff --check成功。
