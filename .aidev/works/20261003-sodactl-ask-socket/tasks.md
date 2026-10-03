# タスク: pane の中のプログラム向けのログイン不要の受け口（pane.sock）と、sodactl ask のログイン不要化

## 実装方針

下から積む: やりとりの型（protocol）→ サーバの部品（権限つきの listen・操作の登録・受け口）→ サーバの配線（ask の操作・パス・環境・起動と停止）→ sodactl（引数・クライアント・ask）→ 通しのテスト（smoke・E2E・handoff）→ docs。
subtask には割らない（1 PR に収まる大きさで、部品は互いに依存して単独ではデリバリできない）。

## 作業順序と依存関係

下の `依存:` に従う。依存では表せない順序の理由:

- T4（受け口）を T5（配線）より先に単体テストまで通す。検査の順（形 → 操作 → pane → 引数）と接続の後始末は、配線してからだと原因を切り分けにくい。
- T9（既存の smoke・E2E の子の環境から socket の変数を外す）は、sodactl が受け口を使い始める T12 より前に済ませる。外す前に T12 を入れると、soda の pane の中で既存のテストを走らせたときに開発者の本物のサーバへ質問が飛ぶ。
- T15〜T17（ビルドした成果物を使う smoke・E2E）は最後。docs と skill（T14）を先に済ませ、`pnpm build` をしてから走らせる（4 本目の smoke が skill を比べる）。

## リスク / 留意点

- `AskService.open` の誤りは同期の throw（research「実装時の注意」）。`PaneOpRegistry.invoke` は handler を `try` の中で `await` する。
- `server.close()` は接続が残っていると終わらない。`PaneSocket.close()` は接続を先に `destroy` する。
- 既存の E2E・smoke は `...process.env` を子へ渡す。開発者が soda の pane の中で走らせると、その pane の `SODA_PANE_SOCKET`・`SODA_AGENT_REPORT_SOCKET` が漏れて、開発者の本物のサーバへ質問が飛ぶ。T9 で子の環境から外す（このリポジトリのテストはいま soda の pane の中で走らせている）。
- `ask.test.ts` は `withSession` を丸ごと偽物にしている。経路の選択を足した後も、既存のケースが実物の socket へ繋ぎに行かないこと（テストの環境に socket の変数を入れない）。
- 4 本目の smoke は `sodactl skill` の出力と `SKILL.md` を比べる。skill を変えたらビルドし直す。
- macOS の `tmpdir()` は長く、socket のパスの上限（103 バイト）に近い。テストの socket のファイル名は短くする（`pane.sock`）。
- Node 20 でテストを走らせている（`engines` は 24 以上）。Node 24 でしか通らないものは `test-result.md` に未検証として残す。

## テスト方針

- 単体: `PaneOpRegistry.test.ts`・`PaneSocket.test.ts`（一時ディレクトリの socket へ行を送る）・`paneSocket.test.ts`（偽の受け口）・`cliArgs` のテスト・`ask.test.ts`・`config.test.ts`・`paneEnv.test.ts`。
- 結合: `packages/server/src/panesocket/paneSocket.integration.test.ts`（実物のサーバ＋ `/ws` のブラウザ役＋受け口）、`packages/cli/src/paneSocket.integration.test.ts`（実物の受け口 × 実物のクライアント）、`paneEnv.integration.test.ts`（実物の pane の環境）。
- 起動確認（smoke）: `.aidev/config.yml` の 10 本をそのまま通す。2 本目（cli の smoke）と 6 本目（handoff の smoke）に、ログインなしの ask を足す。
- E2E: `ask-form.spec.ts` にログインなしの 1 件。合否はブラウザの DOM と sodactl の stdout・終了コード（条項 `e2e-observe-browser`）。
- 全体: `pnpm typecheck`・`pnpm lint`・`pnpm test`。出力と終了コードは別々に残す。
- 実物では確かめられないもの（別の利用者で繋げない・macOS・Windows）は `docs/verification.md` の手動の手順に書き、`test-result.md` に未検証として残す。

## タスク

