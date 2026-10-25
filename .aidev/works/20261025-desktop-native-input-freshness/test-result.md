# 検証

- pnpm build / pnpm typecheck: 成功。
- desktop関連server/web/protocol: 23 files / 170 tests passed。
- 関連実ブラウザnative-video/input/cover: 12 passed / 明示指定の実画面benchmark 1 skipped。
- pnpm smoke: PASS。
- 独立レビューと指摘修正の再レビュー: 通過。

## 連続操作で画像が止まるモデル

合成helperがnative動画中の補助画像だけを止める。実ブラウザcanvasの動画フレームが進んでいることと、画像フレーム数が変わらないことを観測し、5.5秒以上（旧Aの5秒・旧Bの2秒を越える）経過してからmouse dragとArrowRightを操作。ブラウザから送った全入力にinput_ackが戻ることを確認した。OS入力は送らず、生成画素のみを扱う。

Bのprivate-handler回帰では、画像が古くてもnative描画が新しいmarker付きの手動入力を許可し、markerなし（通常/agent経路）は拒否する。動画停止後はmarker付き入力を拒否し、fresh画像の通常入力だけを許可する。helperの入力記録とACKを観測した。2秒以上遅れた初回ACK、別世代、重複、停止・再起動で鮮度を延命しないことも検査した。

## Negative controls

A/Bの判定だけを個別に旧画像年齢へ戻し、Bはserver unit、Aは実serverを再buildして同じブラウザ試験を実行。どちらも入力が届かず実行時に失敗した。ACK到着時刻で更新するbad variantも期限試験で失敗した。各production sourceはbyte一致で復元し、serverを再build後に最終試験を実行した。

### provider

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-input

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (34 tests | 1 failed | 33 skipped) 1267ms
   × keeps image freshness for unmarked and agent input even when native video is fresh 1264ms

 Test Files  1 failed (1)
      Tests  1 failed | 33 skipped (34)
   Start at  23:34:00
   Duration  2.53s (tests 54%, transform 34%, import 12%)


(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > keeps image freshness for unmarked and agent input even when native video is fresh
AssertionError: expected false to be true // Object.is equality

- Expected
+ Received

- true
+ false

 ❯ src/desktop/DesktopRelay.test.ts:173:76


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:173:3

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### relay

```text
  1) src/specs/remote-desktop-native-video.spec.ts:21:3 › hardware-produced h264-generated.json H264 drag continues while image snapshots stall

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      141 |           await expect.poll(()=>sent.slice(startInput).some(m=>m.type==="input"&&(m.input as {code?:string;down?:boolean})?.code==="ArrowRight"&&(m.input as {down?:boolean}).down===false)).toBe(true);
      142 |           const ids=sent.slice(startInput).filter(m=>m.type==="input").map(m=>m.seq);
    > 143 |           await expect.poll(()=>ids.every(id=>received.some(m=>m.type==="input_ack"&&m.seq===id))).toBe(true);
          |                                                                                                    ^
      144 |         }
      145 |         await page.keyboard.press("Control+Space");
      146 |         await page.keyboard.press("Escape");
        at /workspaces/sodashitsu-desktop-input/packages/e2e/src/specs/remote-desktop-native-video.spec.ts:143:100


```

### ack

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-input

 ❯ |@sodashitsu/server| src/desktop/DesktopNativeVideo.test.ts (8 tests | 1 failed | 7 skipped) 20ms
   × uses the acknowledged frame age and does not renew freshness for delayed or duplicate ACKs 18ms

 Test Files  1 failed (1)
      Tests  1 failed | 7 skipped (8)
   Start at  23:34:04
   Duration  1.08s (transform 70%, import 28%, tests 2%, worker 1%)


(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeVideo.test.ts > uses the acknowledged frame age and does not renew freshness for delayed or duplicate ACKs
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopNativeVideo.test.ts:15:36
     13|     clock.mockReturnValue(12001);
     14|     f.video.fromViewer({type:"native_video_ack",id,generation:1,seq:1}…
     15|     expect(f.video.hasFreshDraw()).toBe(false);
       |                                    ^
     16|     f.video.fromHelper(f.frame(id,2));
     17|     f.video.fromViewer({type:"native_video_ack",id,generation:2,seq:2}…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## 範囲

利用者の実OSでのdragと、取得・補助画像encodeの同期処理による全ての描画待ちを自動検証したものではない。native中に画像の鮮度判定で入力を破棄する経路を修正した。GPU直接encoder入力やnativeの通信分離は未対応。生成配列でsnapshot用SHA256Managed/Cngを比較したが平均3.37/3.46msで改善せず、hash実装は変更していない。

## 補助画像延期の追加確認

最終追加後もbuild/typecheck成功、23 files / 170 tests成功、ブラウザ12 passed / 1 skipped、smoke PASS。Bのhelper stdinへの透過spyで未同意helperとunmarked/agent形式の入力に追加keyがなく、同意ありmarked入力だけdeferNativeSnapshot:trueが付くことを確認。

Windowsの実helper結合compile、既存pipe/display/input/frame preparation/priority回帰、GPU NV12生成texture確認成功。純粋CanPrepare試験でnative連続入力中の延期、149ms延期・150ms再開、forceFull即時、画像/secure従来を確認。deferral条件だけ外すnegativeを実行時に検出し、Hostはbyte一致へ復元して全native確認を再実行。

```text
desktop_helper_compiled
desktop_unlock_pipe_cancelled
desktop_unlock_utf8_pipe_passed
desktop_unlock_duplex_pipe_passed
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes
desktop_unlock_process_query_passed
desktop_lock_cover_checks_passed
desktop_input_checks_passed

"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Native drag allowed background image work"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-input\scripts\remote-desktop\validate-unlock-helper.ps1:1
5 文字:1
+ [SodaDesktopTests.FramePreparationChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException


```
