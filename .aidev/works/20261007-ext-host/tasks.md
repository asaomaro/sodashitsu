# タスク: soda 拡張の登録と起動 — 設定に登録したプログラムを Sodashitsu が動かし、標準入出力の NDJSON でやり取りする

実装するのは、この文書を読む別のエージェント。**読む順**: この `tasks.md` → `design.md`（設定の形・型と定数・操作の表・`ExtensionProcess`・`ExtensionHost`・脅威の表 S1〜S23 は、そこが正）→ `requirements.md`（AC の本文）→ `research.md`（既存の作りの事実 E1〜E9・実装アンカー X1〜X23・実装時の注意）。
`decisions.md` の K1〜K14 は、**利用者の決定待ち**（勧める案で書いてある）。実装の前に、監督のセッションに、決定が出たかを確かめる。出ていなければ、勧める案のまま実装してよい（差し替える箇所は、K ごとに 1 つの関数に閉じてある）。
**範囲の外**（観測・割り込み・端末版・`sodactl` からの承認・表示の面の枠と静的ページ・`.aidev/works/20261007-soda-extensions/` の文書）には、手を出さない。

## PR の分け方

差分が 60 ファイル前後（テスト込み）になる見込みなので、**PR を 3 つに分ける**。順に積み、前の PR だけで動く（後ろを待たない）。

| PR | 中身 | タスク | これだけで出来ること | 表示の面への依存 |
|---|---|---|---|---|
| **PR1: サーバと、利用者の設定の拡張** | protocol・設定の読み込み・プロセス・ホスト・台帳の持ち主・`/ws` の方式・`sodactl ext`・起動確認・文書と見本 | T1〜T14 | 利用者の設定に登録した拡張が動き、`display.*` を呼べ、`sodactl ext` で状態とログが見える | PR1（main にある）だけ |
| **PR2: 設定の画面** | ストア・通信の係・節「拡張」・落ちたときの知らせ・E2E・文書 | T15〜T19 | 画面で、一覧・状態・入切・起動し直し・ログ | なし |
| **PR3: プロジェクトの設定と承認** | プロジェクトの根・設定の読み方・鍵・承認の記録・範囲・`/ws` の承認の方式・承認のダイアログ・知らせ・出どころの表示・E2E・起動確認・文書 | T20〜T30 | リポジトリの中の拡張を、承認して動かせる | T27（出どころの表示）と、T28 の一部は、表示の面の PR2 が main に入ってから |

- aidev の work は 1 つのまま（この `tasks.md`）。ブランチは `feature/ext-host` から、PR ごとに切る（例: `feature/ext-host-1-server`・`-2-settings`・`-3-approval`）。PR2 は PR1 の上、PR3 は PR2 の上に積む。
- **独立レビュー（差分全体。実装とは別のコンテキスト）は、PR ごとに掛ける**。PR3 のレビューは、**攻める側の目**で（脅威の表 S1〜S23 を、1 行ずつ、コードで確かめる）。`aidev` の test・review・deliver を PR ごとに回すか、PR2・PR3 を別の work に切り出すかは、実装を監督するセッションが決めて `decisions.md` に書く
  （勧める: PR2・PR3 を始める前に `aidev new` で別の work に切り出し、この `tasks.md` の該当のタスクを写す。1 work 1 PR の決まりに合う。表示の面の作業と同じ進め方）。
- **PR1 は、承認の仕組みが無いまま、プロジェクトの設定を読まない**（読む処理そのものが PR3）。PR1・PR2 の時点で、リポジトリの中の `.soda/extensions.json` は、存在しても何も起きない。**PR1 に、プロジェクトの設定を読む処理を、先回りして入れない。**
- **表示の面の作業と同じファイル**: `packages/server/src/display/DisplayService.ts`・`packages/protocol/src/display.ts`（T7。表示の面の PR3 の T23・T24 も触る）と、パネル・帯の見出しの部品（T27。表示の面の PR2 が作る）。足すだけにする（既存の行を並べ替えない・既存の口の引数の意味を変えない）。
  着手の前に `git fetch` して、表示の面の PR2・PR3 が main に入っていれば、取り込んでから始める。

## 表示の面の PR の着地の順による違い

| 表示の面の状態 | この作業での扱い |
|---|---|
| PR2（画面）が main に無い | T1〜T26・T29 は進められる。T27（出どころの表示）と、T28 の「ブラウザに面が出る」E2E は、**待つ**（その 2 つを外して PR3 を出し、後から小さい PR で足してもよい。その場合は `decisions.md` に書く） |
| PR3（`script-html`・`display.send`）が main に無い | `display.send` は、表に載せない（`unsupported`）。`script-html` の許可の検査（T8）は、形式の名前の文字列だけを見るので、入れておく。許可があるときの `set` は、表示の面の検査が `invalid_display` を返す（テストは、その 2 通りを分けて書く） |
| PR3 が main にある | T8 で、`display.send` を表に足し、`DisplayService.send` に持ち主の検査（`opts.owner`）を足す（design「表示の面への追加」の末尾） |

## 実装方針

各 PR の終わりで `pnpm build`・`pnpm typecheck`・該当パッケージのテストが通る状態にする。

- **PR1**: protocol（T1・T2）→ 設定の読み込み（T3）→ 行の切り出し（T4）→ 起動の引数と環境変数（T5）→ **最初に、実際の子プロセスで、グループごと止められることを確かめる（T6。不確かな点 1）** → 台帳の持ち主（T7）→ 操作の表（T8）→ 無効の記録とホスト（T9）→ `/ws` と組み立て（T10）→ 結合テスト（T11）→ `sodactl ext`（T12）→ 起動確認（T13）→ 文書と見本（T14）。
- **PR2**: ストアと通信の係（T15）→ 節の部品（T16）→ 知らせ（T17）→ E2E（T18）→ 文書（T19）。
- **PR3**: プロジェクトの根と設定の読み方（T20）→ 鍵と記録（T21）→ ホスト（T22）→ 方式（T23）→ 安全の結合テスト（T24）→ 画面の純粋な部分（T25）→ ダイアログと知らせ（T26）→ 出どころの表示（T27）→ E2E（T28）→ 起動確認と文書（T29）→ 負の対照（T30。test 工程）。

純粋な検査（設定の 1 件・要求の行・禁止する文字・鍵）は、純粋な関数に置いて単体テストする。子プロセス・時計・ファイルは、差し替えられる口（`deps`）から受け取る（`machine/testing.ts` の `FakeChild`・`ManualClock` と同じ流儀。拡張用の偽の子は `extensions/testing.ts` に作る。`pid` と `exit` を持つ）。
**`spawn` を呼ぶのは `ExtensionHost.startOne` の 1 か所だけ**（`ExtensionProcess.start` は、そこからだけ呼ばれる）。きっかけの処理に、起動を直接書かない（design「設計方針」1）。

独立点検（`aidev taskcheck`）は、壊れやすいタスク（サーバの状態・保存と復元・プロトコル・安全に関わるもの）だけに掛ける: **T1・T2・T3・T4・T5・T6・T7・T8・T9・T10・T20・T21・T22・T23・T26**（各タスクの末尾に `点検: あり`）。
見た目・配線・テストの追加・E2E・文書のタスクには掛けず、PR ごとに、その PR のタスクが終わった後で `cross` を 1 回掛ける（AGENTS.md「点検とテストの掛け方」）。
PR3 の `cross` は、「起動の入口が 1 つであること（S2）」「承認の記録・無効の記録・設定を、`startOne` が読み直していること」「`pane.sock` に何も載っていないこと」を、名指しで見させる。

## 作業順序と依存関係

下の `依存:` に従う。補足:

