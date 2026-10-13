# 独立レビュー

別コンテキストreview_plugin_componentsが入力先固定・フォーカス/操作/範囲検証・切断抑止・IME・モバイルを点検。

- 必須指摘: 端末部品のEscがIME変換中にもアプリ操作を終了する。共有isEmbeddedAppEscapeでisComposingとkeyCode229を除外し、xterm custom handlerと親onKeydownで使うよう修正。
- 再点検でフロートのwindow capture/bubbleにも同じ問題を発見。native埋め込み端末からのイベントに共通判定を適用。両経路の回帰テストで通常Escのみ閉じることを確認。
- 入力端末のscreenReaderMode=false（モバイルinsertTextを標準端末と同様に通す）も再レビュー。

最終再レビュー: 必須指摘なし。
