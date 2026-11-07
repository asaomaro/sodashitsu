# 途中進捗後の読み取り失敗

Reader.refresh の reject 時に内部 pending を解除し、Service は read reject 後の hint を再予約に使わない。部分 snapshot を作らず undefined のまま通常 2s へ戻す。

関連34テスト成功、server typecheck成功。旧製品2ファイルだけ HEAD に戻した負例は2件失敗（negative.log）。元のバイト列へ完全復元し34件再成功（restore.json / restored.log）。生成記録のみ使用し本番 pane/設定/Windows は操作していない。
