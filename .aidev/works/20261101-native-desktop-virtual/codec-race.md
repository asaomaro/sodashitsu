# Decoder fallbackとtransport終了の競合

CIの記録でHEVC/UDPをブラウザが拒否した直後にpeerを閉じ、Bが先にHEVC/WSSへ切り替えるため、旧stream IDへのcodec fallbackが無効になり、同codecをもう一度要求していた。codec要求のWS送信だけ150ms遅らせる実browser試験で旧コードを一時worktreeに戻して再現（要求1回期待→2回、HEVC2stream+H2641stream）。固定したguardを削除するだけでなく、修正前の実webを再buildして確認した。

修正はdecode/audio/reassemblyを退役させてから、transportをBのreset/次stateまで保持する。新しく予算を延ばさず、元の2秒または単調時計の巻戻りでstop/imagesに戻る。pending中のACK/data/peer error/旧decoder callback/trackとdrawは抑止する。state/source改変の独立taskcheck/crossとshould修正の再点検済み、追加must/shouldなし。

単体19件成功（reset/timeout/rollback/旧decoder・peer callbackを含む）、browser両native backendで2件成功、修正前で1件失敗→同じ一時worktreeへ修正コピー・web再build後1件成功。製品source bytes不変のSHA256は /tmp/soda-native-codec-race-fingerprints.json と照合済み。

## 修正前の生出力

```text

Running 1 test using 1 worker

(node:79292) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-31T15:52:54.940Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-31T15:52:54.941Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-31T15:52:54.941Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-31T15:52:54.943Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-z0HuVP/commands.json","count":0}
{"ts":"2026-10-31T15:52:55.393Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-31T15:52:55.393Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-31T15:52:55.394Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-31T15:52:55.394Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-oVPWgB/commands.json","count":0}
NATIVE_CODEC_FALLBACK_EVIDENCE {"sent":[{"type":"native_codec_fallback","id":"8ff4420a-9c6d-49ab-8fce-fc687b08567b"},{"type":"native_codec_fallback","id":"a6605ffe-9ff9-4f82-be68-befd0d1b49d3"}],"streams":[{"type":"media_stream","id":"8ff4420a-9c6d-49ab-8fce-fc687b08567b","generation":1,"mime":"video/hevc","codecName":"hevc","datagrams":true,"window":3,"codec":"hev1.1.6.L63.B0","width":640,"height":360},{"type":"media_stream","id":"a6605ffe-9ff9-4f82-be68-befd0d1b49d3","generation":1,"mime":"video/hevc","codecName":"hevc","window":3,"codec":"hev1.1.6.L63.B0","width":640,"height":360},{"type":"media_stream","id":"f5846042-1f99-4d05-af4b-4c647561e0cc","generation":1,"mime":"video/h264","codecName":"h264","window":3,"codec":"avc1.42041e","width":640,"height":360}],"states":[{"type":"media_status","id":"8ff4420a-9c6d-49ab-8fce-fc687b08567b","state":"negotiating","audio":false,"iceServers":[],"datagrams":true,"nativeCodecs":true,"codecRequested":"hevc"},{"type":"media_status","id":"8ff4420a-9c6d-49ab-8fce-fc687b08567b","state":"native","audio":false,"datagrams":true,"nativeCodecs":true,"codecRequested":"hevc","codec":"hevc"},{"type":"media_status","id":"a6605ffe-9ff9-4f82-be68-befd0d1b49d3","state":"negotiating","audio":false,"nativeCodecs":true,"codecRequested":"hevc"},{"type":"media_status","id":"a6605ffe-9ff9-4f82-be68-befd0d1b49d3","state":"native","audio":false,"nativeCodecs":true,"codecRequested":"hevc","codec":"hevc"},{"type":"media_status","id":"f5846042-1f99-4d05-af4b-4c647561e0cc","state":"negotiating","audio":false,"nativeCodecs":true,"codecRequested":"hevc","codecFallback":"decoder"},{"type":"media_status","id":"f5846042-1f99-4d05-af4b-4c647561e0cc","state":"native","audio":false,"nativeCodecs":true,"codecRequested":"hevc","codec":"h264","codecFallback":"decoder"}],"resets":[]}
{"ts":"2026-10-31T15:52:59.766Z","level":"info","msg":"machine link closed","machine":"a798c7c04d9026a1c6e0bd404bff8338","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-native-platform-codecs.spec.ts:11:45 › macos-sck generated hevc decoder-reject udp=true keeps scoped pixels (5.8s)


  1) src/specs/remote-desktop-native-platform-codecs.spec.ts:11:45 › macos-sck generated hevc decoder-reject udp=true keeps scoped pixels 

    Error: expect(received).toHaveLength(expected)

    Expected length: 1
    Received length: 2
    Received array:  [{"id": "8ff4420a-9c6d-49ab-8fce-fc687b08567b", "type": "native_codec_fallback"}, {"id": "a6605ffe-9ff9-4f82-be68-befd0d1b49d3", "type": "native_codec_fallback"}]

      36 |   }
      37 |   if(codec==="h264-444"){expect(received.some(value=>value.type==="media_stream"&&value.codecName==="h264-444")).toBe(true);}
    > 38 |   if(mode==="decoder-reject"){console.log("NATIVE_CODEC_FALLBACK_EVIDENCE",JSON.stringify({sent:sent.filter(value=>value.type==="native_codec_fallback"),streams:received.filter(value=>value.type==="media_stream"),states:received.filter(value=>value.type==="media_status"),resets:received.filter(value=>value.type==="native_transport_reset")}));expect(sent.filter(value=>value.type==="native_codec_fallback")).toHaveLength(1);expect(new Set(received.filter(value=>value.type==="media_stream").map(value=>value.id)).size).toBe(2);}
         |                                                                                                                                                                                                                                                                                                                                                                                                                          ^
      39 |   const count=Number(await canvas.getAttribute("data-video-frames"));await expect.poll(async()=>Number(await canvas.getAttribute("data-video-frames"))).toBeGreaterThan(count+5);
      40 |   const pixel=await canvas.evaluate(el=>Array.from((el as HTMLCanvasElement).getContext("2d")!.getImageData(80,60,1,1).data));expect(pixel[0]).toBeGreaterThan(150);expect(pixel[1]).toBeLessThan(100);expect(pixel[2]).toBeLessThan(100);
      41 |   await page.screenshot({path:test.info().outputPath(`${backend}-${codec}-${mode}-${udp}.png`),fullPage:true});await view.getByRole("button",{name:"動画・音声を停止",exact:true}).click();await expect(view.locator("[data-media-state]")).toHaveText("画像配信");
        at /tmp/soda-native-codec-race-negative/packages/e2e/src/specs/remote-desktop-native-platform-codecs.spec.ts:38:410

    Error Context: ../../../soda-native-codec-race-negative-browser-results/remote-desktop-native-plat-40550-dp-true-keeps-scoped-pixels/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    ../../../soda-native-codec-race-negative-browser-results/remote-desktop-native-plat-40550-dp-true-keeps-scoped-pixels/trace.zip
    Usage:

        pnpm exec playwright show-trace ../../../soda-native-codec-race-negative-browser-results/remote-desktop-native-plat-40550-dp-true-keeps-scoped-pixels/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-native-platform-codecs.spec.ts:11:45 › macos-sck generated hevc decoder-reject udp=true keeps scoped pixels 
undefined
/tmp/soda-native-codec-race-negative/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-native-platform-codecs.spec.ts --grep macos-sck.*decoder-reject --retries 0 --output /tmp/soda-native-codec-race-negative-browser-results

```

