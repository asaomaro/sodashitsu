# 確認記録

## ローカル共有

- 既存DesktopRelay suiteと新LocalDesktopRpc、ViewerTabBarの初回実行は315 pass / 2 fail。新テストの入力形式が旧key/event形式だったためcode/down形式に修正。既存の独立画像socket idle通知テストにも時間依存の失敗があり、新規2件と合わせた再実行は3 pass。全体を成功と扱っていない。
- 独立レビューで自己接続URLの固定127.0.0.1がTLS証明書・特定bind hostで失敗すると指摘された。自己originの一般許可追加を撤回し、許可済みlocal要求時だけsource専用loopback受け口を作る実装へ変更。Originヘッダー付き接続を拒否し、通常のsource/auxiliary ticketと既存scopeを使う。公開serverのTLS検証は無効化しない。`endpointRequired`も維持する。
- 修正後LocalDesktopRpc/DesktopRelayのlocal関連: 16 pass（299件対象外）。遅延start中の切断、接続先の一致、暗号化必須時の拒否も確認。
- root build成功後、loopback変更のserver buildも成功。root typecheckは新テストのmock引数型エラーを直した後に全パッケージ・scriptsまで再実行し成功。
- Playwright `local-desktop.spec.ts`: 1 pass。操舵室の接続ビューからlocalを選択し、実canvasの描画フレーム、キー入力とACK、エージェント接続コード、attach後の画面取得とcanvas画素一致、act ACK、許可取消後のobserve拒否、窓終了を検査。PC接続の招待・登録は行わない。画面源はsynthetic helperであり、Windows実画面の検証を代用しない。
- `/root/review_resource_monitor` の独立レビューと修正差分の再レビュー完了。追加の必須指摘なし。
- root全体unit suite: 972 files pass / 2 fail / 1 skip、13,798 tests pass / 3 fail / 1 skip、SettingsDialog worker SIGABRT 1 error。今回の関連ファイルは成功。既存sidebar snapshot 2件（data-assistant-feature属性）とsynthetic Electron nativeTheme export不足1件は、前作業の隔離baseline 590419efでも再現済み（../20261105-signin-context-path/baseline-sidebar.txt、baseline-host.txt）。SettingsDialogの全ファイル実行時SIGABRTも前作業で記録済みで、未解決。全体成功とは扱わず、同じ切り分けを繰り返さない。
- root smoke: PASS。端末の入出力、Web描画・入力、初回案内とフォーカス復帰まで確認。

全体unit suiteの終了時出力（raw）:

```text
  Snapshots  2 failed
 Test Files  2 failed | 972 passed | 1 skipped (976)
      Tests  3 failed | 13798 passed | 1 skipped (13809)
     Errors  1 error
   Start at  13:10:34
   Duration  865.99s (tests 78%, import 13%, environment 5%, transform 3%)
```

## Windowsネイティブ通知

MY-NOTEPC: `C:\git\sodashitsu-windows-notify`へgit clone。Windows Node 24で依存導入・build成功。既存Electronエンジンとproductionのmanaged relayを使い、17880、専用state/userDataで実アシスタント接続を確認。実BrowserWindowの立ち絵生成と接続済み状態を確認し、テストリマインダーも登録した。Windowsはロック中で、吹き出しは仕様で抑制された。利用者は今は解除不可と回答したため、この検証サーバーは認証済み`server.stop`で停止した。既存7780と既存アシスタントは停止していない。

sr-pc: Windows側の`C:\git\sodashitsu`から別の17880・専用state/userDataで接続を確認。ここもロック中。既存共有窓はロック画面の非撮影カバーを表示し、保護画面共有は既存専用サービスの未復旧により開始不可。利用者へ手元で解除可能か確認中。PINの盲入力、サービスの未知journal初期化、強制再起動は行わない。

他のWindows PCで報告された「通知一覧にはあるが吹き出しが出ない」の原因は未確定。こちらのWindowsロック状態をそのPCの原因として扱わない。ロック解除後の通知表示・読み上げの検証が残る。

## 導入

- 49807a61をmainへpush。MY-NOTEPC側のクローンとsr-pcへfast-forward pullし、Windows Node 24でそれぞれbuild成功。
- 稼働中のWSL側はhandoffで13 paneを維持。assistant.enabled=true / phase=runningを更新後に確認。
- sr-pcのWindows worker更新は、自己exec経由の待機がexec.read timeoutになったが、後続の認証済みcontrol statusでlastHandoff adopted=3 / dropped=0を確認（2026-11-05T04:31:46.301Z）。Windows supervisorのPIDは同じままworkerが置き換わるため、PID不変を未更新の根拠にはしない。
- sr-pcの新しい通常サーバーへWindows Edgeの専用headless contextで接続し、`desktop-view`のmachineId=localを表示。PCの接続登録なしでstatus=「ロック画面・閲覧中」/ errors=[] / lockCover=1を確認。これは実Windows helper経路の確認であり、ロック解除後の通常画面・入力・通知の実機合格とは区別する。contextは終了した。
- 別ポート17880の検証用サーバーは確認後に認証済みserver.stopで停止し、test local-authの削除と通常サーバーの稼働を確認した。専用state/userDataと再開手順を残し、既存の通常サーバー・設定は停止/変更していない。
