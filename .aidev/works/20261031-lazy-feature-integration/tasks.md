# 作業（小さい差分で順に着地）

- [x] 既存実行形式・eager import・依頼との不足をread-only独立監査
- [x] soda/sodactlの選択commandのみload、assistant statusの薄いmetadata分離、preflight維持（risky独立点検）
- [x] 無効時module評価0/選択時load/壊れたoptional moduleとpreflightの生成回帰・負例
- [x] この段階のbuild/typecheck/全体試験/独立最終レビュー/PR/main（PR339、main8c03db9d）

## 続く段階（現在の2entry変更だけでは要件全体の完了にしない）

- [ ] server composeのassistant/desktop/preview実装を有効化後のfactoryへ移す。認可・disabled authorityは薄いcore境界に残す。
- [ ] assistant固有exe/独立ZIP導入を廃止し、soda内部GUI entry＋必要なoptional runtime素材へ統合。設定から利用可能にする。
- [ ] native-copy/audio-pipe/selectionの独立exeを共通current-user hostの閉じたroleへ集約。
- [ ] windows-helperのaudio/mic/codec/rich/virtual/protected一括Add-Typeをやめ、有効な機能だけload。
- [ ] privileged service/worker共通host化の可否をmanifest・SCM・worker証明・Job・receipt込みで独立設計/点検し、統合可能なものを対応。
- [ ] 実機確認以外のremote-desktop残件→最後にsr-pcの稼働版/補助プログラム終了原因を確認して復旧。
