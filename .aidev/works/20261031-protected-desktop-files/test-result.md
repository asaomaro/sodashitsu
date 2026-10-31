# 検証

- build / typecheck: PASS。
- 生成の関連5files 324 PASS、追加の保護file/permission/proof 16 PASS、endpoint/UI/protocol 31 PASS。
- ブラウザ: 生成helper＋実Chromium 1217。elevated-default/elevated-uacの2ケースでDOM、browserの送受信、実upload/download bytes、scope終了時の転送UI退去を確認してPASS。OS画面・OS入力・サービス・driver・実デバイスは扱っていない。
- 私有copyでsecure file admissionだけ旧条件へ戻すと、両保護modeのgrant成功assertionがFAIL。元の条件へ復元すると2 PASS。元sourceのbytesは不変。rawはnegative-control.txt。
- 全体は925files/13,073 PASS・1skip。Relayのtest importを二重にしたため初回収集失敗し、重複を削除した。製品sourceを変更せず、Relay全277件を再実行しPASS。合計13,350 PASS・1skip。全体を二重に流していない。