- [ ] T1: 受け口のやりとりの型・定数・要求の schema を protocol に足す（`paneSocket.ts`。`index.ts` から再輸出）
      対象: `packages/protocol/src/paneSocket.ts`（新規作成）、`packages/protocol/src/index.ts:13`、`packages/protocol/src/messages.ts:393` `AskOpenParams`、`packages/protocol/src/errors.ts:2` `ErrorCode` / 根拠: research A24, A25
      依存: なし
      AC: AC13, AC14
- [ ] T2: 0700 の一時ディレクトリで listen → 0600 → rename する共通関数を足す（テストつき: mode が 0600・残骸のファイルを置き換える・失敗したら一時ディレクトリを残さない）
      対象: `packages/server/src/infra/privateUnixSocket.ts`・`privateUnixSocket.test.ts`（新規作成）、手本は `packages/server/src/machine/BridgeEndpoint.ts:91` `BridgeEndpoint.listen` / 根拠: research A12
      依存: なし
      AC: AC5, AC11
- [ ] T3: `PaneOpRegistry`（登録・二重登録の throw・`has`・`invoke` が schema 違反／`RpcError`／想定外の例外を code に揃える）とテスト（`test.echo` を登録して直接呼び、結果・エラーの code・`paneId` が返る）
      対象: `packages/server/src/panesocket/PaneOpRegistry.ts`・`PaneOpRegistry.test.ts`（新規作成）、手本は `packages/server/src/surface/ControlSurface.ts:33` `invoke` / 根拠: research A17, A31
      依存: T1
      AC: AC13, AC16
- [ ] T4: `PaneSocket`（1 接続 1 要求・行の上限・待ちの上限・同時接続の上限・検査の順「形 → 操作 → pane → 引数」・`pane_socket_busy`・`pause`／`resume`／`close`・接続が終わったら `signal` と `onConnectionGone`）とテスト。
      正常系: `test.echo` を登録し、受け口へ 1 行送って結果・handler が投げた `RpcError` の code・受け取った `paneId` が返る。
      異常系: 知らない操作 → `unknown_op`（実在しない pane と組み合わせても `unknown_op`）・実在しない pane → `not_found`・壊れた入力（JSON でない・`v` 違い・上限を超える行・途中で切れる）の後も次の要求が通る・行が揃わないと待ちの上限で切れる（上限はテストで短く差し替える）。
      接続の扱い: 接続を閉じると `signal` が abort して `onConnectionGone` が 1 回・`pause` 中と同時接続の上限超えの新しい接続は `pane_socket_busy`・`pause` は開いている接続を何も書かずに捨てる・`resume` で受け付けが戻る・`close` の後にファイルが無い・残骸があっても起動できる。
      対象: `packages/server/src/panesocket/PaneSocket.ts`・`PaneSocket.test.ts`（新規作成）、手本は `packages/server/src/handoff/HandoffSocket.ts:49` `startHandoffSocket` と `packages/server/src/machine/BridgeEndpoint.ts:126` `close` / 根拠: research A11, A12
      依存: T1, T2, T3
      AC: AC3, AC9, AC11, AC13, AC14, AC16
- [ ] T5: `PaneSocket`・`PaneOpRegistry` を testkit から輸出する（cli の結合テスト用）
      対象: `packages/server/src/testkit.ts` / 根拠: design「対象範囲」
      依存: T4
      AC: AC13
- [ ] T6: 受け口のパスと pane の環境——`paneSocketPathFor`（Windows は undefined）・`SODA_PANE_SOCKET` を入れる／落とす・`SessionService` のオプション。単体テスト（`config.test.ts`: Windows は undefined・それ以外は `<状態ディレクトリ>/pane.sock`、`paneEnv.test.ts`: 入る／パスが無ければ入らない／親の環境の古い値を落とす／token・cookie・`local-auth.json` の秘密がどの値にも含まれない）
      対象: `packages/server/src/config.ts:82` `agentReportSocketPathFor`、`packages/server/src/session/paneEnv.ts:14` `PANE_ENV_DROPPED`・`:31` `PaneEnvManaged`・`:50` `buildPaneEnv`、`packages/server/src/session/SessionService.ts:113`・`:763` `commandEnv`・`:1158` `envForPane`、`packages/server/src/config.test.ts:121`、`packages/server/src/session/paneEnv.test.ts:46` / 根拠: research A13, A15, A16, A27
      依存: なし
      AC: AC5, AC15
