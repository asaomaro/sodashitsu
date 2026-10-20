# 独立レビュー

担当: `/root/review_view_maximize`（実装とは別のコンテキスト）。旧タスクの未コミット変更は対象外。

## 修正した指摘

- 転送の開始中・保存中の切断: 開始時にownerのLifeを予約し、各段階で検証。native公開後に切れた場合も履歴とarchiveを削除する。
- 検証とコマンド実行の分離: `work.exec`の同じ認証済みRPCでscopeを検証してspawn。
- WindowsでO_NOFOLLOWが利用できない場合の最終リンク: lstat、fdのdev/ino、realpath、親ディレクトリの同一性を照合。保存もdir guardを使用。
- Codexの履歴名: 秒精度のcanonical名に修正。一次実装はOpenAI Codex `codex-rs/rollout/src/rollout_file_name.rs`。
- 既存の履歴保護: 直近だけの上限付き検索を流用せず、探索完走が確かめられない場合はnative登録を見送る。archived_sessionsも調べる。native確認〜公開は直列化。
- PJの入れ替え: bindでcanonical rootとdir identityを記憶し、各操作で再検証。scope内部のawait中の設定変更も最後に同期照合。
- TTL失効: ownerだけでなく、転送のMap entryが同じであることも確認し、公開途中でもrollback。
- 保存中のPJ変更: メモ保存/native公開の直前と完了時にscopeを再確認。
- handoffに既存work memoryを明示: 親フォルダと検証済みファイル一覧をnoteに含め、再開側へ読むよう指示。

## 再レビュー

指摘修正差分を再点検し、追加の修正必須指摘なし。さらにtextFileの親ディレクトリguard追加の差分も再点検し、追加指摘なし。重いテストは実装側が一度だけ実行する。

旧ID互換性（w3/p3）への追加修正も独立点検。安全なpath component・Windows予約名拒否・native sessionと転送idのUUID制限維持を確認し、追加の修正必須なし。
