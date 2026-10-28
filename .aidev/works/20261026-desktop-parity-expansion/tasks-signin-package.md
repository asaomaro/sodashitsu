# 7B2e 起動前package検査

- [x] 固定asset/manifest、信頼起点とhost境界を設計。
- [ ] native held-handle verifier/ACL/manifestと生成検証（taskcheck必須）。
- [ ] 制限したbundle bootstrap/release staging toolと生成検証（taskcheck必須）。
- [ ] source負例/元bytes復元、Windows生成CIと関係する検証。
- [ ] 独立build/smoke/cross、修正再点検。
- [ ] PR/main・保護付きroot反映。

installer/SCM/常駐hostへの接続、専用main/worker/UIは後続。実Program Files/service/鍵/画面は変更しない。
