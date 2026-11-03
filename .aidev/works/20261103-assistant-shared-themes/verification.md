# デスクトップアシスタントのテーマ選択と操舵室連動

- appearanceにsodashitsu（操舵室の設定に合わせる）、colorThemeに既存全19テーマを追加。旧設定は従来のdark/アシスタント配色を維持。
- 独立設定は通常/ダーク/OS追従とテーマの明暗の対を使用。テーマ選択時はそのテーマの明暗へ切り替える。連動中はテーマ入力を無効化しローカル選択を保持。
- 操舵室と同じloadThemePrefs/resolveTheme/siblingThemes/uiTokensを使用。既存アシスタント2配色の面は維持し、それ以外のテーマでは画面・入力・ボタン・スクロールバーの色を共通トークンから適用。
- 認証済みnative-main RPCで初回/再接続にprefs.get、prefs.changedに追従。接続主体/revisionを検査。nativeTheme更新でOS明暗に追従。共有設定の書き込みはしない。
- rendererへは解決済みのmodeと限定した色変数だけを渡し、CSS.supportsで色を検査。前回テーマの変数を消してから新しい変数を適用。

検証: protocol+desktop-assistant 82 files / 795 tests pass。追加の初回取得テスト後main/preferences 61 tests pass。root typecheck、最終desktop typecheck、protocol build、assistant build:host成功。生成UIの実Chromiumで全19テーマ・ボタン/scroll色・不要になった変数の除去・連動時disabled・モード切り替え・全local roleで反映を確認。実サーバへのdesktop RPC prefs.get読み取りも成功（永続設定は変更せず）。

review_bubble_resize独立レビュー: 必須指摘なし。追加のテスト/docsを再レビュー。

反映: build:host後にhandoff成功、9 PTY維持。最終確認前に別の接続からserver.stopが発行されサービスが停止したことをserve.outで確認。利用者側の停止を上書きせず再起動はしない。次回起動で新しいビルドが利用される。
