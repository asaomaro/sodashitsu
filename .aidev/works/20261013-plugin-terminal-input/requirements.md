# 端末を送信欄として埋め込む

プラグインの送信欄も端末の場合があるため、soda.mountのterminalにinteractiveを追加する。

- `interactive:true`で端末から直接入力。省略/falseは閲覧専用。
- 同じworkspaceの実体ある稼働paneへの範囲は維持。親が操作中・native textareaへフォーカス・対象が今も許可範囲内を入力ごとに確認。
- 接続断/終了/範囲外/閲覧専用/操作終了時は入力を送らない。フォーカス報告は送らない。PTYサイズ権限を取らない。
- pane新規作成のInputGate保持に巻き込まれて宛先を変えない。mainから固定宛先用componentInputを配線する。
- 本文を専用textarea→actionで送る従来構成に加え、出力用端末と入力用端末を同じpaneへ分けて埋め込める。
- 通常Escはアプリ操作終了を維持。IME変換中/229/修飾Escは端末側へ渡す。Ctrl+[は端末Escape。
- モバイルのinsertTextは標準の入力端末と同様に処理する（interactive時screenReaderMode=false）。
- `soda.features.terminalInput`で対応を判定。入力のための汎用RPCをauthor frameへ公開しない。
