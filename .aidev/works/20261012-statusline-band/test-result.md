# Statusline 帯の表示修正

帯の iframe 共通 root 余白を除き、先頭24px内で本文を中央揃え。上下どちらの帯でも掴みボタン・機能名を上端に固定する。パネル形式の余白は維持する。

Web/server build成功。実ブラウザで既定24px帯の縦overflowなし、掴み/本文の中心位置、D&Dで拡大した帯の上端位置、幅720pxでのoverflowなしを検証。独立レビュー review_history_usage は追加指摘なし。

修正前の2ファイルを戻してserver/webを再buildし、以下の回帰テストが失敗した。修正版を復元しcmpで一致を確認し、再buildした。

```text

Running 1 test using 1 worker

(node:833675) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-12T12:07:33.492Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T12:07:33.493Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-uL0VQK/commands.json","count":0}
{"ts":"2026-10-12T12:07:34.164Z","level":"info","msg":"display set","paneId":"bbf3fe83-1be5-426b-8963-c658b0976490","name":"view-cb1aedf27a0e49a7a68f69ee8f4","kind":"band","format":"html","bytes":1029,"rev":1}
{"ts":"2026-10-12T12:07:38.496Z","level":"info","msg":"display set","paneId":"bbf3fe83-1be5-426b-8963-c658b0976490","name":"view-cb1aedf27a0e49a7a68f69ee8f4","kind":"band","format":"html","bytes":1029,"rev":2}
  ✘  1 src/specs/statusline.spec.ts:351:1 › statusline band centers text without vertical overflow at compact and narrow sizes (8.0s)


  1) src/specs/statusline.spec.ts:351:1 › statusline band centers text without vertical overflow at compact and narrow sizes

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 2
    + Received  + 2

      Object {
    -   "centered": 0,
    -   "overflow": 0,
    +   "centered": 6,
    +   "overflow": 12,
      }

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      378 |         })),
      379 |       )
    > 380 |       .toEqual({ overflow: 0, centered: 0 });
          |        ^
      381 |     if (hasGrip) {
      382 |       const grip = await page.locator(".band-grip").boundingBox();
      383 |       const frame = await page.locator(".pane-bands iframe").boundingBox();
        at assertLayout (/workspaces/sodashitsu/packages/e2e/src/specs/statusline.spec.ts:380:8)
        at /workspaces/sodashitsu/packages/e2e/src/specs/statusline.spec.ts:389:9

    Error Context: test-results/statusline-statusline-band-0f976-at-compact-and-narrow-sizes/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/statusline-statusline-band-0f976-at-compact-and-narrow-sizes/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/statusline-statusline-band-0f976-at-compact-and-narrow-sizes/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/statusline.spec.ts:351:1 › statusline band centers text without vertical overflow at compact and narrow sizes
undefined
/workspaces/sodashitsu/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test statusline.spec.ts --grep centers text without vertical overflow

```

最終確認：上帯・下帯の両方を実DOMで検証し2 passed。

```text

Running 2 tests using 1 worker

(node:838635) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-12T12:09:58.399Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T12:09:58.402Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-BBDKbu/commands.json","count":0}
{"ts":"2026-10-12T12:09:59.130Z","level":"info","msg":"display set","paneId":"c6337d9e-b6ac-4c49-92e4-a4f931ef6034","name":"view-a435c69acb6e4a2db8734a5bacb","kind":"band","format":"html","bytes":1328,"rev":1}
  ✓  1 src/specs/statusline.spec.ts:352:3 › statusline band centers text without vertical overflow at compact and narrow sizes (band-top) (3.0s)
{"ts":"2026-10-12T12:10:01.340Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-12T12:10:01.341Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-QBiD9F/commands.json","count":0}
{"ts":"2026-10-12T12:10:01.830Z","level":"info","msg":"display set","paneId":"0bb37324-e73b-49c2-8bf8-86f399f5466d","name":"view-8510d75640c041c5b436c6830a1","kind":"band","format":"html","bytes":1328,"rev":1}
{"ts":"2026-10-12T12:10:01.967Z","level":"info","msg":"display set","paneId":"0bb37324-e73b-49c2-8bf8-86f399f5466d","name":"view-8510d75640c041c5b436c6830a1","kind":"band","format":"html","bytes":1328,"rev":2}
  ✓  2 src/specs/statusline.spec.ts:352:3 › statusline band centers text without vertical overflow at compact and narrow sizes (band-bottom) (2.9s)

  2 passed (8.0s)

```
