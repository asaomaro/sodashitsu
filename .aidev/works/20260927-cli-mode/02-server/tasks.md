# タスク: 02-server（サーバの口・引数なしの soda・web の設定の置き場所・herdr の操作）

## 実装方針

design「インターフェース / データ構造」の protocol・server と、「設定」「herdr の操作の追加」の web 側を作る。端末版（tui）はまだ無いので、`findOrStart` は `runTui` と同じ形の関数を受け取り、
`main.ts` は tui パッケージが無い間は「接続できた先を表示して終わる」仮の入口を渡す（03 で差し替える）。

- protocol: `prefs.get`・`prefs.set`・`prefs.changed`・`server.stop`（`packages/protocol/src/messages.ts`・`events.ts`）。`SharedPrefs` は `z.object({...}).partial().passthrough()`、上限 256KB。
- server:
  - `persist/PrefsStore.ts`（`<state>/prefs.json`・0600・一時ファイル→rename・rev）と `surface/methods/prefs.ts`（`prefs.get`/`prefs.set`、`prefs.changed` を全クライアントへ）。
  - `surface/methods/server.ts` の `server.stop`（応答の後に `onStopRequest` と同じ経路。`composeServer.ts:98,429`・`main.ts:78`）。
  - `auth/LocalLogin.ts`（秘密の生成・`local-auth.json` 0600・止めるとき削除）と `http/HttpServer.ts` の `POST /api/local-login`（`remoteAddress === localAddress` かつ秘密の一致。失敗は `rateLimiter` に数える。成功は `AuthService` にセッションを発行させる新しい方法 `issueSession()`）。
  - `persist/ServeRecordFile.ts` に `certSha256`。
  - `cliArgs.ts`: 引数なし／先頭がオプション（`--session`・`--state-dir`・`--allow-nested`）を `command: "tui"` に。`help`・`--help`・`-h` は help のまま。
  - `launch/findOrStart.ts`・`launch/spawnDetached.ts`（design「裏での起動」）と `main.ts` の振り分け。
- web:
  - `store/view.ts` の `readPrefs`/`writePrefs`（`soda.prefs.v1` の唯一の出入口。`view.ts:61-81`）を土台に、接続したら `prefs.get` で置き換え、rev 0 なら移行、変更は `prefs.set`、`prefs.changed` を反映。端末ごとの項目（`sidebarWidth`・`sidebarCollapsed`）は送らない。
  - D-7 の操作: client-core の `keys/bindings.ts` に `switch_workspace_1..9`・`open_worktree`・`remove_worktree`・`swap_with_focused`・`stop_server` を足し、web の `ActionDispatcher` に実装（`stop_server` は確認つき）。

## 作業順序と依存関係

下の `依存:` に従う。

## リスク / 留意点

- ローカルログインは認証の口。`remoteAddress` と `localAddress` の比較は IPv4-mapped IPv6（`::ffff:127.0.0.1`）を正規化してから行う。
- 設定の移行で、既存のブラウザの設定を失わないこと（rev 0 のときだけ送る・送った値で上書きしない）。
- Windows の WMI の起動はこの環境で実機確認できない。コマンド行の組み立てを単体テストし、実機は親の test で扱う。

## テスト方針

- server: `composeServer.*.integration.test.ts` の形で実物のサーバを起動し、`prefs.*`・`prefs.changed` の配布・再起動後の復元、`/api/local-login`（成功・秘密の不一致・別アドレス相当・429）、`server.stop`、`serve.json` の指紋を確かめる。
- `findOrStart`: 一時の状態ディレクトリで、動いていない→起動→準備完了、動いている→そのまま、同時に 2 つ、入れ子、失敗の表示。
- web: happy-dom で移行（rev 0＋localStorage あり→送る、rev>0→受ける）と `prefs.changed` の反映、D-7 の操作。

## タスク

- [x] T1: protocol に `prefs.get`/`prefs.set`/`prefs.changed`/`server.stop` の型を足す
      対象: `packages/protocol/src/messages.ts:604-743`・`packages/protocol/src/events.ts:144-168`
      依存: なし
      AC: AC11
- [x] T2: server に `PrefsStore` と `prefs.*` の方式を足す（保存・rev・配布・再起動後の復元）
      対象: `packages/server/src/persist/`（新規 `PrefsStore.ts`）・`packages/server/src/surface/methods/index.ts`（新規 `prefs.ts`）・`packages/server/src/composeServer.ts`
      依存: T1
      AC: AC11
- [x] T3: `server.stop` の方式を足す
      対象: `packages/server/src/surface/methods/`（新規 `server.ts`）・`packages/server/src/composeServer.ts:98,429`
      依存: T1
      AC: AC1
- [x] T4: ローカルログイン（`local-auth.json`・`POST /api/local-login`・`AuthService.issueSession`）と `serve.json` の `certSha256`
      対象: `packages/server/src/auth/AuthService.ts:135-156`・`packages/server/src/http/HttpServer.ts:93-133`・`packages/server/src/persist/ServeRecordFile.ts:12-44`・（新規 `auth/LocalLogin.ts`）
      依存: なし
      AC: AC1, AC18
- [x] T5: 引数なしの `soda`（`cliArgs.ts`）と `findOrStart`・`spawnDetached`・`main.ts` の振り分け（仮の入口）
      対象: `packages/server/src/cliArgs.ts:46-64`・`packages/server/src/main.ts`・`packages/server/src/persist/namedSession.ts:141-145`・`persist/StateDirLock.ts:208-212`・`commands/commandLaunch.ts:44-85`（新規 `launch/`）
      依存: T4
      AC: AC1
- [x] T6: web の設定の置き場所をサーバへ（接続時の取得・初回の移行・変更の送信・`prefs.changed` の反映・端末ごとの項目は残す）
      対象: `packages/web/src/store/view.ts:52-142`・`packages/web/src/store/settings.ts`・`packages/web/src/store/StoreAdapter.ts:102-157`
      依存: T2
      AC: AC11, AC19
- [x] T7: D-7 の操作を操作表に足し、web に実装する
      対象: `packages/client-core/src/keys/bindings.ts`（01 で移したもの）・`packages/web/src/actions/ActionDispatcher.ts`・`packages/web/src/components/ContextMenu.vue:52-59`
      依存: T3
      AC: AC8, AC19
