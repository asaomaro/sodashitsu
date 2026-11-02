# 設計

実機の現在paneはCodex2件だが、履歴RPCは51files/partial=true/byKind=claudeのみ。Claude-firstの走査で共通64MiB枠を消費し、Codexへ進めなかった。

種類ごとに32MiB、256files、10000entries、約2秒、50000eventsの独立枠を割り当てる。合計の従来上限を維持する。パス検証、同じセッションのコピー排除、トークン差分、失効チェック、30秒キャッシュは既存のまま。