- [ ] T7: ask の操作と `composeServer` の配線——`askOpenOp`・組み立て（登録・`onConnectionGone` → `asks.onClientGone`・パスを `SessionService` へ）・起動（Windows 以外・失敗は warn で続ける）・停止・起動失敗の後始末。結合テスト（ログインなしで `answered`・`cancelled`・`timeout`・ブラウザなしの `unavailable`、`/ws` の質問と同じ pane への `ask_busy`、実在しない pane → `not_found`、待っている接続を閉じると `/ws` に `ask.closed`、`pane.write`・`workspace.create` は `unknown_op` で pane の画面と workspace の数が変わらない、`pane.sock` の mode が 0600、別の状態ディレクトリのサーバにしか無い pane は `not_found`、`server.log` に定義・回答の中身が出ない）
      対象: `packages/server/src/panesocket/askOp.ts`・`paneSocket.integration.test.ts`（新規作成）、`packages/server/src/composeServer.ts:238`・`:253`・`:317`・`:673-689`・`:704-706`・`:731`、手本は `packages/server/src/ask/ask.integration.test.ts:45-88` / 根拠: research A5〜A8, A27
      依存: T4, T6
      AC: AC1, AC2, AC3, AC4, AC5, AC6, AC10
- [ ] T8: handoff の配線——`closeClients` で `paneSocket.pause()`、`reopenClients` で `paneSocket.resume()`。既存の handoff の統合テストに、handoff の指示の間は受け口が `pane_socket_busy` を返し、元に戻ると受け付けが戻ることを足す（統合テストで元に戻す経路を作れなければ、依存を直接呼ぶ単体の確認にして、その旨を `decisions.md` に残す）
      対象: `packages/server/src/composeServer.ts:448-477`（`HandoffController` の依存）、`packages/server/src/composeServer.handoff.integration.test.ts` / 根拠: research A9, F21
      依存: T7
      AC: AC11
- [ ] T9: 既存の smoke・E2E の子の環境から `SODA_PANE_SOCKET`・`SODA_AGENT_REPORT_SOCKET` を外す（開発者の pane の受け口へ漏らさない）
      対象: `packages/cli/src/smoke.ts:297-298`（`inPaneEnv` と子へ渡す `env`）、`packages/e2e/src/support/ask.ts:32` `runAsk` / 根拠: research F47, F49, R11
      依存: なし
      AC: なし
- [ ] T10: sodactl の `GlobalOpts` に `urlExplicit`・`paneSocket` を足す（`SODA_PANE_SOCKET` → `SODA_AGENT_REPORT_SOCKET` からの導出 → なし。Windows では常になし）と単体テスト（`--url`・`SODACTL_URL` で `urlExplicit`、`/x/agent-report.sock` → `/x/pane.sock`、別の名前・Windows は undefined）
      対象: `packages/cli/src/cliArgs.ts:118` `GlobalOpts`・`:307` `globalOptsFrom`・`:345` `parseArgs`、`packages/cli/src/cliArgs.test.ts` / 根拠: research A20
      依存: なし
      AC: AC8, AC11
- [ ] T11: sodactl の受け口のクライアント（`paneSocketFor`・`callPaneOp`・`viaPaneSocketOrSession`）。
      単体テスト（`paneSocketFor`: pane の外・パスなし・`urlExplicit`・`--machine` あり → undefined、`--machine local` とパスあり → パス）、（`callPaneOp` を偽の受け口で: 無いパス → fallback・`unknown_op`／`bad_request` → fallback・操作のエラーと `pane_socket_busy` → `RpcFailure`・返事なしで閉じる → `connection_closed`・時間切れ → `timeout`）。
      結合テスト（実物の `PaneSocket` に `test.echo` を登録して `callPaneOp` で呼ぶ）
      対象: `packages/cli/src/paneSocket.ts`・`paneSocket.test.ts`・`paneSocket.integration.test.ts`（新規作成）、`packages/cli/src/wsClient.ts:27` `RpcFailure`、接続の手本は `packages/server/assets/agent-hook-report.cjs:52-63` / 根拠: research A23, A26
      依存: T1, T5, T10
      AC: AC7, AC8, AC13, AC14
