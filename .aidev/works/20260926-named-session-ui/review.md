# レビュー記録

## タスク点検ログ（coding 工程内・「3.3」(b)）
- [nit][conv:regression-negative-control] packages/server/src/persist/ServeRecordFile.test.ts:44 pid の整数・1 以上の検査を消してもテストが落ちない / 対応: 修正済（pid が 0・負・小数のケースを追加。T1・ラウンド1）
- [nit][conv:-] packages/server/src/session/paneEnv.test.ts:79 HEAD で整形済みのファイルに printWidth を超える行を足した / 対応: 修正済（prettier --write。T4・ラウンド1）
- [should][conv:regression-negative-control] packages/server/src/sessionCommands.ts:82 `dir !== base`（WTM_SESSION=default で既定の session の案内に WTM_SESSION を出さない歯止め）を外す変異が生き残った / 対応: 修正済（既定の session がロック中のケースを追加し、外す変異で落ちることを確認。T2・ラウンド1）
- [nit][conv:-] packages/server/src/cliArgs.ts:136 `default` の分岐は `sessionNameProblem` と重複 / 対応: 修正済（分岐を消しコメントに意図。T2・ラウンド1）
- [nit][conv:-] packages/server/src/auth/AuthService.ts:22 定数の並びの途中に関数と interface が割り込んだ / 対応: 修正済（定数の後ろへ移した。T3・ラウンド1）
- [should][conv:regression-negative-control] packages/server/src/persist/namedSession.test.ts:336 別ホストのロックのテストが記録のホスト名でも弾かれ、`entry.host === undefined` を消す変異が生き残った / 対応: 修正済（記録はこのホストのものにし、外す変異で落ちることを確認。T5・ラウンド1）
- [nit][conv:-] packages/server/src/persist/namedSession.test.ts:353 AC5 のキーの検査が部分集合だけ / 対応: 修正済（キーの集合を完全一致で比べる。T5・ラウンド1）
- [nit][conv:-] packages/server/src/composeServer.integration.test.ts:1001 閉じたポートを固定して取り直す競合 / 対応: 修正済（記録したポートを試す以上避けられないことをコメントに明記。T6・ラウンド1）
- [nit][conv:-] packages/server/src/composeServer.ts:315 serve.json の https: true を確かめるテストが無い / 対応: 許容（リポジトリに TLS の証明書の fixture が無く、TLS での起動自体を結合テストしていない。値は `secure` をそのまま書くだけ。T6）
- [nit][conv:-] packages/server/src/composeServer.ts:315 serve.json を書けないときの経路のテストが無い / 対応: 修正済（serve.json をディレクトリにして起動が続きログに残ることを確かめる。pane の sessionName の配線は cli の結合テスト〔dist〕で確かめる。T6・ラウンド1）
- [must][conv:-] packages/web/src/serverSession/sessionTarget.ts:46 ループバックで待ち受ける session にいまのホスト名で URL を作り、相手の Origin の方針に拒否される（`foo.localhost`）・別のアドレス族に届かない（`::1` と `127.0.0.1`） / 対応: 修正済（ループバックは待ち受けのホストそのもの。T7・ラウンド1。decisions D6）
- [should][conv:-] packages/web/src/serverSession/sessionTarget.ts:45 全インタフェースでいまのホスト名がループバックの名前（`foo.localhost`）だと相手が許さない。`--origin` の名前は判定できない / 対応: 修正済（ループバックなら族のループバックのアドレスへ。`--origin` の名前は限界としてコメントと docs に明記。T7・ラウンド1）
- [nit][conv:-] packages/web/src/serverSession/sessionTarget.ts:45 `0.0.0.0` でいまが IPv6 だと届かない URL / 対応: 修正済（unknown にする。T7・ラウンド1）
- [nit][conv:regression-negative-control] packages/web/src/serverSession/sessionTarget.test.ts:35 角括弧付き・大文字の待ち受けホストのケースが無く、冗長な分岐 / 対応: 修正済（ケースを追加・分岐を削除。T7・ラウンド1）
- [nit][conv:-] packages/web/src/main.ts:10 import の並びを崩した / 対応: 修正済（パス順の位置へ。T7・ラウンド1）
- [nit][conv:regression-negative-control] packages/web/src/actions/ActionDispatcher.test.ts:2196 数え方を current に取り違える変異が生き残る / 対応: 許容（current はちょうど 1 件・既定もちょうど 1 件なので、実際の一覧では件数が常に一致する等価な変異。名前付きが current のケースを足しても落ちないことを確かめた——scratchpad/logs/nc-T8-current.log。T8）
- [should][conv:-] packages/web/src/serverSession/sessionTarget.ts:40 全インタフェースの相手に IP でない名前（`--host` の名前・FQDN・mDNS）で開いたページのホスト名を使うと拒否されうる / 対応: 許容（ページからは判定できない。限界として doc コメントと docs に明記。T7・ラウンド2。decisions D7）
- [should][conv:-] packages/web/src/serverSession/sessionTarget.ts:36 ループバックへのポート転送で開いたページではループバックの URL がブラウザ側のマシンを指す / 対応: 許容（同上。開いた先は wtm のログインを求めるだけで秘密は送らない。T7・ラウンド2）
- [nit][conv:-] packages/web/src/serverSession/sessionTarget.ts:36 「外にいるので開けない」は言い過ぎ / 対応: 修正済（判定できないので保守側に倒す、と書き直した。T7・ラウンド2）
- [nit][conv:-] packages/web/src/components/Sidebar.vue:693 session の行の余白が隣の見出しと揃っていない / 対応: 修正済（T10・ラウンド1）
- [nit][conv:-] packages/web/src/components/Sidebar.vue:693 畳んだ幅で ⇄ が … に切れうる / 対応: 修正済（畳んだときは左右の余白を詰める。実機の見た目は未確認。T10・ラウンド1）
- [nit][conv:regression-negative-control] packages/web/src/components/Sidebar.test.ts:1082 aria-label の後半を消す変異が生き残る / 対応: 修正済（全文を toBe で固定。T10・ラウンド1）
- [should][conv:regression-negative-control] packages/web/src/components/SessionSwitchDialog.vue:139 aria-activedescendant と id の対応のテストが無い / 対応: 修正済（テストを追加し、属性を消す変異で落ちることを確認。T9・ラウンド1）
- [nit][conv:-] packages/web/src/components/SessionSwitchDialog.vue:57 二重に届いたときに戻り先を上書きしないガードのテストが無い / 対応: 修正済（テストを追加し、ガードを外す変異で落ちることを確認。T9・ラウンド1）
- [nit][conv:-] packages/web/src/components/SessionSwitchDialog.vue:66 開く前の pane が閉じられたときは端末がフォーカスを奪いうる / 対応: 許容（コメントと decisions D8 に記録。T9）
- [should][conv:-] packages/web/src/serverSession/sessionTarget.ts:59 止まっている既定の session の起動のコマンドが素の `wtm serve` で、名前付き session の pane では WTM_SESSION に選ばれる / 対応: 修正済（`wtm serve --session default`。cross・ラウンド1）
- [should][conv:-] docs/tls-setup.md:451 `--state-dir` で起動した session の pane には根が渡らない / 対応: 修正済（docs に条件と `--state-dir` を足す旨を明記。cross・ラウンド1）
- [nit][conv:-] packages/server/src/persist/namedSession.ts:114 大文字小文字を区別しない FS で綴りを変えて開くと current にならない / 対応: 許容（20260926-named-session の既存の振る舞い——状態ディレクトリは FS が同一視する——に依る。綴りを揃える案内は既に docs にある。後続の backlog に記録。cross）
- [should][conv:-] packages/web/src/components/SessionSwitchDialog.vue 開けない項目の名前を opacity 0.6 で描き、MUTED_TEXT_ALPHA（0.7）を下回った（全体の test で uiTokens.test.ts が検知） / 対応: 修正済（薄めない。理由の文で区別する。test 工程の一式・ラウンド1）

