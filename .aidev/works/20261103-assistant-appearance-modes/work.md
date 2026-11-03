# 操舵室のコントロール配色とデスクトップの明暗設定

## 変更

- 操舵室のアシスタント通常/ダークテーマに限定し、ボタン・フォーム・nativeスクロールバーとxtermのつまみを配色。既存テーマには適用しない。選択・現在の項目は枠でも示し、入/切マークのコントラストを維持する。
- デスクトップの保存設定appearanceにlight/dark/system追加。既存はdark。設定の基本設定から選択し保存する。
- 全6ローカル画面に共通appearance.js。最初の描画用のcache、revision付き最小read-only IPC、設定変更時の配信、matchMediaによるOS追従。remote WebContentsはネイティブIPCを取得しない。
- デスクトップCSSの紺/金/文字/面色をtoken化し、通常版に生成り色/紺文字を追加。従来ダーク配色を保持。

## 検証

- desktop-assistant 30ファイル242テスト通過。旧設定dark既定・systemの保存復元、設定の配信、subframe拒否を含む。
- server host/管理起動の3ファイル25テスト通過。
- Chromium生成UI: 設定の保存、通常版の実際の背景色、OS明暗の動的追従、固定モード、古いrevisionの拒否、全6画面への反映を確認。既存の会話/通知/ツール/画像入力検証も通過。
- 稼働Webの読み取り専用ブラウザへ実CSSとテーマtokenを当て、両配色でボタンとスクロールバーが金色になることをcomputed styleで確認。保存設定は変更していない。画像を目視し、入/切マークと選択枠を追加調整。
- /root/review_bubble_resize の独立差分全体レビューで必須指摘なし。調整後の2点も再レビューを依頼。

- pnpm build / pnpm typecheckは終了コード0。状態表示2点調整後にWeb配布物を再生成。host内蔵リソース41件・共通runtime6種の整合確認。最終2点の独立再レビューも必須指摘なし。

## 稼働反映

実装984c01b7をmainへpushし、サーバhandoffで8 PTYを引き継いだ。保存した10 pane UUIDが全件残り、アシスタントphase=running / stage=readyを確認。

配布後のWebで実際に配信されたCSSを使い、通常/ダークの両方でボタン/スクロールバーが金色であることと入マークの文字対背景比4.5以上を確認。ユーザーの保存テーマは変更していない。キャプチャ: /tmp/sodashitsu-assistant-controls-final.png、/tmp/sodashitsu-assistant-dark-controls-final.png。
