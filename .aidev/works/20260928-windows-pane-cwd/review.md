# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [should][conv:-] packages/web/src/actions/ActionDispatcher.ts:1332 reload_config で shellCwdTracking を読み直す行に試験が無い / 対応: 修正済（1c67ba3・a512db0・aff27f9・4304bc3。負の確認 fix1〜fix8）
- [should][conv:-] packages/server/src/terminal/Mirror.ts:395-401 parseOsc9Cwd が絶対パスを確かめず、相対パスやゴミを pane の場所として受け入れる / 対応: 修正済（1c67ba3・a512db0・aff27f9・4304bc3。負の確認 fix1〜fix8）
- [nit][conv:-] packages/server/src/terminal/Mirror.ts:398 前後の空白があると引用符が残る / 対応: 修正済（1c67ba3・a512db0・aff27f9・4304bc3。負の確認 fix1〜fix8）
- [nit][conv:-] packages/server/src/terminal/Mirror.ts:130-134 UNC を受け入れるので、表示されただけの出力で SMB へ接続しに行きうる（OSC 7 でも前から同じ） / 対応: 修正済（1c67ba3・a512db0・aff27f9・4304bc3。負の確認 fix1〜fix8）
- [nit][conv:-] packages/server/src/terminal/Mirror.ts:131-135 9;9 を処理しても false を返す / 対応: 修正済（1c67ba3・a512db0・aff27f9・4304bc3。負の確認 fix1〜fix8）
- [should][conv:-] docs/verification.md:454-456 cmd は UNC を今の場所にできない（pushd でドライブ文字になる）のに、3 つのシェルで同じ結果を求めている / 対応: 修正済（1c67ba3・a512db0・aff27f9・4304bc3。負の確認 fix1〜fix8）
- [nit][conv:-] docs/tui.md:177-178 / docs/herdr-parity.md:27 実機で未検証なことが書かれていない / 対応: 修正済（1c67ba3・a512db0・aff27f9・4304bc3。負の確認 fix1〜fix8）
- [should][conv:-] packages/server/src/pty/shellCwdTracking.ts:56-60 包んだ prompt が元の prompt より先に文を実行し $? を常に True にする（oh-my-posh・starship の失敗の色が消える） / 対応: 修正済（1c67ba3・a512db0・aff27f9・4304bc3。負の確認 fix1〜fix8）
- [nit][conv:-] packages/server/src/pty/shellCwdTracking.ts:94-101,123 位置引数（pwsh script.ps1 等）を起動を決める引数として見ない / 対応: 修正済（1c67ba3・a512db0・aff27f9・4304bc3。負の確認 fix1〜fix8）
- [nit][conv:-] packages/server/src/pty/shellCwdTracking.ts:54 あとから prompt が差し替えられると追従が止まる（既知の制約として書く） / 対応: 修正済（1c67ba3・a512db0・aff27f9・4304bc3。負の確認 fix1〜fix8）
- [nit][conv:-] packages/server/src/pty/shellCwdTracking.ts:110-113,135-138 cmd の PROMPT の大文字小文字違いの重複・二重の前置き / 対応: 修正済（1c67ba3・a512db0・aff27f9・4304bc3。負の確認 fix1〜fix8）
- [nit][conv:-] .aidev/works/20260928-windows-pane-cwd/design.md:12,60,66 design と tasks に hostname が残る / 対応: 修正済（主エージェントが design を直した）

## ラウンド 1（2026-09-28）
- [nit][conv:-] docs/verification.md:453 OSC 9;9 が OS の ConPTY（SODA_WINDOWS_CONPTY=system）を通るかの確かめが手順と design の未確認に無い / 対応: 修正済（主エージェントが docs と design に足した）
- 点検者が pwsh 7.4.6 の実物（Linux 版）で差し込むスクリプトを動かし、エスケープ・`$?` の保持・プロファイルの後に走ることを確かめた（scratchpad/review-win/）。
