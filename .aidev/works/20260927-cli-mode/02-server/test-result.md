# テスト結果: 02-server

## 実行したもの
- `pnpm build` — exit 0
- `pnpm typecheck` — exit 0
- `npx vitest run packages/protocol packages/client-core packages/server packages/web packages/cli` — 290 files / 5303 passed / 0 failed / 0 skipped（tui は 03 の修正が並行で進行中のため、この subtask の検証からは外した。tui は 03 の test で見る）
- 実装者の検証（記録）: `soda --state-dir <tmp> --session t`（dist）で裏の起動 → token の表示 → 接続 → 終了コード 0、2 回目は既存のサーバへ、`SODA_PANE_ID` で終了コード 1、`soda session stop` で `local-auth.json` が消える。
- 負の確認（変異の網羅）: PrefsSync 25 件・launch 8 件の変異がすべて新しいテストで落ちる（review.md のタスク点検ログ・`scratchpad/check-02r2-mut/`）。

## 受け入れ基準ごとの判定（この subtask の分）
- AC1: pass（サーバ側）— 引数なしの `soda` がサーバを見つける/裏で起動して繋ぐ（仮の入口。端末版の表示は 03）。
- AC11: pass（設定の共有の土台）— `prefs.*` の保存・配布・再起動後の復元、web の移行と反映（happy-dom のテスト）。
- AC18: pass — `/api/local-login` は秘密の不一致・別のアドレス・回数の制限で断る（integration・unit）。
- AC19: pass — 既存のテストは全部通る。設定がブラウザ同士でも共有されるようになった点は decisions D3 の意図した変化。

## 失敗の証跡
このラウンドでは失敗が発生していない（実装中の 1 回目の全体の実行で `WsGateway.integration` の時間に依る 1 件が落ち、単体・2 回目では通った——実装者の報告。負荷による不安定と見ており、この test では再現していない）。

## 起動確認（smoke）
subtask では打たない（親の統合 test で打つ）。

## 未検証の穴（skip / 環境不足）
- Windows の実機: WMI での起動・`cmd.exe` の引用・`serve.out` の NUL の扱い・`/api/local-login` の ACL の前提。
- 別のマシンからの `/api/local-login` は判定を差し替えたテストだけ。
- E2E（ブラウザ）は回していない。設定がブラウザ同士で共有されるようになったことの E2E への影響は見ていない。
