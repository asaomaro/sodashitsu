# プラグインアプリの標準部品埋め込み

## 要望と仕様

プラグインの専用UIからSodashitsuの部品を呼び出せるようにする。初回は背景で動くエージェントの応答を端末として表示し、指示の入力・送信はアプリ独自のフォームで扱う。

- Web/モバイルWebのscript-htmlに `soda.mount("terminal", element, {paneId})` と部品一覧 `soda.components` を提供する。
- 読み取り専用、ANSI・Unicode・新規画像、履歴（5000行上限）、選択/コピー/スクロールを扱う。元端末と同時表示でき、PTYサイズ権限を変更しない。
- 同じworkspaceの実稼働pane（別tab含む）に限定する。仮想anchor・別workspace・未登録paneは拒否する。
- 最大4部品。隔離済みMessageChannelで位置のみ通知し、端末は親のnative DOMに置く。token・汎用RPC・端末DOMをプラグインへ渡さない。
- iframeとスクロール領域でclipし、display:none/visibility:hidden/領域外は部品を外す。dispose/更新/閉じる/対象pane消失時に片付ける。
- ターミナル版は既存terminalDisplayを使用し、Web部品を埋め込むAPIは提供しない。
- 専用入力の送信は既存display.action→拡張の検証→agent.promptで実装する。部品が自動で指示を送信することはない。

## 実装

- script.html SDK、検証済みframe message、DisplayFrameのnative component host。
- EmbeddedTerminal（既存xterm/Unicode/image/query-filter/テーマ/フォント更新を再使用）。
- TerminalRegistryの独立mirror。初期化はwriteバリア→serialize→後続イベントキューで既存端末をリセットせず追加する。新規/再接続のみsubscribe。
- mirrorのLRU保持と通常端末の可視判定を分離し、埋め込みだけで通知を自動既読にしない。
- 開発ガイドにAPI・送信例・限界を記載。
