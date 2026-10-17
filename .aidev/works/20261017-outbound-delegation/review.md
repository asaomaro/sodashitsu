# 独立レビュー

実装とは別コンテキストの `review_reverse_delegation` が差分全体を読み取り専用で確認。

初回指摘:
- P1: 成功handoffや再起動後に委譲を自動復元できない。資格情報の原子的0600保存と起動時復元、サーバー再生成の統合テストを追加。
- P2: provider側で無応答接続を検知できない。15秒ping/45秒タイムアウトとManualClockテストを追加。

上記の修正を再レビューし、追加の阻害事項なし。

その後、不正WebSocket upgradeが接続枠を占有する問題を修正。pendingをsocket所有権つきMapにし、raw socket closeで予約を解除する。version12拒否後の正常接続テストと負の対照を追加。この差分も独立再レビューし、阻害事項なし。
