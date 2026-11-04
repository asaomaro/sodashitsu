# Windows拡張機能・別経路の実機対応

依頼範囲: 仮想画面、モニター選択/複数窓、解像度復元、システム音声/マイク、clipboard、Explorer drag、管理者アプリ/UAC、サインアウト後の専用接続。実装済みと実機確認済みを分け、利用できない機材・署名を完了扱いにしない。

- [x] sr-pcの依存/機材を読み取り確認: 物理1画面、専用IDDなし、仮想audio cableなし、unlock service稼働。
- [x] 利用可能な既存機能のブラウザ/実OS経路を検証し、解像度guardianの不具合を修正（実Explorer dropなど未確認は記録）。
- [x] 仮想画面/マイクの依存導入条件と資材を確認。署名済みIDDは未入手、VB-CABLEは署名確認済みstage、導入/再起動は未実施。
- [ ] 管理者共有で通常Defaultと実UACの遷移/入力/終了を確認。
- [x] signin配布物を生成/検証。
- [ ] signin実導入UAC承認と鍵/trust/別machine登録、実サインアウトを確認。
- [x] source/test差分の独立レビュー、旧版negative/修正版positiveと関連検査、caaddccdをmain/sr-pcへ反映。
- [x] 最終記録の独立レビュー。保護動画停止の追加修正もsource/testを独立レビューし、関連329テスト/build/typecheck成功。

回帰修正にはnegative control。状態/復元/権限/protocolの変更には独立点検を行う。最終差分も独立レビューする。
