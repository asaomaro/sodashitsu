# 検証記録

## 条件

baselineはmain 3dc17129905a2b0f540f8a672470699fde6ead9f（PR192の次frame準備を含む）。currentは本差分（初回pointer-only修正後）。手元のWindowsホストmakkuの通常デスクトップ3200×2000を1280×800へ縮小。Windows PowerShell/.NET Framework、JPEG65、差分なし、30fps設定、目標60frame。入力/clipboard/解像度変更を要求せず、画像やtraceを保存しない。WSLのA/BをB発委譲でつなぎ、実製品の共有窓をChromium153で開いてcanvas描画を観測した。

同一ホストloopbackでありsr-pc・実WAN・入力反映遅延・長時間連続・GPU使用率の測定ではない。表示内容は固定していない。CPUは1core=100%。初回から最終frameまでの定常区間を使い、helper起動・shaderコンパイル等の初期化時間をFPS/CPUへ含めない。取得・縮小はcaptureMs、圧縮はencodeMs。viewerWireBackend=windows-gdiは旧viewer互換の値でGPU利用を証明しない。helper自身の初回readyとcapture-only測定、生成window実画面検証を別途確認した。初回readyは途中のGDI fallbackを保証しない。

## 実画面→製品ブラウザ比較

負荷を重ねず順番に実行。ACK追加なしはbaseline→current各1回。ACK100ms追加はbaseline→current→current→baseline各2回。60枚を待つ非同期停止のためcurrentの追加待ちなしは61枚を計測した。frame数・平均値はJSONの実数を使う。

| run | ACK追加ms | frames | fps | 取得縮小p95 ms | 圧縮p95 ms | helperCPU % | peak RSS MiB | Mbps |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| dxgi-browser-0-baseline | 100 | 60 | 7.734 | 96.341 | 7.656 | 44.45 | 133.15 | 8.680 |
| dxgi-browser-1-dxgi | 100 | 60 | 7.828 | 7.663 | 7.214 | 14.93 | 174.81 | 8.439 |
| dxgi-browser-2-dxgi | 100 | 60 | 7.865 | 7.835 | 5.432 | 13.54 | 178.37 | 8.128 |
| dxgi-browser-3-baseline | 100 | 60 | 7.703 | 61.044 | 6.614 | 35.49 | 136.07 | 8.349 |
| dxgi-browser-zero-0-baseline | 0 | 60 | 12.410 | 78.477 | 5.888 | 53.90 | 136.40 | 13.887 |
| dxgi-browser-zero-1-dxgi | 0 | 61 | 21.298 | 6.244 | 6.711 | 29.40 | 178.01 | 22.590 |

ACK追加なしの改善は約1.72倍。ACK100ms追加時の平均fpsは7.72→7.85で、主な改善はhelperCPUの平均39.97→14.23%。同一画質設定でも縮小フィルター・画面内容・fpsが違うため帯域の値から圧縮性能だけを結論しない。メモリは約42MiB増える。

再現: `SODA_DESKTOP_BENCH_COMMAND`に信頼するWindows helperコマンド配列をJSONで指定し、`SODA_DESKTOP_BENCH_DELTAS=0 SODA_DESKTOP_BENCH_OUT=<dir> node scripts/remote-desktop/benchmark.mjs --width 1280 --fps 30 --frames 60 --ack-delay-ms 0`。ACK100msは末尾を100にする。baselineのnative helperはgit showで上記mainのcs/ps1をWindows一時フォルダへ取り出したもの、currentは本差分。サーバー・viewerは両方ともcurrentビルドを用い、capture backendだけ比較した。

## 取得・圧縮のみの再現用ハーネス

`benchmark-capture.mjs`を同じcurrent helperへ実行。auto、DXGI提示なし、auto+helperの`-CaptureBackend gdi`を比較した。差分なし、cursorなし、JPEG65、30fps目標、60枚、即時ACK。サーバー/ブラウザを含まない。

| モード | 初回ready | fps | 取得縮小p95 ms | CPU % | peak RSS MiB |
|---|---|---:|---:|---:|---:|
| gdi | windows-gdi | 8.747 | 105.480 | 64.63 | 135.83 |
| dxgi | windows-dxgi | 21.326 | 8.191 | 48.57 | 172.20 |
| forced-gdi | windows-gdi | 8.088 | 107.129 | 62.76 | 135.71 |

