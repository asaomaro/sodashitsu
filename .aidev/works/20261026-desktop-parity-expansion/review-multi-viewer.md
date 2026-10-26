# 複数viewer 8A 独立点検

review_pointer / review_transferを実装とは別コンテキストで実施。実キャプチャ・OS入力・service変更なし。

- 共有captureと各viewerのbounded backpressure、frame bytesの検証後ACK、source/lock終了、input排他/ACK routing/古いroute削除、A/B認可と旧peer gateを点検。
- review_pointer: retiring helper越しの重複取得、64未ACKでの入力永久停止、control request queue送信失敗の3件を修正対象とした。回帰とnegative controlを追加し、3件とも修正再点検を通過。古いrelease ACKと新agent attachの順序回帰も独立確認済み。
- review_transfer: 追加must/shouldなし。全体テスト結果は実装側の記録待ち。

task8全体の完了ではない。native動画/音声/保護source拡張、task6の署名済みdriver、task7B、task9/10は未完了。