- **不確かな点と、だめだったときの扱い**（design「依拠する既存の事実」の未確認 u1〜u7）。どれも、結果を `decisions.md` に 1 行残す。
  1. （u1）`detached: true` で起動した子へ、`process.kill(-pid, sig)` でグループごと合図を送れること → **T6**（実際の子と孫で確かめるテストを、最初に書く）。だめなら（環境に依って `EPERM` など）、子の pid へだけ合図を送り、「孫は残りうる」を docs の限界に足して、AC13 の孫の部分を、その環境ではスキップする（理由をテストに書く）。**Linux と macOS のどちらでもだめなら、止めて、監督のセッションに報告する**（設計の要なので）。
  2. （u2）`execve` の後、止め損ねた子の標準入力が閉じること → **T13**（起動確認で、入れ替えの後に、前の pid が消えていることを見る。止めて待つので、ふつうは通らない道）。確かめられなければ、docs に「未確認」と書く。
  3. （u3）Windows の `taskkill` → 実機では確かめない。**T5** の単体テスト（組み立て）だけ。docs「Windows」に「実機では確かめていない」と書く。
  4. （u4）pane が tab・workspace を移ったときに bus に出るイベント → **T9**（`SessionService` の `moveToTab`・`moveToNewTab` の `publish` を読む。research X23）。該当のイベントが無ければ、design「きっかけ」の一覧に足すものは無く、`ext.panes` は、次のきっかけまで遅れる（docs に書く）。範囲の検査は、要求のたびに引くので、変わらない。
  5. （u5）表示の面の PR2 の、見出しの部品 → **T27**（PR2 が main に入ってから、その部品を読む）。
  6. （u6）`findGitRoot` の `deps` の作り方 → **T20**（`workspaceLabel.ts` の `rootWithin` の呼び出し元を読む）。組み立てにくければ、`projectRoot.ts` に、同じたどり方（`.git` のディレクトリ／`gitdir:` のファイル／bare）を、`findGitRoot` を呼ぶ形で包む。**たどり方を、書き直さない**（`gitDirFor` の規則と食い違うと、根がずれる）。
  7. （u7）`/bin/sh -c` が `exec` で置き換えるか → 確かめなくてよい（グループごと止めるので、動きは同じ）。
- **PR1 の T7 は、表示の面のファイルを触る**。T7 だけを先に小さい PR にして出してもよい（表示の面の PR3 と衝突する前に）。その判断は、監督のセッションがする。
- T30（負の対照）は、**test 工程で消化する**（coding の承認の時点では、未チェックで残る。`decisions.md` D5）。PR ごとに、その PR の守りの分を行う（PR1: (d)(e)・PR3: (a)(b)(c)(f)）。

## リスク / 留意点

- **「開いただけで動く」を作らない**（S1・S2）。PR3 のどのタスクでも、`spawn` へ至る道を足したら、`startOne` を通っているかを見る。テストは、「実行の印のファイルが出来ない」を、きっかけごとに 1 つずつ書く（まとめて 1 つにしない——どのきっかけが漏れたか、分からなくなる）。
- **bus の受け手の例外は、pane の処理へ伝わる**（research E3）。`ExtensionHost` の受け手は、`try/catch` で包み、中ではタイマーを掛けるだけにする。
- **bus に流したものは、全接続へ届く**。`extension.changed` に、中身を載せない。
- **子の stdio の `error` に受け手を付ける**（無いと `EPIPE` でサーバが落ちる）。`exit` を待つ（`close` を待たない）。
- **止める処理に上限**（3 秒）。`close()`・`pausePollers` を、拡張が止めない。
- **ログに、コマンド・標準エラーの中身・設定の値を書かない**。`logger` へ渡す項目は、`extension`（鍵の名前）・`run`・`state`・`code`・`signal`・`reason`・`lines` だけ。T11 のテストが、`server.log` を読んで確かめる。
- **利用者の拡張のコマンドを、`/ws` へ送らない**（`ExtensionInfo` に、項目が無い）。プロジェクトの分だけ、`approval.command` で送る（PR3）。
- **`commandConfig.ts` を変えない**（設定の読み方は、写す）。`PANE_ENV_DROPPED` には、足すだけ。
- **Windows**: 結合テスト・起動確認は `win32` でスキップ。単体テストは、`platform` を渡して両方を見る。
- **E2E は、実際に子プロセスを起動する**。拡張のコマンドは、`process.execPath` と、テストが一時ディレクトリに書いた `.mjs` の絶対パスで組み立てる（`node` が `PATH` にあることに頼らない。パスに空白があっても動くよう、引用符で囲む）。
- **テストが、開発者の本物の設定を読まない**: 状態ディレクトリは、いつも一時のもの。`homeDir` は、`ExtensionHostOptions` で差し替える。
- **時間に頼るテストを書かない**: 起動し直しの間隔・30 秒の詰まり・1 秒の待ちは、`ManualClock`（サーバ）と、Playwright の時計（`page.clock`）か、`disabled` の属性の変化を待つ形で見る。`waitForTimeout` だけを根拠にしない。

## テスト方針

- **単体**（vitest）: `parseExtensionsJson`（規則の表: 項目ごとの境界・禁止する文字・知らない項目・重複・`cwd` はプロジェクトで誤り）、`loadUserExtensionsFile`・`loadProjectExtensionsFile`（偽の `open`／一時ディレクトリのリンク・FIFO・大きさ・権限）、`parseExtRequest`、`LineReader`（片のまたぎ・`\r\n`・4 MiB 超・壊れた UTF-8・空の行）、
  `extensionArgv`・`killTreeCommand`・`buildExtensionEnv`（POSIX と Windows）、`entryDigest`（項目ごとに 1 文字変える表）、`ApprovalStore`・`ExtensionStateStore`（壊れた・権限・上限）、`ExtensionProcess`（偽の子: 頻度の `pause`・列の上限と捨て方・30 秒・止め方・掃き）、`ExtensionHost`（偽の子と時計: 状態の遷移・間隔・`reconcile` の差・`startOne` の確かめ直し）、
  `DisplayService`（持ち主の表の 9 行を、1 行 1 テスト。**札なしの既存のテストが、1 つも変わらずに通ること**）、`ExtensionApi`（処理の順の 1〜8）、web の `extensionView.ts`・`approvalView.ts`。
- **結合**（vitest。`composeServer` を立てて、**実際の子プロセス**を起動する。`win32` はスキップ）: `packages/server/src/extensions/extensions.integration.test.ts`。拡張は、テストが一時ディレクトリに書く短い `.mjs`。AC1・AC3・AC5・AC6・AC7・AC9・AC10・AC11・AC13・AC15・AC32（PR1）、AC17〜AC26・AC28（PR3）。
- **E2E**（Playwright。`.aidev/conventions/e2e-observe-browser.md`）: PR2 `extensions-settings.spec.ts`（AC27・AC30 の落ちた知らせ・AC-I3 の節の分）、PR3 `extensions-approval.spec.ts`（AC29・AC30・AC31・AC-I1〜AC-I5）。合否は、ブラウザの DOM・`document.activeElement`・ブラウザが送受信したフレーム（`page.on("websocket")` の `framesent`・`framereceived`）で判定する。
  テスト自身の接続とファイルの操作は、前提を作ること（workspace の用意・設定ファイルを書く）と、サーバ側の確かめ（実行の印のファイルの有無）にだけ使う。何を観測したかを、spec のコメントに書く。
- **起動確認**（`aidev smoke`。ビルドした成果物）: `handoffSmoke.ts`・`stopSmoke.ts` に段を足す（AC14・AC18 の入れ替えの分）。
- **負の対照**（`regression-negative-control.md`。T30）: 守りだけを外して、対応するテストが落ちることを確かめ、戻す。E2E・起動確認は、外した状態でビルドし直してから走らせる。落ちたときの生の出力を `test-result.md` に貼る。
- **全体テストを二重に流さない**（AGENTS.md）: 実装のセッションが `pnpm build`・`pnpm typecheck`・`pnpm test` を流して報告する。受け取った側は、起動確認と、変更に関係する E2E だけを流す。

## タスク

独立点検（`taskcheck`）を掛けるのは T1・T2・T3・T4・T5・T6・T7・T8・T9・T10・T20・T21・T22・T23・T26。

### PR1: サーバと、利用者の設定の拡張

