# モニター別のブラウザ窓

通常sharedMonitors/allの単一helper/capture/encoder/input FIFOを維持し、各窓のviewportで全体canvasとcursor overlayを同時にclipする。独立monitor capture/encoderや帯域削減は実装していない。物理bounds/最終pixelへinputをclampし、非secret strict URLから既存login/endpoint pin経路で起動する。入力/clipboard/音声/micの許可を引き継がない。

独立taskcheck review_pointerはmustなし、native寸法変更・cursor可視位置を重点確認。独立全体review_transferのshould（既存文書の別窓未対応と新機能の混同）は独立取得/圧縮に限定して修正し、追加差分再レビュー通過。新URLの監視に実暗号route /desktop-e2eを追加、nativeの1280→640を直接assertするshouldも対応して再確認。

source fresh build/typecheck、全体11982件/800files通過。最初のweb単独typecheckは新WTのprotocol/client-core distが未生成でmodule解決できず失敗し、通常の全体build後の全体typecheckは通過。

新生成browser plain/encrypted/native/topology4件＋invalidURL1件のunique5。左右可視領域の実pixelblue/red、cursorとbase offset一致・alphaとcrop内外、画像1280→動画640後のclip比、CDP入力downと領域外dragclamp、no opener、child数増加なし、reloadで閲覧、first終了後継続、topology両窓停止を確認。全monitor画像が各窓へ届く制限を明示している。実OS capture/input/音声/設定変更は行っていない。

初回新browserはwrap labelのoption文字を含むaccessible nameにexact locatorが一致せずtimeout（90秒）。selectへ明示aria-labelを付けて修正した。catch内の診断例外で本来のtimeoutを隠していたため、診断読み取りにもcatchを付けた。invalidURL試験はtokenログイン完了前に次URLへ遷移しlogin画面になったため、ログイン済みDOMを待ってから検査する前提へ修正。修正後invalid単独とnative寸法境界+invalid2件も通過。

独立check WTはmain86e14a51から全差分/新fileを適用しfresh build/smoke PASS。負例3件ではstrict未知field拒否、右monitor canvas offset、cropped input clampだけを無効にし、それぞれ回帰失敗を確認。各変更はfinallyでexact bytesに復元・照合。browser負例は変更ごとにweb fresh build、最後も復元sourceでfresh buildを完了。以下は生出力。root結果・配備は後記。

