# 検証結果

新しい提出stage生成5tests pass、既存mode callback fake検査pass。回帰バグ修正ではなく新規配布準備機能のため、存在しなかった旧scriptへの負対照は行わない。拒否テストは別HWID/source INF/別archのPE/欠落symbols/redirected path/曖昧commit/既存出力を検査。

実機はWindows11 Pro build26200 x64/SecureBoot有効/IddCx10.0.26100.4202/UMDF reflector running。既存Intel IrisXe displayだけで、確認後も同じ一覧。code-signing cert0。実CATはNotSigned、GitHub release0。

CI run41224931654・source9841e0ab54c61d5e2bcafcdc68efaeb59275d8b5のunsigned artifact13051142090を期限内に取得。現main f696b1adとのdriver source差分0を確認。WDK生成4fileを実Windows makecabでCABへ保存、expand後全SHA一致。CAB536293B/SHA256 b420aefafd7c55cb9069929142874ca900f569e7710399a408e1c1ed841fc1bc。

永続artifact: `/home/asaomaro/.local/state/sodashitsu/virtual-driver-signing-20261107/SodaVirtualDisplay-unsigned-submission.cab` とsubmission.json/unsigned-submission.zip。sr-pc: `C:\Windows\Temp\soda-virtual-signing-20261107\submission`。認証秘密は保存しない。

prepare-release.ps1は実PowerShell AST通過、実unsigned CATをoutput作成前に拒否。署名済み正例とWindows PnP受け入れ/captureは未検証。CI追加step自体はまだremote実行していない。scriptは署名/提出/導入/信頼設定/表示変更を行わない。raw logsを併記。

転送は大きなstdin staging timeout/SFTP subsystem非対応だったため既知SSH認証のlegacy SCPで実施。認証やサーバ設定は変更しない。最終CAB取得後に両端SHA一致を確認した。
