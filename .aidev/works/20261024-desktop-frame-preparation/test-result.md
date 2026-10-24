# 通常画面の次フレーム準備とPNG並列復号

## 仕様

前の1枚を送信してブラウザACKを待つ間に、通常画面では次の1枚を取得・圧縮する。通信上の未ACKは従来どおり1枚までで、JSON/画像プロトコル・権限は変えない。準備枠も1枚までで、準備完了後200msを超えた画像は破棄して取り直す。取得自体が遅い場合は準備完了時刻を基準にするため進行不能にならない。入力、キー/ボタン解放、画質変更、keyframe要求で準備画像を破棄する。

seq、差分の基準、生画素previous、contentId、全画面画像の時刻は実際に送信したときだけ更新する。準備だけして破棄した画像を差分基準に使わない。送信直前にも既存のdesktop guardを確認する。Winlogonは先行準備を使わず従来のACK後撮影を維持し、初期ロック画面の非撮影経路も変わらない。

ブラウザでは最大8領域のPNGを並列復号する。allSettledで遅れて成功するbitmapまで回収し、全領域の成功・寸法・接続世代を確認後にだけ、元の順番で描画してchainを進める。失敗時の部分描画を避け、取得したbitmapをすべてcloseする。

## 性能比較

Windows実機のGDI/JPEG取得を、WSL上の専用A/Bサーバーとheadless Chromiumで表示して計測。入力は許可せず、実画面画像は成果物へ保存していない。1280幅・JPEG65・差分なし・60枚・ブラウザACKに100ms待ちを追加。旧版はdc115ebb、改善版は今回のフレーム準備経路。30fps設定は旧→新→旧→新→新→旧の各3回、10fps設定は各1回。画面内容は固定しておらず、後半でJPEGサイズが変化している。CPUはhelperの1コア換算でPC全体のCPUではない。

- 30fps設定: 実効4.66〜4.97 → 7.86〜7.94fps。平均約4.79→7.89（約1.65倍）。
- 10fps設定: 実効4.82→7.11fps（単回比較）。
- FPS増に伴ってCPU/帯域も増えた。詳細はsummary.jsonと各native JSON。30fps設定のCPU平均は約22.7→37.4%/1core、帯域平均約5.1→8.5Mbps、peak RSSは両方約137MiB。
- 実行中のWindows画面・同一ホスト・人工ACK待ちの比較であり、sr-pc・WAN・入力遅延・長時間性能を表すものではない。GDI取得自体の最適化や動画codecへの変更ではない。

PNG復号は、実際の旧/新render.tsをTypeScriptからモジュール化し、Chromiumで生成PNG8領域（計1024×512、804624bytes）を描画。交互実行、5回warmup後各25回。render-comparison.jsonの比較は平均16.73→9.94ms、p95 20.6→13.4ms。生成画像での比較であり、実デスクトップ入力遅延ではない。

性能ハーネスでは隠れた端末paneの購読が解除されるため、以前のterminal echo計測は無効な待ちになっていた。今回のデスクトップ専用計測ではその値をnullにし、入力遅延を測っていないことを明記した。最初のnative試行はこの古いecho待ちで失敗したので比較値には採用していない。native JSONのsourcePngEncodeP95Msは旧名称でJPEG encode時間も含む。現在のハーネスはsourceEncodeP95Msへ改称した。

## 検証

- Windowsの純粋native検証成功。キューの上限、ACK前に送らない、遅いcaptureの進行、200msの期限、1fpsでも期限が緩まないこと、入力/画質/keyframeによる破棄、serial/overlap両モードを確認。65msの生成+100ms ACKの決定的モデルでは5秒31→50枚。これは実機性能値とは別。
- renderer unit4件成功。2領域を同時に復号し、後の領域が先に完成しても途中描画せず、先の失敗後に成功するbitmapもcloseすることを確認。
- 別コンテキストreview_transferがnative差分基準・準備画像破棄・secureモード・bitmap解放をレビューし、指摘なし。CPU/帯域と入力遅延未計測も併記する。

## 負対照

旧render.tsだけに戻すと同時decode数が1になり、並列開始の回帰テストが失敗した。nativeの先行準備だけを無効にした一時コピーでは実際のキューのモデル比較が失敗した。ソースをバイト単位で復元し、Windows検証を通してから最終build/全体テストを行う。

### frame-render-negative

```text
 FAIL  |@sodashitsu/web| src/desktop/render.test.ts > decodes patches concurrently while retaining atomic drawing and patch order
AssertionError: expected "vi.fn()" to be called 2 times, but got 1 times
 ❯ src/desktop/render.test.ts:74:18
     72|   vi.stubGlobal("createImageBitmap",decode);
     73|   const rendering=renderDesktopUpdate(canvas,frame,chain,()=>true);
     74|   expect(decode).toHaveBeenCalledTimes(2);
       |                  ^
     75|   resolveSecond(second);await Promise.resolve();expect(drawImage).not.…
     76|   resolveFirst(first);await expect(rendering).resolves.toBe(true);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  12:14:07
   Duration  862ms (transform 53%, environment 30%, import 16%, tests 1%)
```

### frame-native-negative

```text
desktop_unlock_pipe_cancelled
desktop_unlock_utf8_pipe_passed
desktop_unlock_duplex_pipe_passed
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
desktop_unlock_process_query_passed
desktop_lock_cover_checks_passed
desktop_input_checks_passed
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Preparation did not overlap ACK wait"
発生場所 C:\Users\makku\AppData\Local\Temp\soda-frame-prepared-h2_wilqk\validate-unlock-helper.ps1:11 文字:1
+ [SodaDesktopTests.FramePreparationChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
```

独立レビューで、nativeベンチマーク失敗時のPlaywright traceに実画面が残り得る点を指摘。nativeモードではtrace/screenshot/videoを無効化し、成果物を性能数値に限定した。初期の不採用試行のtraceは後続の試験のresults初期化で削除され、コミット対象に含めていない。

最終確認: 全体unit737ファイル・11294件成功、関連E2E8件、既定の模擬ソースの性能ハーネス、build/typecheck/smoke成功。主作業フォルダへ既存変更を保って反映したbuildとrenderer unit4件も成功。