## launch negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-monitor-windows-check

 ❯ |@sodashitsu/web| src/desktop/monitorWindow.test.ts (3 tests | 1 failed | 2 skipped) 14ms
   × roundtrips only strict launch preferences and rejects secrets, grants and malformed URLs 12ms

 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  04:12:43
   Duration  1.58s (transform 51%, environment 29%, import 18%, worker 1%, tests 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/monitorWindow.test.ts > roundtrips only strict launch preferences and rejects secrets, grants and malformed URLs
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/monitorWindow.test.ts:9:158


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

## clip-offset negative

```text

Running 1 test using 1 worker

{"ts":"2026-10-27T19:14:10.741Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T19:14:10.743Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T19:14:10.743Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T19:14:10.753Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-VKD3uX/commands.json","count":0}
{"ts":"2026-10-27T19:14:11.678Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T19:14:11.679Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T19:14:11.679Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T19:14:11.681Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-MG6uwH/commands.json","count":0}
Generated popup DOM plain [
  'Generated shared monitors B — デスクトップ閲覧中操作するIME ONIME OFF情報・設定最大化閉じる▴暗号化接続 接続先PCのlocalhost設定で鍵を作成し、このブラウザの指紋を許可してください。接続先で「暗号化接続を必須にする」を有効にします。  このブラウザの鍵を作成 接続先PCで確認した指紋接続先PCのlocalhost画面に表示された指紋と一致することを確認しました この接続先を記憶して暗号化で接続  指紋の不一致や鍵を読み取れない場合は停止します。通常接続へは自動で戻りません。ブラウザへ配信されるプログラムと両端のPCは信頼する必要があります。 Synthetic test source 模擬画面（実デスクトップではありません） 画像設定: 幅上限1280 / 10fps上限 / JPEG 65 / フルカラー複数viewerで同じ画面を共有モニター選択を共有（全ての窓で同じ選択が必要）参加するモニターIDこのモニターで接続共有中の窓と同じモニターIDを指定してください。別のIDでは参加できません。差分画像を共有（全ての窓で同じ選択が必要）独立カーソルを共有（全ての窓で同じ選択が必要）通常画面の画像配信です。同じ画質設定で最大8窓まで接続できます。操作は1窓だけに許可され、他の窓からは引き継げません。操作中の窓で解除してから、別の窓で「操作する」を押してください。対応する接続先ではシステム音声も共有でき、動画の解像度も各窓の希望を集約して調整します。固定設定の窓がある間は、その解像度を維持します。クリップボードは利用できません。OSの解像度変更は利用できません。動画で遅れた窓は次のキーフレームから復帰します。管理者権限のアプリ・UAC画面を共有一時的な仮想画面を使う再同期共有停止画面に合わせる画質・計測プリセット選択…低帯域標準高画質送信幅の上限fps上限JPEG品質色フルカラー約6.5万色256色16階調グレー差分転送自動画質調整共有元のカーソルを表示 幅は縦横比を保った上限、fpsは目標上限です。JPEG品質を下げると文字がにじむ場合があります。  減色は細かな色の違いを失い、エージェントの画像認識にも影響します。差分PNGにも適用されます。  適用すると共有へ再接続し、操作とエージェント許可を解除します。設定はこのブラウザでマシンごとに記憶します。 適用して再接続この窓に表示するモニター全体left — 640×480right — 800×600選択モニターを別窓で開く全モニターの取得・転送を共有し、全モニターの画像を各窓で受信し、選択領域だけ表示します。領域外へのドラッグは表示モニター端で止まります。操作権は1窓ずつ取得してください。モニター別の独立圧縮には対応していません。別窓で開きます。開かない場合は、このサイトのポップアップを許可してください。表示モニターleft — 640×480 / 125%right — 800×600（主画面） / 150%全モニターをまとめて表示エージェント連携 この共有画面の取得・PC操作を最大2分許可します。取得画像をモデルへ渡す用途を含みます。発行コードは30秒以内・1回だけ使用できます。  エージェントへの画面提供・操作を許可 文字を送る▾閲覧専用。操作にはBの事前許可が必要です。6.7 fps · 0.88 Mbps · relay→描画ACK p95 72 ms · 取得 41.8 / encode 2.3 / 描画 53.9 ms · 入力ACK 0 ms'
] [
  '\n' +
    '    Generated shared monitors B — デスクトップ閲覧中操作するIME ONIME OFF情報・設定最大化閉じる▴暗号化接続 接続先PCのlocalhost設定で鍵を作成し、このブラウザの指紋を許可してください。接続先で「暗号化接続を必須にする」を有効にします。  このブラウザの鍵を作成 接続先PCで確認した指紋接続先PCのlocalhost画面に表示された指紋と一致することを確認しました この接続先を記憶して暗号化で接続  指紋の不一致や鍵を読み取れない場合は停止します。通常接続へは自動で戻りません。ブラウザへ配信されるプログラムと両端のPCは信頼する必要があります。 Synthetic test source 模擬画面（実デスクトップではありません） 画像設定: 幅上限1280 / 10fps上限 / JPEG 65 / フルカラー複数viewerで同じ画面を共有モニター選択を共有（全ての窓で同じ選択が必要）参加するモニターIDこのモニターで接続共有中の窓と同じモニターIDを指定してください。別のIDでは参加できません。差分画像を共有（全ての窓で同じ選択が必要）独立カーソルを共有（全ての窓で同じ選択が必要）通常画面の画像配信です。同じ画質設定で最大8窓まで接続できます。操作は1窓だけに許可され、他の窓からは引き継げません。操作中の窓で解除してから、別の窓で「操作する」を押してください。対応する接続先ではシステム音声も共有でき、動画の解像度も各窓の希望を集約して調整します。固定設定の窓がある間は、その解像度を維持します。クリップボードは利用できません。OSの解像度変更は利用できません。動画で遅れた窓は次のキーフレームから復帰します。管理者権限のアプリ・UAC画面を共有一時的な仮想画面を使う再同期共有停止画面に合わせる画質・計測プリセット選択…低帯域標準高画質送信幅の上限fps上限JPEG品質色フルカラー約6.5万色256色16階調グレー差分転送自動画質調整共有元のカーソルを表示 幅は縦横比を保った上限、fpsは目標上限です。JPEG品質を下げると文字がにじむ場合があります。  減色は細かな色の違いを失い、エージェントの画像認識にも影響します。差分PNGにも適用されます。  適用すると共有へ再接続し、操作とエージェント許可を解除します。設定はこのブラウザでマシンごとに記憶します。 適用して再接続この窓に表示するモニター全体left — 640×480right — 800×600選択モニターを別窓で開く全モニターの取得・転送を共有し、全モニターの画像を各窓で受信し、選択領域だけ表示します。領域外へのドラッグは表示モニター端で止まります。操作権は1窓ずつ取得してください。モニター別の独立圧縮には対応していません。表示モニターleft — 640×480 / 125%right — 800×600（主画面） / 150%全モニターをまとめて表示エージェント連携 この共有画面の取得・PC操作を最大2分許可します。取得画像をモデルへ渡す用途を含みます。発行コードは30秒以内・1回だけ使用できます。  エージェントへの画面提供・操作を許可 文字を送る▾閲覧専用。操作にはBの事前許可が必要です。6.8 fps · 0.89 Mbps · relay→描画ACK p95 113 ms · 取得 56.5 / encode 2.7 / 描画 9.9 ms · 入力ACK 0 ms\n' +
    '  \n' +
    '\n'
]
{"ts":"2026-10-27T19:14:27.816Z","level":"info","msg":"machine link closed","machine":"53484502bf94792a2ccc595e0a93e561","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-monitor-windows.spec.ts:15:3 › monitor-specific browser popup plain (19.9s)


  1) src/specs/remote-desktop-monitor-windows.spec.ts:15:3 › monitor-specific browser popup plain ──

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      142 |           const p=canvas.getContext("2d")!.getImageData(Math.floor(x),Math.floor(y),1,1).data;
      143 |           return getComputedStyle(el).overflow==="hidden"&&box.width>100&&box.height>100&&(color==="blue"?p[2]!>200&&p[0]!<30:p[0]!>200&&p[2]!<30);
    > 144 |         },color)).toBe(true);
          |                   ^
      145 |       }
      146 |       // Both layers share an exact DOM offset; the initial fake cursor is on right only.
      147 |       for(const [viewport,visible]of[[left,false],[right,true]]as const){
        at /workspaces/sodashitsu-desktop-monitor-windows-check/packages/e2e/src/specs/remote-desktop-monitor-windows.spec.ts:144:19

    Error Context: test-results/remote-desktop-monitor-win-3915a-pecific-browser-popup-plain/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-monitor-win-3915a-pecific-browser-popup-plain/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-monitor-win-3915a-pecific-browser-popup-plain/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-monitor-windows.spec.ts:15:3 › monitor-specific browser popup plain ───
undefined
/workspaces/sodashitsu-desktop-monitor-windows-check/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-monitor-windows.spec.ts -g popup plain
(node:1813146) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

```

## input-clamp negative

```text

Running 1 test using 1 worker

{"ts":"2026-10-27T19:15:43.064Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T19:15:43.066Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T19:15:43.066Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T19:15:43.080Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-tCdLN1/commands.json","count":0}
{"ts":"2026-10-27T19:15:43.959Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-27T19:15:43.961Z","level":"info","msg":"agent manifest extended","kind":"agy","path":"antigravity-extra.toml","added":1}
{"ts":"2026-10-27T19:15:43.961Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-27T19:15:43.963Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-NoWYbr/commands.json","count":0}
Generated popup DOM plain [
  'Generated shared monitors B — デスクトップ閲覧中操作するIME ONIME OFF情報・設定最大化閉じる▴暗号化接続 接続先PCのlocalhost設定で鍵を作成し、このブラウザの指紋を許可してください。接続先で「暗号化接続を必須にする」を有効にします。  このブラウザの鍵を作成 接続先PCで確認した指紋接続先PCのlocalhost画面に表示された指紋と一致することを確認しました この接続先を記憶して暗号化で接続  指紋の不一致や鍵を読み取れない場合は停止します。通常接続へは自動で戻りません。ブラウザへ配信されるプログラムと両端のPCは信頼する必要があります。 Synthetic test source 模擬画面（実デスクトップではありません） 画像設定: 幅上限1280 / 10fps上限 / JPEG 65 / フルカラー複数viewerで同じ画面を共有モニター選択を共有（全ての窓で同じ選択が必要）参加するモニターIDこのモニターで接続共有中の窓と同じモニターIDを指定してください。別のIDでは参加できません。差分画像を共有（全ての窓で同じ選択が必要）独立カーソルを共有（全ての窓で同じ選択が必要）通常画面の画像配信です。同じ画質設定で最大8窓まで接続できます。操作は1窓だけに許可され、他の窓からは引き継げません。操作中の窓で解除してから、別の窓で「操作する」を押してください。対応する接続先ではシステム音声も共有でき、動画の解像度も各窓の希望を集約して調整します。固定設定の窓がある間は、その解像度を維持します。クリップボードは利用できません。OSの解像度変更は利用できません。動画で遅れた窓は次のキーフレームから復帰します。管理者権限のアプリ・UAC画面を共有一時的な仮想画面を使う再同期共有停止画面に合わせる画質・計測プリセット選択…低帯域標準高画質送信幅の上限fps上限JPEG品質色フルカラー約6.5万色256色16階調グレー差分転送自動画質調整共有元のカーソルを表示 幅は縦横比を保った上限、fpsは目標上限です。JPEG品質を下げると文字がにじむ場合があります。  減色は細かな色の違いを失い、エージェントの画像認識にも影響します。差分PNGにも適用されます。  適用すると共有へ再接続し、操作とエージェント許可を解除します。設定はこのブラウザでマシンごとに記憶します。 適用して再接続この窓に表示するモニター全体left — 640×480right — 800×600選択モニターを別窓で開く全モニターの取得・転送を共有し、全モニターの画像を各窓で受信し、選択領域だけ表示します。領域外へのドラッグは表示モニター端で止まります。操作権は1窓ずつ取得してください。モニター別の独立圧縮には対応していません。別窓で開きます。開かない場合は、このサイトのポップアップを許可してください。表示モニターleft — 640×480 / 125%right — 800×600（主画面） / 150%全モニターをまとめて表示エージェント連携 この共有画面の取得・PC操作を最大2分許可します。取得画像をモデルへ渡す用途を含みます。発行コードは30秒以内・1回だけ使用できます。  エージェントへの画面提供・操作を許可 文字を送る▾閲覧専用。操作にはBの事前許可が必要です。6.7 fps · 0.88 Mbps · relay→描画ACK p95 91 ms · 取得 32.2 / encode 3.2 / 描画 6.3 ms · 入力ACK 0 ms'
] [
  '\n' +
    '    Generated shared monitors B — デスクトップ操作中閲覧に戻るIME ONIME OFF情報・設定最大化閉じる▴暗号化接続 接続先PCのlocalhost設定で鍵を作成し、このブラウザの指紋を許可してください。接続先で「暗号化接続を必須にする」を有効にします。  このブラウザの鍵を作成 接続先PCで確認した指紋接続先PCのlocalhost画面に表示された指紋と一致することを確認しました この接続先を記憶して暗号化で接続  指紋の不一致や鍵を読み取れない場合は停止します。通常接続へは自動で戻りません。ブラウザへ配信されるプログラムと両端のPCは信頼する必要があります。 Synthetic test source 模擬画面（実デスクトップではありません） 画像設定: 幅上限1280 / 10fps上限 / JPEG 65 / フルカラー複数viewerで同じ画面を共有モニター選択を共有（全ての窓で同じ選択が必要）参加するモニターIDこのモニターで接続共有中の窓と同じモニターIDを指定してください。別のIDでは参加できません。差分画像を共有（全ての窓で同じ選択が必要）独立カーソルを共有（全ての窓で同じ選択が必要）通常画面の画像配信です。同じ画質設定で最大8窓まで接続できます。操作は1窓だけに許可され、他の窓からは引き継げません。操作中の窓で解除してから、別の窓で「操作する」を押してください。対応する接続先ではシステム音声も共有でき、動画の解像度も各窓の希望を集約して調整します。固定設定の窓がある間は、その解像度を維持します。クリップボードは利用できません。OSの解像度変更は利用できません。動画で遅れた窓は次のキーフレームから復帰します。管理者権限のアプリ・UAC画面を共有一時的な仮想画面を使う再同期共有停止画面に合わせる画質・計測プリセット選択…低帯域標準高画質送信幅の上限fps上限JPEG品質色フルカラー約6.5万色256色16階調グレー差分転送自動画質調整共有元のカーソルを表示 幅は縦横比を保った上限、fpsは目標上限です。JPEG品質を下げると文字がにじむ場合があります。  減色は細かな色の違いを失い、エージェントの画像認識にも影響します。差分PNGにも適用されます。  適用すると共有へ再接続し、操作とエージェント許可を解除します。設定はこのブラウザでマシンごとに記憶します。 適用して再接続この窓に表示するモニター全体left — 640×480right — 800×600選択モニターを別窓で開く全モニターの取得・転送を共有し、全モニターの画像を各窓で受信し、選択領域だけ表示します。領域外へのドラッグは表示モニター端で止まります。操作権は1窓ずつ取得してください。モニター別の独立圧縮には対応していません。表示モニターleft — 640×480 / 125%right — 800×600（主画面） / 150%全モニターをまとめて表示エージェント連携 この共有画面の取得・PC操作を最大2分許可します。取得画像をモデルへ渡す用途を含みます。発行コードは30秒以内・1回だけ使用できます。  エージェントへの画面提供・操作を許可 文字を送る▾入力はBのPC全体に届きます。Escを2回続けて押すと操作を解除。6.2 fps · 0.81 Mbps · relay→描画ACK p95 115 ms · 取得 46.2 / encode 3.1 / 描画 5.6 ms · 入力ACK 18 ms\n' +
    '  \n' +
    '\n'
]
{"ts":"2026-10-27T19:15:53.091Z","level":"info","msg":"machine link closed","machine":"0815c5ccfbeb85a5491bd8fc8a54d36e","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-monitor-windows.spec.ts:15:3 › monitor-specific browser popup plain (12.1s)


  1) src/specs/remote-desktop-monitor-windows.spec.ts:15:3 › monitor-specific browser popup plain ──

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: true
    Received: false

      189 |         const down=sent.find(v=>v.kind==="pointer"&&v.event==="down")!;
      190 |         expect(down.x).toBeCloseTo(320/1439,2);expect(down.y).toBeCloseTo(240/(mode==="native"?809:799),2);
    > 191 |         expect(sent.filter(v=>v.kind==="pointer").every(v=>v.x<=639/1439+0.00001)).toBe(true);
          |                                                                                    ^
      192 |       }
      193 |       // Reload uses the same nonsecret launch preferences, never retained input permission.
      194 |       await second.reload();
        at /workspaces/sodashitsu-desktop-monitor-windows-check/packages/e2e/src/specs/remote-desktop-monitor-windows.spec.ts:191:84

    Error Context: test-results/remote-desktop-monitor-win-3915a-pecific-browser-popup-plain/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-monitor-win-3915a-pecific-browser-popup-plain/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-monitor-win-3915a-pecific-browser-popup-plain/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-monitor-windows.spec.ts:15:3 › monitor-specific browser popup plain ───
undefined
/workspaces/sodashitsu-desktop-monitor-windows-check/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-monitor-windows.spec.ts -g popup plain
(node:1822227) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)

```


## Topology race correction

Root関連browser初回は21件中20通過、既存shared-monitors topologyで「モニター構成が変更」が「画像の順序が不正」に上書きされた。handlerがreadyをfalseにするだけで、後続binary/pendingdecodeを失効していない実競合だった。topologyでstop/epoch失効、onmessage catchでもdead/epoch再検査を追加。独立taskcheckでdecode rejectの古いcatchが理由を上書きするmustを検出し、resolve/reject2ケースの確定回帰とguardで修正・独立再点検/全体差分再レビューを通過した。fixture初版はPNGheaderが不正でdecoderまで届かなかったため、生成headerに直して前提もassertした。

初回root全体は12043通過＋TuiApp.subagents経過時間の1件が失敗（808files）。本修正後はsource/rootをfresh buildして全体再実行しており、初回を全通過と扱わない。

Windows CI初回40567763438は既存生成microphone private pipeでexit5（PCM自体のchecks_passed後）となった。今回Windows/C#実装は無変更。修正commit709dcfa0の40568384204 / job122415669364は全checks SUCCESS（19:22:05 UTC）。CIの実音声デバイス利用はない。

## topology negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-monitor-windows-check

 ❯ |@sodashitsu/web| src/components/RemoteDesktopTopology.test.ts (2 tests | 2 failed) 77ms
   × invalidates pending decode resolve and queued frames when monitor topology changes 59ms
   × invalidates pending decode reject and queued frames when monitor topology changes 17ms

 Test Files  1 failed (1)
      Tests  2 failed (2)
   Start at  04:21:30
   Duration  1.99s (transform 68%, environment 14%, import 13%, tests 4%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/RemoteDesktopTopology.test.ts > invalidates pending decode resolve and queued frames when monitor topology changes
 FAIL  |@sodashitsu/web| src/components/RemoteDesktopTopology.test.ts > invalidates pending decode reject and queued frames when monitor topology changes
AssertionError: expected '画像の順序が不正です' to contain 'モニター構成が変更'

Expected: "モニター構成が変更"
Received: "画像の順序が不正です"

 ❯ src/components/RemoteDesktopTopology.test.ts:37:49
     35|     await socket.onmessage!({data:packet});
     36|     if(outcome==="resolve")resolve(bitmap);else reject(new Error("gene…
     37|     expect(viewer.get('[role="alert"]').text()).toContain("モニター構成が変更");
       |                                                 ^
     38|     expect(viewer.get("[data-desktop-status]").text()).toBe("停止");
     39|     expect(viewer.get('[aria-label="共有画面"]').attributes("data-rendered…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


```

## decoder-epoch negative

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-monitor-windows-check

 ❯ |@sodashitsu/web| src/components/RemoteDesktopTopology.test.ts (2 tests | 1 failed | 1 skipped) 59ms
   × invalidates pending decode reject and queued frames when monitor topology changes 58ms

 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  04:21:33
   Duration  1.91s (transform 68%, environment 14%, import 14%, tests 3%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/components/RemoteDesktopTopology.test.ts > invalidates pending decode reject and queued frames when monitor topology changes
AssertionError: expected 'generated delayed decoder failure' to contain 'モニター構成が変更'

Expected: "モニター構成が変更"
Received: "generated delayed decoder failure"

 ❯ src/components/RemoteDesktopTopology.test.ts:37:49
     35|     await socket.onmessage!({data:packet});
     36|     if(outcome==="resolve")resolve(bitmap);else reject(new Error("gene…
     37|     expect(viewer.get('[role="alert"]').text()).toContain("モニター構成が変更");
       |                                                 ^
     38|     expect(viewer.get("[data-desktop-status]").text()).toBe("停止");
     39|     expect(viewer.get('[aria-label="共有画面"]').attributes("data-rendered…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```


## 最終検証

709dcfa0の最終runtime版で、source/rootのfresh全体build＋catch guard反映後web再build、全体typecheckを通過。source全体11984件/801files、root全体12046件/809filesがそれぞれ1回の最終runですべて通過。初回rootのTUI時計1件失敗とは区別し、その試験も最終全体で通過した。

source最終browserは新5件＋既存shared-monitors topology1件の6件が一つのprocessで通過。root関連browser初回20通過＋topology1失敗に対し、修正後に新/既存topology2件を一つのprocessで通過し、unique21件を検証（21件を一度に全通過と主張しない）。旧失敗は原因を特定して修正し、回帰resolve/rejectと負例を追加した。独立check WTも最終sourceでweb fresh build/smokeを再確認してPASS。

負例は計5件、すべて期待したassertで失敗しfinallyでexact source bytesを復元。Windows CIは修正commitの全checks通過。実OS操作・OSのmonitor構成変更・本物の音声入出力は本差分で実行していない。
