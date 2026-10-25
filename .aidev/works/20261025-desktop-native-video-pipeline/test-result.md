# 検証

## 観測の範囲

sr-pcの利用者画像は30fps設定、1920×1200、描画4.6fps。稼働中の実画面の再計測値ではない。読み取り専用で確認した時点ではhelperはleaseのみでCPU 0。実画面ブラウザ試行は初回画像待ちでtimeoutしたため性能値として採用しない。ロック解除やguardの迂回はしない。

## ブラウザ比較

Chromiumの製品canvasを観測。Windows hardware encoderで事前生成した640×360のH264 fixtureを模擬helperから送り、ブラウザの描画ACKへ100ms追加する。実画面取得・圧縮・実WANを含まない。30fps要求、60枚以上、各1回。

```text
NATIVE_WINDOW_BENCH {"pipelined":false,"frames":64,"fps":8.538320796909941,"ackDelayMs":100,"source":"hardware-generated fixture; no actual desktop or physical network"}
NATIVE_WINDOW_BENCH {"pipelined":true,"frames":80,"fps":26.041666666717834,"ackDelayMs":100,"source":"hardware-generated fixture; no actual desktop or physical network"}
```

初回native E2E 5 passed / explicit real capture benchmark 1 skipped。

## Windows

実際のwindows-helper.ps1 -ValidateOnlyの結合コンパイルとvalidate-unlock-helper.ps1をWindows PowerShell 5.1で実行。新規3枚windowのFIFO・上限・重複・並び違反・枠の再利用・旧版1枚を純粋テストで確認。OS入力や実画面取得は行わない。

```text
desktop_helper_compiled
desktop_frame_preparation_checks_passed
desktop_unlock_checks_passed
```

## 修正を戻す検証

実装のv2提示だけを戻して再ビルドし、同じブラウザの3枚試験が失敗することを確認する。完了後に元ファイルとのcmp一致を確認する。

```text
  1) src/specs/remote-desktop-native-video.spec.ts:320:3 › native video three-frame window under 100ms draw ACK delay

    Error: expect(received).toBeGreaterThan(expected)

    Expected: > 18
    Received:   8.803431941108872

      406 |         fps = ((times.length - 1) * 1000) / (times.at(-1)! - times[0]!);
      407 |       if (pipelined) {
    > 408 |         expect(fps).toBeGreaterThan(18);
          |                     ^
      409 |         await expect(view.locator("[data-native-video-stats]")).toContainText("3枚");
      410 |       } else expect(fps).toBeLessThan(12);
      411 |       console.log(
        at /workspaces/sodashitsu-desktop-input/packages/e2e/src/specs/remote-desktop-native-video.spec.ts:408:21
```

修正ファイルを復元しcmp一致を確認。再ビルド後の全体試験を実施。

## 最終確認

- pnpm build / pnpm typecheck: 成功。
- 全体vitest --maxWorkers=4: 739 files / 11315 tests passed、336.41秒。
- 関連E2E: 15 passed / 明示指定の実画面benchmark 1 skipped。最終比較8.83→26.20fps。
- clean worktreeのpnpm smoke: PASS。
- 元の作業フォルダへ利用者の変更を保持して3-wayで反映し、build成功、関連56 tests passed。
- Windows生成映像のhardware-only MFT / NV12 / SPS-IDR / timestamp / packet limit検証: 成功。
- 独立レビュー: 指摘なし。
