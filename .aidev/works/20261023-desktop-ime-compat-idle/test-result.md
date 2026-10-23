# IME通知の互換性と放置後のロック画面復帰

## 現象と修正

両サーバ更新後も開いたままの旧ブラウザへready.imeKeysを送ってしまい、strictな旧DesktopReadyがunrecognized_keysで接続を停止した。新ブラウザはWebSocket subprotocolでIME対応を示し、RelayはBのcapabilitiesでも対応確認してから新しいconfigure optionを送る。helperはそのoptionがあるときだけ通知し、Provider/Relayの両方で非対応接続への通知を落とす。旧Relayには未知のJSON項目を送らず、wsの既定subprotocol処理を使う。旧Bには新しいoptionを渡さない。通知を要求していない旧ブラウザは通常の共有を継続する。

sr-pcの放置後はWTS locked=0、入力Default、前景がWindows標準ShellExperienceHost、同session=1、LockApp常駐で、既存のpending条件に入らずSelectSource=transitionとなっていた。OSの固定パス（reparse拒否）、ユーザー、session、Logon SID、前景の不変性、locked/Defaultを検証したShellExperienceHostも非撮影の復帰面として扱う。従来のLockApp検証を共通化したがEnterはLockAppだけ、Shellは画面の復帰要求だけに制限する。

## 検証

- build/typecheck成功、DesktopRelay/protocol unit 32件成功。
- IMEブラウザ3ケース成功（新旧ブラウザ、対応/旧helper）。旧ブラウザ相当のケースではPR187の未要求通知を再現するhelperを使い、ブラウザが受け取るreadyからimeKeysが省かれ通常入力と画像が継続することを確認した。
- 関連9 E2Eの実行で8件成功、unlock再接続1件が終了状態で失敗。単独再実行は成功、基点mainでの同じ単独試験も成功。原因は未確定で、退行ではないとは断定しない。規約どおり追加反復は行っていない。
- 追加テストの補助配列startsが既存カウンターと衝突する点を独立レビューで検出しstartRequestsへ修正。実行中の全体テストを中断し、関連unit成功を確認して全体を再実行した。
- Windows validate-unlock-helper.ps1成功。実機で修正ブロックだけを一時PowerShellへコンパイルし、同じShell状態でselected=cover、pendingShell=trueを確認。リポジトリのファイルは変更していない。
- Guard確認後にSetThreadExecutionStateによる画面復帰要求を1回だけ実施。LockAppが前景に戻り、selected=cover/visible=trueとなった。キー・認証情報・画像は扱っていない。
- その後、公開HTTPSのdesktop-shareでready secureDesktop=true / lockScreenCover=trueを確認。操作権を取らず、その確認用の接続だけ終了した。
- 独立レビュー review_transfer: 互換性とnative差分は指摘なし。補助変数の衝突は修正済み。
- 全体テスト: 735ファイル・11272件成功。PTY起動1件は、負対照から復元したProvider/Relayのmtimeがdistより新しくビルド日時の検査で停止。最終build後のその1件は成功。合計11273件を確認。
- 最終smoke: 成功。
- 最終typecheck、主作業フォルダのbuild、関連unit34件: 成功。

実機の修正前観測（旧版の実行結果）:

```json
{
  "head": "f73524f4",
  "selected": "transition",
  "sample": {
    "foregroundZero": false,
    "foreground": {
      "Id": 12200,
      "ProcessName": "ShellExperienceHost",
      "SessionId": 1,
      "Path": "C:\\Windows\\SystemApps\\ShellExperienceHost_cw5n1h2txyewy\\ShellExperienceHost.exe"
    },
    "visible": false,
    "pending": false,
    "cover": false,
    "secureCandidate": false,
    "locked": 0,
    "inputDefault": true
  }
}
```

実機の修正済み判定（ファイル変更なし、非撮影）:

```text
{"selected":"cover","visible":false,"locked":0,"filesChanged":false,"inputSent":false,"capture":false,"shell":true,"pending":true,"cover":true}

```

実機の画面復帰後（キー送信なし）:

```text
{"capture":false,"visible":true,"inputSent":false,"before":"cover","cover":true,"wakeOnly":true,"selected":"cover","locked":0}

```

## 旧ブラウザの回帰試験の負対照

Provider/Relayの未要求ready通知除去だけを外して実行。旧DesktopReadyと同じstrict schemaが、利用者と同じunrecognized_keys/imeKeysを出して失敗した。修正版2ファイルをバイト一致で復元した。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-ime-compat

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (25 tests | 1 failed | 23 skipped) 132ms
   × keeps strict legacy viewers connected without unsolicited IME fields (helper=true) 62ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > keeps strict legacy viewers connected without unsolicited IME fields (helper=true)
AssertionError: expected [Function] to not throw an error but '[\n  {\n    "code": "unrecognized_key…' was thrown

- Expected:
undefined

+ Received:
"[
  {
    \"code\": \"unrecognized_keys\",
    \"keys\": [
      \"imeKeys\"
    ],
    \"path\": [],
    \"message\": \"Unrecognized key: \\\"imeKeys\\\"\"
  }
]"

 ❯ src/desktop/DesktopRelay.test.ts:405:60
    403|   const {imeKeys: _ime, ...oldShape}=DesktopReady.shape;
    404|   const {z}=await import("zod");
    405|   expect(()=>z.object(oldShape).strict().parse(ready)).not.toThrow();
       |                                                            ^
    406|   expect(ready).not.toHaveProperty("imeKeys");
    407|   expect(viewer.ws.readyState).toBe(WebSocket.OPEN);

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 passed | 23 skipped (25)
   Start at  21:38:45
   Duration  834ms (transform 61%, import 20%, tests 18%)


```
