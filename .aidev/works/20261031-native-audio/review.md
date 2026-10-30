# 独立レビュー

実装したrootとは別のread-onlyコンテキストでレビューした。review_pointerがNode PCM path/physical owner/Provider/Settings/Web/TUI/Relay回帰/E2E/文書、review_transferがLinux PCM/Unix peer/Pulse actor/Portal配線/生成試験/workflowの全製品差分を点検。

修正・再点検したmust:
- 固定2500ms開始期限をpath/verify/hello到達点でも検査。
- select待機後とactive callback後に、親所有/許可/元期限を送信直前に検査。
- 部分書込みの全例外でpeerを終端化し、別recordを継ぎ足さない。
- buffer終端を観測時刻より未来にせず、PCM timestampの全範囲を有限化。
- configure中の取消・開始期限超過をPLAYING直前でも検査。
- 稼働中のreceiver EOFをpull前/後、無音時にも検査しsource→pipeの順で退役。
- 音声対応/非対応viewerの加入順に依存しない共有helper video/audio ceiling。

shouldも反映:
- shared memberのsynthetic closeはphysical owner終了と扱わない生成回帰。
- Linuxの音声対応ラベルとLinux-firstの記録境界。
- TypeErrorへ逃げた初回負例は不採用にし、fixtureを修正して意図したAssertionErrorを再取得。
- 最後のテスト用NonNullable annotationは読み取り再点検済み、runtime差分なし。

最終deltaで追加must/shouldなし。レビュアーは編集・実screen/audio/OS input・試験実行を行っていない。全体試験とCIの結果はtest-result.md/PRへ追記する。
