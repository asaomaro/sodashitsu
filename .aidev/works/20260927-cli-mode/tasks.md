# タスク: CLI 版の画面（端末版）— 親（split 判定と割れ目）

## 実装方針

split 判定: **subtask 分割する**。端末版は、共有パッケージの切り出し・サーバの口（設定・ローカルログイン・停止・起動）・端末版の本体・全操作・付加機能が
相互に依存し（端末版は共有パッケージとサーバの口が無いと接続も操作もできない）、単独ではデリバリできないが、規模が大きく漸進的に点検する価値がある（DESIGN「5.」の中段）。
割れ目は `architecture.md`「tasks への申し送り」のとおり 6 つ。各 subtask の詳細な `tasks.md` はその subtask の tasks 工程で作る。

| subtask | 担う範囲 | 主な AC |
|---|---|---|
| `01-client-core` | `@sodashitsu/client-core` の新設と web からの移動（挙動不変） | AC19 |
| `02-server` | protocol の型・`prefs.*`・`server.stop`・ローカルログイン・`serve.json` の指紋・引数なしの `soda`・`findOrStart`・裏での起動・web の設定の置き場所の移動・D-7 の操作（表と web） | AC1, AC11, AC18, AC19 |
| `03-tui-core` | tui パッケージ・接続・モデル・headless・割り付け・差分描画・入力の分解と pane への送出・切り離し・大きさ | AC2, AC3, AC4（接続と描画の部分）, AC6, AC10, AC12 |
| `04-tui-ops` | 全操作・モード・マウス・サイドバーと tab バー・狭い幅の 1 列表示。Web の拡張のうちどれを対応にするかの基準は `research-inventory.md` §3-3 の分類（AC15 の一覧は 06 でこれを清書する） | AC5, AC7, AC8, AC9, AC-I1〜AC-I5 |
| `05-tui-features` | 設定画面・通知・複数ホスト・テーマの配色・クリップボード・画像・独自コマンド | AC11, AC13, AC14, AC-I1〜AC-I4（設定画面と通知の一覧の分） |
| `06-docs-verify` | docs（使い方・機能の扱いの一覧・移行）・性能の測定・3 環境の確かめ方・親の統合 test で使う疑似端末の確かめのスクリプト | AC4, AC15, AC16, AC17, AC19（移行の説明） |

## 作業順序と依存関係

- 直列: 01 → 02 → 03 → 04 → 05 → 06（各 subtask の `dependsOn` に前の兄弟を書く）。理由は `architecture.md`「tasks への申し送り」の最後の項。

## リスク / 留意点

- 01 の移動は import の付け替えが多い。移した先で web の既存のテストが全部通ることで挙動の不変を確かめる。
- 02 の設定の置き場所の移動は web の挙動（ブラウザ同士での共有）を変える（decisions D3）。移行のテストを必ず書く。
- Windows の裏での起動（WMI）と Windows Terminal ネイティブの入力は、この環境で確かめられない可能性がある。確かめられない範囲は test-result の「未検証の穴」に残す。
- 規模: 03〜05 は大きい。各 subtask の tasks で 1 タスク＝1 回の点検に収まる粒度に割る。

## テスト方針

- 各 subtask: vitest（単体・結合。server の `composeServer.*.integration.test.ts` の形で実物のサーバと繋ぐ）。tui は `TuiIo` を注入して、入力の列→出力の列を検証する。
- 親の統合 test（スクリプトは 06 で作り、実施は親の test 工程）: ビルドした `soda` を一時の状態ディレクトリで起動し、疑似端末（node-pty）の中で `soda` を引数なしで動かして、起動・描画・入力・切り離し・再接続・ブラウザ相当のクライアントとの同時接続を確かめる。
- E2E（ブラウザ）は依頼が無いので回さない（memory）。web の変更は vitest（happy-dom）で確かめる。
- `pnpm build`・`pnpm typecheck`・`pnpm lint`（既存の赤は区別して記録）・`aidev smoke`。

## タスク

各 subtask の `tasks.md` に置く（親ではチェックリストを持たない）。
