# 作業（Linux system audioを先に着地する段階）

- [x] 一次資料/PCM contractとUnix socket権限・元scope・物理slot設計（risky独立点検）
- [x] Node native PCM受信とowned temporary path/停止quota/Opus（risky独立点検）
- [x] Linux system monitor取得と有限PCM chunk、生成tone/fake peer検証（risky独立点検）
- [x] Linux設定/Web/TUI/交渉/shared音声/E2E実配線（risky独立点検。最終E2E/CIは下記）
- [x] 文書/負例/全体build/typecheck/test/独立差分レビュー/PR #338
- [ ] 最終CI後にmain反映（最終結果はPR #338のchecks/merge記録を参照）

## 後続の独立した変更

- [ ] macOS SCK audioとPCM変換、生成音/SDK/停止検証
- [ ] nativeマイク転送など残件
- [ ] 最後に接続元/sr-pcの稼働版とhelper終了原因を確認し、接続を復旧する

実OS録音/再生、実画面取得、OSの信頼・driver/service変更は生成試験で行わない。実機確認は開発検証と区別する。