- [ ] T1: protocol の型・定数・純粋な関数を、新しいファイルに作る: design「型と定数」の全部（定数・`ExtensionScope`・`ExtensionRunState`・`ExtensionInfo`〔`approval?` の型 `ExtensionApprovalView` も、この時点で定義する。使うのは PR3〕・`ExtensionExitReason`・`ExtensionFileProblem`・`ExtensionListResult`・`ExtensionLogResult`・`ExtPane`・`ExtLimits`・`ExtLine`・`ExtDisplayEvent`・`ExtRequest`・`ExtRequestParse`・`EXT_EVENT_TYPES`）と、
      `parseExtRequest`（JSON でない → `bad_line`／オブジェクトでない・`method` が 1〜64 文字の文字列でない・`id` が有限の数でも 1〜64 文字の文字列でもない・`params` が配列でないオブジェクトでない → `bad_request`／知らない項目は無視）・`hasForbiddenChars`（design「設定ファイル」の表の一覧）・`extLimits`。
      `EXTENSION_ID_RE` は `COMMAND_ID_RE` をそのまま使う。`index.ts` から export。単体テスト（`parseExtRequest` の境界・`__proto__` を項目に持つ行で、何も壊れないこと・`hasForbiddenChars` の、一覧の文字を 1 つずつ）
      対象: `packages/protocol/src/extension.ts`（新規）、`packages/protocol/src/extension.test.ts`（新規）、`packages/protocol/src/index.ts`、`packages/protocol/src/commands.ts:13` `COMMAND_ID_RE`（参照）/ 根拠: design「型と定数」、research X3、手本は `packages/protocol/src/display.ts`
      依存: なし
      AC: AC7, AC8, AC12, AC34
      点検: あり
- [ ] T2: protocol の通信（PR1 の分）: `/ws` の方式 `extension.list`・`extension.reload`（引数 `{}`）・`extension.restart`・`extension.log`（`{ key }`。1〜160 文字）・`extension.setEnabled`（`{ key, enabled }`）の zod の schema と結果を、`METHOD_SCHEMAS`・`MethodResultMap` に足す。
      イベント `{ event: "extension.changed"; data: {} }` を `ServerEvent` に足す（**中身を持たない**）。テスト（表に載っていること・`extension.changed` の `data` に項目が無いこと）
      対象: `packages/protocol/src/messages.ts` `METHOD_SCHEMAS`・`MethodResultMap`（`command.*` の近く）、`packages/protocol/src/events.ts` `ServerEvent`、`packages/protocol/src/messages.test.ts` / 根拠: research X14、design「`/ws` の方式とイベント」
      依存: T1
      AC: AC4, AC15, AC16
      点検: あり
- [ ] T3: 利用者の設定の読み込み: `parseExtensionsJson(text, scope)`（design「設定ファイル」の表。`strictObject`・既定を埋める・`allow` を並べ替える・`scope === "project"` で `cwd` があれば誤り・1 つでも規則の外なら全体を採らない・誤りの文に値を入れない）と、`loadUserExtensionsFile(path, deps?)`（`loadCommandsFile` と同じ手順を**写す**。`commandConfig.ts` は変えない）。
      `ExtensionEntry`・`ExtensionFileLoad`・`ExtensionFileDeps` を、このファイルで定義する。単体テスト（規則の表・リンク・ほかの利用者が書ける・大きすぎる・壊れた UTF-8・`ENOENT` は空・Windows は持ち主と権限を見ない・**誤りの文に、設定に書いた `command` の文字列が入らないこと**）
      対象: `packages/server/src/extensions/extensionConfig.ts`（新規）、`extensionConfig.test.ts`（新規）、手本 `packages/server/src/commands/commandConfig.ts` `loadCommandsFile`・`parseCommandsJson`・`issueText`・`safeKeyName`（参照だけ）/ 根拠: research E1・X1、design「設定ファイル」
      依存: T1
      AC: AC2, AC34
      点検: あり
- [ ] T4: 行の切り出し `LineReader`: `push(chunk: Buffer)`・`next(): { kind: "line"; text; bytes } | { kind: "too_long"; bytes } | { kind: "bad_utf8"; bytes } | null`。改行（`\n`。直前の `\r` は除く）で切る。改行が無いまま `EXTENSION_LINE_MAX_BYTES` を超えたら、次の改行までを捨てて `too_long` を 1 回返す。空白だけの行は飛ばす。
      持つのは、切り出していない残りだけ（上限＋1 片）。単体テスト（片をまたぐ行・1 片に 1000 行・ちょうど 4 MiB と 1 バイト超・捨てている途中で片が続く・壊れた UTF-8・多バイト文字が片をまたぐ）
      対象: `packages/server/src/extensions/lineReader.ts`（新規）、`lineReader.test.ts`（新規）/ 根拠: design「`ExtensionProcess`」の「読む」、research E5（行で読む先例が無い）
      依存: T1
      AC: AC12
      点検: あり
- [ ] T5: 起動の引数・止め方・環境変数（純粋）: `extensionArgv`（POSIX は `["/bin/sh", "-c", command]`。Windows は `commandArgv` と同じ形）・`killTreeCommand`（Windows だけ `taskkill /pid <pid> /T /F`）・`EXTENSION_ENV_DROPPED`・`buildExtensionEnv`（design「`ExtensionProcess`」の頭）。
      `PANE_ENV_DROPPED` に `SODA_EXTENSION_ID`・`SODA_EXTENSION_SCOPE`・`SODA_PROJECT_ROOT`・`SODA_EXTENSION_RUN_ID` を足す。単体テスト（両方の `platform`・Windows は大文字小文字を区別せずに落とす・**結果のどの値にも、`SODACTL_TOKEN`・`SODA_PANE_ID`・`SODA_PANE_SOCKET`・`SODA_SERVER_URL`・`SODA_AGENT_REPORT_SOCKET` の元の値が含まれないこと**・`paneEnv.test.ts` に、足した 4 つが落ちること）
      対象: `packages/server/src/extensions/extensionLaunch.ts`（新規）、`extensionLaunch.test.ts`（新規）、`packages/server/src/session/paneEnv.ts:14` `PANE_ENV_DROPPED`、`packages/server/src/session/paneEnv.test.ts`、`packages/server/src/commands/commandLaunch.ts:21` `commandArgv`（参照）/ 根拠: research E7・X2・X12、design「`ExtensionProcess`」
      依存: T1
      AC: AC1, AC36
      点検: あり
- [ ] T6: `ExtensionProcess`（design「`ExtensionProcess`」の全部: 起動・読む〔`LineReader`・2 つの桶・`pause`〕・書く〔列・捨てる・まとめる・30 秒〕・標準エラーの輪の記録・止める・`exit` の後の掃き・`exited`）。偽の子 `FakeExtChild`（`pid`・`PassThrough` 3 本・`exit` を出す・合図を記録する）と、`ManualClock` の使い回しを `extensions/testing.ts` に。
      **最初に、実際の子プロセスのテストを 1 つ書いて、不確かな点 1 を確かめる**: `/bin/sh -c 'sleep 300 & exec sleep 300'` の形で孫を作り、`stop()` の後、子と孫の pid が、どちらも消えていること（`process.kill(pid, 0)` が `ESRCH`）。`win32` はスキップ。
      単体テスト（偽の子と時計）: 続けて 100 行は、すぐ処理され、101 行目は、桶が戻るまで `pause` されて、**捨てられずに**処理される／4 MiB 超の行で `onBadLine("line_too_long")`／列が 512 行を超えると、出来事が古いものから捨てられ、空いたら `ext.dropped` が入る／`ext.panes` は、書かれていない前の 1 つと置き換わる／捨てられない行が入らなければ止まる（`not_reading`）／`drain` が 30 秒来なければ止まる／
      `stop()` は、合図を無視する子でも 3 秒以内に返る／`stop()` を 2 回呼んでも同じ／`spawn` が投げたら `exited` が `spawn_failed`／子の `stdin` の `error`（`EPIPE`）で、例外が外へ出ない／終了コード 0 は `exited`・ほかは `crashed`／標準エラーは 200 行・1 行 4 KiB・制御文字の置き換え・あふれた数／**ロガーに、標準エラーの中身とコマンドが渡らないこと**（`MemoryLogger` を読む）
      対象: `packages/server/src/extensions/ExtensionProcess.ts`（新規）、`ExtensionProcess.test.ts`（新規）、`extensions/testing.ts`（新規）、手本 `packages/server/src/machine/MachineLink.ts`（`defaultSpawn`・`finish`・`error` の受け手）・`packages/server/src/machine/testing.ts`・`packages/server/src/display/rateLimit.ts` `TokenBucket` / 根拠: research E5・X10、design「`ExtensionProcess`」、不確かな点 1
      依存: T1, T4, T5
      AC: AC12, AC13, AC15
      点検: あり
