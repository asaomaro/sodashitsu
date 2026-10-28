# 7B2b SYSTEM専用enrollment reader

- [x] 固定保存先、SYSTEM primary/owner account、機密ACL、用途/owner entropy、private pipeと後続のtrust境界を設計。
- [x] Native reader/ACL/DPAPI/factsの実装、独立taskcheck。
- [x] Node private-child readerのowner/abort/budget/zeroizationと非出力を実装・検証、独立taskcheck。
- [x] Windows生成crypto/ACL/ABIとCurrentUser scope観測、source負例とbytes復元。
- [ ] 全体build/typecheck/test、独立build/smoke/cross/delta、PR/main/保護付きroot反映。

service/書込みcontroller/鍵準備/peer登録/実取得・入力への接続は後続。SYSTEM実行前の固定package/asset hash検査も後続hostの必須条件で、開発repoをSYSTEM起動しない。
