# 明暗モードの切り替えとsr-pc検証

通知ベルの左に通常→ダーク→システム追従を巡回するボタンをWeb（モバイル含む）とTUIへ追加。選択済み明暗テーマを維持して共有設定へ保存し、対のないNord等も失わない。折り畳んだTUIではベルの一つ上に配置。狭幅では新規・メニュー・切替・ベルが重ならないようにした。

関連7ファイル96テスト、pnpm build、pnpm typecheck成功。ブラウザでは共有prefs要求を模擬し、利用者の保存設定を変更せず、巡回・OS明暗追従・ベル左の位置・折り畳み後の可視性を確認した。

review_bubble_resizeによる差分全体の独立レビューで必須指摘なし。既存テーマの表示名検査が17テーマのまま残っていたため、現行の19テーマに更新した。

## 実機で検出したlocalhostコールバックの不具合

sr-pcへの更新とWindows上のpnpm install --frozen-lockfile・pnpm build成功。既存4ペインを維持している。localhostから閲覧すると、共有元が自身のlocalhostへコールバックして開始要求を拒否し0フレームだった。公開HTTPS URLで同じ接続先を開くとロック画面readyを受信でき、許可設定の問題ではないことを確認した。

明示的なextraOriginsの外部HTTPS URLだけをloopback閲覧時のproviderコールバックに使用する修正を追加。viewerの認証・Origin、短命ticketとprovider側の許可リストは維持する。IPリテラルとしての127/8と、localhost・::1だけを対象とし、127.example.comは変更しない。

関連307テスト・build・typecheck成功。URL構築だけを戻すと回帰テストが失敗する負例を記録し、元のバイト列へ復元後に全体を検証した。review_resource_monitorの独立レビュー、127.*判定修正の再レビューとも必須指摘なし。

## Windowsロック解除サービス

sr-pcのインストール済みサービスは古い版で停止しており、ロック画面からサインイン画面へ切り替えると共有が終了する。現行インストーラーは-ValidateOnlyでコンパイル成功。現在のリモート実行は非管理者のため、WindowsのUAC確認が必要。昇格起動の要求を行い、利用者へ本体のロック解除・UAC承認を依頼している。PINはログ・成果物・リポジトリへ保存していない。

## 最終反映と残る承認

localhost修正もsr-pcでpull/build成功。Windowsのhandoffを別プロセスで起動し、接続先ログの「3 pane(s) kept running」と、既存4ペインの保持を確認した。手元は既存13ペイン保持・アシスタントrunning/ready。

双方の更新後、localhostから実機sr-pcへ新しく接続し、errorなし・allowInput=true・secureDesktop=true・lockScreenCover=trueのreadyをブラウザで受信した（srpc-localhost-after.txt）。初期ロック画面では意図的に撮影しないため、フレーム数0は正常。サインイン後の実画面取得はまだ確認できていない。

インストーラーの昇格起動を要求したが、exec.readはtimeoutになった。sr-pcではconsentプロセス1件、更新結果ファイル未作成を確認している。更新完了・PINによる解除・サインイン後の実画面確認は、Windows本体でのロック解除/UAC承認待ち。利用者への非同期質問を出している。完了扱いにはしていない。作成した検証ブラウザは終了済み。