- [ ] T7: 表示の面の台帳に、持ち主を足す（design「表示の面への追加」の、型と、決まりの表の 9 行）: `DisplayInfo.source?`・`DisplaySource`（protocol。`readDisplayInfo` が、形の合う `source` を通し、形の合わないものは落とす）、`Entry.owner?`、`set(…, opts?)`・`close(…, opts?)`・`list(…, opts?)`・`ownerOf`・`countOwned`・`ownedPanes`・`closeOwned`・`onOwnedEvent`。
      札つきの面の出来事は、pane の列に入れず、受け手へ（`seq` なし）。`onPaneClosed` で、札つきの面ごとに、受け手へ `display.closed`（`pane_closed`）。受け手の例外は、包んでログ。
      **札を付けない呼び出しの動きを変えない**: 既存の `DisplayService.test.ts`・`display.integration.test.ts` が、1 行も変えずに通ること。足すテストは、決まりの表の 1 行ごとに 1 つ（とくに: 札つきの `set` が、札の無い面・別の札の面の名前に当たると `invalid_display` で、面が変わらず、頻度の桶が減っていない／札なしの `set` が札つきの面を置き換えると、元の持ち主に `closed` が届き、`source` が外れる／札つきの面の `display.action` が、pane の `wait` に返らない）。
      表示の面の PR3 が main にあれば、`send(…, opts?: { owner })`（札の違う面は `display_closed`）も足す
      対象: `packages/server/src/display/DisplayService.ts`（`Entry` 65 行・`set` 135 行・`close` 210 行・`list` 219 行付近・`pushEvent` 441 行・`remove` 481 行・`onPaneClosed` 499 行）、`packages/server/src/display/DisplayService.test.ts`、`packages/protocol/src/display.ts` `DisplayInfo`・`readDisplayInfo`、`packages/protocol/src/display.test.ts` / 根拠: research E8・X13、design「表示の面への追加」
      依存: T1
      AC: AC5, AC9, AC10
      点検: あり
- [ ] T8: 拡張が呼べる操作の表 `ExtensionApi`（design「拡張が呼べる操作」の表と、処理の順 1〜8）: `createExtensionApi(deps: { displays; panes(ext): ExtPane[]; inScope(ext, paneId): boolean; logger })` が、`handle(ext, req: ExtRequest): ExtLine | null`（`id` が無ければ `null`）を返す。
      表は `ext.features`・`ext.panes`・`display.set`・`display.close`・`display.list`・`display.features`（表示の面の PR3 があれば `display.send`）。引数の検査は `packages/protocol` の `DisplaySetParams`・`DisplayCloseParams`・`DisplayListParams`・`DisplayFeaturesParams`（`/ws` と同じ schema）。
      `helloLine(ext, runId)`（`methods`・`events`・`display.features`〔許可で絞る〕・`limits`・`allow`・`onUnresponsive`）も、ここに置く。単体テスト: 表に無い名前・`display.wait` → `unsupported`／`id` なし → `null`（誤りのときも）／範囲の外 → `not_found`（無い pane と、同じ code・同じ文）／
      `allow` に `script-html` が無いときの `format: "script-html"` → `unsupported`、あるとき → 台帳の検査へ進む（PR3 が無ければ `invalid_display`）／`features` から `format:script-html`・`send` が除かれる／17 個目の面 → `display_limit`（同じ名前の置き換えは通る）／台帳が投げた `RpcError` の code がそのまま返る／ほかの例外 → `internal`（文は固定）／
      返事の文に入る `method` の名前は、決まった文字のときだけ
      対象: `packages/server/src/extensions/ExtensionApi.ts`（新規）、`ExtensionApi.test.ts`（新規）、`packages/protocol/src/messages.ts:491` 付近〜の `Display*Params`（参照）、`packages/server/src/display/DisplayService.ts`（T7 の口）/ 根拠: design「拡張が呼べる操作」「範囲と許可」
      依存: T1, T7
      AC: AC5, AC7, AC8, AC9, AC25, AC34
      点検: あり
- [ ] T9: 無効の記録と、ホスト（利用者の設定の分）: `ExtensionStateStore`（`<stateDir>/extension-state.json`。壊れていれば空として扱い、`problems` に 1 行）と、`ExtensionHost`（design「`ExtensionHost`」のうち、利用者の設定だけ: `reconcile` の 1・3〔無効の記録〕・4〜8、`startOne` の 1〜3・5〜8、`onExit`、きっかけの表、`start`・`stop`・`dispose`・`list`・`reload`・`restart`・`log`・`setEnabled`）。
      **プロジェクトの設定を読む処理・承認の検査は、入れない**（PR3 の T22。入れる場所に `// PR3（T22）` と書くだけ）。`inScope` は、利用者の拡張なら「pane が実在すれば真」。pane の一覧は、bus のイベント（design「きっかけ」の表）で、100ms まとめて作り直し、前と同じなら送らない。
      不確かな点 4（pane の移動で出るイベント）を、ここで読んで確かめる。`instanceKey("user", null, id)` と、変更の検知用の `entryDigest("", entry)` は、`approval.ts` に置く（PR3 が、同じ関数を使う）。
      単体テスト（偽の子・時計）: 起動で `ext.hello` → `ext.panes` の順／読み直しの 4 通り（足す・消す・変える・変えない＝`runId` が同じ）／`enabled: false`・無効の記録 → `disabled`／落ちた後の間隔 1・2・4・8 秒、5 回目で `failed`、60 秒動いた後は 1 秒へ戻る／終了コード 0 → `exited`（起動し直さない）／`reload`・`restart` で `failed`・`exited` から戻る／
      **`startOne` が、起動の直前に設定を読み直し、`digest` が違えば起動しない**（落ちた後・時間が来る前に、ファイルを書き換える）／`start()` を、止めずに 2 回呼んでも `spawn` は 1 回／`stop()` の後に来たタイマーは、何もしない／33 個目は `over_limit`／終わったら `closeOwned`／
      bus の受け手の中で例外が出ても、`bus.publish` の呼び出し元へ伝わらない／`extension.changed` は、同じ一覧なら出ない／`setEnabled` は、画面の種類でない接続から `invalid_params`
      対象: `packages/server/src/extensions/ExtensionStateStore.ts`（新規）、`ExtensionHost.ts`（新規）、`approval.ts`（新規。`entryDigest`・`instanceKey` だけ）、それぞれの `*.test.ts`、`packages/server/src/session/SessionService.ts:252` `snapshot`・`828` `commandContext`、`packages/server/src/persist/atomicFile.ts` `writeFileAtomic`、手本 `packages/server/src/machine/MachineManager.ts`・`packages/server/src/ask/AskService.ts:112` 付近（bus の購読）/ 根拠: research E3・E5・X5・X7・X8・X10・X23、design「`ExtensionHost`」「無効の記録」
      依存: T3, T6, T8
      AC: AC1, AC3, AC4, AC6, AC10, AC11, AC34
      点検: あり
