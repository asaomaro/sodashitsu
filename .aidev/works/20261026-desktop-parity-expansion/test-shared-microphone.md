# 複数viewerのマイク共有の検証

base e322e815 / source 27290ced。実マイク/スピーカー/録音アプリを操作せず、生成oscillator・生成PCM/Opus・private sinkだけで検証。

- build/typecheck成功。全体790ファイル/11841件成功。
- 新共有browser2件＋既存mic/sharedaudioの最終browser6件成功。PCMと暗号化Opus、画像先行、2窓競合/明示handover/最初のviewer退出後継続、tracks停止を検査。
- pool31件成功、交渉/排他の関連10件成功。追加same-member古いstream停止回帰も全体で成功。
- native動画+音声を2回開始/停止する間の別viewer mic継続は、音声running/生成audio_stopまで待機する強化後のfocused回帰1件も成功。
- 独立worktree offline install/build/smoke成功。独立レビュー2件、should対応差分再レビュー成功。
- 初回browser2件はPCM成功/暗号化Opus1件失敗（切替後mic停止）。製品ソースを変えずfocused1件、追加診断4件、診断wrapper除去後の最終6件は成功。初回原因は確定していない。従来どおり圧縮/ACK/PCMの有限期限を超えると明示停止する仕様を維持しており、成功した再実行だけで初回原因を断定しない。
- 実Windows音声デバイスと実通話アプリの確認は未実施。

## 負例

各guardを1つずつ外し、source直接読込のvitestで失敗を確認。finallyで元のバイト列を復元し完全一致を確認。その後fresh build/typecheck/browser6件/全体を実行した。以下は失敗の標準出力。

### owner

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-microphone

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (32 tests | 1 failed | 31 skipped) 29ms
   × owns one microphone independently of input and releases only its own stream across viewer departure 27ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > owns one microphone independently of input and releases only its own stream across viewer departure
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSharedCapture.test.ts:227:122
    225|  try{
    226|   f.child.send({...ready,microphone:true});await vi.waitFor(()=>expect…
    227|   expect(a.session.requestMicrophone!("stream-a",true)).toBe(true);exp…
       |                                                                                                                          ^
    228|   a.send({type:"native_microphone",id:"stream-a",enabled:true,pipeName…
    229|   expect(f.child.commands.filter(m=>m.type==="native_microphone")).toE…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 31 skipped (32)
   Start at  21:18:07
   Duration  1.56s (transform 71%, import 27%, tests 2%)


```

### stream

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-microphone

 ❯ |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts (32 tests | 1 failed | 31 skipped) 43ms
   × does not let an old microphone stop release a newer stream of the same member 40ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopSharedCapture.test.ts > does not let an old microphone stop release a newer stream of the same member
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/DesktopSharedCapture.test.ts:245:154


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 31 skipped (32)
   Start at  21:18:10
   Duration  1.74s (transform 69%, import 28%, tests 3%)


```

### claim

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-microphone

 ❯ |@sodashitsu/server| src/desktop/DesktopMicrophone.test.ts (9 tests | 1 failed | 8 skipped) 20ms
   × rejects a busy shared microphone before allocating a pipe 18ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopMicrophone.test.ts > rejects a busy shared microphone before allocating a pipe
AssertionError: expected "vi.fn()" to be called with arguments: [ Array(1) ]

Number of calls: 0

 ❯ src/desktop/DesktopMicrophone.test.ts:51:227


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 8 skipped (9)
   Start at  21:18:13
   Duration  1.20s (transform 67%, import 30%, tests 2%, worker 1%)


```

### feature

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-shared-microphone

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (158 tests | 1 failed | 153 skipped) 1441ms
   × shares microphone only with every gate after an image-only first viewer: viewer 293ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > shares microphone only with every gate after an image-only first viewer: viewer
AssertionError: expected true to be undefined // Object.is equality

- Expected:
undefined

+ Received:
true

 ❯ src/desktop/DesktopRelay.test.ts:1215:64
    1213|  const options={...start.options,features:true,sharedDesktop:true},fir…
    1214|  const viewer=await f.viewer(missing==="viewer"?"shared-old-microphone…
    1215|  expect(viewer.messages.find(m=>m.type==="ready")?.microphone).toBe(mi…
       |                                                                ^
    1216|  expect(f.startRequests.at(-1)!.options.sharedMicrophone).toBe(["viewe…
    1217|  expect((await readFile(f.lifecycle,"utf8")).trim().split("\n")).toHav…

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 passed | 153 skipped (158)
   Start at  21:18:16
   Duration  3.42s (tests 45%, transform 41%, import 14%)


```