新helperにDXGIを提示しない場合とローカル強制GDIで各60枚が配信されることを確認。旧helperは上記ブラウザ比較baselineで新providerの追加configure項目を無視して動作した。helper初回readyと性能値だけでは途中のfallback有無を厳密に判別できない。

## Native検証

`validate-unlock-helper.ps1`: SCM/OS入力/実画面取得なしで既存native検証が通過。
`validate-dxgi.ps1`: GPU上の生成画像だけで縮小、色、向き、奇数幅、保持画像、Dispose、未対応出力fallbackを検証。
`validate-dxgi.ps1 -CaptureDesktop`: 通常画面に一時的な4色窓を表示し、DXGI→GPU縮小の色と座標を検証。入力送信・画像保存・表示mode変更なし。

実画面検証の追加で、初回Acquireがpresent=0/accumulated=0のpointer-onlyでも成功し、黒い未確定画像を配信し得る不具合を検出した。初回pointer-only/timeoutはdestinationへ触らずfalseを返し、HostはそのframeをGDIで取り、以後の有効presentでDXGIへ移るよう修正した。修正だけを外すnegativeで下記の実画面テストが落ち、復元後に通過した。


### 既存native checks

```text
desktop_unlock_pipe_cancelled
desktop_unlock_utf8_pipe_passed
desktop_unlock_duplex_pipe_passed
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
desktop_unlock_process_query_passed
desktop_lock_cover_checks_passed
desktop_input_checks_passed
desktop_frame_preparation_checks_passed
frame_preparation_model: duration=5000ms capture_encode=65ms ack=100ms fps_limit=30 serial_frames=31 overlapped_frames=50; deterministic model, not a desktop benchmark
desktop_unlock_checks_passed
desktop_unlock_no_console_utf8_passed
```

### GPU+live checks

```text
desktop_dxgi_gpu_checks_passed: generated pixels only; odd widths, GPU scaling, orientation, BGR, retained source, disposal, fallback
desktop_dxgi_live_capture_passed: generated window captured through DXGI and GPU downscale; no images saved or input sent
```

### Negative: pointer-only保護のみ除去

```text
desktop_dxgi_gpu_checks_passed: generated pixels only; odd widths, GPU scaling, orientation, BGR, retained source, disposal, fallback
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Initial pointer-only surface was published"
発生場所 C:\Users\makku\AppData\Local\Temp\soda-dxgi-wce9ti6l\validate-dxgi.ps1:7 文字:24
+ if ($CaptureDesktop) { [SodaDesktopTests.DxgiLiveChecks]::Run() }
+                        ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
```

### Negative: provider交渉/legacy mappingをHEADへ戻す

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-input

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (29 tests | 1 failed | 28 skipped) 82ms
   × negotiates DXGI only on the local helper channel and keeps legacy viewer ready compatible 80ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > negotiates DXGI only on the local helper channel and keeps legacy viewer ready compatible
AssertionError: expected undefined to deeply equal [ 'dxgi' ]

- Expected:
[
  "dxgi",
]

+ Received:
undefined

 ❯ src/desktop/DesktopRelay.test.ts:462:37
    460|   await expect.poll(() => viewer.frames.length).toBeGreaterThan(0);
    461|   const configure = JSON.parse(await readFile(f.record + ".configure.j…
    462|   expect(configure.captureBackends).toEqual(["dxgi"]);
       |                                     ^
    463|   expect(f.startRequests[0]!.options).not.toHaveProperty("captureBacke…
    464|   const ready = viewer.messages.find(m => m.type === "ready");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 28 skipped (29)
   Start at  15:08:03
   Duration  773ms (transform 67%, import 21%, tests 12%)
```

両negativeとも対象production sourceをbyte-exactで復元した。C#は各回Add-Typeで再コンパイル。providerテストはTypeScriptソースを実行し、protocolは先に新しいbuildへ更新済み。

## 総合検証

`pnpm build`、`pnpm typecheck`通過。`pnpm exec vitest run --maxWorkers=4`: 737 files / 11295 tests passed、365.26s。`pnpm smoke`: PASS。関係E2E `remote-desktop.spec.ts remote-desktop-delta.spec.ts remote-desktop-unlock.spec.ts remote-desktop-input.spec.ts remote-desktop-cover.spec.ts`: 9 passed (43.6s)。先に実行したnative実画面→製品browser性能検証6回もそれぞれ通過。

複数GPU、回転環境、仮想RDP、実WAN、長時間、物理入力反映遅延は未検証。回転・DXGI/API失敗はGDI経路を維持する。
