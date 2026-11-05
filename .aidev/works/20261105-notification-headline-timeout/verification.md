# 検証

sr-pcのWindowsネイティブ・別ポート17880・専用state/userDataで、ロック解除後にproduction Electronの通知BrowserWindowがvisibleになり、リマインダー本文が一致した。音声offと、system voice on/quiet fullscreen onでも同様。通常の通知表示経路は動作しており、報告元PCの原因は未確定。

コード上では、共有要約の未応答/待機が続くとpendingHeadlineが無期限に残り、通知一覧だけに存在して吹き出しが出ない経路がある。修正はこの経路の待機上限である。

## 関連試験

main.test.ts 62テスト成功（4.00秒）。新しい試験は未解決の要約Promiseを作り、期限後の簡潔な通知、遅い要約で同じ窓の内容だけ更新されて窓が追加されないことを確認。

## 修正前の負例

main.tsだけをHEADの修正前ソースへ戻し、同じ試験を実行。失敗後はfinallyで修正版のバイト列を復元し、完全一致を確認した。復元後SHA256: 108622ec82c9d3a982dfc62451849a9a64795ac5fde5457d8aa5661198c4023d。

失敗の生の出力（抜粋）:

```text
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯
AssertionError: expected undefined to be type of 'function'
 Test Files  1 failed (1)
      Tests  1 failed | 61 skipped (62)
```

## 独立レビュー

review_resource_monitorが変更全体を確認。timer取消、通知ID/epochの確認、音声準備の経路、遅い要約での重複通知を点検し、必須指摘なし。


## 全体検証

build、typecheck、smoke成功。型検査では最初に試験のsetTimeoutラッパーの可変長引数型が見つかり、Reflect.applyへ修正後、全体を再実行して成功した。
全体テストの失敗は既知のSidebar snapshot 2件、AssistantHostBundleのnativeTheme stub不足、SettingsDialogのOOMと一致し、新しい失敗なし。

```text
 Test Files  2 failed | 973 passed | 1 skipped (977)
      Tests  3 failed | 13811 passed | 1 skipped (13822)
     Errors  1 error
   Start at  16:48:34
   Duration  875.15s (tests 79%, import 13%, environment 4%, transform 4%)
```

## Windowsの作業完了通知

隔離した17880のサーバーに、自前のclaude.exe console fixtureだけを起動。working→idleとcompletionSeqを確認し、会話ウィンドウを閉じたproduction Electronで通知窓がvisibleになり、通知元が自前workspaceに一致することを確認した。実モデルの起動はない。

```text
{"nativeAgentCompletion":true,"notificationWindowVisible":true,"ownedSourceMatched":true}
```


## Windows実機の要約待機上限

production host bundleを修正版へ更新した隔離アプリで、Windows上の自前codex.exe fixtureを要約専用に使用。fixtureは入力を保存せず30秒待機し、実モデルやネットワークは使わない。PATHとCODEX_HOMEは隔離した17880サーバーの子プロセスだけに設定し、通常サーバーの設定は変更しない。
最初のfixtureは意図的に削除されるSODA_*環境変数を参照してmarkerを作れず失敗したため、固定した自前LocalAppDataフォルダー参照へ直して再検証した。
遅延中の要約処理に対して15.356秒で簡潔な通知が表示され、自前workspaceの通知と一致した。

```text
{"nativeHeadlineTimeout":true,"notificationWindowVisible":true,"ownedSourceMatched":true,"simpleFallback":true,"elapsedMs":15356,"realModelUsed":false}
```

検証したnative bundleはLinuxのレビュー済みbuildとSHA256 ef45f7a58173c6d959ab4100cdb5b0811ab9ded8cd7dfecc8848eaff0d44e094で完全一致。Windows側の未修正bundleからの小さいbyte差分を隔離アプリだけに適用し、適用前後の全体hashを検証した。通常の配布物や秘密設定に差分を適用していない。


## 導入

- 4ba0be68をmainへpush。MY-NOTEPCのC:\git\sodashitsu-windows-notifyとsr-pcのC:\git\sodashitsuをbf12705aへfast-forward更新し、desktop-assistant/serverのWindows build成功。
- sr-pc側の稼働workerをhandoffし、認証済みcontrol statusで2026-11-05T08:09:41.444Z / adopted=3 / dropped=0を確認。buildしたWindows host bundleのSHA256は検証済みのef45f7a58173c6d959ab4100cdb5b0811ab9ded8cd7dfecc8848eaff0d44e094と一致。
- Windows main.jsの既存RunOnce pinは変化なし。
- 隔離17880サーバーを認証済みserver.stopで終了し、17880/17980の待受0を確認。隔離local-authと自前のcodex.exeダミーは撤去。自前workspaceは閉じ、通常サーバーの共有設定や通常の要約エージェントは変更していない。

- WSL稼働サーバーもhandoffで13 paneを維持した。
