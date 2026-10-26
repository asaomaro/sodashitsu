# native resolution validation

- 最終ソース fc4704b6（main取り込みはcadence結果docs 2件のみ、feature source byte差分なし）。検証中はsourceを固定。
- build/typecheck pass。vitest全768 suites / 11,509 tests pass (384.84s)。
- Playwright native video/UDP/audio + new adaptive: 22 pass / 2 skip (3.0m)。skipは明示opt-inの30分soak/性能計測。
- new adaptive 5ケース: UDP、WSS、format準備2.2秒遅延、adaptive=false、OS等倍表示。1280×800→960×600の実canvas寸法・生成赤画素、同session/peer、gen2描画後の実Opus outputさらに20以上、1つのAudioContextとミュート状態の継続を確認。jitterでの内部decoder再生成は既存の有界回復動作として許容し、active decoderは1つ。
- 独立worktree native-codecs(fc4704b6時点) build/smoke pass。
- A Windows: combined sourceのpure state/odd寸法検査pass。生成GPU textureの1280×800→960×600、使用中pool timeoutと非再利用、tracked sample解放後resize、新SPS/IDR、imageサイズ不変を確認。復元後Fps60設定で再検査pass（実測60fpsを保証するものではない）。
- B Windows: branch archiveをTEMPでcombined compile、pure state、生成GPU resize検査pass。B既存repo main a6096199/cleanのまま。実codecは1280×800=avc1.424020、960×600=avc1.42401fであり、固定codecを仮定しない切替metadataを確認。
- 独立全体レビューと修正再レビューpass。review-native-resolution.md参照。
- OS capture、実ユーザーinput/clipboard、lock/unlock、display mode変更を自動実行しない。GPU/音声は生成texture/PCM、OS等倍E2Eはfake helper。

以下8負例は該当修正だけ戻して実際の失敗を確認後、元byte列へ復元一致を確認。音声世代の負例はnegative build→実WSS browser失敗→source復元→restored build完了→同browser成功。Windows raw stderr(cp932)も/tmpに保持。

