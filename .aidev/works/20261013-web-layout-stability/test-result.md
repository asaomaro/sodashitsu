# 検証

- Web build（型検査を含む）: PASS
- E2E typecheck: PASS
- 関連ユニットテスト: PaneFrame / PaneLayout / ViewSync、3 files / 103 tests PASS
- 実 Chromium: 7サイズの連続寸法測定、ファイル一覧ホイール操作 PASS
- 実 Chromium: 既存 native statusline の設定・行数リサイズ・モバイル表示 PASS
- 実 Chromium: 低いログイン画面のスクロール PASS（整数のスクロール位置に対する分数ピクセルのボタン境界に1pxの許容を設定）。
- 独立レビューの修正後再点検: ブロッカーなし

## 負の対照（生出力）

App.vue の製品修正のみ戻し、Web を再ビルドして同じ回帰テストを実行。rootのはみ出しを検知し失敗。finallyでソースを元のバイト列へ戻して一致を確認し、修正版を再ビルドした。

```text

Running 1 test using 1 worker

(node:349476) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-13T13:20:06.772Z","level":"info","msg":"agent manifests loaded","ok":22,"total":22}
{"ts":"2026-10-13T13:20:06.773Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-gw3dAn/commands.json","count":0}
{ width: 2048, height: 1224 } [ '[2048,1224,2048,1224,1791,1118.625]' ]
{ width: 2056, height: 1179 } [ '[2056,1179,2056,1179,1799,1073.625]' ]
{ width: 1280, height: 720 } [ '[1280,720,1280,720,1023,614.625]' ]
{ width: 1040, height: 620 } [ '[1040,620,1040,620,783,514.625]' ]
{ width: 800, height: 60 } [ '[800,60,800,93,543,0]' ]
  ✘  1 src/specs/layout-stability.spec.ts:7:1 › desktop layout remains inside the viewport and stops resizing with an agent statusline (14.2s)


  1) src/specs/layout-stability.spec.ts:7:1 › desktop layout remains inside the viewport and stops resizing with an agent statusline 

    Error: expect(received).toBeLessThanOrEqual(expected)

    Expected: <= 60
    Received:    93

      61 |       const [width, height, scrollWidth, scrollHeight] = JSON.parse(settled.at(-1)!);
      62 |       expect(scrollWidth).toBeLessThanOrEqual(width);
    > 63 |       expect(scrollHeight).toBeLessThanOrEqual(height);
         |                            ^
      64 |     }
      65 |     // Internal views must keep their own mouse scrolling after document clipping.
      66 |     await Promise.all(
        at /tmp/sodashitsu-plugin-components/packages/e2e/src/specs/layout-stability.spec.ts:63:28

    Error Context: test-results/layout-stability-desktop-l-80e32-ng-with-an-agent-statusline/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/layout-stability-desktop-l-80e32-ng-with-an-agent-statusline/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/layout-stability-desktop-l-80e32-ng-with-an-agent-statusline/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/layout-stability.spec.ts:7:1 › desktop layout remains inside the viewport and stops resizing with an agent statusline 
undefined
/tmp/sodashitsu-plugin-components/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test src/specs/layout-stability.spec.ts -g desktop layout
```

## 限界

利用者の画像と同じサイズで継続的な振動は再現しなかった。修正が除去するのはページ全体のはみ出し・スクロールバーによる寸法変化である。実機確認は別途必要。