- [ ] T12: `runAsk` に経路の選択を通す（`viaPaneSocketOrSession`。`invalid_ask_spec` の読み替えは両方の経路に効かせる）と `ask.test.ts` の追加（受け口があれば `withSession` を呼ばない・fallback で今までの経路・`--url`／`SODACTL_URL` で受け口を使わない・定義の誤りではどちらにも繋がない・受け口が `invalid_ask_spec` を返すと使い方の誤り）
      対象: `packages/cli/src/commands/ask.ts:80` `runAsk`・`:100` `requestAsk`、`packages/cli/src/commands/ask.test.ts:53-74` / 根拠: research A19, A27
      依存: T9, T11
      AC: AC1, AC7, AC8, AC17
- [ ] T13: `paneEnv.integration.test.ts` に「実物の pane の中の `SODA_PANE_SOCKET` が、そのサーバの実在する `pane.sock` のパスと一致する」を足す
      対象: `packages/cli/src/paneEnv.integration.test.ts:148` / 根拠: research A27
      依存: T7
      AC: AC1
- [ ] T14: docs と skill——先に「`/ws` の経路で `SODA_PANE_ID` を書き換えると別の pane を名乗れる」をコードで確かめ（`resolveCallerPane`・`selfPaneId`。確かめた結果を `decisions.md` に残し、違っていれば docs の安全の境界の文言を事実に合わせる）、その上で書く: `docs/sodactl.md`（節「ログイン不要の受け口（pane.sock）」・ask の節・環境変数の表・「接続先と認証」・herdr との違い）、`docs/machines.md`、`docs/verification.md`（ログインなしの ask の手順・別の利用者で繋げない確認・Windows は今までどおり）、`docs/tls-setup.md`（socket の一覧）、`packages/cli/skills/sodactl/SKILL.md`、`AGENTS.md`（案内に 1 行）、`sodactl help` の ask の文面（skill と揃える。design の「対象範囲」に無いので `decisions.md` に 1 行残す）。書いた後に `skill.test.ts` を通す（4 本目の smoke は T15 でビルドし直してから通す）
      対象: `docs/sodactl.md:212`・`:217-273`・`:499-510`・`:520-523`・`:645-652`、`docs/machines.md:118-121`、`docs/verification.md:419-421`・`:734-756`、`docs/tls-setup.md:463-466`、`packages/cli/skills/sodactl/SKILL.md:32-39`・`:108-128`、`AGENTS.md`、`packages/cli/src/main.ts:59-61`、`packages/cli/src/paneTarget.ts:15`・`packages/cli/src/selfGuard.ts:39`（確認する場所）、`packages/cli/src/skill.test.ts` / 根拠: research A21, A30, F51〜F54
      依存: T12
      AC: AC5, AC12
- [ ] T15: cli の smoke にログインなしの ask を足す（キャッシュの無い HOME・`SODA_PANE_SOCKET` はその smoke が起動したサーバの状態ディレクトリの `pane.sock`）: `unavailable`・終了コード 0、`{questions: []}` → 終了コード 2。ビルドし直して smoke の 2 本目と 4 本目（`sodactl skill | cmp`）を通す
      対象: `packages/cli/src/smoke.ts:313-332` / 根拠: research A29
      依存: T7, T9, T12, T14
      AC: AC2, AC12, AC17
- [ ] T16: E2E にログインなしの 1 件を足す（`support/ask.ts` に token を渡さない呼び方: キャッシュの無い HOME・`SODACTL_TOKEN` なし・`SODA_PANE_SOCKET` はテストのサーバの `pane.sock`）: ブラウザで決定 → `answered`・ダイアログの最上部に pane の表示・SIGINT でダイアログが閉じる
      対象: `packages/e2e/src/support/ask.ts:32` `runAsk`、`packages/e2e/src/specs/ask-form.spec.ts:40`・`:194` / 根拠: research A28
      依存: T7, T9, T12
      AC: AC1, AC4, AC6
- [ ] T17: handoff の smoke に、handoff の後の「古い pane の環境」（`SODA_PANE_SOCKET` なし・`SODA_AGENT_REPORT_SOCKET` だけ・キャッシュの無い HOME）でビルドした sodactl の `ask` が `unavailable`・終了コード 0 になることを足す
      対象: `packages/server/src/handoffSmoke.ts:142` 付近（Windows では何もしない分岐の後） / 根拠: research F50, F58
      依存: T8, T12
      AC: AC11
