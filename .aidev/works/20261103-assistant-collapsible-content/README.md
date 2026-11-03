# 全体スクロールと項目の折り畳み

利用者の最終指示: バーだけ非表示にする案から変更し、各要素ではスクロールさせず全内容を表示する。本文全体は縦スクロールし、各要素を折り畳めるようにする。

- 会話画面のnav・compose・statusもspeech-contentへ移し、本文のスクロールを1箇所にする。通知/会話/roster/credit/preview/statusの高さ上限・overflow:autoを撤去。
- 通知全体/個々、会話、セッション、入力、接続情報をdetailsへ。既存rosterの折り畳みは維持。settingsの基本/説明/previewと各fieldset、toolsの文章・メモ/音声を折り畳める項目にする。既存fieldsetノードを保持し、フォームとの関連を変えない。
- textareaは内容の自然高へ合わせる。input/change/MutationObserver/ResizeObserverをmicrotaskでまとめ、style変更は監視しない。emptyラッパーのhiddenは値が変わる時だけ変更し、循環を防ぐ。
- 通常更新ではopenやdraftを変更しない。通知選択/ツール文面受信/invalid時に必要な親detailsを展開する。会話の追従判定は全体scroll位置で行う。

独立レビュー: review_bubble_resizeが全体scroll、fold保持、通知/draft展開、フォーム検証、autosize/observerを点検。change後と送信成功後の再計測も再レビューし、必須指摘なし。
