# レビュー記録（親の統合 review）

## ラウンド 1（2026-09-28）
- [must][conv:-] packages/web/src/actions/PrefsSync.ts:73-80 既存の web の利用者が先に端末版を使うとサーバの rev が 1 になり、ブラウザの移行が飛ばされて localStorage のキー・テーマ等が黙って消える / 対応: 修正済（d3941ed・ae49be9・dbd5f5d・a5c0bd8。負の確認 27 件）
- [should][conv:-] packages/web/src/store/onboarding.ts:53 web のはじめの案内が共有の設定の onboarding を読まない / 対応: 修正済（d3941ed・ae49be9・dbd5f5d・a5c0bd8。負の確認 27 件）
- [should][conv:-] packages/server/src/launch/findOrStart.ts:133 裏で起動した soda serve が最初の端末の環境（TMUX・SSH_*・TERM_PROGRAM 等）を受け継ぎ、以後の pane に残る / 対応: 修正済（d3941ed・ae49be9・dbd5f5d・a5c0bd8。負の確認 27 件）
- [should][conv:-] packages/client-core/src/prefs/types.ts:1-6 設定の読み込み・既定を client-core へ移さず、tui が web の loader を写している（D-5 に反する） / 対応: 修正済（d3941ed・ae49be9・dbd5f5d・a5c0bd8。負の確認 27 件）
- [should][conv:-] packages/tui/src/app/t7.test.ts:1-22 写した試験に出典の見出しが無い・third_party/herdr/README.md の表に 3 つが無い / 対応: 修正済（d3941ed・ae49be9・dbd5f5d・a5c0bd8。負の確認 27 件）
- [should][conv:-] .aidev/works/20260927-cli-mode/06-docs-verify/test-result.md:30,33 AC16・AC4・Windows の WMI が未検証 / 対応: 許容（ユーザーは確認しないと明言。PR の既知の制約に書き、decisions D21 に残す）
- [nit][conv:-] packages/web/src/actions/MachineWiring.ts web は別のマシンを見ている間に手元の prefs.changed を受けない（端末版は受ける） / 対応: 許容（D7.4 の web の挙動のまま。docs に書く→ D21）
- [nit][conv:-] packages/tui/src/app/TuiApp.ts:430,458 初回の token と一緒のとき stopHint が出ない / 対応: 修正済（d3941ed・ae49be9・dbd5f5d・a5c0bd8。負の確認 27 件）
- [nit][conv:-] packages/tui/src/actions/TuiDispatcher.ts:1182-1187 stop_server の後に終了コード 1 と「サーバが止まった」になる / 対応: 修正済（d3941ed・ae49be9・dbd5f5d・a5c0bd8。負の確認 27 件）
- [nit][conv:-] packages/server/src/launch/placeholderEntry.ts:1-67 試験だけが使う仮の入口が本番の src にある / 対応: 修正済（d3941ed・ae49be9・dbd5f5d・a5c0bd8。負の確認 27 件）

## ラウンド 2（2026-09-28）
- [should][conv:-] packages/web/src/actions/PrefsSync.ts:179-196 上限超えで断られた移行の種が移し終えた扱いにならず、読み込みのたびに送り直し知らせる / 対応: 修正済（7f2055e。負の確認あり）
- [should][conv:-] packages/web/src/actions/PrefsSync.ts:81 端末版が先に書いた keys 等の中の項目がブラウザの独自の項目を消す / 対応: 修正済（7f2055e。入れ子の全段の併合。decisions D22）
- [should][conv:-] docs/tui.md:164-165 設定の移行の説明が古い・D3/D10 を改める決定が無い / 対応: 修正済（docs/tui.md・decisions D22）
- [should][conv:regression-negative-control!] .aidev/works/20260927-cli-mode/test-result.md:1-60 統合 review の修正の負の確認の生の出力が test-result に無い・最初に通った変異の経緯が無い / 対応: 修正済（test-result.md に貼った。r1-4-core-notify が最初に通り、試験を強めて notify-2 で落ちた経緯も記録に含む）
- [nit][conv:-] packages/web/src/store/view.ts:80 移行の印がオリジンごとでサーバごとではない / 対応: 許容（サーバの識別子が hello に無い。docs に書いた。D22）
- [nit][conv:-] packages/server/src/launch/serveEnv.ts:20-43 WSL_INTEROP を落としていない / 対応: 許容（落とした場合の影響が確かめられない。未検証の穴。D22）
- [nit][conv:-] packages/tui/src/net/TuiNet.ts:77,398 stopExpected が取り消されない / 対応: 修正済（8ea10ae。負の確認あり）

## ラウンド 3（2026-09-28）
- 指摘なし（7f2055e・8ea10ae を主エージェントが確かめた。移行の上限超えの印・入れ子の併合・stopExpected の取り消しに試験と負の確認がある。vitest 5819/5819）
