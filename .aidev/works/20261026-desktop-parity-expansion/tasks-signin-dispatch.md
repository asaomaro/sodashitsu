# 7B2c 有限要求処理

- [x] 最小handler表とchannel/request寿命、scope/取消/cleanupを設計。
- [x] 実装・関連unit、独立taskcheck（安全/状態）。
- [x] source負例・復元、全体build/typecheck/test。
- [x] 独立build/smoke/crossと修正差分再点検。
- [ ] PR/main・保護付きroot反映。

常駐service/installer/書込みcontroller/worker/UIは後続。実SYSTEM起動・実取得/入力は行わない。
