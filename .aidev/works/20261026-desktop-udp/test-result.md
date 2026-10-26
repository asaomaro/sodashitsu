# 検証記録

2026-10-26。実OS入力・実画面/システム音声の取得は行わず、生成H264・模擬入力を使用。

- 最終 pnpm build / typecheck 成功。
- 最終全体: 751 suites、11,424 tests全件成功、408.07秒（/tmp/desktop-udp-all-complete.log）。停止後packet/async signaling修正前の全体751 suites/11,414成功後、追加修正のため全体を再実行した。
- 実Chromium: 4条件×2回=8件全成功（/tmp/desktop-udp-browser-complete.log）。選択candidate両端UDP、ICE設定空、実canvasの生成H264色、WSS動画payloadゼロ、直接描画ACKを確認。peer切断/接続中の映像全欠損では別idのWSSで再開。明示停止でUDP表示を消す。映像1枚を全欠損しWSS noticeを500msずつ遅らせてもUDPで復旧する。
- 操作許可あり/ControlLeft down保持中のpeer故障で、WSS復旧後も閲覧中となりdownを再送しないことを実browserで確認。接続先OSには入力せず模擬helperへ送った。
- 単体: fragment/gap/bounds、直接ACKの順とdrop非fresh、帯域上限、旧viewer/B/helper/secure、遅い旧metadata、停止後packet/codec/ICE処理を検証。最終全体へ含む。
- A/B両方のWindows生成画像で、hardware MFTの強制IDRとbitrate変更・60fps media type・timestamp・packet上限成功（/tmp/desktop-udp-native-keyframe.log、/tmp/desktop-udp-sr-preflight.log）。Bはfeature branch archiveをtempへ展開し、mainのHEAD3c4b0ad5・既存repo状態を変更していない。
- 独立レビュー、各修正の再レビュー成功。診断ログ/一時的なE2E prototype instrumentationは除去済み。

停止後に届くnative noticeが破棄済みassemblyを参照する不具合を修正し、受信停止後packetと古いICE Promiseの完了/失敗で、新しい共有を閉じない回帰を追加した。live UDPのsignaling失敗はWSSへ戻す。ICE各phaseのresolve/reject回帰は旧経路でも確認した。

## Runtime negative（生の出力）

該当修正だけを外して失敗を確認し、元bytesと一致するよう復元。browserの表示負例は製品webをrebuildし、復元後は全build完了を待って最終8件を実行した。DCEP負例はインストール済みESM entryをatomic replaceしてpnpmの共有store inodeを変更せず、古い代入を実行して失敗を確認し、元bytesへ戻した。native ForceKeyFrame負例も実行時にIDR欠如を検出した。ANSI/改行以外は要約せず掲載。

### gap

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-udp

 ❯ |@sodashitsu/web| src/desktop/datagramFrames.test.ts (7 tests | 1 failed | 6 skipped) 7ms
   × expires an entirely missing access unit from a later fragment without waiting for reliable notices 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/datagramFrames.test.ts > expires an entirely missing access unit from a later fragment without waiting for reliable notices
AssertionError: expected [] to deeply equal [ 1, 2 ]

- Expected
+ Received

