# 概要機械評価の確認

製品b0db410e＋文言のみb18dcecd。変更は共通計算/helper export・Web/TUI概要とその関連テストのみ。式/95・90・80・60閾値・10件minimumはroot承認済み。既存エージェント生成assessmentは不変。

関連3file40tests成功。unknownを成功に足す誤計算＋旧Web/TUIを戻す負例は5fail/35pass、3runtime前後SHA完全復元後40pass（negative.log/restored.log/restoration.json）。浮動誤差29/100・57/100、全失敗の0点E、欠測/低sample評価不能、不正分母/非整数/NaN/Infinity、coverageと部分取得を回帰確認。

b0db固定上で対象3packages core/TUI/Web build0（Web test-inclusive型＋Viteを含む）、TUI全型0、core新2files strict型0。b18は共通説明文の文字列1箇所だけ精密化し、core再build/対象型0とWeb Vite再生成0。型の構造や式は変えておらず、全Web型の二重実行はしていない。各rawとbuild-results.json参照。全repo build/testはしていない。

生成RPCの実Chrome DOMで4テーマ/390px/既知95点A/低sample未評価/真の0点E/CLI条件追従/overviewのみ/追加モデル呼出0を確認。Soda dark画像を目視。旧Web sourceではカード欠落で失敗し、Web SHA完全復元後同browser成功（browser-negative.log/browser-restoration.json/browser-final.log）。初回browserは閉じた条件フォームをselectしようとしてtimeout、runnerで条件ボタンを開く実操作へ修正（browser-initial.log保持）。製品コードの不具合ではない。own Chromium/Viteはfinallyでawait close。実モデル・利用者記録・Windows・OSclipboard操作0。

独立レビューはreview_audio_integrationへ依頼。計算/guardの機能上の指摘なし、inferredの説明を正式Read分類と本文推測操作で区別するshouldをb18で解消。最終照合待ち。
