# 子行のセッション名を先頭へ

依頼: 子の1行目をセッション名/タスク名と状態アイコン、2行目を取得済みモデル名に入れ替える。

Web/TUIとも description を先頭、type を次行へ。片方のみなら1行、両方未取得なら「サブエージェント」。readonly、全文title、状態不明の丸?、glyph幅を反映したTUIインデント、同じ文字サイズを維持。

Web Sidebar203件、TUI20件成功。Web/TUI typecheck終了0。生成fixtureの実ブラウザで先頭セッション名/次行モデルと丸?・13.6px・ariaを確認（browser.json/png）。利用者pane/設定/Windowsを操作していない。

製品2ファイルのみ旧順へ戻した負例はWeb/TUI/browserすべて失敗。バイト完全復元後、Web203/TUI20/browser全成功（restore.json/raw logs）。
