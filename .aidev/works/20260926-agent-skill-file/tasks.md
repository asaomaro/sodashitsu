# タスク: agent skill ファイル・pane の環境変数・自分の pane への操作の歯止め

## 実装方針

design.md のとおり、サーバ（pane の環境）→ CLI（引数・接続先）→ CLI（歯止め）→ skill ファイル → 結合テスト → docs の順に組む。
サーバ・プロトコルの RPC は変えない。各タスクで単体テストを書き、負の確認（実装を変異させてテストが落ちること）は test 工程でまとめて行う
（`.aidev/conventions/regression-negative-control.md`。生の出力を test-result.md に貼る）。

## 作業順序と依存関係

- 下の `依存:` に従う。T2 の結合テスト（T7）は、サーバの配線（T2）と CLI の接続先（T3）の両方が要る。

## リスク / 留意点

- `GlobalOpts` を使うテストのリテラルが多い。`caller` は任意のプロパティにして既存のリテラルを変えない（AC17）。
- `exactOptionalPropertyTypes`：`caller: undefined` を代入しない（キーごと省く）。
- prettier は新規のファイルと、HEAD で整形済みのファイル（`attach.ts`・`agentStart.ts`・`tab.ts`・`agent.ts` とそのテストの一部）にだけかける。
- 結合テストはテストのプロセスの環境（`process.env`）を書き換えるので、終わったら必ず戻す。

## テスト方針

- 単体: `net.test.ts`（URL の表）・`paneEnv.test.ts`（消す・入れる・token が残らない・win32 の大文字小文字）・`cliArgs.test.ts`（優先順位・caller・skill の使い方の誤り）・
  `selfGuard.test.ts`（条件の組み合わせ）・各コマンドのテスト（断る・断らない・要求を送らない）・`skill.test.ts`（内容・front matter・最初の確認・コマンドの食い違い）。
- 結合（実サーバ・実 PTY）: pane の中の `WTM_SERVER_URL` と、テストのプロセスに置いた `WTMCTL_TOKEN` が pane に見えないこと。
- test 工程: `pnpm -s build`・`pnpm -s typecheck`・`pnpm -s test`・`aidev smoke`、サーバを起動していない状態で `WTMCTL_URL` に誰も待ち受けていないポートを指して
  ビルド済みの `wtmctl skill` を打ち、終了コード 0 と `cmp`（ファイルと一致）を確かめる（接続しないことの確認を兼ねる。design AC5）、実サーバの pane の中からビルド済みの wtmctl で
  `pane close "$WTM_PANE_ID"` が `self_target` になること（手で 1 回）、負の確認。E2E は動かさない。

## タスク

- [x] T1: `paneServerUrl` を追加する（全インタフェース → ループバック・IPv6 の角括弧・URL にできなければ undefined）とテスト
      対象: `packages/server/src/util/net.ts` `formatUrlHost`・`isWildcardHost` / 根拠: research A3
      依存: なし
      AC: AC8
- [x] T2: pane の環境を `buildPaneEnv` で組み立てる（受け継いだ `WTMCTL_URL`・`WTMCTL_TOKEN`・古い `WTM_*` を消し、`WTM_SERVER_URL` を入れる）。`SessionService` の
      オプション `serverUrlForPanes`、`composeServer` の待ち受けの後・復元と最初の workspace の作成の前での URL の決定（スキームは `secure`、ポートは `server.address()`、文字列・null なら `options.port`。
      復元・最初の pane に入らない順序の誤りは T7 の結合テストで捕まえる）。`paneEnv.test.ts`
      対象: `packages/server/src/session/SessionService.ts:1039-1043` `envForPane`・`packages/server/src/composeServer.ts:236-254` `listen`・`packages/server/src/session/paneEnv.ts`（新規） / 根拠: research A1, A2
      依存: T1
      AC: AC7, AC9, AC15
- [x] T3: CLI の引数: `USAGE_LINES` の export と help の一本化（説明文の「環境変数」の行を優先順位の形にし、歯止めの 1 文を足す）・`wtmctl skill` の解釈・接続先の優先順位（`WTM_SERVER_URL`）・`GlobalOpts.caller`。`cliArgs.test.ts`
      対象: `packages/cli/src/cliArgs.ts:11-35` `USAGE`・`:154-159` `globalOptsFrom`・`packages/cli/src/main.ts:25-60` `printHelp` / 根拠: research A4, A5
      依存: なし
      AC: AC6, AC10, AC13, AC17
- [x] T4: 歯止め `selfGuard.ts`（`assertNotSelfPane`・`assertNotSelfTab`・`assertNotSelfWorkspace`）と `selfGuard.test.ts`
      対象: `packages/cli/src/selfGuard.ts`（新規）・`packages/cli/src/wsClient.ts` `RpcFailure`
      依存: T3
      AC: AC11, AC12, AC13
- [x] T5: 9 コマンドへの歯止めの呼び出しと各コマンドのテスト（断る・メッセージ・要求を送らない・断らないコマンドの代表）
      対象: `packages/cli/src/commands/pane.ts`・`attach.ts:95` `runPaneAttach`・`agentStart.ts` `runAgentStart`・`tab.ts` `runTabClose`・`workspace.ts` `runWorkspaceClose`・
      `agent.ts:310-345` `runAgentPrompt`/`runAgentSendKeys` と各テスト（`commands/{pane,attach,agentStart,tab,workspace,agent,agentRename}.test.ts`） / 根拠: research A6
      依存: T4
      AC: AC11, AC12, AC14
- [x] T6: skill ファイル `packages/cli/skills/wtmctl/SKILL.md` と `skill.ts`（`skillFilePath`・`readSkill`・`runSkill`）・main の分岐・`skill.test.ts`（内容・front matter・最初の確認・コマンドの食い違い）
      対象: `packages/cli/skills/wtmctl/SKILL.md`（新規）・`packages/cli/src/skill.ts`（新規）・`packages/cli/src/main.ts` / 根拠: research A5, A7
      依存: T3
      AC: AC1, AC2, AC3, AC4, AC5
- [x] T7: 結合テスト（実サーバ・実 PTY）: pane の中の `WTM_SERVER_URL` と、テストのプロセスの `WTMCTL_TOKEN` が pane に渡らないこと
      対象: `packages/cli/src/paneEnv.integration.test.ts`（新規）・手本 `packages/cli/src/main.integration.test.ts` / 根拠: research A8
      依存: T2, T3
      AC: AC7, AC9, AC15
- [x] T8: docs（`docs/wtmctl.md` の新しい節と herdr との違い・`docs/herdr-parity.md` の H39）
      対象: `docs/wtmctl.md`・`docs/herdr-parity.md:72`
      依存: T2, T5, T6, T7
      AC: AC16