- [ ] T10: `/ws` の方式と、組み立て: `registerExtensionMethods(surface, deps)`（T2 の 5 つ。`deps.extensions` が無ければ登録しない）、`MethodDeps.extensions?`、`registerAllMethods` から呼ぶ。`composeServer.ts` に、生成（`displays` の後。`internal.extensions` で `deps` を差し替えられる）・
      `listen()` の `await extensions.start()`（`void machines.start()` の前。**ロックの後**）と `catch` の `extensions.stop()`・`close()` の `await extensions.stop()`（`machines.stop()` の隣）と `extensions.dispose()`（`displays.dispose()` の前）・`pausePollers` の `await extensions.stop()`・`resumePollers` の `void extensions.start()`。
      **`paneOps.register` は足さない**。`clientError.ts` に足す code は、PR1 では無い。テスト（`composeServer` を、偽の `spawn` で立てる）: 5 つの方式が通る／`extension.setEnabled` は `external` の接続から `invalid_params`／`pane.sock` へ `extension.list`・`extension.setEnabled` を送ると `unknown_op`／
      `extension.changed` のフレームに、`data` の項目が無い／`extension.list` の結果の JSON に、利用者の拡張の `command` の文字列が無い／`listen()` が途中で失敗したとき、起動した拡張が止まる
      対象: `packages/server/src/surface/methods/extension.ts`（新規）、`packages/server/src/surface/methods/index.ts`・`deps.ts`、`packages/server/src/composeServer.ts`（生成 350 行の後・`registerAllMethods` 429 行・`pausePollers` 524 行・`resumePollers` 530 行・`listen` 773 行と `catch` 774 行付近・`close` 813 行・847 行）、手本 `packages/server/src/surface/methods/command.ts:16` 付近 / 根拠: research E6・X11・X14、design「`/ws` の方式とイベント」「組み立て」
      依存: T2, T9
      AC: AC1, AC4, AC14, AC15, AC23
      点検: あり
- [ ] T11: 結合テスト（実際の子プロセス。`win32` はスキップ）: `composeServer` を立て、状態ディレクトリに `extensions.json` を書いて、テストが一時ディレクトリに書いた `.mjs` を `process.execPath` で起動する。helper（設定を書く・拡張の `.mjs` を書く・一覧が、ある状態になるまで待つ）を、このファイルの中に置く。
      見ること: (1) 環境変数と作業ディレクトリを書き出す拡張 → id・種類があり、token・`SODA_PANE_ID`・受け口のパスが無い（AC1）(2) 読み直しの 4 通りを、実際の pid で（AC3）(3) `display.set` が台帳に載り、`pane.sock` の `display.list` に見え、結果が `/ws` の `display.set` と同じ項目を持つ。面への `display.action`（テストの画面の接続から）が、拡張に行で届く（AC5）
      (4) pane を足す・消すと `ext.panes` の行が届く（AC6）(5) 知らない操作に `unsupported` が返り、拡張は動き続ける。`id` なしには返事が来ない（AC7）(6) 拡張の面を、`pane.sock` の `display.list` は見える・`display.wait` に操作が返らない／拡張の `display.list` に、`pane.sock` で出した面が無い・`display.close` で閉じられない・同じ名前の `set` が誤り（AC9）
      (7) 拡張を落とすと、その面だけが消え、`pane.sock` で出した面は残る（AC10）(8) 落ち続ける拡張を動かしながら、pane の echo が通る（AC11）(9) 合図を無視して孫を作る拡張を、無効にすると、子と孫の pid が消える。`close()` の後、どの拡張の pid も残っていない（AC13）
      (10) 標準エラーに目印の文字列を書く拡張 → `extension.log` で読め、**`server.log` に、目印の文字列と、設定に書いたコマンドの文字列が無い**（AC15）(11) 同じ状態ディレクトリで 2 つ目の `composeServer` の `listen()` は、ロックで失敗し、拡張の印のファイルを作らない（AC1）(12) 面の数は、`pane.sock` の分と合わせて数えられる（拡張 2 ＋ `pane.sock` 2 で、次のパネルが `display_limit`）（AC5）
      対象: `packages/server/src/extensions/extensions.integration.test.ts`（新規）、手本 `packages/server/src/display/display.integration.test.ts`・`packages/server/src/machine/machines.integration.test.ts`（`describe.skipIf(win32)`・`internal` の差し替え）/ 根拠: design「受け入れ基準との対応」
      依存: T10
      AC: AC1, AC3, AC5, AC6, AC7, AC9, AC10, AC11, AC13, AC15
- [ ] T12: `sodactl ext`（design「`sodactl ext`」の表）: `list`・`log <id|key>`・`reload`・`restart <id|key>`。`/ws` の経路だけ。先に `extension.list` を呼び、`not_found`（知らない方式）なら `{"status":"unsupported","reason":…}` で終了コード 0。`<id|key>` は、`key` の完全一致 → `id` が 1 つに決まるもの → 2 つ以上は使い方の誤り（終了コード 2・候補の `key`）→ 無ければ `not_found`（終了コード 1）。
      `USAGE_LINES`・`Command`・`parseCommand`・`main.ts` の switch と `printHelp`・`SKILL.md`（同じコミットで）。**承認・取り消し・有効と無効のサブコマンドは作らない**。テスト（引数の解釈・古いサーバ・id の重なり・`USAGE_LINES` に `approve`・`deny`・`revoke`・`enable`・`disable` が無いこと）
      対象: `packages/cli/src/commands/ext.ts`（新規）、`packages/cli/src/cliArgs.ts` `USAGE_LINES`・`Command`・`parseCommand`、`packages/cli/src/main.ts`、`packages/cli/skills/sodactl/SKILL.md`、`packages/cli/src/skill.test.ts`（通ること）、手本 `packages/cli/src/commands/display.ts`（`unsupported` の出し方）/ 根拠: research X18、`20261007-soda-extensions/research.md` R7、design「`sodactl ext`」
      依存: T10
      AC: AC16
- [ ] T13: 起動確認に段を足す: `handoffSmoke.ts` — 状態ディレクトリに `extensions.json`（起動のたびに、自分の pid と、起動した孫〔`sleep`〕の pid を、決まったファイルへ追記する拡張）を置いて起動 → 拡張が動いている → `soda handoff` → **前の拡張と孫の pid が消えていて、新しい pid で動いている**。
      `stopSmoke.ts` — 同じ拡張を動かして `soda session stop` → 拡張と孫の pid が消えている。pid の再利用を避けるため、確かめは、止めた直後に行う（既存の `isAlive`・`until` を使う）。不確かな点 2 の結果を `decisions.md` に 1 行
      対象: `packages/server/src/handoffSmoke.ts`（`main()` の段・`isAlive` 56 行付近）、`packages/server/src/stopSmoke.ts` / 根拠: research E6・E9・X20、design「受け入れ基準との対応」AC14
      依存: T10
      AC: AC14
- [ ] T14: 文書と見本（PR1 の分）: `docs/examples/extension-hello.mjs`（design「文書と見本」のとおり）と、`docs/extensions.md` の節「拡張とは」「置き場所と書き方」（利用者の設定だけ。プロジェクトの分は「後の版」と書かず、PR3 で足す）「やり取り（1 行 1 JSON）」「操作と出来事の一覧」「上限」「見本」「`sodactl ext`」「安全と限界」（PR1 の時点の分: 隔離しない・環境変数は見える・標準入力が閉じたら終わる決まり・異常終了で残りうる・面の名前のぶつかり・面の数は合わせて数える）「新旧の組み合わせ」「Windows」（実機では確かめていない）。
      `docs/sodactl.md` に `sodactl ext` の節。`AGENTS.md` の頭の案内に 1 行（「- 拡張（設定に登録したプログラムを Sodashitsu が動かす。置き場所と書き方・やり取りの型・上限・安全と限界・`sodactl ext`）は `docs/extensions.md`。」の形）。
      結合テストに 1 つ足す: **文書の見本と同じファイル**（`docs/examples/extension-hello.mjs`）を起動して、pane に帯 `hello` が載ること・標準入力を閉じる（無効にする）と、強制終了を待たずに終わること（AC32）
      対象: `docs/extensions.md`（新規）、`docs/examples/extension-hello.mjs`（新規）、`docs/sodactl.md`、`AGENTS.md:7-17` の箇条書き、`packages/server/src/extensions/extensions.integration.test.ts` / 根拠: research E9、design「文書と見本」、手本 `docs/custom-commands.md`
      依存: T11, T12
      AC: AC32, AC33

### PR2: 設定の画面