## 復元・再build後の生出力

```text

Running 1 test using 1 worker

(node:81517) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-31T15:54:10.556Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-31T15:54:10.557Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-31T15:54:10.557Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-31T15:54:10.559Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-U9vZZD/commands.json","count":0}
{"ts":"2026-10-31T15:54:10.994Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-31T15:54:10.995Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-31T15:54:10.995Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-31T15:54:10.996Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-64fKlz/commands.json","count":0}
NATIVE_CODEC_FALLBACK_EVIDENCE {"sent":[{"type":"native_codec_fallback","id":"8ba2f475-8889-4f7c-91bc-8d53ce1f0470"}],"streams":[{"type":"media_stream","id":"8ba2f475-8889-4f7c-91bc-8d53ce1f0470","generation":1,"mime":"video/hevc","codecName":"hevc","datagrams":true,"window":3,"codec":"hev1.1.6.L63.B0","width":640,"height":360},{"type":"media_stream","id":"c5b7b3fa-5421-45b5-94a5-445e51055b0d","generation":1,"mime":"video/h264","codecName":"h264","datagrams":true,"window":3,"codec":"avc1.42041e","width":640,"height":360}],"states":[{"type":"media_status","id":"8ba2f475-8889-4f7c-91bc-8d53ce1f0470","state":"negotiating","audio":false,"iceServers":[],"datagrams":true,"nativeCodecs":true,"codecRequested":"hevc"},{"type":"media_status","id":"8ba2f475-8889-4f7c-91bc-8d53ce1f0470","state":"native","audio":false,"datagrams":true,"nativeCodecs":true,"codecRequested":"hevc","codec":"hevc"},{"type":"media_status","id":"c5b7b3fa-5421-45b5-94a5-445e51055b0d","state":"negotiating","audio":false,"iceServers":[],"datagrams":true,"nativeCodecs":true,"codecRequested":"hevc","codecFallback":"decoder"},{"type":"media_status","id":"c5b7b3fa-5421-45b5-94a5-445e51055b0d","state":"native","audio":false,"datagrams":true,"nativeCodecs":true,"codecRequested":"hevc","codec":"h264","codecFallback":"decoder"}],"resets":[]}
{"ts":"2026-10-31T15:54:16.570Z","level":"info","msg":"machine link closed","machine":"910bf1c2c9894031d083163d94cfa5e8","kind":"transient","reason":"接続が切れました"}
  ✓  1 src/specs/remote-desktop-native-platform-codecs.spec.ts:11:45 › macos-sck generated hevc decoder-reject udp=true keeps scoped pixels (6.7s)

  1 passed (7.7s)

```