## negative notice-generation

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-resolution

 ❯ |@sodashitsu/protocol| src/desktopNativeAdaptive.test.ts (1 test | 1 failed) 7ms
   × strictly bounds format ACKs separately from draw ACKs and OS input 7ms

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  18:55:11
   Duration  680ms (transform 76%, import 22%, tests 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/protocol| src/desktopNativeAdaptive.test.ts > strictly bounds format ACKs separately from draw ACKs and OS input
ZodError: [
  {
    "code": "invalid_value",
    "values": [
      1
    ],
    "path": [
      "generation"
    ],
    "message": "Invalid input: expected 1"
  }
]
 ❯ src/desktopNativeAdaptive.test.ts:7:34
      5|  const ack={type:'native_format_ack',id,generation:2,baseSeq:17};expec…
      6|  for(const wrong of [{...ack,generation:1},{...ack,baseSeq:-1},{...ack…
      7|  expect(DesktopNativeFrameNotice.parse({type:'native_frame_notice',id,…
       |                                  ^
      8|  expect(DesktopNativeProfilePending.parse({type:'native_profile_pendin…
      9|  expect(DesktopMediaStream.parse({type:'media_stream',id,generation:2,…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## negative transport-clock

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-resolution

 ❯ |@sodashitsu/server| src/desktop/DesktopNativeAdaptive.test.ts (4 tests | 1 failed | 3 skipped) 12ms
   × does not renew input freshness from format ACK or the age of a retained IDR 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  18:55:13
   Duration  698ms (transform 77%, import 20%, tests 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeAdaptive.test.ts > does not renew input freshness from format ACK or the age of a retained IDR
AssertionError: expected last "vi.fn()" call to have been called with [ true ]

- Expected
+ Received

  [
-   true,
+   false,
  ]

 ❯ src/desktop/DesktopNativeAdaptive.test.ts:37:138


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## negative viewer-barrier

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-resolution

 ❯ |@sodashitsu/web| src/desktop/mediaReceiver.test.ts (15 tests | 1 failed | 14 skipped) 12ms
   × waits up to three seconds for a new decoder format without accepting retired decoder callbacks 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 14 skipped (15)
   Start at  18:55:51
   Duration  997ms (transform 62%, environment 22%, import 15%, tests 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/mediaReceiver.test.ts > waits up to three seconds for a new decoder format without accepting retired decoder callbacks
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array [
      "images",
    ]


Number of calls: 1

 ❯ src/desktop/mediaReceiver.test.ts:119:86
    117|   decoders[0]!.output({timestamp:1000,displayWidth:1280,displayHeight:…
    118|   receiver.profilePending({type:'native_profile_pending',id,generation…
    119|   now.mockReturnValue(3500);await vi.advanceTimersByTimeAsync(500);exp…
       |                                                                                      ^
    120|   decoders[0]!.error(new DOMException('retired decoder'));expect(state…
    121|   resolve();await Promise.resolve();await Promise.resolve();expect(sen…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## negative odd-start

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Video output dimensions"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-native-resolution\scripts\remote-desktop\validate-video-r
ate.ps1:4 文字:1
+ [SodaDesktopTests.VideoRateChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : ArgumentException
 

```

## negative resume-fence

```text
"0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Resume before actual SPS/IDR"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-native-resolution\scripts\remote-desktop\validate-video-r
ate.ps1:4 文字:1
+ [SodaDesktopTests.VideoRateChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```

## negative busy-pool

```text
"5" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Busy MF pool was replaced"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-native-resolution\scripts\remote-desktop\validate-gpu-sur
faces.ps1:5 文字:157
+ ... veFixtureFile){1280}else{640}),$(if($AdaptiveFixtureFile){800}else{36 ...
+                                                               ~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```

## negative audio-generation

```text

Running 1 test using 1 worker

{"ts":"2026-10-26T09:57:58.801Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T09:57:58.802Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T09:57:58.802Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T09:57:58.806Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-mcBJCS/commands.json","count":0}
{"ts":"2026-10-26T09:57:59.274Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T09:57:59.274Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T09:57:59.274Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T09:57:59.275Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-TdTjDL/commands.json","count":0}
ADAPTIVE_DIAGNOSTICS [{"type":"video_ready"},{"type":"ready","title":"Synthetic test source","allowInput":false,"width":1280,"height":800,"backend":"synthetic","allowClipboard":false,"allowMedia":true,"dynamicQuality":true,"image":{"colorMode":"full","showCursor":true},"imageLane":true,"nativeVideo":true,"nativeAdaptive":true,"nativeDatagrams":true,"nativeAudio":true,"nativeVideoWindow":3,"nativeMaxFps":60,"imeKeys":true,"extendedInput":true},{"type":"stats","frames":1,"bytes":189072,"fps":21.059769732477665,"mbps":31.854502262872142,"ackP95Ms":22.039312999999765},{"type":"media_status","id":"f597c46c-8126-42fc-8df2-9a678669c03b","state":"negotiating","audio":false,"nativeAudio":true},{"type":"native_audio_status","id":"f597c46c-8126-42fc-8df2-9a678669c03b","state":"starting"},{"type":"media_status","id":"f597c46c-8126-42fc-8df2-9a678669c03b","state":"native","audio":false,"nativeAudio":true},{"type":"media_stream","id":"f597c46c-8126-42fc-8df2-9a678669c03b","generation":1,"mime":"video/h264","window":3,"codec":"avc1.420420","width":1280,"height":800},{"type":"native_audio_status","id":"f597c46c-8126-42fc-8df2-9a678669c03b","state":"running"},{"type":"stats","frames":2,"bytes":189278,"fps":1.9528756993972876,"mbps":1.4785456265220793,"ackP95Ms":22.039312999999765},{"type":"stats","frames":3,"bytes":189484,"fps":1.4828746154543433,"mbps":0.7492827030260021,"ackP95Ms":22.039312999999765},{"type":"stats","frames":4,"bytes":189690,"fps":1.3221823558532828,"mbps":0.5016095421636184,"ackP95Ms":22.039312999999765},{"type":"stats","frames":5,"bytes":189896,"fps":1.241787110011673,"mbps":0.3772966480684427,"ackP95Ms":22.039312999999765},{"type":"native_profile_pending","id":"f597c46c-8126-42fc-8df2-9a678669c03b","generation":2},{"type":"media_stream","id":"f597c46c-8126-42fc-8df2-9a678669c03b","generation":2,"mime":"video/h264","baseSeq":120,"window":3,"codec":"avc1.42041f","width":960,"height":600},{"type":"stats","frames":6,"bytes":190102,"fps":1.1930468765134603,"mbps":0.30240079642528245,"ackP95Ms":22.039312999999765},{"type":"stats","frames":7,"bytes":190308,"fps":1.1612481843196183,"mbps":0.25256550795599764,"ackP95Ms":22.039312999999765},{"type":"stats","frames":8,"bytes":190514,"fps":1.1367811003302057,"mbps":0.21657271454830881,"ackP95Ms":22.039312999999765},{"type":"stats","frames":9,"bytes":190720,"fps":1.1206515929173155,"mbps":0.18998281937883593,"ackP95Ms":22.039312999999765},{"type":"stats","frames":10,"bytes":190927,"fps":1.1072046476837192,"mbps":0.16911620941464758,"ackP95Ms":22.039312999999765},{"type":"stats","frames":11,"bytes":191135,"fps":1.0965451106048731,"mbps":0.15242774524760905,"ackP95Ms":22.039312999999765}]
ADAPTIVE_CONTROLS []
ADAPTIVE_VIEW Generated adaptive B — デスクトップ
閲覧中
操作する
IME ON
IME OFF
情報・設定
最大化
閉じる
▴

Synthetic test source 模擬画面（実デスクトップではありません）

画像設定: 幅上限1280 / 10fps上限 / JPEG 65 / フルカラー

再同期
共有停止
画面に合わせる
画質・計測
プリセット
選択…
低帯域
標準
高画質
送信幅の上限fps上限JPEG品質色
フルカラー
約6.5万色
256色
16階調グレー
差分転送自動画質調整共有元のカーソルを表示

幅は縦横比を保った上限、fpsは目標上限です。JPEG品質を下げると文字がにじむ場合があります。

減色は細かな色の違いを失い、エージェントの画像認識にも影響します。差分PNGにも適用されます。

適用すると共有へ再接続し、操作とエージェント許可を解除します。設定はこのブラウザでマシンごとに記憶します。

適用して再接続
動画・音声

接続先のGPUでH.264へ圧縮します。システム音声も要求できます。利用できない場合は画像配信へ戻ります。

システム音声を要求経路
GPU H.264（システム音声対応）
WebRTC（接続できなければ中継）
圧縮動画を中継
映像ビットレートの目標(kbps) UDPを優先（利用できない場合はWSS）動画FPS上限
30 fps
60 fps
動画共有を依頼動画・音声を停止音声を止める

システム音声: 再生中

GPU H.264

動画 14.2 fps（描画実測）

動画 960×600 · 取得 5.0 / 色変換 0.0 / 圧縮・待機 0.0 ms
送信→描画ACK 32 ms · 復号・描画 6.4 ms · ACK待ち 0 / 3枚

文字を送る
▾
閲覧専用。操作にはBの事前許可が必要です。
画像: 1.1 fps · 0.15 Mbps · relay→描画ACK p95 22 ms · 取得 0.0 / encode 0.0 / 描画 0.0 ms · 入力ACK 0 ms
{"ts":"2026-10-26T09:58:12.297Z","level":"info","msg":"machine link closed","machine":"7b2c30adf663235013ed669583a2a3e0","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-native-adaptive.spec.ts:5:72 › generated native resolution barrier and real Opus continuity: wss (14.6s)


  1) src/specs/remote-desktop-native-adaptive.spec.ts:5:72 › generated native resolution barrier and real Opus continuity: wss 

    Error: expect(received).toBeGreaterThan(expected)

    Expected: > 212
    Received:   192

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      47 |   }
      48 |   const afterFormat=await page.evaluate(()=>(window as any).__adaptive.outputs);
    > 49 |   await expect.poll(()=>page.evaluate(()=>(window as any).__adaptive.outputs)).toBeGreaterThan(Math.max(before,afterFormat)+20);
         |                                                                                ^
      50 |   const state=await page.evaluate(()=>({outputs:(window as any).__adaptive.outputs,energy:(window as any).__adaptive.energy,decoders:(window as any).__adaptive.audio.filter((a:AudioDecoder)=>a.state!=='closed').length,contexts:(window as any).__adaptive.contexts.length,peers:(window as any).__adaptive.peers.length}));
      51 |   expect(state.energy).toBeGreaterThan(.01);expect(state.decoders).toBe(1);expect(state.contexts).toBe(1);expect(state.peers).toBe(1);
      52 |   await expect(view.locator('[data-native-audio]')).toContainText('再生中');
        at /workspaces/sodashitsu-desktop-native-resolution/packages/e2e/src/specs/remote-desktop-native-adaptive.spec.ts:49:80

    Error Context: test-results/remote-desktop-native-adap-f1983-nd-real-Opus-continuity-wss/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-native-adap-f1983-nd-real-Opus-continuity-wss/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-native-adap-f1983-nd-real-Opus-continuity-wss/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-native-adaptive.spec.ts:5:72 › generated native resolution barrier and real Opus continuity: wss 
undefined
/workspaces/sodashitsu-desktop-native-resolution/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-native-adaptive.spec.ts --grep continuity: wss
(node:2576721) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

```

## negative congestion

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-native-resolution

 ❯ |@sodashitsu/server| src/desktop/DesktopNativeAdaptive.test.ts (5 tests | 1 failed | 4 skipped) 6ms
   × reduces resolution after sustained loss/queue even with cheap pixels, and does not react to an isolated event 5ms

 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  19:02:13
   Duration  699ms (transform 75%, import 23%, tests 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeAdaptive.test.ts > reduces resolution after sustained loss/queue even with cheap pixels, and does not react to an isolated event
AssertionError: expected undefined to deeply equal { width: 960, height: 600 }

- Expected:
{
  "height": 600,
  "width": 960,
}

+ Received:
undefined

 ❯ src/desktop/DesktopNativeAdaptive.test.ts:57:97
     55|  const sample=(congested:boolean)=>{let size;for(let i=0;i<10;i++){now…
     56|  expect(sample(true)).toBeUndefined();expect(sample(false)).toBeUndefi…
     57|  expect(sample(true)).toBeUndefined();expect(sample(true)).toBeUndefin…
       |                                                                                                 ^
     58| });
     59|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```