- [ ] T15: ブラウザの状態と通信: `store/extensions.ts`（design「ブラウザ」の項目）と `ExtensionController`（接続のたびに `extension.list`。`not_found` なら `supported = false`／`extension.changed` で取り直し、重なったら最後の 1 回／マシンの切り替えで捨てる／操作 `reload`・`restart`・`log`・`setEnabled`）。`StoreAdapter` で `extension.changed` を振り分け、`main.ts`・`injection.ts` に配線。
      `ActionDispatcher.reloadConfig()` が、`command.reload` に続けて `extension.reload` を呼ぶ（`not_found` は黙って無視。トーストの文は変えない）。純粋な `extensionView.ts`（状態 → 文・`lastExit` → 文・並べ方）と単体テスト
      対象: `packages/web/src/store/extensions.ts`（新規）、`packages/web/src/extensions/ExtensionController.ts`（新規）、`packages/web/src/extensions/extensionView.ts`（新規）と `extensionView.test.ts`、`packages/web/src/store/StoreAdapter.ts:177` 付近〜、`packages/web/src/main.ts`、`packages/web/src/injection.ts`、`packages/web/src/actions/ActionDispatcher.ts:1471` `reloadConfig`、手本 `packages/web/src/store/agentIntegrations.ts`・`packages/web/src/ask/AskController.ts` / 根拠: research E9・X15・X17、design「ブラウザ」
      依存: T10
      AC: AC27
- [ ] T16: 節「拡張」の部品（design「ブラウザ」の `ExtensionSettings.vue`）: 説明・置き場所・［読み直す］・`supported === false` の文・`problems`・一覧（id・種類の印と根・作者の説明・許可・応答しないとき・状態の文・入切〔`role="switch"`〕・［起動し直す］・［ログ］）・ログの開閉（`<pre>` に `textContent`。［更新］）。
      `SettingsDialog.vue` の `.settings-body` の直下に置く（左のメニューが拾う）。**作者の説明・id・パスは、`v-html` を使わない**。操作中の行は、ボタンを押せなくする（二重押し）。この時点では、プロジェクトの行のボタン（［確認］［承認を取り消す］）は無い（PR3 の T26）
      対象: `packages/web/src/components/ExtensionSettings.vue`（新規）、`packages/web/src/components/SettingsDialog.vue`（`.settings-body` の直下。「エージェント連携」1241 行付近の近く）、手本 `packages/web/src/components/KeySettings.vue`（節を別の部品に分けた先例）/ 根拠: research E9・X15、design「ブラウザ」
      依存: T15
      AC: AC27
- [ ] T17: 「続けて落ちた」の知らせ: `ExtensionController` が、前の一覧で `failed` でなかった拡張が `failed` になったら、ふつうのトースト（「拡張『<id>』が続けて落ちたので止めました（設定 › 拡張）」）を出す。接続し直した直後の最初の一覧では、出さない（前の一覧が無い）。単体テスト（一覧の前後から、出すべき知らせを返す純粋な関数として）
      対象: `packages/web/src/extensions/ExtensionController.ts`、`packages/web/src/extensions/extensionView.ts`（`newlyFailed(prev, next)`）、`packages/web/src/store/view.ts:755` 付近 `toast`（呼ぶだけ）/ 根拠: research X16、design「ブラウザ」の「知らせ」
      依存: T15
      AC: AC30
- [ ] T18: E2E（設定の画面）: helper `support/extensions.ts`（状態ディレクトリに `extensions.json` を書く・拡張の `.mjs` を一時ディレクトリに書く・`process.execPath` でコマンドを組む・実行の印のファイルを読む）。spec: (1) 利用者の拡張を登録して［読み直す］→ 行が「動作中」になる（DOM）(2) 拡張を落とす（拡張が、決まったファイルが出来たら終了コード 1 で終わる）→ 開いたままの節で、状態が変わり、5 回で「続けて落ちたので止めた」と、トースト。**`document.activeElement` が変わらない** (3) 入切を切る → 「無効」。サーバを立て直しても「無効」のまま
      (4) ［ログ］で、標準エラーの目印の文字列が `<pre>` に出る（`<b>` を書いても、文字のまま）(5) **ブラウザが受けたフレーム（`framereceived`）のどれにも、設定に書いたコマンドの目印の文字列が無い** (6) 既存のキーの操作「設定を読み直す」で、足した拡張が一覧に出る (7) 節の入切・ボタンに `Tab` で届き、`Space`・`Enter` で押せる
      対象: `packages/e2e/src/specs/extensions-settings.spec.ts`（新規）、`packages/e2e/src/support/extensions.ts`（新規）、手本 `packages/e2e/src/specs/settings.spec.ts`（`openSettingsByKey`）・`packages/e2e/src/support/appServer.ts`（`stateDir`・`restart`）/ 根拠: research E9・X19、`.aidev/conventions/e2e-observe-browser.md`
      依存: T16, T17
      AC: AC27, AC30
- [ ] T19: 文書（PR2 の分）: `docs/extensions.md` に節「設定の画面」（一覧・状態の意味・入切は session ごとにサーバが覚える・ログ・読み直し）。`docs/tui-parity.md`「3. Web 版だけの拡張」の表に 1 行（拡張の一覧・承認: 対象外。端末版は面を出せないので。利用者の設定の拡張は、端末版だけでも動く）
      対象: `docs/extensions.md`、`docs/tui-parity.md`（表の末尾。W32 の行が手本）/ 根拠: research E9・X21
      依存: T16
      AC: AC33

### PR3: プロジェクトの設定と承認

- [ ] T20: プロジェクトの根と、設定の読み方: `resolveProjectRoot(cwd, deps)`（`findGitRoot` → `realpath` → 絶対パス・1024 文字以下・禁止する文字なし。2 秒の上限。**git のコマンドを呼ばない**）と、`loadProjectExtensionsFile(root, deps?)`（design「設定ファイル」の 1〜5: `.soda` がリンクでないディレクトリ・`O_NOFOLLOW`・fd の `stat` で通常ファイルと大きさ・`realpath` が決まった場所・同じ fd から読む・3'（Unix: 根・`.soda`・ファイルの持ち主が自分で、other が書けない。グループが書けるなら `groupWritable`））。不確かな点 6。
      単体テスト（一時ディレクトリに本物のファイルを作る）: ふつうのリポジトリ／linked worktree（`.git` がファイル）→ worktree の根／git の外 → `null`／根がリンク越し → 実体のパス／`.soda` がリンク → 誤り／`extensions.json` がリンク → 誤り／FIFO → 止まらずに誤り／64 KiB 超 → 誤り／`cwd` を書いた 1 件 → 誤り／ファイル・`.soda`・根のどれかが other から書ける（`chmod o+w`）→ 誤り／グループが書ける → 読めて `groupWritable: true`／持ち主が自分でない（偽の `getuid`）→ 誤り／根のパスに改行・書字方向の制御 → `null`／
      **`PATH` の先頭に、呼ばれたら印のファイルを作る偽の `git` を置いて、印が出来ないこと**
      対象: `packages/server/src/extensions/projectRoot.ts`（新規）、`projectRoot.test.ts`（新規）、`packages/server/src/extensions/extensionConfig.ts`（`loadProjectExtensionsFile` を足す）、`extensionConfig.test.ts`、`packages/server/src/session/workspaceLabel.ts:55` `findGitRoot`（呼ぶだけ。変えない）/ 根拠: research E3・X6、design「プロジェクトの根」「設定ファイル」、脅威 S1・S6
      依存: T3
      AC: AC17, AC28
      点検: あり
