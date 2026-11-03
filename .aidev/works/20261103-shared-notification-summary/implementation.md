# 通知の作業要約の共通化とデスクトップ表示設定

## 要件と結果

- 会話ログと船長への送信欄を同じ会話セクションへ統合。
- 通知カード内へ作業要約・判断事項・折り畳み原文・返信欄を統合。返信の二重送信を防ぎ、送信中に編集した次の下書きを保持。
- 船長に通知要約を依頼する旧処理とUIを削除。操舵室の既存要約設定の種類/モデルを共用し、共通ON/OFFを追加。船長未割当でも利用可能。既定オン（従来の通知要約設定と同じ）。旧DesktopAssistantPreferences.notificationSummaryは保存互換のため残すが、実行可否は共通SummarySettingsが決める。
- server notification.summaryが通知キー/実体/会話/作業先を検査し、既存SummaryServiceの隔離CLIで通知ごとの作業要約を生成。原文はサーバで限定取得。過去ペイン要約と直近会話・質問を引用資料にし、欠損・古さ・省略を明示。目的/作業/成果・検証/課題/判断/返信案を返す。
- サーバ内でキーとモデルを元に最大128ジョブ/結果を共有。二重生成を防ぎ、他の要約と合わせて同時実行2、個別生成120秒。キャッシュは再起動で消える。独立した専用実行で船長・作業担当へ入力しない。
- Webトースト・通知履歴とdesktop NoticeSummariesが同じ結果を取得。native RPCは同時4件まで、設定変更中も旧リクエストの完了まで枠を保持。解消した通知・古いepoch結果は表示しない。無効時はdisabledを明示。
- 通常/ダークのテーマ候補を明暗で絞り込み、操舵室連動時はテーマ欄ごと非表示。OS連動は元のテーマIDを維持するため全候補を保持。
- 最前面/背面（最前面固定なし）の表示設定を追加。立ち絵/会話/通知へ適用し、既存の窓も更新。背面はOSの通常Z順で他アプリを手前にでき、会話表示時に強制focusしない。常時最下層へ固定するOS独自機能ではない。設定/ツール/操舵室ビューは通常窓。

## 検証

- root pnpm build / pnpm typecheck成功。最終desktop typecheck/build:host、server buildも成功。
- protocol/desktop/conversation/ask/関連Web: 96 files / 1041 tests pass。引用省略フラグの最終修正後server追加対象5件成功。
- 生成UI実Chromium: 統合した会話フォーム、船長なしでカード内要約、HTMLを文字として表示、返信中の下書き保持、通知解消でカード消失、disabled時の要約非表示、全19テーマ・明暗絞り込み・OS+nord保持・連動時欄非表示・windowLayerの保存を確認。
- 実Webブラウザ400px幅: 長い通知見出し+共有要約を描画。移動/閉じるが画面内にあることをDOM矩形で確認。要約RPC1件をブラウザで差し替え、実モデルを呼ばずに描画を確認。旧inline CSS overrideで見出しが操作ボタンに重なることを再現。
- negative control: cache-scope、system-theme、inflight-slots、late-window-layer。各修正だけ戻すと対応試験が失敗し、保存した修正済みbytesへ復元後に一致確認。rawログを同梱。
- review_resource_monitor: server/protocol/collector独立レビュー。pane全体混入cacheキーと設定変更時busy.clearを修正し再レビュー、必須指摘なし。
- review_bubble_resize: native/Web/UI独立レビュー。Toastのinline化、OSモードのテーマID置換、ready-to-showの古いlayer参照を修正し再レビュー、必須指摘なし。disabled表示とtextarea配色も再レビュー済み。

実モデルによる生成・macOS/Linuxの実ウィンドウの重なりは未測定。CLI隔離は既存の要約実行基盤を再利用し、テストではモデル出力/子プロセスを制御して検証した。

## 反映

mainにサーバ基盤とクライアント/UIを分けてコミット。handoffで10 PTYを引き継ぎ、既存12 paneすべてを維持。稼働サーバでnotification.summaryが登録され、存在しない対象がモデルを起動せずnot_foundで拒否されることを確認。アシスタント起動状態はafter.txtを参照。
