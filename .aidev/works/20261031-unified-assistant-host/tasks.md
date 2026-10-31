# 作業

- [x] GUI resourcesのbundleと配布収録（JS依存/相対URL/third-party notices検証）
- [x] 公式固定版runtime manifest/準備と所有・中断・atomic publish（risky独立点検）
- [x] 内部assistant-host roleとWSL/3OS選択、閉じたargv（risky独立点検）
- [x] ONだけのController async resolver、準備中OFF/stop/変更/実退役（risky独立点検）
- [x] Web/TUI設定、薄いstatus/保存とrequest取消（risky独立点検）
- [x] standalone pack/installerの廃止と統一配布/docs/利用手順
- [x] 生成試験/負例/build/typecheck/全体試験、hosted packaging、独立最終レビューと修正点検
- [x] PR/CI/main（PR343/344/345）。実GUI/実WSLの表示は未検証として明記

## 資源準備の最初の着地

- [x] server単体buildから生成する依存関係
- [x] NodeModules無しsynthetic Electron/manifest/preload試験
- [x] 全build/typecheck/全体試験とpackage staging検証
- [x] 独立crossと修正delta
- [x] CI・PR/main（PR343）