- [
-   1,
-   2,
- ]
+ []

 ❯ src/desktop/datagramFrames.test.ts:35:35
     33| it("expires an entirely missing access unit from a later fragment with…
     34|  const f=setup(),p2=packet(2),p3=packet(3,true);f.frames.fragment(enco…
     35|  expect(f.drop.mock.calls.flat()).toEqual([1,2]);expect(f.frame).not.t…
       |                                   ^
     36|  // Notices may arrive after direct rendering/ACK; they cannot resurre…
     37|  f.frames.notice(1,packet(1).length);f.frames.notice(2,p2.length);f.fr…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 6 skipped (7)
   Start at  09:25:43
   Duration  944ms (transform 57%, environment 23%, import 18%, tests 1%)


```

### timer

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-udp

 ❯ |@sodashitsu/web| src/desktop/mediaReceiver.test.ts (3 tests | 1 failed | 2 skipped) 19ms
   × expires a frozen video using a fresh WSS fallback for datagrams=true 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/mediaReceiver.test.ts > expires a frozen video using a fresh WSS fallback for datagrams=true
AssertionError: expected "vi.fn()" to be called with arguments: [ { type: 'media_fallback', …(1) } ]

Received:

  1st vi.fn() call:

  [
    {
-     "id": "test",
-     "type": "media_fallback",
+     "enabled": false,
+     "type": "media",
    },
  ]


Number of calls: 1

 ❯ src/desktop/mediaReceiver.test.ts:50:26
     48|     await vi.advanceTimersByTimeAsync(2500);
     49|     expect(receiver.active).toBe(false);
     50|     if(udp){expect(send).toHaveBeenCalledWith({type:"media_fallback",i…
       |                          ^
     51|     else{expect(send).toHaveBeenCalledWith({ type: "media", enabled: f…
     52|   } finally {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  09:25:45
   Duration  880ms (transform 57%, environment 23%, import 17%, tests 3%)


```

### retired metadata

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-udp

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (61 tests | 3 failed | 58 skipped) 449ms
   × ignores a retired native native_frame_notice after parent stop overtakes buffered metadata 221ms
   × ignores a retired native native_draw_ack after parent stop overtakes buffered metadata 109ms
   × ignores a retired native native_transport_reset after parent stop overtakes buffered metadata 117ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > ignores a retired native native_frame_notice after parent stop overtakes buffered metadata
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > ignores a retired native native_draw_ack after parent stop overtakes buffered metadata
 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > ignores a retired native native_transport_reset after parent stop overtakes buffered metadata
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/DesktopRelay.test.ts:728:19
    726|  const message=type==="native_frame_notice"?{type,id,generation:1,seq:…
    727|  server.receiveVideo(Buffer.from(JSON.stringify(message)),false);
    728|  expect(fail).not.toHaveBeenCalled();expect(v.ws.readyState).toBe(WebS…
       |                   ^
    729| });
    730|

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯


 Test Files  1 failed (1)
      Tests  3 failed | 58 skipped (61)
   Start at  09:25:46
   Duration  1.53s (transform 48%, tests 33%, import 19%)


```

### dropped freshness

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-udp

 ❯ |@sodashitsu/server| src/desktop/DesktopNativeVideo.datagrams.test.ts (6 tests | 1 failed | 5 skipped) 30ms
   × ignores parent ACKs and releases dropped credit without renewing draw freshness on either delayed or duplicate ACK 29ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeVideo.datagrams.test.ts > ignores parent ACKs and releases dropped credit without renewing draw freshness on either delayed or duplicate ACK
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopNativeVideo.datagrams.test.ts:29:121
     27| it("ignores parent ACKs and releases dropped credit without renewing d…
     28|  const f=setup();f.peer.hooks.ready();f.video.fromHelper(f.frame());f.…
     29|  expect(()=>f.peer.hooks.ack(f.ack(2))).toThrow("order");f.peer.hooks.…
       |                                                                                                                         ^
     30|  expect(f.send).toHaveBeenCalledWith(expect.objectContaining({type:"na…
     31|  f.video.fromHelper(f.frame(2));f.peer.hooks.ack(f.ack(2));expect(f.vi…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  09:25:49
   Duration  810ms (transform 70%, import 25%, tests 4%)


```

### DCEP

```text

Running 1 test using 1 worker

(node:970333) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-26T00:26:56.726Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T00:26:56.727Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T00:26:56.727Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T00:26:56.732Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-6JUr6q/commands.json","count":0}
{"ts":"2026-10-26T00:26:57.193Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T00:26:57.194Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T00:26:57.194Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T00:26:57.195Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ffofVA/commands.json","count":0}
{"ts":"2026-10-26T00:27:01.065Z","level":"info","msg":"machine link closed","machine":"caf9e3d71bff3de0bc8e765af956a3a6","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-udp.spec.ts:7:54 › native H264 actual UDP candidate/direct ACK and WSS recovery after close (5.0s)


  1) src/specs/remote-desktop-udp.spec.ts:7:54 › native H264 actual UDP candidate/direct ACK and WSS recovery after close 

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: 0
    Received: 21

      32 |   await view.getByRole("button",{name:"動画共有を依頼",exact:true}).click();await expect(view.locator("[data-native-datagrams]")).toBeVisible();
      33 |   await expect.poll(async()=>Number(await canvas.getAttribute("data-video-frames")),{timeout:20000}).toBeGreaterThan(10);
    > 34 |   expect(wssVideo).toBe(0);expect(sent.some(m=>m.type==="native_video_ack")).toBe(false);expect(received.some(m=>m.type==="native_frame_notice")).toBe(true);
         |                    ^
      35 |   const selected=await page.evaluate(async()=>{
      36 |    const peer=((window as any).__nativePeers as RTCPeerConnection[]).find(p=>p.connectionState==="connected")!;const report=await peer.getStats();
      37 |    const rows:any[]=[];report.forEach(s=>rows.push(s));const transport=rows.find(s=>s.type==="transport"&&s.selectedCandidatePairId),pair=transport?rows.find(s=>s.id===transport.selectedCandidatePairId):rows.find(s=>s.type==="candidate-pair"&&s.nominated&&s.state==="succeeded");
        at /workspaces/sodashitsu-desktop-udp/packages/e2e/src/specs/remote-desktop-udp.spec.ts:34:20

    Error Context: test-results/remote-desktop-udp-native--26dea-nd-WSS-recovery-after-close/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-udp-native--26dea-nd-WSS-recovery-after-close/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-udp-native--26dea-nd-WSS-recovery-after-close/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-udp.spec.ts:7:54 › native H264 actual UDP candidate/direct ACK and WSS recovery after close 
undefined
/workspaces/sodashitsu-desktop-udp/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-udp.spec.ts --grep after close

```

### forced keyframe

```text
"1" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Requested native IDR missing"
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-udp\scripts\remote-desktop\validate-h264.ps1:5 ����:73
+ ... pTests.H264Checks]::Run($(if($FixtureFile){$FixtureFile}else{$null}))
+                                                                  ~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```

### stop badge

```text

Running 1 test using 1 worker

(node:976070) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-26T00:30:05.415Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T00:30:05.417Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T00:30:05.417Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T00:30:05.428Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-RKEuzr/commands.json","count":0}
{"ts":"2026-10-26T00:30:06.209Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-26T00:30:06.210Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-26T00:30:06.211Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-26T00:30:06.212Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-oJ9Kv2/commands.json","count":0}
{"ts":"2026-10-26T00:30:17.901Z","level":"info","msg":"machine link closed","machine":"d49f9ff1b6405378eae98d36f861d7ea","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-udp.spec.ts:7:54 › native H264 actual UDP candidate/direct ACK and WSS recovery after stop (13.5s)


  1) src/specs/remote-desktop-udp.spec.ts:7:54 › native H264 actual UDP candidate/direct ACK and WSS recovery after stop 

    Error: expect(locator).toHaveCount(expected) failed

    Locator:  locator('[data-remote-desktop]').locator('[data-native-datagrams]')
    Expected: 0
    Received: 1
    Timeout:  5000ms

    Call log:
      - Expect "toHaveCount" locator('[data-remote-desktop]').locator('[data-native-datagrams]') with timeout 5000ms
      - waiting for locator('[data-remote-desktop]').locator('[data-native-datagrams]')
        13 × locator resolved to 1 element
           - unexpected value "1"


      40 |   const pixel=await canvas.evaluate(el=>{const c=el as HTMLCanvasElement;return Array.from(c.getContext("2d")!.getImageData(40,40,1,1).data);});expect(pixel[0]).toBeGreaterThan(180);expect(pixel[1]).toBeLessThan(80);expect(pixel[2]).toBeLessThan(80);
      41 |   if(mode==="stop"){
    > 42 |    await view.getByRole("button",{name:"動画・音声を停止",exact:true}).click();await expect(view.locator("[data-media-state]")).toHaveText("画像配信");await expect(view.locator("[data-native-datagrams]")).toHaveCount(0);expect(wssVideo).toBe(0);return;
         |                                                                                                                                                                                                  ^
      43 |   }
      44 |   // Close the real browser peer; product must restart a fresh stream over WSS.
      45 |   if(mode==="close"){
        at /workspaces/sodashitsu-desktop-udp/packages/e2e/src/specs/remote-desktop-udp.spec.ts:42:194

    Error Context: test-results/remote-desktop-udp-native--56570-and-WSS-recovery-after-stop/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-udp-native--56570-and-WSS-recovery-after-stop/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-udp-native--56570-and-WSS-recovery-after-stop/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-udp.spec.ts:7:54 › native H264 actual UDP candidate/direct ACK and WSS recovery after stop 
undefined
/workspaces/sodashitsu-desktop-udp/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-udp.spec.ts --grep after stop

```

### late receiver

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-udp

 ❯ |@sodashitsu/web| src/desktop/mediaReceiver.test.ts (4 tests | 1 failed | 3 skipped) 16ms
   × ignores late native notices and chunks after peer close, before the fresh WSS stream arrives 14ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/mediaReceiver.test.ts > ignores late native notices and chunks after peer close, before the fresh WSS stream arrives
AssertionError: expected [Function] to not throw an error but 'TypeError: Cannot read properties of …' was thrown

- Expected:
undefined

+ Received:
"TypeError: Cannot read properties of undefined (reading 'notice')"

 ❯ src/desktop/mediaReceiver.test.ts:69:97
     67|  try{
     68|   receiver.nativeStream(1,"avc1.42041f",640,360,3,true);receiver.stop(…
     69|   expect(()=>receiver.notice({type:"native_frame_notice",id,generation…
       |                                                                                                 ^
     70|   expect(()=>receiver.chunk(new Uint8Array())).not.toThrow();
     71|   await Promise.resolve();expect(send).not.toHaveBeenCalled();expect(s…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  09:40:39
   Duration  1.34s (transform 54%, environment 30%, import 15%, tests 1%)


```

### retired signaling

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-udp

 ❯ |@sodashitsu/web| src/desktop/mediaReceiver.test.ts (13 tests | 1 failed | 11 skipped) 14ms
   × ignores retired peer remote completion/rejection, reject=true 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/mediaReceiver.test.ts > ignores retired peer remote completion/rejection, reject=true
AssertionError: promise rejected "Error: retired transport" instead of resolving
 ❯ src/desktop/mediaReceiver.test.ts:88:24
     86|   const pending=receiver.signal(phase==="candidate"?{kind:"candidate",…
     87|   if(rejected)fail(Error("retired transport"));else resume({type:"answ…
     88|   await expect(pending).resolves.toBeUndefined();expect(calls.at(-1)).…
       |                        ^
     89|  }finally{receiver.stop();delete(HTMLVideoElement.prototype as any).re…
     90| });

Caused by: Error: retired transport
 ❯ src/desktop/mediaReceiver.test.ts:87:20

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 11 skipped (13)
   Start at  09:43:17
   Duration  1.52s (transform 53%, environment 29%, import 16%, tests 1%)


```
