# 検証

関連unit 4ファイル41件pass。UIのみ元へ戻した負の対照ではlive download progressテストが失敗し、固定版をbyte一致で復元した。生の出力はnegative-control.log。以降にビルドを実施。

全体ビルド成功。補助引数の整理後のserver再ビルド成功。Chromium E2E 1件pass（生成した設定応答を使い、本物のGUI導入・ダウンロードは起動していない）。ブラウザDOMで50%・50.0MB/100.0MB・展開へのpoll更新・indeterminate・中止・390px横溢れなしを確認し、狭幅スクリーンショットを目視。

全体型検査成功。起動smoke PASS。一時サーバ・導入済みChromiumのパス指定で既存assertionをそのまま実施。稼働サーバhandoffで5実行端末、前後で7paneの全IDを保持。実設定APIのprogressがcacheからappへ進むことを確認（再ダウンロード目的の設定変更なし）。

全体test: 949ファイルpass・1skip、13,593件pass・1skip。未変更3ファイルの計3件が失敗（画像添付の待機、容量回復の5秒timeout、TUI経過秒の17秒期待）。該当3ファイル単独再実行54件は全件pass（4.60秒）。時間上限や未変更ソースは修正していない。全体一回で成功とは記録しない。生の失敗出力はwhole-suite-failures.log。稼働APIはcache→app→running/readyへ進み、全7pane保持を確認。
