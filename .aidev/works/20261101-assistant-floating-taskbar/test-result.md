# 上下動の最上位置をタスクバーに接する配置へ

ユーザー指定: 上下動の最高位置でもキャラクターとタスクバーの隙間をなくす。テスト不要。

character.jsの移動範囲を上向き0〜-8DIPから下向き0〜8DIPへ変更。最高位置はtranslateY(0)で既存の足元基準。低い位置は既存のcaptain overflow:hiddenで下端8DIP以内を隠す。idle-floatingの高さ縮小・上余白を削除し原寸を維持。軽減・pause・非idle時は従来の基準位置。利用手順と既存UI確認スクリプトの移動範囲assertも更新したが実行しない。

テスト（unit/E2E/native probe/smoke）はユーザー指定により実行しない。反映用build:hostのみ実行成功 `/tmp/soda-floating-taskbar-build.log`。アシスタントdisableでphase disabled確認後enableし反映。COREサービス・話者設定・立ち絵選択は維持。

導入済みCORE /speakersの読み取りでは43話者・127スタイル。5人以外も設定画面の話者一覧から選択可能。

独立レビュー `/root/review_core_voice_float`:今回の位置・CSS・文書差分のみ読み取り点検し、必須指摘なし。レビュー側もテストを実行していない。