- [ ] T21: 鍵と、承認の記録: `entryDigest(root, entry)`（T9 で作ったものを、design「鍵と、承認の記録」の入力と一致させる: `{ v, root, id, command, description, enabled, allow, onUnresponsive, cwd }` の順）・`ApprovalStore`（`load`・`lookup`・`decide`・`revoke`。根の `extension-approvals.json`。読むときの検査・**だめなら記録なし**・(根, id) ごとに 1 件・読み直してから書く・256 件）。
      単体テスト: 1 件の項目ごとに 1 文字変えると `digest` が変わる表（`id`・`command`・`description`・`enabled`・`allow`・`onUnresponsive`）と、根が違うと変わること・ファイルの体裁（空白・項目の順）では変わらないこと／`lookup` の 3 通り（同じ → `status`・違う → `none` と `previous`・無い → `none`）／壊れた JSON・知らない項目・リンク・ほかの利用者が書ける → 記録なし／
      257 件目で、古いものから捨てる／2 つの `ApprovalStore`（別の session のつもり）が、交互に `decide` しても、互いの記録を消さない（読み直してから書く）／書いたファイルの権限が 0600
      対象: `packages/server/src/extensions/approval.ts`、`ApprovalStore.ts`（新規）、それぞれの `*.test.ts`、`packages/server/src/persist/atomicFile.ts` `writeFileAtomic`、手本 `packages/server/src/machine/MachineCatalog.ts`（根に置く・`loadCatalog`・`saveCatalog`）/ 根拠: research E2・X4・X5、design「鍵と、承認の記録」、脅威 S3・S18
      依存: T9
      AC: AC19, AC20, AC34
      点検: あり
- [ ] T22: ホストに、プロジェクトの分を足す: `reconcile` の 2（workspace → 根の覚え → 根ごとに `loadProjectExtensionsFile`。33 個目からは `problems`）・3（承認の記録）・4 の `pending`・`denied`、**`startOne` の 3（プロジェクトの読み直し）と 4（承認の記録の読み直し）**、`inScope`（`commandContext` → workspace → 根。**要求のたび**）、pane の一覧を作り直すときの、範囲の外の面の `closeOwned` と `display.closed`（`out_of_scope`）、
      `approve`・`deny`・`revoke`（`isScreenKind`・`digest` の一致・`extension_stale`）、`ExtensionInfo.approval`（`digest`・`status`・`command`・`cwd`・`groupWritable`・`decidedAt`・`previous`）、作業ディレクトリ（根）と `SODA_PROJECT_ROOT`。起動のときの workspace は `snapshot()` から読む（復元は bus に出ない）。
      単体テスト（偽の子・時計・一時ディレクトリ）: 記録なし → `pending` で `spawn` が呼ばれない／`approve` → 動く／`deny` → `denied`・`spawn` なし／`revoke` → 止まって `pending`／古い `digest` の `approve` → `extension_stale`・記録は書かれない／**承認 → ファイルを書き換え → 拡張を落とす → 時間を進める → `spawn` が呼ばれず `pending`**（AC21）／
      **`spawn` へ至るきっかけを 1 つずつ**（`start`・`workspace.created`・`reload`・`restart`・`setEnabled(true)`・`deny` の後の `restart`・`revoke` の後の `restart`・`stop` → `start`〔入れ替えの失敗からの再開〕・上限の空き）で、承認が無ければ `spawn` が呼ばれないこと（AC18）／`enabled: false` で未承認 → `disabled`（`pending` ではない。`approve` は `not_found`）／承認 → 別の中身に書き換え（`pending`）→ **承認した中身へ戻す → 聞き直されずに動く**／画面の入切で切って入れ直しても、承認は保たれる／動いている拡張が 32 のとき、順が前の拡張を足しても、動いているものは止まらず、足したものが `over_limit`／
      最後の workspace が消えると止まり、一覧から消える。記録は残る／範囲: 別の根の workspace の pane → `not_found`、`ext.panes` に出ない、根の無い workspace の pane → 外／画面の種類でない接続の `approve`・`deny`・`revoke` → `invalid_params`
      対象: `packages/server/src/extensions/ExtensionHost.ts`（T9 の `// PR3（T22）` の場所）、`ExtensionHost.test.ts`、`ExtensionApi.ts`（`inScope` を渡す所）、`packages/server/src/session/SessionService.ts:828` `commandContext`・`252` `snapshot` / 根拠: design「`ExtensionHost`」「範囲と許可」、脅威 S1〜S5・S10・S23
      依存: T20, T21
      AC: AC17, AC18, AC19, AC20, AC21, AC22, AC24, AC25, AC26
      点検: あり
- [ ] T23: protocol と `/ws` の方式（承認）: `extension.approve`・`extension.deny`（`{ key, digest }`。`digest` は 16 進 64 文字）・`extension.revoke`（`{ key }`）を `METHOD_SCHEMAS`・`MethodResultMap` と `registerExtensionMethods` に足す。エラーの code `extension_stale` を `errors.ts` と `clientError.ts`（「登録が変わりました。中身を確かめ直してください」）に。`composeServer.ts` で、`ExtensionHost` に `sessionRoot` が渡っていることを確かめる。
      テスト: 3 つの方式が通る／`external` の接続から `invalid_params`／中継越し（`viaBridge`）の、画面の種類の接続からは通る／**`pane.sock` へ `extension.approve`・`extension.deny`・`extension.revoke` を送ると `unknown_op`**／`extension.list` の結果に、プロジェクトの拡張の `approval.command` があり、利用者の拡張には `approval` が無い
      対象: `packages/protocol/src/messages.ts`、`packages/protocol/src/errors.ts`、`packages/client-core/src/net/clientError.ts:96` 付近、`packages/server/src/surface/methods/extension.ts`、`packages/server/src/composeServer.ts`、テストは `packages/server/src/extensions/extensions.integration.test.ts` か `surface` の既存のテストの流儀 / 根拠: research E4・X9・X14、design「`/ws` の方式とイベント」、脅威 S9
      依存: T22
      AC: AC22, AC23
      点検: あり
- [ ] T24: 安全の結合テスト（実際の子プロセス・一時のリポジトリ。`win32` はスキップ）: helper（一時ディレクトリに `.git/HEAD` と `.soda/extensions.json` を作る・コマンドは「印のファイルを作る」拡張・workspace を、その場所で作る）。
      見ること: (1) workspace を作る → 一覧に `pending`。**印のファイルが無い**。サーバを立て直す・`extension.reload`・`extension.restart`・`setEnabled` の後も、無い（AC17・AC18）(2) 画面の接続から `approve` → 印が出来る。サーバを立て直しても動く（聞き直されない）。**同じ `sessionRoot` で別の `stateDir`（別の名前付き session）のサーバでも、動く**（AC19）
      (3) 登録の項目を 1 つずつ変えて `reload` → 止まって `pending`。同じファイルの別の拡張は、同じ pid のまま（AC20）。リポジトリを別の場所へ写して workspace を作る → `pending`（AC20）(4) 承認 → ファイルを書き換え（読み直さない）→ 拡張を落とす → 起動し直されず `pending`（AC21）(5) `deny` → 印が出来ない・`pending` でない。後で `approve` → 動く。`revoke` → pid が消えて `pending`（AC22）
      (6) 2 つのリポジトリの workspace で、片方の拡張が、他方の pane へ `display.set` → `not_found`。`ext.panes` に、他方の pane が無い。pane を、他方の workspace へ移すと、面が消え、拡張に `display.closed`（`out_of_scope`）（AC24）(7) `allow` なしの `script-html` → `unsupported`（利用者・プロジェクトの両方）。`allow` を足すと `pending` に戻る（AC25・AC20）
      (8) 最後の workspace を消すと、pid が消え、一覧から消える。作業ディレクトリが根で、環境変数に `SODA_PROJECT_ROOT`（AC26）(9) `.soda` がリンク・`extensions.json` がリンク・`cwd` つき → 一覧に理由が出て、印が出来ない（AC28）(10) 承認の記録を壊す → 全部が `pending`（動く側に倒れない）
      対象: `packages/server/src/extensions/extensions.integration.test.ts` / 根拠: design「受け入れ基準との対応」、脅威 S1〜S6・S10・S11・S18
      依存: T23
      AC: AC17, AC18, AC19, AC20, AC21, AC22, AC24, AC25, AC26, AC28
- [ ] T25: 画面の純粋な部分: `approvalView.ts` — `diffEntry(previous, current)`（変わった項目だけ。`allow` は並びを無視）・`hasNonAscii(s)`・`showPath(s)`（禁止する文字を `\u{…}` に）・`allowText(allow)`・`nextPending(list, afterKey)`（次の 1 件）・`pendingNotice(list, notified)`（知らせを出すべき `key:digest` と件数。`disabled` は入らない）。単体テスト
      対象: `packages/web/src/extensions/approvalView.ts`（新規）、`approvalView.test.ts`（新規）/ 根拠: design「ブラウザ」
      依存: T15
      AC: AC29, AC30
