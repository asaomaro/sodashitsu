# 検証記録

生成PCM/H264のみ。実システム音声取得・実OS入力・unlockなし。ブラウザは実AudioDecoder/AudioContextを使い、テスト用最終gain0へ迂回。

- 完了: build/typecheck、Windows combined helper ValidateOnlyコンパイル、生成音声UDP/WSS/初期mute/明示再生/消音/停止4ケース、生成loss短時間継続（60s、635video frames/2208audio outputs、video4/audio128 drop、40ms順序入替、decoder queue2/source最大5）。
- 最終全体テスト: **757 suites / 11,446 tests passed**、409.01s。ソースを凍結して実行。独立worktreeでinstall/build/smoke PASS。
- 最終browser4件passed（28.1s、音声DC単体closeでもUDP映像継続、再依頼で初期mute復帰）。
- 長時間試験の初回は生成helperがaudio/video別々の論理時計を進め、CPU負荷でaudioが150ms以上古くなって正しく破棄された。試験helperを共通の単調時計へ変更し、同じ負荷下90秒再試験で914video/3836audio、video6/audio221drop、queue2/source5、継続成功。製品の鮮度判定は変更していない。
- 修正済み生成helperによる30分継続は完了。`../20261026-desktop-endurance/test-result.md`参照。

## 修正前の実ブラウザ失敗

```text
AUDIO_OUTPUT_ERROR Error: Unexpected audio output
    at e.output (...) 1119999 [1120000]
```

±21usのsample clock照合へ修正。生成packet lossでraw Opusの連続clockが入力timestampとずれたため不連続時にdecoderを更新。

## Runtime negative controls

各修正だけを無効化し、対応テストの実失敗を確認した。実行後はバイト列一致で復元した。

### clock

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-audio-ui

 ❯ |@sodashitsu/web| src/desktop/nativeAudioReceiver.test.ts (5 tests | 1 failed | 4 skipped) 9ms
   × starts muted without context/decoder and accepts sample-clock timestamp rounding 8ms

 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  10:52:35
   Duration  1.56s (transform 49%, environment 32%, import 18%, tests 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/nativeAudioReceiver.test.ts > starts muted without context/decoder and accepts sample-clock timestamp rounding
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 1 times

Received:

  1st vi.fn() call:

    Array []


Number of calls: 1

 ❯ src/desktop/nativeAudioReceiver.test.ts:90:26
     88|     const data = f.output(39999);
     89|     expect(data.close).toHaveBeenCalledOnce();
     90|     expect(f.failed).not.toHaveBeenCalled();
       |                          ^
     91|     expect(f.contexts[0].sources[0].start).toHaveBeenCalled();
     92|   } finally {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### loss

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-audio-ui

 ❯ |@sodashitsu/web| src/desktop/nativeAudioReceiver.test.ts (5 tests | 1 failed | 4 skipped) 13ms
   × resets the raw Opus sample clock after lost packets and ignores the retired decoder output 11ms

 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  10:52:38
   Duration  1.44s (transform 55%, environment 25%, import 18%, tests 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/nativeAudioReceiver.test.ts > resets the raw Opus sample clock after lost packets and ignores the retired decoder output
AssertionError: expected [ <Anonymous Class>{ …(6) } ] to have a length of 2 but got 1

- Expected
+ Received

- 2
+ 1

 ❯ src/desktop/nativeAudioReceiver.test.ts:162:24
    160|     f.output(20000);
    161|     f.receiver.push(packet(3));
    162|     expect(f.decoders).toHaveLength(2);
       |                        ^
    163|     expect(f.decoders[0].close).toHaveBeenCalledOnce();
    164|     const late = { timestamp: 40000, close: vi.fn() };

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### audio-open

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-audio-ui

 ❯ |@sodashitsu/server| src/desktop/DesktopNativeDatagrams.audio.test.ts (1 test | 1 failed) 59ms
   × starts video without waiting for optional audio and keeps it alive when that channel closes 58ms

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  10:52:40
   Duration  1.02s (transform 70%, import 23%, tests 6%, worker 1%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeDatagrams.audio.test.ts > starts video without waiting for optional audio and keeps it alive when that channel closes
AssertionError: expected "vi.fn()" to be called once, but got 0 times
 ❯ src/desktop/DesktopNativeDatagrams.audio.test.ts:13:245


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

### isolate

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-audio-ui

 ❯ |@sodashitsu/web| src/desktop/mediaReceiver.test.ts (14 tests | 1 failed | 13 skipped) 22ms
   × isolates malformed audio on WSS from video and ignores audio after stop 19ms

 Test Files  1 failed (1)
      Tests  1 failed | 13 skipped (14)
   Start at  10:52:42
   Duration  1.28s (transform 57%, environment 25%, import 16%, tests 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/mediaReceiver.test.ts > isolates malformed audio on WSS from video and ignores audio after stop
AssertionError: expected [Function] to not throw an error but 'Error: bad audio packet' was thrown

- Expected:
undefined

+ Received:
"Error: bad audio packet"

 ❯ src/desktop/mediaReceiver.test.ts:102:93


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```


## 最終fixtureと検証

- 共通時計変更後の関連unit: 7 suites /94 tests passed (17.28s)。browser4件再実行passed (25.2s)。製品コードに追加変更なし。
- 生成helperの送信上限チェックをseq更新より前へ移動。実socketを3秒pauseしてOSバッファを満たすテストを追加し、再開後の連番を検査。復元後1/1pass (3.84s)。
- 修正箇所だけ元へ戻した実行の生出力:

```text

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-audio-ui

 ❯ |@sodashitsu/server| src/desktop/DesktopSyntheticAudio.test.ts (1 test | 1 failed) 7135ms
   × keeps generated helper PCM sequence contiguous through local pipe backpressure 7134ms

 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  11:05:24
   Duration  7.93s (tests 91%, transform 7%, import 2%)

(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSyntheticAudio.test.ts > keeps generated helper PCM sequence contiguous through local pipe backpressure
AssertionError: expected { …(2) } to deeply equal { failure: '', progress: true }

- Expected
+ Received

  {
-   "failure": "",
+   "failure": "Error: Invalid PCM frame order",
    "progress": true,
  }

 ❯ src/desktop/DesktopSyntheticAudio.test.ts:23:106


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopSyntheticAudio.test.ts:23:3

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


```

- 追加backpressureテストのpoll指定をVitestの型に合わせinterval:50へ修正（製品変更なし）。server typecheck成功、対象1件再実行pass (3.86s)、1行差分の独立再レビュー通過。
