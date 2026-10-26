# 第6段階後半: 仮想display integration

基盤PR #219 / main54228950上の差分。ローカルceiling、viewer/A/B/helperの明示交渉、protected broker purpose、headless helper起動前の仮想画面作成、exact targetの入力前再照合、退出時の回収、固定失敗理由、署名済みpackageの明示登録手順を追加。

Windows 11 x64専用IDD sourceは実Windows CIでcompile/package成功。現在配布artifactはunsignedであり、署名済み配布・DriverStore実登録・実headless captureは未完了。署名環境/署名済みpackageの有無を利用者へ任意質問し、独立して実装・fake検証を継続。第6段階を実機確認済みとは扱わない。

独立レビュー: review_pointer（Node/UI/旧peer/公開message）とreview_transfer（Windows/broker/installer）。A/Bのstartup期限不一致を25sへ整合し16s実接続を検証。service purposeはunlock-only/virtual-only/bothのactualrouteを分離。normal desktop事前guard、ready parser、stdout失敗時も回収、root→leaf reparse/drive種別の改善を再レビュー済み、最新差分mustなし。

自動検証は生成画面・fake helper・fake owner/device/clockだけ。OS driver/serviceの導入・更新、実capture/入力/clipboard/表示設定変更は行わない。installer AST/unsigned catalog拒否とown TEMPのancestor junction拒否・cleanup保持を確認。readonlyのWindows version/DriverStore metadata照会は実作成時のnative backendで使うが、fake試験はBeginを呼ばない。

最終結果は追記する。先行検査: 新ブラウザ6件pass、関連100件pass、16s後ready unit pass、combined broker/helperコンパイル・actual guard/parser/purpose/ABI fake検査pass。最新reason表示と全体は再検証中。

以下は対象修正だけを除去したnegativeの生出力。全件失敗を確認後、元bytesへ復元し一致を確認した。

## A startup deadline

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-virtual-integration

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (81 tests | 1 failed | 80 skipped) 21034ms
   × allows an explicitly negotiated virtual source to become ready after sixteen seconds 21032ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > allows an explicitly negotiated virtual source to become ready after sixteen seconds
AssertionError: expected undefined to match object { virtualDisplay: true }

- Expected:
{
  "virtualDisplay": true,
}

+ Received:
undefined

 ❯ src/desktop/DesktopRelay.test.ts:790:162


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:790:86

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 80 skipped (81)
   Start at  21:59:31
   Duration  22.16s (tests 96%, transform 4%, import 1%)


```

## B startup deadline

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-desktop-virtual-integration

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (81 tests | 1 failed | 80 skipped) 21036ms
   × allows an explicitly negotiated virtual source to become ready after sixteen seconds 21035ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > allows an explicitly negotiated virtual source to become ready after sixteen seconds
AssertionError: expected undefined to match object { virtualDisplay: true }

- Expected:
{
  "virtualDisplay": true,
}

+ Received:
undefined

 ❯ src/desktop/DesktopRelay.test.ts:790:162


Caused by: Error: Matcher did not succeed in time.
 ❯ src/desktop/DesktopRelay.test.ts:790:86

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 80 skipped (81)
   Start at  21:59:54
   Duration  22.12s (tests 96%, transform 4%, import 1%)


```

## normal desktop guard

```text
desktop_broker_purpose_checks_passed: unlock-only / virtual-only / both routes separated; no service/device creation or display/input changes
"0" 個の引数を指定して "VerifyVirtualDesktopGuard" を呼び出し中に例外が発生しました: "Virtual device was opened before 
normal desktop guard"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-virtual-integration\scripts\remote-desktop\validate-virtu
al-broker.ps1:10 文字:1
+ [SodaDesktopHost]::VerifyVirtualDesktopGuard()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```

## virtual-only purpose

```text
"0" 個の引数を指定して "VerifyLeasePurposes" を呼び出し中に例外が発生しました: "Unlock helper unavailable"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-virtual-integration\scripts\remote-desktop\validate-virtu
al-broker.ps1:9 文字:1
+ [SodaDesktopUnlock]::VerifyLeasePurposes()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```

## ready device string

```text
desktop_broker_purpose_checks_passed: unlock-only / virtual-only / both routes separated; no service/device creation or display/input changes
virtual_desktop_preflight_guard_passed: fake normal/secure guards; no native device or desktop APIs
"0" 個の引数を指定して "VerifyReadyMessages" を呼び出し中に例外が発生しました: "Invalid virtual ready accepted: device"
発生場所 \\wsl.localhost\Ubuntu\workspaces\sodashitsu-desktop-virtual-integration\scripts\remote-desktop\validate-virtu
al-broker.ps1:11 文字:1
+ [SodaDesktopVirtualClient]::VerifyReadyMessages()
+ ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : InvalidOperationException
 

```