- [ ] T26: 承認のダイアログと、知らせ（design「ブラウザ」の `ExtensionApprovalDialog.vue` と「知らせ」の全部）: 別の `<dialog>`・`showModal()`・`view.setExtensionApprovalOpen`（`modalOpen` に入れる）・背景で閉じない・`Esc` は［後で］・中身 1〜8（**全部 `textContent`。`v-html` を使わない**。コマンドの `<pre>` に、高さの上限・内側のスクロールを付けない。ボタンは中身の後ろ）・
      開いたら［承認しない］へフォーカス・［承認して動かす］は 1 秒 `disabled`（中身が替わったら、やり直す）・`extension_stale` と `digest` の変化で描き直す・1 件を決めたら次へ・閉じたら `restoreFocus`。**開くのは `store.dialogKey` が入ったときだけ**（`extension.changed` では開かない）。
      節「拡張」の、プロジェクトの行に［確認］（`pending`・`denied`）と［承認を取り消す］（承認済み）。承認待ちの、消えないトースト（1 つ・件数・［確認する］・0 件で消す・閉じたものは出し直さない）。`App.vue` に置く
      対象: `packages/web/src/components/ExtensionApprovalDialog.vue`（新規）、`packages/web/src/components/ExtensionSettings.vue`、`packages/web/src/extensions/ExtensionController.ts`、`packages/web/src/store/extensions.ts`、`packages/web/src/store/view.ts`（`modalOpen` 382 行付近・`setAskOpen` の隣）、`packages/web/src/App.vue:109` 付近、手本 `packages/web/src/components/AskDialog.vue`（`showModal`・`onNativeCancel`・`restoreFocus` 129 行付近）/ 根拠: research E9・X16、design「ブラウザ」、脅威 S7・S8・S19
      依存: T23, T25
      AC: AC29, AC30, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
      点検: あり
- [ ] T27: 出どころの表示（**表示の面の PR2 が main に入ってから**。不確かな点 5）: パネルの見出し・帯の端の、固定のラベルを、`DisplayInfo.source` があれば「拡張『<id>』の表示（利用者｜プロジェクト）」にする。無ければ、今までのラベル。文字として出す。単体テスト（ラベルの文を返す純粋な関数）
      対象: 未特定（表示の面の PR2 が作る、パネル・帯の見出しの部品。`20261007-soda-extensions/tasks.md` の T12 の `対象` を見る）/ 根拠: research X22、design「ブラウザ」の「出どころの表示」
      依存: T7, T26
      AC: AC31
- [ ] T28: E2E（承認）: spec — 一時のリポジトリ（`.git/HEAD`・`.soda/extensions.json`。コマンドは、印のファイルを作って動き続ける `.mjs`）で workspace を作る。
      (1) 消えないトースト（件数 1・［確認する］）が出る。**`document.activeElement` は、出る前と同じ**。ダイアログは、開いていない（AC30・AC-I1）(2) ［確認する］で開く。根・設定ファイルのパス・id・コマンドの全文（`<b>x</b>` を含む 1024 文字のコマンドが、`<pre>` の `textContent` に全部あり、`<b>` の要素が無い・`<pre>` の `scrollHeight` が `clientHeight` と等しい）・作業ディレクトリ・固定の文言 2 つ・`allow`（なし）・`onUnresponsive`・「作者が書いた説明」の見出し・ASCII でない文字の注意が出る（AC29）
      (3) 開いた直後のフォーカスは［承認しない］。［承認して動かす］は `disabled` で、時計を 1 秒進めると押せる。**開いた直後に `Enter` を 2 回打っても、承認にならない**（印が無い。状態は `denied`）（AC-I4・S8）(4) 設定の節から［確認］で開き直し、［承認して動かす］→ 行が「動作中」になり、印が出来る。**ブラウザが送ったフレームの `extension.approve` の `digest` が、受けた `extension.list` の `approval.digest` と同じ**（AC29・AC-I2）
      (5) 登録を書き換えて［読み直す］→ トーストが出て、ダイアログに「前に承認した登録からの変更」（前と後）（AC29）(6) ダイアログを開いたまま、登録を書き換えて読み直す → 「登録が変わりました」と出て、中身が替わり、［承認して動かす］が、また 1 秒 `disabled`（AC-I2）(7) `Esc` で閉じると、`pending` のまま・印が無い・フォーカスが、開く前の場所へ戻る（AC-I1・AC-I4）
      (8) キーボードだけで: トーストの［確認する］へ `Tab` → `Enter` → `Tab` でボタンを巡る → `Enter`（AC-I3）(9) 設定の画面を開いたまま、ダイアログを開いて閉じると、設定が残っている。開いている間に打ったキーが、端末へ届かない（ブラウザが送った入力のフレームが無い）（AC-I5）(10) 承認待ちが 2 件のとき、1 件を決めると、次の 1 件に替わる。「すべて承認」のボタンが無い（AC-I1・AC29）
      (11) （表示の面の PR2 が main にあれば）承認した拡張が出したパネルが、ブラウザに出て、固定のラベルに、拡張の id と「プロジェクト」が出る。中身・題に何を書いても、ラベルは変わらない（AC31）。PR2 が無ければ、この項は `test.fixme` にして、理由を書く
      対象: `packages/e2e/src/specs/extensions-approval.spec.ts`（新規）、`packages/e2e/src/support/extensions.ts` / 根拠: `.aidev/conventions/e2e-observe-browser.md`、design「ブラウザ」、脅威 S7・S8
      依存: T26, T27
      AC: AC29, AC30, AC31, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [ ] T29: 起動確認と文書（PR3 の分）: `handoffSmoke.ts` に段 — 一時のリポジトリで workspace を作り、承認していない拡張の印のファイルが、**`soda handoff` の後も無い**（AC18）。`docs/extensions.md` に節「プロジェクトの拡張と承認」（置き場所・`cwd` は書けない・承認の流れ・鍵に入るもの・扱える pane の範囲・寿命・`allow`・承認の取り消し・承認の記録の場所）と、
      「安全と限界」の残り（スクリプトの中身は鍵に入らない・同じ場所の差し替え・接続の種類は境界でない・承認の記録は同じ利用者が書ける・`sodactl` からは承認できない・別のマシン）。`AGENTS.md` の案内の行に、承認を足す
      対象: `packages/server/src/handoffSmoke.ts`、`docs/extensions.md`、`AGENTS.md` / 根拠: design「脅威と対策」の「残る限界」
      依存: T24
      AC: AC18, AC33
- [ ] T30: 負の対照（**test 工程で消化する**。PR ごとに、その PR の守りの分）: 守りだけを外して、対応するテストが落ちることを確かめ、戻す。落ちたときの生の出力を `test-result.md` に貼る。
      PR1 — (d) T7 の持ち主の検査（札つきの出来事を、pane の列にも入れる／札つきの `close` が、札を見ない）を外す → T7・T11 (6) が落ちる。(e) T6 の、グループへの合図（子の pid へだけ送る）と、`exit` の後の掃きを外す → T6 の実際の子のテスト・T11 (9) が落ちる。
      PR3 — (a) `startOne` の 4（承認の記録の検査）を外す → T22・T24 (1) が落ちる。(b) `startOne` の 3（読み直して `digest` を比べる）を外す → T22・T24 (4) が落ちる。(c) `inScope` を、いつも真にする → T22・T24 (6) が落ちる。(f) `approve` の `isScreenKind` を外す → T23 が落ちる。
      **落ちなければ、テストを書き直す**（`regression-negative-control.md`）
      対象: `packages/server/src/extensions/ExtensionHost.ts`・`ExtensionProcess.ts`・`packages/server/src/display/DisplayService.ts`（外して、戻す）、`.aidev/works/20261007-ext-host/test-result.md`（新規）/ 根拠: `.aidev/conventions/regression-negative-control.md`
      依存: T11, T24
      AC: AC35
