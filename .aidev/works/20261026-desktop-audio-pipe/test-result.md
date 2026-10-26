# 検証記録

生成PCMのみを使用し、実際のWASAPI・画面取得・OS入力は実行していない。

- build/typecheck 成功。全体テストは753 suites / 11,429 tests成功、1 skip。soda PTYの1 suiteだけ、negative controlで復元したソースmtimeがdistより新しいため起動拒否。serverを再buildし同suiteを再実行し1/1成功（6.28s）。
- protocol/PCM/Opus unit 6件成功。生成440Hz PCMの実Opus圧縮/復号を確認。
- Windows A/B双方で生成source、owner ACL + NETWORK deny、接続PID照合、取消/停止/Dispose成功。Bのtracked変更なし、HEAD 1218c8a4を維持。実音声device未使用。
- 独立レビュー済み。NETWORK SID明示拒否の追加を再レビュー済み。

## Negative controls（実出力）

### pid

```text
"0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Wrong process must receive no PCM/header"
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-audio\scripts\remote-desktop\validate-audio.ps1:4 ����:1
+ [SodaDesktopTests.AudioChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```

### acl

```text
"0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Audio pipe ACL"
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-audio\scripts\remote-desktop\validate-audio.ps1:4 ����:1
+ [SodaDesktopTests.AudioChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```

### network

```text
"0" �̈������w�肵�� "Run" ���Ăяo�����ɗ�O���������܂���: "Audio pipe must have explicit owner allow and network d
eny rules"
�����ꏊ \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-audio\scripts\remote-desktop\validate-audio.ps1:4 ����:1
+ [SodaDesktopTests.AudioChecks]::Run()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```

### pcm

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopPcmStream.test.ts (2 tests | 1 failed | 1 skipped) 9ms
   × rejects unsupported formats, oversized PCM, nonconsecutive sequence and unsafe timestamps before encoding 8ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopPcmStream.test.ts > rejects unsupported formats, oversized PCM, nonconsecutive sequence and unsafe timestamps before encoding
AssertionError: expected [Function] to throw an error
 ❯ src/desktop/DesktopPcmStream.test.ts:11:337


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  10:23:50
   Duration  1.07s (transform 73%, import 25%, tests 1%, worker 1%)


```

### owner

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-audio

 ❯ |@sodashitsu/server| src/desktop/DesktopNativeAudio.test.ts (3 tests | 1 failed | 2 skipped) 27ms
   × does not request a pipe when the owning media is retired during codec import 26ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopNativeAudio.test.ts > does not request a pipe when the owning media is retired during codec import
AssertionError: expected "vi.fn()" to not be called at all, but actually been called 2 times

Received:

  1st vi.fn() call:

    Array [
      Object {
        "enabled": true,
        "id": "22222222-2222-4222-8222-222222222222",
        "pipeName": "SodaDesktopAudio-0f282640627e4234b1974f9e29704c96",
        "pipePath": "/tmp/SodaDesktopAudio-0f282640627e4234b1974f9e29704c96.sock",
        "type": "native_audio",
      },
    ]

  2nd vi.fn() call:

    Array [
      Object {
        "enabled": false,
        "id": "22222222-2222-4222-8222-222222222222",
        "type": "native_audio",
      },
    ]


Number of calls: 2

 ❯ src/desktop/DesktopNativeAudio.test.ts:28:107


⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 2 skipped (3)
   Start at  10:23:52
   Duration  1.08s (transform 65%, import 32%, tests 3%)


```

修正箇所だけを無効化し実行し、それぞれ失敗を確認後、元のバイト列へ復元した。