## ラウンド 1（2026-09-27）
- [should][conv:e2e-observe-browser] docs/verification.md:450 実ブラウザでしか確かめられない振る舞いの手動確認が Windows ネイティブの節だけで PowerShell 前提 / 対応: 差し戻し（OS に依らない手順を Linux の節にも置く）
- [nit][conv:-] docs/verification.md:55 参照先の見出しの書き方が不正確 / 対応: 差し戻し（同時に直す）
- [nit][conv:-] docs/tls-setup.md:500 別の根の同じ名前の session は Cookie が衝突する限界を書いていない / 対応: 差し戻し（同時に直す）
- [nit][conv:-] docs/tls-setup.md:509 モバイルでもタイトルの [名前] は付く / 対応: 差し戻し（同時に直す）
- [nit][conv:-] packages/web/src/components/SessionSwitchDialog.vue:263 unknown の理由の文が別ホスト・token の作り直し中と合わない / 対応: 差し戻し（文言を広げる）
- ラウンド 1 の対応（coding 再開）: verification.md の Linux の節に OS に依らない手動確認を足し、参照・Cookie の限界・モバイル・unknown の理由の文を直した。

## ラウンド 2（2026-09-27）
指摘なし（ラウンド 1 の 5 件はすべて解消。修正の差分による新たな must/should なし）。
