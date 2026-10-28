# 7B2f 常駐host

- [x] 固定実行/環境/Jobとleaseの所有を設計。
- [x] ServiceBase host・native launcher・runtime検査（taskcheck必須）。
- [x] 生成ordinary子/孫の環境・継承・取消/失敗回収検証、負例/復元、Windows CI。
- [x] 独立build/smoke/crossと修正再点検。
- [ ] PR/main/root保護付き反映。

実service登録/起動をせず、Node main/worker/controller/UIへ続ける。7B全体は未完了。
