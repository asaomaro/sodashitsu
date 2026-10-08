# タスク: soda 拡張の登録と起動 — 設定に登録したプログラムを Sodashitsu が動かし、標準入出力の NDJSON でやり取りする

実装するのは、この文書を読む別のエージェント。**読む順**: この `tasks.md` → `design.md`（設定の形・型と定数・操作の表・`ExtensionProcess`・`ExtensionHost`・脅威の表 S1〜S26 は、そこが正）→ `requirements.md`（AC の本文）→ `research.md`（既存の作りの事実 E1〜E9・実装アンカー X1〜X23・実装時の注意）。
`decisions.md` の K1〜K14 は、**利用者が、すべて勧める案で確定した**（2026-10-08）。`script-html` と、サーバの設定 `displayScriptEnabled` の関係は、`decisions.md` D8。
**範囲の外**（観測・割り込み・端末版・`sodactl` からの承認・表示の面の枠と静的ページ・`.aidev/works/20261007-soda-extensions/` の文書）には、手を出さない。

## PR の分け方

差分が 65 ファイル前後（テスト込み）になる見込みなので、**PR を 3 つに分ける**。順に積み、前の PR だけで動く（後ろを待たない）。

| PR | 中身 | タスク | これだけで出来ること | 表示の面への依存 |
|---|---|---|---|---|
| **PR1: サーバと、利用者の設定の拡張** | protocol・設定の読み込み・プロセス・ホスト・台帳の持ち主（`display.send` を含む）・出どころの表示・`/ws` の方式・`sodactl ext`・起動確認・文書と見本 | T1〜T14・T27 | 利用者の設定に登録した拡張が動き、`display.*`（`send` を含む）を呼べ、パネルのラベルに拡張の id が出て、`sodactl ext` で状態とログが見える | なし（PR2・PR3 とも main にある） |
| **PR2: 設定の画面** | ストア・通信の係・節「拡張」・落ちたときの知らせ・E2E・文書 | T15〜T19 | 画面で、一覧・状態・入切・起動し直し・ログ | なし |
| **PR3: プロジェクトの設定と承認** | プロジェクトの根・設定の読み方・鍵・承認の記録・範囲・`/ws` の承認の方式・承認のダイアログ・知らせ・E2E・起動確認・文書 | T20〜T26・T28・T29（T30 は test 工程） | リポジトリの中の拡張を、承認して動かせる | なし |

- aidev の work は 1 つのまま（この `tasks.md`）。ブランチは `feature/ext-host` から、PR ごとに切る（例: `feature/ext-host-1-server`・`-2-settings`・`-3-approval`）。PR2 は PR1 の上、PR3 は PR2 の上に積む。
- **独立レビュー（差分全体。実装とは別のコンテキスト）は、PR ごとに掛ける**。PR1 と PR3 のレビューは、**攻める側の目**で（脅威の表 S1〜S26 を、1 行ずつ、コードで確かめる。PR1 は、あわせて、`DisplayService.ts` の差分が「足した行だけ」で、設定・冷却の検査が動いていないことを見る）。`aidev` の test・review・deliver を PR ごとに回すか、PR2・PR3 を別の work に切り出すかは、実装を監督するセッションが決めて `decisions.md` に書く
  （勧める: PR2・PR3 を始める前に `aidev new` で別の work に切り出し、この `tasks.md` の該当のタスクを写す。1 work 1 PR の決まりに合う。表示の面の作業と同じ進め方）。
- **PR1・PR2 は、プロジェクトの設定を読まない**（読む処理そのものが PR3）。PR1・PR2 の時点で、リポジトリの中の `.soda/extensions.json` は、存在しても何も起きない。**PR1・PR2 に、プロジェクトの設定を読む処理を、先回りして入れない。**
- **利用者の決定**: K1〜K14 は、すべて勧める案で確定した（`decisions.md`）。実装は、PR1 → PR2 → PR3 の順。
- **表示の面のファイルを触るのは、T7（`DisplayService.ts`・`protocol/src/display.ts`）と T27（`displayLabel.ts`）と T14（`docs/display.md` に 1 節）だけ**。足すだけにする（既存の行を並べ替えない・既存の口の引数の意味を変えない・既存のテストを変えない）。

## main の表示の面に合わせた点（2026-10-08。main の `1ff0418`）

表示の面の PR2（画面）・PR3（`script-html`・`display.send`）は、**main に入っている**。この文書の行番号は、`1ff0418` を取り込んだ時点のもの（着手の前に `git fetch` して、ずれていたら、名前で探す）。

- **`script-html` を拡張が出せる条件は、2 つとも**: (1) 登録の `allow: ["script-html"]`（`ExtensionApi` が見る。無ければ、台帳を呼ばずに `unsupported`）(2) サーバの設定 `displayScriptEnabled`（**台帳 `DisplayService` が、`set`・`send` の中で見る**。無効なら `display_script_disabled`。既定は無効）。
  **`ExtensionHost`・`ExtensionApi` は、設定を読まない・変えない・検査を飛ばさない**（台帳の `set`・`send` を、`/ws`・`pane.sock` と同じ入口から呼ぶだけ）。`prefs.set` を呼ぶコードを、`extensions/` に書かない。
- **`display.send` は PR1 に入れる**（前の版の T31 は、T7〔台帳の持ち主の検査〕と T8〔操作の表〕に取り込んだ）。**出どころの表示（T27）も PR1 に入れる**（`displayLabel` の 1 か所）。「後から足す小さい PR」は、無くなった。
- **冷却・設定の無効化は、持ち主を見ない**（main の作りのまま。**変えない**）: 冷却は pane ごとで、入ると、その pane の `script-html` の面を、だれが出したものでも閉じる。T7 は、閉じた面が札つきなら、持ち主へ理由つき（`focus_steal`・`navigated`・`script_disabled`）で知らせるだけ。
- **main の表示の面の守りを、1 つも弱めない**: `DisplayService` の、設定・冷却・回数・頻度・数と合計の検査の順と条件、`report`・`action`・`dismiss`・`get`・`subscribe` の動き、枠と静的ページ・CSP・sandbox は、変えない。T7 が足すのは、札・`source`・受け手・`opts.owner` だけ。

### 直す・足す既存のテスト（PR1）

| ファイル | すること |
|---|---|
| `packages/server/src/display/DisplayService.test.ts`（`describe` は `.set` 91 行・`.close / list` 236・`.subscribe / renderers / features` 284・`.get` 333・`.action / dismiss / report` 413・`.wait` 491・`: pane.closed` 643・`: 列の seq` 688・`.send` 710・`.action の source` 761・`: 取られた回数と冷却（pane ごと）` 777・`: 設定（displayScriptEnabled）` 1007） | **既存のテストは、1 行も変えない**（札なしの動きが変わっていない証拠）。末尾に、新しい `describe`「持ち主（札）」を足す（T7） |
| `packages/server/src/display/display.integration.test.ts`（117 行の `describe`） | 変えない（通ること） |
| `packages/protocol/src/display.test.ts` | `readDisplayInfo` が、`source` つきの面を通すこと・形の合わない `source` を落とさずに通すこと（読み手はゆるい。形を確かめるのは `displayLabel`）を足す（T7） |
| `packages/web/src/display/displayLabel.test.ts`（7 行: `source: "ext-a"` でも壊れない） | 既存は変えない（文字列の `source` は、今までのラベル）。形の合う `source` のときの文を足す（T27） |
| `packages/server/src/session/paneEnv.test.ts` | 足した 4 つの環境変数が落ちること（T5） |
| `packages/protocol/src/messages.test.ts` | 方式の表に `extension.*` があること（T2・T23） |
| `packages/cli/src/skill.test.ts` | 変えない（`USAGE_LINES` と `SKILL.md` を、同じコミットで直せば通る。T12） |
| `packages/server/src/handoffSmoke.ts`（`isAlive` 56 行。display の段 276・342・416 行付近）・`stopSmoke.ts`（**`isAlive` は無い**。`process.kill(pid, 0)` を直に使っている。297 行付近） | 段を足す（T13・T29）。`stopSmoke.ts` には、`isAlive` に当たる小さな関数を、そのファイルの中に足す |
| `packages/e2e/src/support/appServer.ts`（`startAppServer` 70 行。`internal` は `askImageFetcher` だけ。57 行） | `internal.extensions` を渡す口を足す（T18） |

## 実装方針

各 PR の終わりで `pnpm build`・`pnpm typecheck`・該当パッケージのテストが通る状態にする。

- **PR1**: protocol（T1・T2）→ 設定の読み込み（T3）→ 行の切り出し（T4）→ 起動の引数と環境変数（T5）→ **最初に、実際の子プロセスで、グループごと止められることを確かめる（T6。不確かな点 1）** → 台帳の持ち主と `send` の検査（T7）→ 出どころの表示（T27）→ 操作の表（T8）→ 無効の記録と鍵の関数（T9）→ ホストの芯（T9-2）→ 終わったときと起動し直し（T9-3）→ pane の一覧と出来事（T9-4）→ `/ws` と組み立て（T10）→ 結合テスト（T11）→ `sodactl ext`（T12）→ 起動確認（T13）→ 文書と見本（T14）。
- **PR2**: ストアと通信の係（T15）→ 節の部品（T16）→ 知らせ（T17）→ E2E（T18）→ 文書（T19）。
- **PR3**: プロジェクトの根と設定の読み方（T20）→ 鍵と記録（T21）→ ホスト: 根とあるべき集合と起動の確かめ直し（T22）→ 承認の操作（T22-2）→ 範囲（T22-3）→ 方式（T23）→ 安全の結合テスト（T24）→ 画面の純粋な部分（T25）→ ダイアログと知らせ（T26）→ E2E（T28）→ 起動確認と文書（T29）→ 負の対照（T30。test 工程）。

純粋な検査（設定の 1 件・要求の行・禁止する文字・鍵）は、純粋な関数に置いて単体テストする。子プロセス・時計・ファイルは、差し替えられる口（`deps`）から受け取る（`machine/testing.ts` の `FakeChild`・`ManualClock` と同じ流儀。拡張用の偽の子は `extensions/testing.ts` に作る。`pid` と `exit` を持つ）。
**拡張のコマンドを `spawn` するのは `ExtensionHost.startOne` の 1 か所だけ**（`ExtensionProcess.start` は、そこからだけ呼ばれる）。きっかけの処理に、起動を直接書かない（design「設計方針」1）。

独立点検（`aidev taskcheck`）は、壊れやすいタスク（サーバの状態・保存と復元・プロトコル・安全に関わるもの）だけに掛ける: **T1・T2・T3・T4・T5・T6・T7・T8・T9・T9-2・T9-3・T9-4・T10・T20・T21・T22・T22-2・T22-3・T23・T26**（各タスクの末尾に `点検: あり`）。
見た目・配線・テストの追加・E2E・文書のタスクには掛けず、PR ごとに、その PR のタスクが終わった後で `cross` を 1 回掛ける（AGENTS.md「点検とテストの掛け方」）。
PR1 の `cross` は、「拡張のコマンドの `spawn` が 1 か所であること」「`stop()` が返った後に、子が起動しないこと（`stopped`・`epoch`・`closing`）」「bus と台帳の受け手が、例外を外へ出さないこと」を、PR3 の `cross` は、「承認の記録・無効の記録・設定を、`startOne` が読み直していること」「`pane.sock` に何も載っていないこと」を、名指しで見させる。

## 作業順序と依存関係

下の `依存:` に従う。補足:

- **不確かな点と、だめだったときの扱い**（design「依拠する既存の事実」の未確認 u1〜u8）。どれも、結果を `decisions.md` に 1 行残す。
  1. （u1）`detached: true` で起動した子へ、`process.kill(-pid, sig)` でグループごと合図を送れること → **T6**（実際の子と孫で確かめるテストを、最初に書く）。だめなら（環境に依って `EPERM` など）、**止めて、監督のセッションに報告する**（設計の要なので、代えを勝手に選ばない）。
  2. （u2）`execve` の後、止め損ねた子の標準入力が閉じること → **T13**（起動確認で、入れ替えの後に、前の pid が消えていることを見る。止めて待つので、ふつうは通らない道）。確かめられなければ、docs に「未確認」と書く。
  3. （u3）Windows の `taskkill` → 実機では確かめない。**T5**（組み立て）と **T6**（偽の `runFile` の記録）の単体テストだけ。docs「Windows」に「実機では確かめていない」と書く。
  4. （u4）pane が tab・workspace を移ったときに bus に出るイベント → **T9-4**（`SessionService` の `moveToTab`・`moveToNewTab` の `publish` を読む。research X23）。該当のイベントがあれば、design「きっかけ」の表に足す。無くても、**2 秒ごとの、面を持つ pane の見直し**（T9-4）で面は消えるので、`ext.panes` の行が遅れるだけ（docs に書く）。
  5. （u5）済み（表示の面の PR2 が main に入った。見出しの部品は `displayLabel`・`displayBandLabel`。T27）。
  6. （u6）`findGitRoot` の `deps` の作り方 → **T20**（`workspaceLabel.ts` の `rootWithin` の呼び出し元を読む）。組み立てにくければ、`projectRoot.ts` に、`findGitRoot` を呼ぶ形で包む。**たどり方を、書き直さない**（`gitDirFor` の規則と食い違うと、根がずれる）。
  7. （u7）`/bin/sh -c` が `exec` で置き換えるか → 確かめなくてよい（グループごと止めるので、動きは同じ）。
  8. （u8）「グループに残りがいる間、その番号は、新しい pid・新しいグループの番号にならない」（`sweepGroup` の前提）→ テストでは確かめない（OS の決まり）。**T6 の実装者が、Linux と macOS の文書（`kill(2)`・`setpgid(2)`・pid の割り当て）で確かめ、出典を `decisions.md` に 1 行残す**。確かめられなければ、止めて、監督のセッションに報告する（`sweepGroup` の 2 秒の間の `SIGKILL` をやめて、`exit` の直後の 1 回だけにする、という代えを相談する）。
- **PR1 の T7 は、表示の面のファイル（`DisplayService.ts`）を触る**。表示の面の PR は、どれも main に入ったので、衝突の心配は、もう無い。
- T30（負の対照）は、**test 工程で消化する**（coding の承認の時点では、未チェックで残る。`decisions.md` D5）。PR ごとに、その PR の守りの分を行う（PR1: (d)(e)(f1)(g)(h)(i)(j)・PR3: (a)(b)(c)(f)）。T30 は、どの PR の差分にも入らない（外して、戻す）ので、「PR の分け方」の表には無い。`依存:` は、全部の分が済む条件（T11 と T24）で、PR1 の分は、T11 が済めば行える。
- **`依存:` は、同じファイルを先に作るタスクを、全部は並べていない**（PR の順で満たされる）: T22・T22-2・T22-3 は T9-2〜T9-4 の `ExtensionHost` を、T29 は T13 の起動確認の段を、土台にする。

## リスク / 留意点

- **「開いただけで動く」を作らない**（S1・S2）。PR3 のどのタスクでも、`spawn` へ至る道を足したら、`startOne` を通っているかを見る。テストは、「実行の印のファイルが出来ない」を、きっかけごとに 1 つずつ書く（まとめて 1 つにしない——どのきっかけが漏れたか、分からなくなる）。
- **止める処理と、起動の処理の競合**（S14）。`stop()` は `chain` を待たない。`startOne` は、`spawn` の直前（`await` を挟まずに）で `stopped`・`epoch`・`runs` を見直す。`runs` から外した起動は、`settled` まで `closing` に持つ。
- **bus と台帳の受け手の例外は、pane の処理へ伝わる**（research E3）。受け手は `try/catch` で包み、bus の受け手の中ではタイマーを掛けるだけ、台帳の受け手（`onOwnedEvent`）の中では、台帳を呼ばない（`queueMicrotask`）。
- **bus に流したものは、全接続へ届く**。`extension.changed` に、中身を載せない。
- **子の stdio の `error` に受け手を付ける**（無いと `EPIPE` でサーバが落ちる）。`exit` を待つ（`close` を待たない）。タイマーの中の `process.kill` は、`try/catch` で包む（`ESRCH`・`EPERM`）。
- **ログに、コマンド・標準エラーの中身・設定の値を書かない**。`logger` へ渡す項目は、`extension`（`key`）・`run`・`state`・`code`・`signal`・`reason`・`lines` だけ。T11 のテストが、`server.log` を読んで確かめる。
- **利用者の拡張のコマンドを、`/ws` へ送らない**（`ExtensionInfo` に、項目が無い）。プロジェクトの分だけ、`approval.command` で送る（PR3）。
- **`commandConfig.ts` を変えない**（設定の読み方は、写す）。`PANE_ENV_DROPPED` には、足すだけ。
- **Windows**: 結合テスト・起動確認は `win32` でスキップ。単体テストは、`platform` を渡して両方を見る。
- **結合テストと E2E は、実際に子プロセスを起動する**。拡張のコマンドは、`process.execPath` と、テストが一時ディレクトリに書いた `.mjs` の絶対パスで組み立てる（`node` が `PATH` にあることに頼らない。パスに空白があっても動くよう、引用符で囲む）。
- **テストが、開発者の本物の設定を読まない**: 状態ディレクトリは、いつも一時のもの。`homeDir` は、`ExtensionHostOptions` で差し替える。
- **時間に頼るテストを書かない**: 単体は `ManualClock`。結合テストと E2E は、`internal.extensions.timings`（design「`ExtensionHost`」の `deps.timings`）で、起動し直しの間隔（`backoffMinMs: 20`）・見張り（`approvalsPollMs: 100`）・面の見直し（`scopeReviewMs: 100`）を縮め、**状態が変わるのを待つ**（一覧・DOM を、上限つきで見続ける）。`waitForTimeout` だけを根拠にしない。ダイアログの 1 秒は、`disabled` の属性が外れるのを待つ。

## テスト方針

- **単体**（vitest）: `parseExtensionsJson`（規則の表: 項目ごとの境界・禁止する文字・知らない項目・重複・`cwd` はプロジェクトで誤り）、`loadUserExtensionsFile`・`loadProjectExtensionsFile`（偽の `open`／一時ディレクトリのリンク・FIFO・大きさ・権限・根より上）、`parseExtRequest`、`LineReader`、
  `extensionArgv`・`killTreeCommand`・`buildExtensionEnv`（POSIX と Windows）、`entryDigest`（項目ごとに 1 文字変える表）、`ApprovalStore`・`ExtensionStateStore`（壊れた・読めない・権限・上限・鍵のファイル）、`ExtensionProcess`（偽の子: 壊れた行の数え方・3 つの桶と `pause`・列の上限と捨て方・30 秒・`sweepGroup`・止め方）、
  `ExtensionHost`（偽の子と時計: 状態の遷移・間隔・`reconcile` の差・`startOne` の確かめ直し・`stop` との競合・遅れて来た `exit`）、`DisplayService`（持ち主の決まりの表の **12 行を、1 行 1 テスト**。**札なしの既存のテストが、1 つも変わらずに通ること**）、`ExtensionApi`（処理の順の 2〜8）、web の `extensionView.ts`・`approvalView.ts`。
- **結合**（vitest。`composeServer` を立てて、**実際の子プロセス**を起動する。`win32` はスキップ）: `packages/server/src/extensions/extensions.integration.test.ts`。拡張は、テストが一時ディレクトリに書く短い `.mjs`。PR1 は T11、PR3 は T24。
- **E2E**（Playwright。`.aidev/conventions/e2e-observe-browser.md`）: PR2 `extensions-settings.spec.ts`（AC27・AC30 の落ちた知らせ・AC-I3 の節の分）、PR3 `extensions-approval.spec.ts`（AC29・AC30・AC-I1〜AC-I5）。合否は、ブラウザの DOM・`document.activeElement`・ブラウザが送受信したフレーム（`page.on("websocket")` の `framesent`・`framereceived`）で判定する。
  テスト自身の接続とファイルの操作は、前提を作ること（workspace の用意・設定ファイルを書く）と、サーバ側の確かめ（実行の印のファイルの有無）にだけ使う。何を観測したかを、spec のコメントに書く。
- **起動確認**（`aidev smoke`。ビルドした成果物）: `handoffSmoke.ts`・`stopSmoke.ts` に段を足す（AC14・AC18 の入れ替えの分）。
- **負の対照**（`regression-negative-control.md`。T30）: 守りだけを外して、対応するテストが落ちることを確かめ、戻す。E2E・起動確認は、外した状態でビルドし直してから走らせる。落ちたときの生の出力を `test-result.md` に貼る。
- **全体テストを二重に流さない**（AGENTS.md）: 実装のセッションが `pnpm build`・`pnpm typecheck`・`pnpm test` を流して報告する。受け取った側は、起動確認と、変更に関係する E2E だけを流す。

## タスク

独立点検（`taskcheck`）を掛けるのは T1・T2・T3・T4・T5・T6・T7・T8・T9・T9-2・T9-3・T9-4・T10・T20・T21・T22・T22-2・T22-3・T23・T26。

### PR1: サーバと、利用者の設定の拡張

- [x] T1: protocol の型・定数・純粋な関数を、新しいファイルに作る: design「型と定数」の全部（定数・`ExtensionScope`・`ExtensionRunState`・`ExtensionInfo`〔`approval?` の型 `ExtensionApprovalView` と、`ExtensionListResult.approvals?` の `ExtensionApprovalRecordView` も、この時点で定義する。使うのは PR3〕・`ExtensionExitReason`・`ExtensionFileProblem`・`ExtensionListResult`・`ExtensionLogResult`・`ExtPane`・`ExtLimits`・`ExtLine`・`ExtDisplayEvent`・`ExtRequest`・`ExtRequestParse`・`EXT_EVENT_TYPES`）と、
      `parseExtRequest`（JSON でない → `bad_line`／オブジェクトでない・`method` が 1〜64 文字の文字列でない・`id` が有限の数でも 1〜64 文字の文字列でもない・`params` が配列でないオブジェクトでない → `bad_request`／知らない項目は無視）・`hasForbiddenChars`（design「設定ファイル」の表: Unicode の種別の正規表現）・`extLimits`。
      `EXTENSION_ID_RE` は `COMMAND_ID_RE` をそのまま使う。`index.ts` から export。単体テスト（`parseExtRequest` の境界・`__proto__` を項目に持つ行で、何も壊れないこと・`hasForbiddenChars` の、種別ごとの代表の文字〔U+0000・U+000A・U+202E・U+200B・U+00AD・U+00A0・U+3000・U+2028・U+3164・U+FE0F・U+E0001〕が真で、U+0020・ASCII・ふつうの日本語が偽）
      対象: `packages/protocol/src/extension.ts`（新規）、`packages/protocol/src/extension.test.ts`（新規）、`packages/protocol/src/index.ts`、`packages/protocol/src/commands.ts:13` `COMMAND_ID_RE`（参照）/ 根拠: design「型と定数」、research X3、手本は `packages/protocol/src/display.ts`
      依存: なし
      AC: AC7, AC8, AC12, AC34
      点検: あり
- [x] T2: protocol の通信（PR1 の分）: `/ws` の方式 `extension.list`・`extension.reload`（引数 `{}`）・`extension.restart`・`extension.log`（`{ key }`。1〜160 文字）・`extension.setEnabled`（`{ key, enabled }`）の zod の schema と結果を、`METHOD_SCHEMAS`・`MethodResultMap` に足す。
      イベント `{ event: "extension.changed"; data: {} }` を `ServerEvent` に足す（**中身を持たない**）。エラーの code は、PR1 では足さない。テスト（表に載っていること・`extension.changed` の `data` に項目が無いこと）
      対象: `packages/protocol/src/messages.ts` `METHOD_SCHEMAS`・`MethodResultMap`（`command.*` の近く）、`packages/protocol/src/events.ts` `ServerEvent`、`packages/protocol/src/messages.test.ts` / 根拠: research X14、design「`/ws` の方式とイベント」
      依存: T1
      AC: AC4, AC15, AC16
      点検: あり
- [x] T3: 利用者の設定の読み込み: `parseExtensionsJson(text, scope)`（design「設定ファイル」の表。`strictObject`・既定を埋める・`allow` を並べ替える・`scope === "project"` で `cwd` があれば誤り・1 つでも規則の外なら全体を採らない・誤りの文に値を入れない）と、`loadUserExtensionsFile(path, deps?)`（`loadCommandsFile` と同じ手順を**写す**。`commandConfig.ts` は変えない）。
      `ExtensionEntry`・`ExtensionFileLoad`・`ExtensionFileDeps` を、このファイルで定義する。単体テスト（規則の表・17 件 → 誤り・知らない `allow` の値 → 誤り・リンク・ほかの利用者が書ける・大きすぎる・壊れた UTF-8・`ENOENT` は空・Windows は持ち主と権限を見ない・**誤りの文に、設定に書いた `command` の文字列が入らないこと**）
      対象: `packages/server/src/extensions/extensionConfig.ts`（新規）、`extensionConfig.test.ts`（新規）、手本 `packages/server/src/commands/commandConfig.ts` `loadCommandsFile`・`parseCommandsJson`・`issueText`・`safeKeyName`（参照だけ）/ 根拠: research E1・X1、design「設定ファイル」
      依存: T1
      AC: AC2, AC34
      点検: あり
- [x] T4: 行の切り出し `LineReader`: `push(chunk: Buffer)`・`next(): { kind: "line"; text; bytes } | { kind: "too_long"; bytes } | { kind: "bad_utf8"; bytes } | null`。改行（`\n`。直前の `\r` は除く）で切る。改行が無いまま `EXTENSION_LINE_MAX_BYTES` を超えたら、次の改行までを捨てて `too_long` を 1 回返す。空白だけの行は飛ばす。
      持つのは、切り出していない残りだけ（上限＋1 片）。単体テスト（片をまたぐ行・1 片に 1000 行・ちょうど 4 MiB と 1 バイト超・捨てている途中で片が続く〔持っているバイト数が増えないこと〕・壊れた UTF-8・多バイト文字が片をまたぐ）
      対象: `packages/server/src/extensions/lineReader.ts`（新規）、`lineReader.test.ts`（新規）/ 根拠: design「`ExtensionProcess`」の「読む」、research E5（行で読む先例が無い）
      依存: T1
      AC: AC12
      点検: あり
- [x] T5: 起動の引数・止め方・環境変数（純粋）: `extensionArgv`（POSIX は `["/bin/sh", "-c", command]`。Windows は `[シェル, "/d", "/s", "/c", "\"<command>\""]` で、シェルは `ComSpec`〔大文字小文字を問わず引く〕か、無ければ `<SystemRoot>\System32\cmd.exe`）・
      `killTreeCommand(pid, platform, env)`（Windows だけ。**`<SystemRoot ?? windir ?? "C:\Windows">\System32\taskkill.exe` の絶対パス**と、`cwd` も `System32`。名前だけで起動しない。S25）・`EXTENSION_ENV_DROPPED`・`buildExtensionEnv`（design「`ExtensionProcess`」の頭）。
      `PANE_ENV_DROPPED` に `SODA_EXTENSION_ID`・`SODA_EXTENSION_SCOPE`・`SODA_PROJECT_ROOT`・`SODA_EXTENSION_RUN_ID` を足す。単体テスト（両方の `platform`・`taskkill` の `file` が絶対パスで、`SystemRoot` も `windir` も無いときは `C:\Windows`・`ComSpec` が無いときのシェルが絶対パス・Windows は大文字小文字を区別せずに落とす・
      **結果のどの値にも、`SODACTL_TOKEN`・`SODA_PANE_ID`・`SODA_PANE_SOCKET`・`SODA_SERVER_URL`・`SODA_AGENT_REPORT_SOCKET` の元の値が含まれないこと**・`paneEnv.test.ts` に、足した 4 つが落ちること）
      対象: `packages/server/src/extensions/extensionLaunch.ts`（新規）、`extensionLaunch.test.ts`（新規）、`packages/server/src/session/paneEnv.ts:14` `PANE_ENV_DROPPED`、`packages/server/src/session/paneEnv.test.ts`、`packages/server/src/commands/commandLaunch.ts:21` `commandArgv`（参照）/ 根拠: research E7・X2・X12、design「`ExtensionProcess`」、脅威 S17・S25
      依存: T1
      AC: AC1, AC36
      点検: あり
- [x] T6: `ExtensionProcess`（design「`ExtensionProcess`」の全部: 起動・読む〔`LineReader`・**`parseExtRequest` と、壊れた行の数え方と `ext.error`**・量は片を受けた時点で 2 つの量の桶から・行の桶・`pause`・16 行か 8 ミリ秒でイベントループへ返す・1 行ぶんを `try/catch`〕・書く〔列・捨てる・まとめる・30 秒〕・標準エラーの輪の記録と量の桶・`sweepGroup`・止める・止めていない `exit` の後の掃き・**`exit`／打ち切りで、サーバの側の stdio を閉じる**・`exited`・`settled`）。
      偽の子 `FakeExtChild`（`pid`・`PassThrough` 3 本・`exit` を出す）と、合図を記録する偽の `killGroup`、`ManualClock` の使い回しを `extensions/testing.ts` に。不確かな点 8（`sweepGroup` の前提）の出典を確かめる。
      **最初に、実際の子プロセスのテストを書いて、不確かな点 1 を確かめる**（`win32` はスキップ）: (i) `/bin/sh -c 'sleep 300 & exec sleep 300'` の形で孫を作り、`stop()` が**返った時点で**、子と孫の pid が、どちらも消えている（`process.kill(pid, 0)` が `ESRCH`）
      (ii) **合図を無視する孫を残して、親がすぐ終了コード 0 で終わる**拡張（孫の pid を、ファイルへ書き出す）: `stop()` を呼ばずに、`settled` が決まるのを待つと（3 秒以内）、孫が消えている（止めていない `exit` の後の、裏の `sweepGroup`）(iii) (ii) と同じ拡張で、親の `exit` の直後（掃いている途中）に `stop()` を呼ぶと、返った時点で、孫が消えている。(iv) 標準エラーへ 1 行書いて、すぐ終了コード 1 で終わる拡張 → その行が `log()` にある。
      単体テスト（偽の子と時計）: 壊れた行（JSON でない・形が合わない・4 MiB 超・壊れた UTF-8）ごとに、`ext.error` が 1 行書かれ、`onRequest` は呼ばれない／**続けて 20 行で、自分で止まり、`exited` の理由が `bad_lines`。19 行の後に読める行が 1 つ来ると、数え直す**／続けて 100 行は、すぐ処理され、101 行目は、桶が戻るまで `pause` されて、**捨てられずに**処理される／
      **改行の無い出力を 9 MiB 流すと、8 MiB の辺りで `stdout.pause()` される**（量は、行の成立を待たずに数える）／渡された全体の桶が空なら、拡張ごとの桶に余りがあっても `pause` される／17 行目の前に `setImmediate` を挟む／列が 512 行を超えると、出来事が古いものから捨てられ、空いたら `ext.dropped` が入る／`ext.panes` は、書かれていない前の 1 つと置き換わる／捨てられない行が入らなければ止まる（`not_reading`）／`drain` が 30 秒来なければ止まる／
      `sweepGroup`: `killGroup(pid, 0)` が `ESRCH` を投げたら、**以後、何の合図も送らない**／`SIGTERM` は 1 回だけ／期限で `SIGKILL`／`killGroup` が `EPERM` を投げても、例外が外へ出ず、期限で打ち切る／同時に 2 回頼まれても、1 つだけ走る／**`settled` の後に `stop()` を呼んでも・掃きを頼んでも、`killGroup` が 1 度も呼ばれない**（生涯で 1 回）／`SIGKILL` は 1 回だけで、その後も、`ESRCH` になるか、3 秒の期限まで、残りを見続ける／子が `exit` したら、`stdin` が終わり、`stdout`・`stderr` は、`end` を 200 ミリ秒まで待ってから `destroy` される（止めていない `exit` でも・`stop` が 3 秒で打ち切ったときも）。**`exit` の後に届いた標準エラーの行（200 ミリ秒以内）が、`log()` に入る**／
      `stop()` は、合図を無視する子でも 3 秒以内に返る／`stop()` を 2 回呼んでも同じ／`spawn` が投げたら `exited` が `spawn_failed`／子の `stdin` の `error`（`EPIPE`）で、例外が外へ出ない／`onRequest` が例外を投げても、`data` の受け手から漏れない／終了コード 0 は `exited`・ほかは `crashed`／
      標準エラーは 200 行・1 行 4 KiB・制御文字の置き換え・あふれた数・1 MiB 超を続けて書くと `stderr.pause()`／**ロガーに、標準エラーの中身とコマンドが渡らないこと**（`MemoryLogger` を読む）／
      `platform: "win32"`: `stop()` は、`killGroup` を呼ばず、2 秒後に、子が `exit` していなければ、偽の `runFile` を **`killTreeCommand` の返す絶対パスと `cwd`** で 1 回呼ぶ。子が先に `exit` したら、`runFile` を呼ばない
      対象: `packages/server/src/extensions/ExtensionProcess.ts`（新規）、`ExtensionProcess.test.ts`（新規）、`extensions/testing.ts`（新規）、手本 `packages/server/src/machine/MachineLink.ts`（`defaultSpawn`・`finish`・`error` の受け手）・`packages/server/src/machine/testing.ts`・`packages/server/src/display/rateLimit.ts` `TokenBucket` / 根拠: research E5・X10、design「`ExtensionProcess`」、不確かな点 1・8、脅威 S13・S14・S25
      依存: T1, T4, T5
      AC: AC12, AC13, AC15, AC36
      点検: あり
- [x] T7: 表示の面の台帳に、持ち主を足す（design「表示の面への追加」の、型と、決まりの表。札 `tag` は、呼ぶ側が決める文字列——拡張は、起動 1 回ごとに別の札を使う）: `DisplayInfo.source?`・`DisplaySource`（protocol。**`readDisplayInfo` は、変えない**〔同じオブジェクトを返すので、`source` は通る。形の検査を、ここに足さない〕）、`Entry.owner?`、
      `set(…, opts?)`・`close(…, opts?)`・`list(…, opts?)`・**`send(…, opts?)`**・`ownerOf`・`countOwned`・`bytesOwned`・`ownedPanes`・`closeOwned`・`onOwnedEvent`。
      札つきの面の出来事（`display.action`〔`source` つき〕・`display.closed`）は、pane の列に入れず、受け手へ（`seq` なし）。`onPaneClosed` で、札つきの面ごとに、受け手へ `display.closed`（`pane_closed`）。受け手の例外は、包んでログ。
      **`send` の持ち主の検査は、ここで必ず入れる**: 面の札と `opts.owner` が違えば `display_closed`（札なしの呼び出し〔`/ws`・`pane.sock`〕が、札つきの面を指す場合を含む）。検査の場所は、設定の検査（`display_script_disabled`）の後・面の有無の検査と同じ所（面が無いのと、同じ答えにする）。
      **札を付けない呼び出しの動きを変えない・表示の面の守りを弱めない**: 設定（`scriptEnabled`）・冷却・回数・頻度・数と合計の検査の順と条件、`enterCooldown`（その pane の `script-html` の面を、**持ち主を見ずに**全部閉じる）、`onScriptSettingChanged`（全部の `script-html` の面を閉じる）は、変えない。閉じた面が札つきなら、`remove` の中で、持ち主へ理由つきで知らせるだけ。
      既存の `DisplayService.test.ts`（12 の `describe`）・`display.integration.test.ts` が、**1 行も変えずに**通ること。足すテスト（新しい `describe`「持ち主（札）」）は、**決まりの表の 12 行を、1 行ごとに 1 つ**と、次のもの:
      札つきの `set` が、札の無い面・別の札の面の名前に当たると `invalid_display` で、面が変わらず、頻度の桶が減っていない／**札なしの `set` が札つきの面に当たると、「閉じて、新しい面を作る」**: 元の持ち主に `closed` が届き、`display.removed`（古い `id`）と `display.updated`（**新しい `id`**・`rev: 1`・`source` なし）が出る。**古い `id` への `action` は `display_closed`**（拡張あての操作の値が、pane の列に入らない）／**その `set` が、`display_limit`（種類を替えて満杯・合計の超過）・`display_busy`・`display_script_disabled` で失敗したら、札・`source`・中身・`id` が残り、持ち主に `closed` が届かず、その後の `closeOwned(tag)` で、その面が消える**／札つきの面の `display.action` が、pane の `wait` に返らず、受け手に `source` つきで届く／札つきの `close`・`list` は、その札の面だけ／札なしの `list` に、札つきの面が `source` つきで出る／
      `closeOwned` は、`display.removed` を bus に配り、受け手へは知らせず、閉じた面を返す／受け手が投げても、`set`・`close` が成功する／**札なしの `send` が、札つきの `script-html` の面を指すと `display_closed` で、`display.message` が bus に出ない／札つきの `send` が、札の無い面・別の札の面を指すと `display_closed`／札つきの `send` が、自分の面へ届く**／
      **設定が無効のとき、札つきの `set`（`script-html`）・`send` も `display_script_disabled`**（札は、設定の検査を飛ばさない）／設定を、有効 → 無効にすると、札つきの `script-html` の面も閉じ、持ち主へ `display.closed`（`script_disabled`）／**冷却は、持ち主をまたぐ**: 札なしの面の `focus_steal` が 3 回 → 同じ pane の、札つきの `script-html` の面も閉じ、持ち主へ `focus_steal` が届き、冷却の間、札つきの `set`（`script-html`）は `display_busy`。逆（札つきの面が原因）も同じ／
      `set` の引数に `source` を書いても、面の `source` に載らない（`checkDisplaySet` が落とす）／**持ち主が替わる置き換えの、数え方**（design「表示の面への追加」の「コードの上の手順」。`remove` の後は、新規の枝だけを通す・`byPane` を取り直す・配るのは、付け替えの後）: 大きい札つきの面を、札なしの `set` で置き換えることを繰り返しても、サーバ全体の合計が正しく、上限ちょうどまで入り、1 バイト超で `display_limit`／その pane で唯一の面を置き換えた後、札なしの `close(name)`・`list`・pane を閉じる、で、新しい面が消える（`byId` にだけ残らない）／古い面の `ttl` が、新しい面を消さない／受け手の中から、同期で台帳の `list` を呼んでも、同じ名前の面が 1 つ／札つきの `set` が他人の名前に当たる `invalid_display` は、設定・冷却の検査の後・数の検査の前（設定が無効なら `display_script_disabled` が先）
      対象: `packages/server/src/display/DisplayService.ts`（`DisplayServiceOptions` 62 行・`Entry` 80 行・`set` 157 行・`close` 240 行・`list` 249 行・`send` 308 行〔設定 310・面の有無 312〕・`action` 360 行〔`source` は 380〕・`onScriptSettingChanged` 445 行・`enterCooldown` 513 行・`pushEvent` 565 行・`remove` 605 行・`onPaneClosed` 623 行）、`packages/server/src/display/DisplayService.test.ts`（末尾に足す）、
      `packages/protocol/src/display.ts`（`DisplayInfo` 94 行・`readDisplayInfo` 390 行）、`packages/protocol/src/display.test.ts` / 根拠: research E8・X13、design「依拠する既存の事実」の「main の表示の面」・「表示の面への追加」、脅威 S11・S12・S26
      依存: T1
      AC: AC5, AC9, AC10, AC25
      点検: あり
- [ ] T27: 出どころの表示（PR1。`displayLabel` の 1 か所）: `displayLabel(info)` の引数を `Pick<DisplayInfo, "name"> & { source?: unknown }` に広げ、`source` が **`{ type: "extension", id: <EXTENSION_ID_RE に合う文字列>, scope: "user" | "project" }` の形のときだけ**、接頭の文を「拡張『<id>』の表示（利用者・隔離）」／「拡張『<id>』の表示（プロジェクト・隔離）」に替える。ほかの形・文字列・無いときは、今までの「pane のプログラムの表示（隔離）」。
      `displayBandLabel` は `displayLabel` を呼んでいるので、帯も替わる（引数の型だけ広げる）。接頭の文を返す `displayLabelPrefix(info)` を切り出し、**`packages/web/src/mobile/MobileDisplaySheet.vue` の 53 行（`<dialog>` の `aria-label` が `DISPLAY_LABEL_PREFIX` を直に使っている）を、それに替える**（56 行は `displayLabel(active)` なので、そのまま替わる）。**`PanePanel.vue`・`PaneBands.vue`・`DisplayScriptMark.vue` は、変えない**（印「スクリプト」は、今までどおり、形式と設定で出る）。単体テスト: 形の合う `source`（利用者・プロジェクト）で文が替わる／`source: "ext-a"`（文字列。既存のテスト）・`{ type: "extension", id: "<b>" }`・`scope` が知らない値・`null` → 今までの文／id に HTML を書いても、文字のまま（そもそも `EXTENSION_ID_RE` に合わない）。
      E2E を 1 つ（`extensions-settings.spec.ts` が出来る PR2 の T18 に足す。PR1 では、単体テストまで）
      対象: `packages/web/src/display/displayLabel.ts`（`DISPLAY_LABEL_PREFIX` 4 行・`displayLabel` 11 行・`displayBandLabel` 37 行）、`packages/web/src/display/displayLabel.test.ts`（7 行の既存のテストは変えない）、`packages/web/src/mobile/MobileDisplaySheet.vue:53`、`MobileDisplaySheet.test.ts`、`packages/protocol/src/extension.ts` `EXTENSION_ID_RE`（参照）/ 根拠: design「ブラウザ」の「出どころの表示」、`20261007-soda-extensions/decisions.md` D31（ラベルは 1 か所）、脅威 S12・S20
      依存: T1, T7
      AC: AC31
- [ ] T8: 拡張が呼べる操作の表 `ExtensionApi`（design「拡張が呼べる操作」の表と、処理の順 2〜8。**1〔行の解釈と、壊れた行〕は T6**）: `createExtensionApi(deps: { displays; panes(ext): ExtPane[]; inScope(ext, paneId): boolean; logger })` が、`handle(ext, req: ExtRequest): ExtLine | null`（`id` が無ければ `null`）を返す。全体を `try/catch`。
      表は `ext.features`・`ext.panes`・`display.set`・`display.close`・`display.list`・`display.features`・**`display.send`**。引数の検査は `packages/protocol` の `DisplaySetParams`（523 行）・`DisplayCloseParams`（526）・`DisplayListParams`（528）・`DisplaySendParams`（535）・`DisplayFeaturesParams`（537。`/ws` と同じ schema）。
      **`script-html` の条件は 2 つとも**（上の「main の表示の面に合わせた点」）: `allow` に `script-html` が無い拡張の、`format: "script-html"` の `set` と、`display.send` は、**台帳を呼ばずに** `unsupported`。`allow` があれば、台帳へ進む（設定が無効なら、台帳が `display_script_disabled`）。**このファイルは、設定（`prefs`）を読まない**。台帳は、`ext.tag`（起動ごとの札）を付けて呼ぶ。
      `handle` は、1 つの拡張の面の数（16）と、中身の合計（8 MiB。`bytesOwned`）も見る（処理の順 6）。`helloLine(ext)`（`runId`・`methods`〔`display.send` は、`allow` があるときだけ〕・`events`・`display.features`〔`allow` で絞る〕・`display.scriptEnabled`〔台帳の `features().scriptEnabled === true`。`allow` が無ければ、いつも `false`〕・`display.limits`・`limits`・`allow`・`onUnresponsive`）も、ここに置く。単体テスト: 表に無い名前・`display.wait` → `unsupported`／`id` なし → `null`（誤りのときも）／範囲の外 → `not_found`（無い pane と、同じ code・同じ文）／
      `allow` に `script-html` が無いときの `format: "script-html"` の `set` と `display.send` → `unsupported` で、**台帳の `set`・`send` が呼ばれていない**（偽の台帳の記録）／`allow` があり、設定が無効 → `display_script_disabled`（台帳の code が、そのまま返る）／`allow` があり、設定が有効 → 通る／`allow` があり、冷却の間 → `display_busy`／`allow` が無ければ、`features` から `format:script-html`・`send` が除かれ、`scriptEnabled` は `false`・`methods` に `display.send` が無い／`allow` があれば、`scriptEnabled` は、設定の値／`display.send` は、自分の札を付けて台帳を呼ぶ（ほかの持ち主の面 → `display_closed`）・範囲の外の pane → `not_found`／17 個目の面 → `display_limit`（同じ名前の置き換えは通る）／その拡張の中身の合計が 8 MiB を超える `set` → `display_limit`（自分の面の置き換えは、差で数える。ちょうど 8 MiB は通る。他人の名前に当たるときは、他人の面のバイト数を引かない）。`ext.hello.limits.displayBytes` に 8 MiB／
      台帳が投げた `RpcError` の code がそのまま返る／ほかの例外・`inScope` が投げた例外 → `internal`（文は固定）／返事の文に入る `method` の名前は、決まった文字のときだけ／**`helloLine` に、`methods`・`events`・`limits`・`onUnresponsive` があり、`ext.features` の結果に `display.renderers` がある**（AC8）
      対象: `packages/server/src/extensions/ExtensionApi.ts`（新規）、`ExtensionApi.test.ts`（新規）、`packages/protocol/src/messages.ts:523-537` の `Display*Params`（参照）、`packages/server/src/display/DisplayService.ts`（T7 の口）/ 根拠: design「拡張が呼べる操作」「範囲と許可」、脅威 S11・S21
      依存: T1, T7
      AC: AC5, AC7, AC8, AC9, AC25, AC34
      点検: あり
- [ ] T9: 無効の記録と、鍵の関数: `ExtensionStateStore`（design「無効の記録」。`<stateDir>/extension-state.json`。`load(): { ok: true; disabled } | { ok: false; problem }`・`setDisabled(key, disabled, known)`）と、`approval.ts` の `entryDigest(root, entry)`（**design「鍵と、承認の記録」の入力の形そのまま**: `{ v, root, id, command, description, enabled, allow, onUnresponsive, cwd }` の順。PR3 が、同じ関数を、根つきで使う）・`instanceKey(scope, root, id)`（プロジェクトは、根のハッシュの 64 文字の全体）。
      単体テスト: `ExtensionStateStore` — 無いファイル → 空で `ok`／壊れた JSON・知らない項目 → `ok: false`／`setDisabled` は、壊れたファイル・無いファイルを作り直す／**読めない（偽の `open` が `EACCES`・時間切れ）ときは、書かずに誤り**／`known` に無い `key` を捨てる／256 件を超えると誤り／0600。
      `entryDigest` — 項目ごとに 1 文字変えると変わる表（`id`・`command`・`description`・`enabled`・`allow`・`onUnresponsive`・`cwd`）・根が違うと変わる・`allow` の並びと、省いた項目（既定）では変わらない。`instanceKey` — 2 つの根で、同じ id の `key` が違う
      対象: `packages/server/src/extensions/ExtensionStateStore.ts`（新規）、`approval.ts`（新規）、それぞれの `*.test.ts`、`packages/server/src/persist/atomicFile.ts` `writeFileAtomic` / 根拠: research X5、design「無効の記録」「鍵と、承認の記録」、脅威 S18
      依存: T3
      AC: AC4, AC20, AC34
      点検: あり
- [ ] T9-2: ホストの芯（利用者の設定の分）: `ExtensionHost` の、持つもの・**直列化**（外向きの入口だけが `chain` へつなぐ。中は直接呼ぶ。「予約」の意味）・ファイルを読む 1 回 2 秒の上限と「前の読み取りが返っていなければ、出さない」・`reconcile` の 0・1・3〔無効の記録〕・4〜7・`startOne` の 1〜3・5〜8・`stopRun`・`finishRun`・`closing`・`stopped` と `epoch`・`start`・`stop`・`dispose`・`list`・`reload`・`restart`・`log`・`setEnabled`・全体の量の桶・`deps.timings`・`deps.limits`。
      **プロジェクトの設定を読む処理・承認の検査は、入れない**（PR3 の T22。入れる場所に `// PR3（T22）` と書くだけ）。この時点の `inScope` は「pane が実在すれば真」。終わったとき（`onExit`）は、T9-3（ここでは、`runId` が一致したら `finishRun` するだけの仮の形でよい）。
      単体テスト（偽の子・時計）: 起動で `ext.hello` → `ext.panes` の順／読み直しの 4 通り（足す・消す・変える・変えない＝`runId` が同じ）／設定が規則の外 → そのファイルの拡張は 0・動いていたものが止まり・`problems` に出る（AC2）／`enabled: false`・無効の記録 → `disabled`／無効の記録が壊れている → 全部 `disabled`（`spawn` なし）／
      **`startOne` が、起動の直前に設定を読み直し、`digest` が違えば起動しない**／`start()` を、止めずに 2 回呼んでも `spawn` は 1 回／**`startOne` が設定を読んでいる途中（偽の `open` を止めておく）で `stop()` → 読み終わっても `spawn` されない**／`stop()` は、`chain` が詰まっていても（偽の `open` が返らない）3 秒以内に返る／
      `stop()` は、`runs` と、**`closing`（止めている途中の起動）の両方**を待つ（`reconcile` の 5 が `proc.stop` を待っている間に `stop()` → その子の `settled` まで待つ）／`stopped` の間の `reload`・`restart` は、`spawn` せずに今の一覧を返す／`restart` と `reconcile` が重なっても、`spawn` は 1 回／
      同時に動かす合計の上限（`deps.limits.runningMax` を 2 にして）: 3 つ目は `over_limit` で、動いているものは止まらない。順が前の拡張を足しても、動いているものは譲らない。空きが出来て `reload` すると動く／時間切れの後の予約は、続けて 3 回までで、時間切れの無い `reconcile` で 0 に戻る／`stopped` の間の `setEnabled` は、記録だけを書き、`spawn` しない／設定を読む処理が 2 秒で返らない → `problems` に出て、次の操作（`setEnabled`）が待たされない。**同じファイルへの読み取りが、返らないまま 2 つ目を出さない**（偽の `open` の呼ばれた回数）。5 秒後に、差を埋める仕事が 1 回予約される／
      `extension.changed` は、同じ一覧なら出ない／`setEnabled` は、画面の種類でない接続から `invalid_params`／`list()` の結果に、利用者の拡張の `command` の文字列が無い
      対象: `packages/server/src/extensions/ExtensionHost.ts`（新規）、`ExtensionHost.test.ts`（新規）、手本 `packages/server/src/machine/MachineManager.ts`（唯一の持ち主・`start`/`stop`）/ 根拠: research E5・X10、design「`ExtensionHost`」（持つもの・直列化・差を埋める・起動・止める・後始末・きっかけの表の `start`・`reload`・`restart`・`setEnabled`・`stop`・`dispose`）、脅威 S2・S13・S14
      依存: T3, T6, T8, T9
      AC: AC1, AC2, AC3, AC4, AC14, AC34
      点検: あり
- [ ] T9-3: 終わったときと、起動し直し: `onExit(key, runId, exit)`（design「終わったとき」。全体を `try/catch`・`runId` が一致するときだけ状態を変える・`exited`／`backoff`／`failed`・`failures` の数え方・`backoff` の時間切れは `chain` へ `startOne`）と、`stop()` で `backoff` を捨てること、`reload`・`restart` で `failed`・`exited` から戻ること、`lastExit`・`lastLog`。
      単体テスト: 落ちた後の間隔 1・2・4・8 秒、5 回目で `failed`、60 秒動いた後は 1 秒へ戻る／`bad_lines`・`not_reading` で止まった回も、落ちた回に数える／終了コード 0 → `exited`（起動し直さない）／`reload`・`restart` で `failed`・`exited` から戻る／**落ちた後・時間が来る前に、設定ファイルを書き換える → 時間が来ても `spawn` されない**／
      `backoff` の拡張がある状態で `stop()` → `start()` → 起動し直される／`stop()` の後に来た `backoff` のタイマーは、何もしない／**`stop` が 3 秒で返った後（子は、まだ `exit` していない）に、新しい起動 → 古い子の `exit` が遅れて届く → 新しい起動の面・状態・`runs` が変わらない**／**`finishRun` の後に、その起動の `onRequest`（`display.set`）が遅れて呼ばれても、台帳が呼ばれない**（面が出来ない）／`backoff` の時間切れで起動した・`over_limit` になった・`restart` した後に、`extension.changed` が出る／`display.set` で面の数（`displays`）だけが変わっても、`extension.changed` は出ない／終わったら、その起動の札の面だけが `closeOwned` される（次の起動の面は残る）／
      `backoff` の時間が来たときに枠が無ければ（`runningMax: 1` で、別の拡張が動いている）`over_limit`／`onExit` の中で例外が出ても、捕まらない拒否にならない（`process.on("unhandledRejection")` を、テストで見張る）
      対象: `packages/server/src/extensions/ExtensionHost.ts`、`ExtensionHost.test.ts` / 根拠: design「`ExtensionHost`」の「終わったとき」と、状態遷移の図、脅威 S13・S14
      依存: T9-2
      AC: AC10, AC11
      点検: あり
- [ ] T9-4: pane の一覧と、出来事の渡し方: bus の購読（design「きっかけ」の表の、pane・tab・workspace のイベント。**受け手は `try/catch`・中ではタイマーを掛けるだけ**・100ms まとめて、長くても 500ms）で、pane の一覧（`ExtPane`）を作り直し、前と同じなら送らない。`onOwnedEvent` の受け手（**出来事を渡す直前に範囲を確かめる**・外なら `display.action` は渡さず、`display.closed` は理由を `out_of_scope` に替える〔**理由が `pane_closed` のものは、替えずに、そのまま渡す**〕・
      **受け手の中では台帳を呼ばず、`queueMicrotask` で `closeOwned`**・札から起動を引けなければ捨てる）。**面を持つ pane の見直し**（2 秒ごと）。不確かな点 4（pane の移動で出るイベント）を、ここで読んで確かめる。
      単体テスト（`inScope` は、テストが差し替える）: pane を足す・消すと、新しい一覧の行が届く。中身が同じなら、届かない／`pane.updated` が 50ms おきに続いても、500ms 以内に作り直される／bus の受け手の中で例外が出ても、`bus.publish` の呼び出し元へ伝わらない／
      範囲の外の pane の面への `display.action` は、拡張へ渡らず、面が閉じて `out_of_scope` が届く／範囲の外の pane の `display.closed`（利用者が閉じた）は、理由が `out_of_scope` に替わって届く／pane が閉じたときの `display.closed` は、理由が `pane_closed` のまま届く／台帳が `close` の処理の途中で受け手を呼んでも、台帳への再入が起きない（`closeOwned` が、受け手の呼び出しの中で呼ばれていないこと）／
      **bus のイベントが 1 つも出なくても、2 秒（`scopeReviewMs`）で、範囲の外の pane の面が消える**／`stopped` の間は、bus の受け手がタイマーを掛けない
      対象: `packages/server/src/extensions/ExtensionHost.ts`、`ExtensionHost.test.ts`、`packages/server/src/session/SessionService.ts:253` `snapshot`・`829` `commandContext`・`912` `hasPane`・`moveToTab`／`moveToNewTab`（読むだけ）、手本 `packages/server/src/ask/AskService.ts:112` 付近（bus の購読）/ 根拠: research E3・X7・X8・X23、design「範囲と許可」「きっかけ」の表と、その下の「出来事を拡張へ渡す直前に、範囲を確かめる」、脅威 S10
      依存: T9-2
      AC: AC6, AC24
      点検: あり
- [ ] T10: `/ws` の方式と、組み立て: `registerExtensionMethods(surface, deps)`（T2 の 5 つ。`deps.extensions` が無ければ登録しない）、`MethodDeps.extensions?`、`registerAllMethods` から呼ぶ。`composeServer.ts` に、生成（`displays` の後。`internal.extensions` で `deps`〔`timings` を含む〕を差し替えられる）・
      `listen()` の `void extensions.start()`（`void machines.start()` の隣。**ロックの後**。待たない）と `catch` の `extensions.stop()`・`close()` の `await extensions.stop()`（`machines.stop()` の隣）と、**`finally` の `await extensions.stop().catch(() => undefined)` → `extensions.dispose()`**（`displays.dispose()` の前。`try` の途中で投げても、子を止める）・`pausePollers` の `await extensions.stop()`・`resumePollers` の `void extensions.start()`。
      **`paneOps.register` は足さない**。テスト（`composeServer` を、偽の `spawn` で立てる）: 5 つの方式が通る／`extension.setEnabled` は `external` の接続から `invalid_params`／`pane.sock` へ `extension.list`・`extension.setEnabled` を送ると `unknown_op`／
      `extension.changed` のフレームに、`data` の項目が無い／`extension.list` の結果の JSON に、利用者の拡張の `command` の文字列が無い／**設定の読み込みが止まっていても（偽の `open` が返らない）、`listen()` が返る**／`close()` を、`start()` の直後（設定を読んでいる途中）に呼んでも、拡張の子が残らない／`close()` の `try` の、`extensions.stop()` より前（`machines.stop` の偽物が投げる。`extensions.stop()` は、その後ろに置く）で例外が出ても、`finally` で、`extensions.stop()` → `extensions.dispose()` が、`displays.dispose()` より前に呼ばれている
      対象: `packages/server/src/surface/methods/extension.ts`（新規）、`packages/server/src/surface/methods/index.ts`・`deps.ts`、`packages/server/src/composeServer.ts`（`internal` の型 164〜179 行・生成は `new DisplayService` 350〜360 行の後・`registerAllMethods` 442 行・`pausePollers` 530 行〔`machines.stop` 537〕・`resumePollers` 539 行〔`machines.start` 543〕・`listen` 628 行〔ロック 633・`machines.start` 787 とその後の `catch`〕・`close` 812 行〔`machines.stop` 827・`displays.dispose` 861〕）、手本 `packages/server/src/surface/methods/command.ts:16` 付近 / 根拠: research E6・X11・X14、design「`/ws` の方式とイベント」「組み立て」
      依存: T2, T9-3, T9-4
      AC: AC1, AC4, AC14, AC15, AC23
      点検: あり
- [ ] T11: 結合テスト（実際の子プロセス。`win32` はスキップ）: `composeServer` を立て（`internal.extensions.timings` で、`backoffMinMs: 20`・`scopeReviewMs: 100`）、状態ディレクトリに `extensions.json` を書いて、テストが一時ディレクトリに書いた `.mjs` を `process.execPath` で起動する。helper（設定を書く・拡張の `.mjs` を書く・一覧が、ある状態になるまで、上限つきで待つ）を、このファイルの中に置く。
      見ること: (1) 環境変数と作業ディレクトリを書き出す拡張 → id・種類があり、token・`SODA_PANE_ID`・受け口のパスが無い（AC1）(2) 読み直しの 4 通りを、実際の pid で。設定を規則の外に書き換えて読み直すと、動いていた拡張が止まり、一覧に理由が出る（AC2・AC3）(3) `display.set` が台帳に載り、`pane.sock` の `display.list` に見え、結果が `/ws` の `display.set` と同じ項目を持つ。面への `display.action`（テストの画面の接続から）が、拡張に行で届く（AC5）
      (4) pane を足す・消すと `ext.panes` の行が届く（AC6）(5) 知らない操作に `unsupported` が返り、拡張は動き続ける。`id` なしには返事が来ない（AC7）。`ext.hello` と `ext.features` の中身（AC8）(6) 拡張の面を、`pane.sock` の `display.list` は見える・`display.wait` に操作が返らない／拡張の `display.list` に、`pane.sock` で出した面が無い・`display.close` で閉じられない・同じ名前の `set` が誤り／`pane.sock` が、拡張の面を閉じる・同じ名前で出し直すと、拡張に `display.closed` が届く（AC9）
      (7) 拡張を落とすと、その面だけが消え、`pane.sock` で出した面は残る（AC10）(8) 落ち続ける拡張（5 回で `failed` になるまで）を動かしながら、pane の echo が通る（AC11）(9) 合図を無視して孫を作る拡張を、無効にすると、`extension.setEnabled` が返った時点で、子と孫の pid が消えている。終了コード 0 で終わって、合図を無視する孫を残す拡張 → 状態が `exited` になった後、3 秒以内に、孫の pid が消える。`close()` の後、どの拡張の pid も残っていない（AC13）
      (10) 標準エラーに目印の文字列を書く拡張 → `extension.log` で読め、**`server.log` に、目印の文字列と、設定に書いたコマンドの文字列が無い**（AC15）(11) 同じ状態ディレクトリで 2 つ目の `composeServer` の `listen()` は、ロックで失敗し、拡張の印のファイルを作らない（AC1）(12) 面の数は、`pane.sock` の分と合わせて数えられる（拡張 2 ＋ `pane.sock` 2 で、次のパネルが `display_limit`）（AC5）
      (14) **`script-html` の 2 つの条件**（設定は、テストの `/ws` の接続から `prefs.set` で切り替える）: `allow` なしの拡張 → 設定が有効でも `unsupported`／`allow` ありの拡張 → 設定が無効なら `display_script_disabled`、有効にすると通る／有効 → 無効にすると、拡張へ `display.closed`（`script_disabled`）が届く／`allow` ありの拡張の `display.send` が通り、`pane.sock` からの `display.send` は、拡張の面へ `display_closed`（AC9・AC25）
      (13) JSON でない行を 20 行書く拡張 → `ext.error` が返り、20 行で止められて、起動し直しの回数に入る。4 MiB を超える 1 行を書く拡張 → サーバは動き続け（pane の echo が通る）、その行だけが捨てられて、続く要求が通る（AC12。「標準入力を読まない」拡張を止めることは、30 秒の実時間が要るので、ここでは見ない——T6 の単体で見る）
      対象: `packages/server/src/extensions/extensions.integration.test.ts`（新規）、手本 `packages/server/src/display/display.integration.test.ts`・`packages/server/src/machine/machines.integration.test.ts`（`describe.skipIf(win32)`・`internal` の差し替え）/ 根拠: design「受け入れ基準との対応」
      依存: T10
      AC: AC1, AC2, AC3, AC5, AC6, AC7, AC8, AC9, AC10, AC11, AC12, AC13, AC15, AC25
- [ ] T12: `sodactl ext`（design「`sodactl ext`」の表）: `list`・`log <id|key>`・`reload`・`restart <id|key>`。`/ws` の経路だけ。先に `extension.list` を呼び、`not_found`（知らない方式）なら `{"status":"unsupported","reason":…}` で終了コード 0。`<id|key>` は、`key` の完全一致 → `id` が 1 つに決まるもの → 2 つ以上は使い方の誤り（終了コード 2・候補の `key`）→ 無ければ `not_found`（終了コード 1）。
      `USAGE_LINES`・`Command`・`parseCommand`・`main.ts` の switch と `printHelp`・`SKILL.md`（同じコミットで）。**承認・取り消し・有効と無効のサブコマンドは作らない**。テスト（引数の解釈・古いサーバ・同じ id が 2 つのとき、id は誤りで `key` は通る・`USAGE_LINES` に `approve`・`deny`・`revoke`・`enable`・`disable` が無いこと）
      対象: `packages/cli/src/commands/ext.ts`（新規）、`packages/cli/src/cliArgs.ts` `USAGE_LINES`・`Command`・`parseCommand`、`packages/cli/src/main.ts`、`packages/cli/skills/sodactl/SKILL.md`、`packages/cli/src/skill.test.ts`（通ること）、手本 `packages/cli/src/commands/display.ts`（`unsupported` の出し方）/ 根拠: research X18、`20261007-soda-extensions/research.md` R7、design「`sodactl ext`」
      依存: T10
      AC: AC16
- [ ] T13: 起動確認に段を足す: `handoffSmoke.ts` — 状態ディレクトリに `extensions.json`（起動のたびに、自分の pid と、起動した孫〔`sleep`〕の pid を、決まったファイルへ追記する拡張）を置いて起動 → 拡張が動いている → `soda handoff` → **前の拡張と孫の pid が消えていて、新しい pid で動いている**。
      `stopSmoke.ts` — 同じ拡張を動かして `soda session stop` → 拡張と孫の pid が消えている。pid の再利用を避けるため、確かめは、止めた直後に行う（既存の `isAlive`・`until` を使う）。不確かな点 2 の結果を `decisions.md` に 1 行
      対象: `packages/server/src/handoffSmoke.ts`（`main()` の段・`isAlive` 56 行付近）、`packages/server/src/stopSmoke.ts` / 根拠: research E6・E9・X20、design「受け入れ基準との対応」AC14
      依存: T10
      AC: AC14
- [ ] T14: 文書と見本（PR1 の分）: `docs/examples/extension-hello.mjs`（design「文書と見本」のとおり）と、`docs/extensions.md` の節「拡張とは」「置き場所と書き方」（**利用者の設定だけ**。リポジトリの中の設定には、触れない——PR3 の T29 で足す）「やり取り（1 行 1 JSON）」「操作と出来事の一覧」「上限」「見本」「`sodactl ext`」「安全と限界」（PR1 の時点の分: 隔離しない・**設定『スクリプトが動く表示』は、拡張からの守りではない〔拡張は、利用者の権限で、自分で有効に出来る。有効になると、すべての画面に知らせが出る〕**・冷却の巻き添え・環境変数は見える・コマンドに秘密を書かない〔標準エラーの記録に、断片が出うる〕・標準入力が閉じたら終わる決まり・異常終了で残りうる・自分でグループを抜けた孫は止められない・面の名前のぶつかり・面の数は合わせて数える）「新旧の組み合わせ」「Windows」（実機では確かめていない・親が先に終わった後の孫は止められない）。
      `docs/sodactl.md` に `sodactl ext` の節。**`docs/display.md` に 1 節「拡張が出した面」**（`docs/extensions.md` への案内・固定のラベルに拡張の id と種類が出る・拡張の面の操作と「閉じた」は、その拡張にだけ届き、pane の `wait`／`events` には返らない・pane のプログラムは、拡張の面を閉じられる／同じ名前で出し直せるが、データは送れない・`script-html` は、設定が有効で、かつ登録に `allow` があるときだけ・**冷却は pane ごとなので、拡張の面と、pane のプログラムの面は、互いを巻き添えにする**）と、「残る限界」の 9（形式は縛れない）に、「Sodashitsu が起動する拡張は、登録の `allow` で縛れる。pane の中のプログラムは、縛れない」を 1 文。`AGENTS.md` の頭の案内に 1 行（「- 拡張（設定に登録したプログラムを Sodashitsu が動かす。置き場所と書き方・やり取りの型・上限・安全と限界・`sodactl ext`）は `docs/extensions.md`。」の形）。
      結合テストに 1 つ足す: **文書の見本と同じファイル**（`docs/examples/extension-hello.mjs`）を起動して、pane に帯 `hello` が載ること・無効にする（＝標準入力が閉じる）と、強制終了（2 秒）を待たずに、0.5 秒以内に終わること（AC32）
      対象: `docs/extensions.md`（新規）、`docs/examples/extension-hello.mjs`（新規）、`docs/sodactl.md`、`AGENTS.md:7-18` の箇条書き、`docs/display.md`、`packages/server/src/extensions/extensions.integration.test.ts` / 根拠: research E9、design「文書と見本」、手本 `docs/custom-commands.md`
      依存: T11, T12
      AC: AC32, AC33

### PR2: 設定の画面

- [ ] T15: ブラウザの状態と通信: `store/extensions.ts`（design「ブラウザ」の項目）と `ExtensionController`（接続のたびに `extension.list`。`not_found` なら `supported = false`／`extension.changed` で取り直し、重なったら最後の 1 回／マシンの切り替えで捨てる／操作 `reload`・`restart`・`log`・`setEnabled`）。`StoreAdapter` で `extension.changed` を振り分け、`main.ts`・`injection.ts` に配線。
      `ActionDispatcher.reloadConfig()` が、`command.reload` に続けて `extension.reload` を呼ぶ（`not_found` は黙って無視。トーストの文は変えない）。純粋な `extensionView.ts`（状態 → 文・`lastExit` → 文・並べ方）と単体テスト
      対象: `packages/web/src/store/extensions.ts`（新規）、`packages/web/src/extensions/ExtensionController.ts`（新規）、`packages/web/src/extensions/extensionView.ts`（新規）と `extensionView.test.ts`、`packages/web/src/store/StoreAdapter.ts:122` の `switch`（`display.*` は 206〜210 行）、`packages/web/src/main.ts`、`packages/web/src/injection.ts`、`packages/web/src/actions/ActionDispatcher.ts:1531` `reloadConfig`、手本 `packages/web/src/store/agentIntegrations.ts`・`packages/web/src/ask/AskController.ts` / 根拠: research E9・X15・X17、design「ブラウザ」
      依存: T10
      AC: AC27
- [ ] T16: 節「拡張」の部品（design「ブラウザ」の `ExtensionSettings.vue`）: 説明・置き場所（**PR2 では、利用者の設定の場所だけ**。「リポジトリの `.soda/extensions.json`」の案内は、PR3 の T26 で足す）・［読み直す］・`supported === false` の文・`problems`・一覧（id・種類の印と根・作者の説明・許可〔`script-html` を持つ行に、画面の設定のストア（`settings.displayScriptEnabled`）が偽なら「サーバの設定『スクリプトが動く表示』が無効なので、スクリプトの面は出ません」〕・応答しないとき・状態の文・入切〔`role="switch"`〕・［起動し直す］・［ログ］）・ログの開閉（`<pre>` に `textContent`。［更新］）。
      `SettingsDialog.vue` の `.settings-body` の直下に置く（左のメニューが拾う）。**作者の説明・id・パスは、`v-html` を使わない**。操作中の行は、ボタンを押せなくする（二重押し）。この時点では、プロジェクトの行のボタン（［確認］［承認を取り消す］）と、「承認の記録」は無い（PR3 の T26）
      対象: `packages/web/src/components/ExtensionSettings.vue`（新規）、`packages/web/src/components/SettingsDialog.vue`（`.settings-body` の直下。「エージェント連携」1263〜1319 行の近く。`displayScriptEnabled` の入切は「端末」の節の 1243〜1254 行——**そこは変えない**。節「拡張」は、設定のストアの値を読んで、文を出すだけ）、手本 `packages/web/src/components/KeySettings.vue`（節を別の部品に分けた先例）/ 根拠: research E9・X15、design「ブラウザ」
      依存: T15
      AC: AC27
- [ ] T17: 「続けて落ちた」の知らせ: `ExtensionController` が、前の一覧で `failed` でなかった拡張が `failed` になったら、ふつうのトースト（「拡張『<id>』が続けて落ちたので止めました（設定 › 拡張）」）を出す。接続し直した直後の最初の一覧では、出さない（前の一覧が無い）。単体テスト（一覧の前後から、出すべき知らせを返す純粋な関数として）
      対象: `packages/web/src/extensions/ExtensionController.ts`、`packages/web/src/extensions/extensionView.ts`（`newlyFailed(prev, next)`）、`packages/web/src/store/view.ts:755` 付近 `toast`（呼ぶだけ）/ 根拠: research X16、design「ブラウザ」の「知らせ」
      依存: T15
      AC: AC30
- [ ] T18: E2E（設定の画面）: `support/appServer.ts` の `startAppServer` に、`internal.extensions`（`timings`）を渡す口を足す（`askImageFetcher` と同じ流儀。起動し直しの間隔を `backoffMinMs: 20` に縮める）。helper `support/extensions.ts`（状態ディレクトリに `extensions.json` を書く・拡張の `.mjs` を一時ディレクトリに書く・`process.execPath` でコマンドを組む・実行の印のファイルを読む）。
      spec: (1) 利用者の拡張を登録して［読み直す］→ 行が「動作中」になる（DOM）(2) 拡張を落とす（拡張が、決まったファイルが出来たら終了コード 1 で終わる）→ 開いたままの節で、状態が変わり、「続けて落ちたので止めた」と、トーストが出る（DOM を、上限つきで待つ）。**`document.activeElement` が変わらない** (3) 入切を切る → 「無効」。サーバを立て直しても「無効」のまま
      (4) ［ログ］で、標準エラーの目印の文字列が `<pre>` に出る（`<b>` を書いても、文字のまま）(5) **ブラウザが受けたフレーム（`framereceived`）のどれにも、設定に書いたコマンドの目印の文字列が無い** (6) 既存のキーの操作「設定を読み直す」で、足した拡張が一覧に出る (7) 節の入切・ボタンに `Tab` で届き、`Space`・`Enter` で押せる (8) 利用者の拡張が出したパネルが、ブラウザに出て、**枠の外の固定のラベル**が「拡張『<id>』の表示（利用者・隔離）」になっている。面の題・中身に何を書いても、ラベルは変わらない。`pane.sock`（`runDisplay`）で出したパネルのラベルは、今までどおり（AC31） (9) `allow` に `script-html` を持つ拡張の行に、設定が無効の間は「…無効なので、スクリプトの面は出ません」が出て、設定の「端末」の節で有効にすると消える（`enableScript` は、前提を作るのに使ってよい）
      対象: `packages/e2e/src/specs/extensions-settings.spec.ts`（新規）、`packages/e2e/src/support/extensions.ts`（新規）、`packages/e2e/src/support/appServer.ts`、手本 `packages/e2e/src/specs/settings.spec.ts`（`openSettingsByKey`）/ 根拠: research E9・X19、`.aidev/conventions/e2e-observe-browser.md`
      依存: T16, T17
      AC: AC27, AC30, AC31, AC-I3
- [ ] T19: 文書（PR2 の分）: `docs/extensions.md` に節「設定の画面」（一覧・状態の意味・入切は session ごとにサーバが覚える・ログ・読み直し）。`docs/tui-parity.md`「3. Web 版だけの拡張」の表に 1 行（拡張の一覧・承認: 対象外。端末版は面を出せないので。利用者の設定の拡張は、端末版だけでも動く）
      対象: `docs/extensions.md`、`docs/tui-parity.md`（表の末尾は W34〔表示の面。161 行〕。次は W35。W34 の行が手本）/ 根拠: research E9・X21
      依存: T16
      AC: AC33

### PR3: プロジェクトの設定と承認

- [ ] T20: プロジェクトの根と、設定の読み方: `resolveProjectRoot(cwd, deps)`（`findGitRoot` → `realpath` → 絶対パス・1024 文字以下・禁止する文字なし。**時間の上限は、この関数に置かない**〔`null` は「git の外」だけ。上限と、時間切れの扱いは、呼ぶ側の T22〕。**git のコマンドを呼ばない**）と、`loadProjectExtensionsFile(root, deps?)`（design「設定ファイル」の 1〜5 と 3'・3'': `.soda` がリンクでないディレクトリ・`O_NOFOLLOW`・fd の `stat` で通常ファイルと大きさ・
      Unix は、根・`.soda`・ファイルの持ち主が自分で、other が書けない・**根より上のディレクトリが、`/` まで、持ち主が自分か root で、other が書けないか、スティッキー**・グループが書けるなら `groupWritable`・`realpath` が決まった場所・同じ fd から読む）。不確かな点 6。
      単体テスト（一時ディレクトリに本物のファイルを作る。持ち主と、根より上は、偽の `stat` で）: ふつうのリポジトリ／linked worktree（`.git` がファイル）→ worktree の根／git の外 → `null`／根がリンク越し → 実体のパス／`.soda` がリンク → 誤り／`extensions.json` がリンク → 誤り／FIFO → 止まらずに誤り／64 KiB 超 → 誤り／`cwd` を書いた 1 件 → 誤り／17 件 → 誤り／
      ファイル・`.soda`・根のどれかが other から書ける（`chmod o+w`）→ 誤り／グループが書ける → 読めて `groupWritable: true`／持ち主が自分でない（偽の `getuid`）→ 誤り／根の親が other から書けてスティッキーなし → 誤り、スティッキーあり（`/tmp` の形）→ 読める／根より上の持ち主が root → 読める／根のパスに改行・書字方向の制御 → `null`／
      **`PATH` の先頭に、呼ばれたら印のファイルを作る偽の `git` を置いて、印が出来ないこと**
      対象: `packages/server/src/extensions/projectRoot.ts`（新規）、`projectRoot.test.ts`（新規）、`packages/server/src/extensions/extensionConfig.ts`（`loadProjectExtensionsFile` を足す）、`extensionConfig.test.ts`、`packages/server/src/session/workspaceLabel.ts:55` `findGitRoot`（呼ぶだけ。変えない）/ 根拠: research E3・X6、design「プロジェクトの根」「設定ファイル」、脅威 S1・S6・S24
      依存: T3
      AC: AC17, AC28
      点検: あり
- [ ] T21: 承認の記録: `ApprovalStore`（design「鍵と、承認の記録」: `load`・`lookup`・`decide`・`revoke`・`list`〔記録の全部。`root`・`id`・時刻だけ〕・`signature()`〔見張り用の `stat` の署名〕。根の `extension-approvals.json`。(根, id) ごとに 1 件で、`approved`〔鍵と中身〕と `denied`〔鍵〕を別に持つ・読むときの検査・**だめなら記録なし**・
      **書く手順**〔鍵のファイルに持ち主の印・**鍵を取る待ちを含めた全体で 2 秒**・読み直す・読み直せなければ書かない・**打ち切った後の続きは、書かない**（各段の前に、打ち切り済みでないこと・鍵が自分の印のままであることを確かめる）・前の書く手順が返っていなければ、次は始めずに誤り・**打ち切っても、鍵は、裏の続きが返るまで消さない**・`writeFileAtomic` の直前にも確かめる・自分の印のときだけ消す・30 秒より古い置き去りの鍵は、中身と時刻を確かめ直してから消す〕・256 件・`version` が新しければ、読まず・書かない）。
      単体テスト: `lookup`（`approved` の鍵と同じ → `approved`・`denied` の鍵と同じ → `denied`・どちらでもない → `none` と `previous`〔`approved` の中身〕と `deniedBefore`・無い → `none`）／A を承認 → B を `denied` → A の鍵は `approved` のまま／`decide(approved)` は `denied` を消す／`revoke` は、その (根, id) の 1 件を全部消す／
      壊れた JSON・知らない項目・リンク・ほかの利用者が書ける → 記録なし／**読み直しが読めない（偽の `open` が `EACCES`・時間切れ）とき、`decide` は誤りで、ファイルが変わらない**／257 件目で、古いものから捨てる／
      鍵のファイルが残っている（新しい）→ 2 秒待って誤り・記録は変わらない／**読み直しが 2 秒で返らず、`decide` が誤りを返した後に、読み直しが返っても、ファイルが書かれない**（偽の `open` を、後から返す）。**その間、鍵のファイルは残っていて、裏の続きが返った後に消える。裏の続きが返る前の、次の `decide` は、始めずに誤り**／30 秒より古い鍵のファイル → 消して書ける／消そうとした鍵のファイルの中身が、確かめ直したら変わっていた → 消さない／`version: 2` のファイル → 記録なし・`decide` は誤りで、ファイルが変わらない／
      2 つの `ApprovalStore`（別の session のつもり）が、**同時に**（`Promise.all`）`decide` と `revoke` をしても、どちらも失われない（片方が誤りで返ることは、あってよい。黙って失われない）／書いたファイルの権限が 0600・終わった後に、鍵のファイルが残っていない
      対象: `packages/server/src/extensions/ApprovalStore.ts`（新規）、`ApprovalStore.test.ts`（新規）、`packages/server/src/extensions/approval.ts`（T9 の `entryDigest` を使う）、`packages/server/src/persist/atomicFile.ts` `writeFileAtomic`、手本 `packages/server/src/machine/MachineCatalog.ts`（根に置く・`loadCatalog`・`saveCatalog`）/ 根拠: research E2・X4・X5、design「鍵と、承認の記録」、脅威 S3・S18
      依存: T9
      AC: AC19, AC20, AC34
      点検: あり
- [ ] T22: ホストに、プロジェクトの分を足す（その 1: 根・あるべき集合・起動の確かめ直し）: bus の `workspace.created`・`workspace.closed` の購読（**200ms まとめて、長くても 1 秒で、差を埋める**——T9-4 の、設定を読まない「pane の一覧の作り直し」とは別の道。`workspace.closed` は、受け手の中で、その id の根の覚えを 1 つ消す）・`reload` の「根を引き直す」印・`reconcile` の 2（workspace → 根を引く〔1 つ 2 秒の上限は、ここで付ける・2 つずつ並行・合わせて 5 秒・**時間切れは「根なし」として覚えない**・時間切れがあれば 5 秒後に 1 回予約（続けて 3 回まで）〕→ **対応表を作り終えてから差し替える** → 根ごとに `loadProjectExtensionsFile`。辞書順で 33 個目からは、読まずに `problems`）・3（承認の記録）・4 の `pending`・`denied`、
      **`startOne` の 3（プロジェクトの読み直し）と 4（承認の記録の読み直し）**、承認の記録の見張り（5 秒ごとに `signature()`。変わったら、差を埋める）、作業ディレクトリ（根）と `SODA_PROJECT_ROOT`、`ExtensionInfo.approval`（`digest`・`status`・`command`・`cwd`・`groupWritable`・`decidedAt`・`previous`・`deniedBefore`・`approvedAlive`）と `list().approvals`。起動のときの workspace は `snapshot()` から読む（復元は bus に出ない）。
      **この時点では、`approve` などの操作は無い**（T22-2）。テストは、`ApprovalStore` へ直接書いて、前提を作る。単体テスト（偽の子・時計・一時ディレクトリ）: 記録なし → `pending` で `spawn` が呼ばれない／`approved` の記録あり → 動く／`denied` の記録あり → `denied`・`spawn` なし／`enabled: false` で未承認 → `disabled`（`pending` ではない）／
      **`spawn` へ至るきっかけを 1 つずつ**（`start`・`workspace.created`・`reload`・`restart`・`setEnabled(true)`・`stop` → `start`〔入れ替えの失敗からの再開〕・上限の空き・`backoff` の時間切れ）で、承認が無ければ `spawn` が呼ばれないこと（AC18）／
      **承認 → 設定ファイルを書き換え → 拡張を落とす → 時間を進める → `spawn` が呼ばれず `pending`**（AC21。`startOne` の 3）／**承認して動かす → 承認の記録のファイルから、その 1 件を直接消す（見張りの時間が来る前）→ 拡張を落とす → 時間を進める → `spawn` が呼ばれない**（`startOne` の 4。`reconcile` の判定は、まだ `eligible` のまま、という場面）／
      承認 → 別の中身に書き換え（`pending`）→ **承認した中身へ戻す → 聞き直されずに動く**／画面の入切で切って入れ直しても、承認は保たれる／`denied` の拡張を、画面の入切で切って入れ直す・`restart` しても、`denied` のまま／A を承認 → B が `denied` → C に書き換え: `previous` は A・`deniedBefore` が真・`approvedAlive` が真／
      最後の workspace が消えると止まり、一覧から消える。記録は残り、`list().approvals` に `active: false` で出る／33 個の根 → 辞書順で 33 個目は読まれず（偽の `open` の記録）、`problems` に出る／根を引く処理が返らない workspace があっても、ほかの根の拡張は動き、5 秒後に、差を埋める仕事が予約される／
      `reload` の直後（根を引き直している途中）に、範囲の検査が走っても、古い対応表で答える（空の表を見せない）／別の `ApprovalStore`（別の session のつもり）で記録を消す → こちらの拡張が、見張りの 1 回（`approvalsPollMs`）で止まる
      対象: `packages/server/src/extensions/ExtensionHost.ts`（T9-2 の `// PR3（T22）` の場所）、`ExtensionHost.test.ts`、`packages/server/src/session/SessionService.ts:253` `snapshot` / 根拠: design「`ExtensionHost`」（差を埋める・起動・きっかけの表の見張り）、脅威 S1〜S5・S13・S23
      依存: T20, T21
      AC: AC17, AC18, AC19, AC20, AC21, AC22, AC26, AC34
      点検: あり
- [ ] T22-2: ホストに、プロジェクトの分を足す（その 2: 承認の操作）: `approve`・`deny`（`isScreenKind`・`desired` にあって `pending`／`denied`・**`digest` の一致**・`extension_stale`）・`revoke(clientId, root, id)`（画面だけ。**`desired` に無い (根, id) でもよい**）。どれも `chain` の中で、記録を書いてから、差を埋める。承認した直後に枠が無ければ `over_limit`。`stopped` の間は、記録だけを書く（起動は、次の `start()`）。記録が無い (根, id) の `revoke` は、何もせずに成功。
      単体テスト: `approve` → 動く／`deny` → `denied`・`spawn` なし／`deny` の後の `restart` でも `spawn` なし／`revoke` → 止まって `pending`（`disabled` の拡張でも、記録が消える）。`revoke` の後の `restart` でも `spawn` なし／いま workspace が無い根の記録を `revoke` → 消える（開き直すと `pending`）／古い `digest` の `approve` → `extension_stale`・記録は書かれない／
      `disabled` の拡張への `approve` → `not_found`／**`desired` に無い (根, id) を `revoke` → `extension.changed` が出る**（`approvals` も、比べる対象）。記録のファイルを、外から書き換えて、見張りが拾う → `extension.changed` が出る／画面の種類でない接続の `approve`・`deny`・`revoke` → `invalid_params`／記録の書き込みが誤り（鍵のファイルを取れない）→ 方式が誤りを返し、状態が変わらない／動いている数が 32 のときの `approve` → `over_limit`（動いているものは止まらない）
      対象: `packages/server/src/extensions/ExtensionHost.ts`、`ExtensionHost.test.ts` / 根拠: design「承認の操作」、脅威 S5・S9・S18
      依存: T22
      AC: AC19, AC21, AC22, AC23
      点検: あり
- [ ] T22-3: ホストに、プロジェクトの分を足す（その 3: 範囲）: `inScope`（プロジェクトの拡張は、`commandContext(paneId)` → workspace → `workspaceRoots` の根が、拡張の根と文字列として等しいときだけ。**要求のたび**。根の無い workspace は外）。T9-4 の、出来事の前の確かめ・面を持つ pane の見直し・`ext.panes` が、この `inScope` を使うこと。
      単体テスト: 別の根の workspace の pane への `display.set` → `not_found`（無い pane と、同じ code・同じ文）／`ext.panes` に、別の根・根の無い workspace の pane が出ない／pane が、別の根の workspace へ移る（偽の `commandContext` の答えを変える。bus のイベントは出さない）→ 見直しの 1 回で、面が消え、`display.closed`（`out_of_scope`）が届き、その後の `display.set` は `not_found`／
      移った後・見直しの前に、その面の `display.action` が来ても、拡張へ渡らない／利用者の拡張は、どの pane も範囲の中
      対象: `packages/server/src/extensions/ExtensionHost.ts`（`inScope`）、`ExtensionHost.test.ts`、`packages/server/src/session/SessionService.ts:829` `commandContext` / 根拠: design「範囲と許可」、脅威 S10
      依存: T22
      AC: AC24
      点検: あり
- [ ] T23: protocol と `/ws` の方式（承認）: `extension.approve`・`extension.deny`（`{ key, digest }`。`digest` は 16 進 64 文字）・`extension.revoke`（`{ root, id }`）を `METHOD_SCHEMAS`・`MethodResultMap` と `registerExtensionMethods` に足す。エラーの code `extension_stale` を `errors.ts` と `clientError.ts`（「登録が変わりました。中身を確かめ直してください」）に。`composeServer.ts` で、`ExtensionHost` に `sessionRoot` が渡っていることを確かめる。
      テスト: 3 つの方式が通る／`external` の接続から `invalid_params`／中継越し（`viaBridge`）の、画面の種類の接続からは通る／**`pane.sock` へ `extension.approve`・`extension.deny`・`extension.revoke` を送ると `unknown_op`**／`extension.list` の結果に、プロジェクトの拡張の `approval.command` があり、利用者の拡張には `approval` が無い。`approvals` に、コマンドの文字列が無い
      対象: `packages/protocol/src/messages.ts`、`packages/protocol/src/errors.ts`、`packages/client-core/src/net/clientError.ts:98-103`（display の code）の後、`packages/server/src/surface/methods/extension.ts`、`packages/server/src/composeServer.ts`、テストは `packages/server/src/extensions/extensions.integration.test.ts` か `surface` の既存のテストの流儀 / 根拠: research E4・X9・X14、design「`/ws` の方式とイベント」、脅威 S9
      依存: T22-2
      AC: AC22, AC23
      点検: あり
- [ ] T24: 安全の結合テスト（実際の子プロセス・一時のリポジトリ。`win32` はスキップ。`timings` で、`backoffMinMs: 20`・`approvalsPollMs: 100`・`scopeReviewMs: 100`）: helper（一時ディレクトリに `.git/HEAD` と `.soda/extensions.json` を作る・コマンドは「印のファイルを作る」拡張・workspace を、その場所で作る）。
      見ること: (1) workspace を作る → 一覧に `pending`。**印のファイルが無い**。サーバを立て直す・`extension.reload`・`extension.restart`・`setEnabled` の後も、無い（AC17・AC18）(2) 画面の接続から `approve` → 印が出来る。サーバを立て直しても動く（聞き直されない）。**同じ `sessionRoot` で別の `stateDir`（別の名前付き session）のサーバでも、動く**（AC19）
      (3) 登録の項目を 1 つずつ変えて `reload` → 止まって `pending`。同じファイルの別の拡張は、同じ pid のまま。承認した中身へ戻して `reload` → 聞き直されずに動く。リポジトリを別の場所へ写して workspace を作る → `pending`（AC20）(4) 承認 → ファイルを書き換え（読み直さない）→ 拡張を落とす → 起動し直されず `pending`（AC21）
      (5) `deny` → 印が出来ない・`pending` でない。後で `approve` → 動く。`revoke` → pid が消えて `pending`。**別の session のサーバで `revoke` → こちらの pid が、見張りのうちに消える**。承認して動かす → **承認の記録のファイルから、その 1 件を直接消し、すぐ拡張を落とす → 起動し直されない**（この項だけ、`approvalsPollMs` を長く〔60 秒〕したサーバで。**見るのは、起動の回数**——拡張が、起動のたびに pid を追記するファイルの行数が、増えないこと。最後の状態だけを見ない: 見張りが後から止めても、通ってしまう）。workspace を全部消した後、記録が `approvals` に出て、`revoke` で消え、開き直すと `pending`（AC18・AC22）
      (6) 2 つのリポジトリの workspace で、片方の拡張が、他方の pane へ `display.set` → `not_found`。`ext.panes` に、他方の pane が無い。pane を、他方の workspace へ移すと、面が消え、拡張に `display.closed`（`out_of_scope`）（AC24）(7) `allow` なしの `script-html` → `unsupported`（利用者・プロジェクトの両方。設定が有効でも）。`allow` を足すと `pending` に戻る。承認すると、設定が有効なら出せ、無効なら `display_script_disabled`（AC25・AC20）
      (8) 最後の workspace を消すと、pid が消え、一覧から消える。作業ディレクトリが根で、環境変数に `SODA_PROJECT_ROOT`（AC26）(9) `.soda` がリンク・`extensions.json` がリンク・`cwd` つき・`chmod o+w` したファイル → 一覧に理由が出て、印が出来ない（AC28）(10) 承認の記録を壊す → 全部が `pending`（動く側に倒れない）。無効の記録を壊す → 全部が「無効」
      対象: `packages/server/src/extensions/extensions.integration.test.ts` / 根拠: design「受け入れ基準との対応」、脅威 S1〜S6・S10・S11・S18・S24
      依存: T23, T22-3
      AC: AC17, AC18, AC19, AC20, AC21, AC22, AC24, AC25, AC26, AC28
- [ ] T25: 画面の純粋な部分: `approvalView.ts` — `diffEntry(previous, current)`（変わった項目だけ。`allow` は並びを無視）・`hasNonAscii(s)`・`nonAsciiList(s)`（文字と符号位置。重複を除いて 16 個まで・残りの数）・`showPath(s)`（禁止する文字を `\u{…}` に）・`allowText(allow)`・
      `pendingQueue(list, key)`（開いたときの、同じ根の `pending` の `key` の一覧）と `nextInQueue(queue, list, afterKey)`（一覧の次の、まだ `pending` のもの。無ければ `null`）・`pendingNotice(list, notified)`（知らせを出すべき `key:digest` と件数。`disabled` は入らない）。単体テスト
      対象: `packages/web/src/extensions/approvalView.ts`（新規）、`approvalView.test.ts`（新規）/ 根拠: design「ブラウザ」
      依存: T15
      AC: AC29, AC30
- [ ] T26: 承認のダイアログと、知らせ（design「ブラウザ」の `ExtensionApprovalDialog.vue` と「知らせ」の全部）: 別の `<dialog>`・`showModal()`・`view.setExtensionApprovalOpen`（`modalOpen` に入れる）・背景で閉じない・`Esc` は［後で］・中身 1〜8（**全部 `textContent`。`v-html` を使わない**。コマンドの `<pre>` に、高さの上限・内側のスクロールを付けない。ボタンは中身の後ろ）・
      開いたら［承認しない］へフォーカス・［承認して動かす］は 1 秒 `disabled`・**1 秒をやり直すのは、中身が替わったとき（`extension_stale`・`digest` の変化・次の 1 件）と、ほかのモーダルが開いた／閉じたとき。フォーカスを［承認しない］へ置き直すのは、中身が替わったときと、ほかのモーダルが「閉じた」ときだけ**（開いたときは、上のモーダルからフォーカスを奪わない。閉じたときの置き直しは、閉じたモーダル自身のフォーカスの戻しの後——`nextTick` と `requestAnimationFrame` の後）・その拡張が `pending`・`denied` でなくなったら、次へ替わるか閉じる・
      「N 件中 M 件目」・1 件を決めたら、**開いたときの同じ根の一覧の**次へ・`deniedBefore` の注意・「前に承認した中身の記録は、残っています」・ASCII でない文字の符号位置・`groupWritable` の注意・マシンの名前・**`allow` に `script-html` があるときの、固定の文 3 つ**（スクリプトが読めるもの／設定が有効のときだけ動く・いまは有効｜無効〔`settings.displayScriptEnabled`〕／設定は、拡張からの守りではない）・閉じたら `restoreFocus`。**開くのは `store.dialogKey` が入ったときだけ**（`extension.changed` では開かない）。
      節「拡張」: 置き場所の案内に「リポジトリの `.soda/extensions.json`」を足す。プロジェクトの行に［確認］（`pending`・`denied`）と［承認を取り消す］（**`approval.approvedAlive` なら、どの状態でも**。`extension.revoke { root, id }`。いまの登録と鍵が違う行には「前に承認した中身の記録が残っています」を添える）。
      **`disabled` の行にも、承認の有無（承認済み・未承認・承認しない）を出す。`approval.groupWritable` の行に、注意の印**。ダイアログには、別のマシンを表示中なら、マシンの名前。**設定のいまの値（有効｜無効）は、`extension.list` からではなく、画面の設定のストア（`settings.displayScriptEnabled`。`prefs.changed` で替わる）から出す**——節「拡張」の行の文も、ダイアログの文も、設定を変えると、開いたままで替わる。節の末尾に「承認の記録」（`list.approvals`。いま開いていないリポジトリの分も。［記録を消す］）。
      承認待ちの、消えないトースト（1 つ・件数・［確認する］・0 件で消す・閉じたものは出し直さない）。`App.vue` に置く
      対象: `packages/web/src/components/ExtensionApprovalDialog.vue`（新規）、`packages/web/src/components/ExtensionSettings.vue`（T16）、`packages/web/src/extensions/ExtensionController.ts`（T15・T17）、`packages/web/src/store/extensions.ts`、`packages/web/src/store/view.ts`（`setAskOpen` 364 行・`modalOpen` 382 行）、`packages/web/src/App.vue`（`<AskDialog />` 104 行・`<Toast />` 109 行の近く）、手本 `packages/web/src/components/AskDialog.vue`（`showModal`・`onNativeCancel`・`restoreFocus` 130 行）/ 根拠: research E9・X16、design「ブラウザ」、脅威 S7・S8・S19
      依存: T16, T17, T23, T25
      AC: AC22, AC29, AC30, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
      点検: あり
- [ ] T28: E2E（承認）: spec — 一時のリポジトリ（`.git/HEAD`・`.soda/extensions.json`。コマンドは、印のファイルを作って動き続ける `.mjs`）で workspace を作る。
      (1) 消えないトースト（件数 1・［確認する］）が出る。**`document.activeElement` は、出る前と同じ**。ダイアログは、開いていない（AC30・AC-I1）(2) ［確認する］で開く。根・設定ファイルのパス・id・コマンドの全文（`<b>x</b>` を含む 1024 文字のコマンドが、`<pre>` の `textContent` に全部あり、`<b>` の要素が無い・`<pre>` の `scrollHeight` が `clientHeight` と等しい）・作業ディレクトリ・固定の文言 2 つ・`allow`（なし）・`onUnresponsive`・「作者が書いた説明」の見出し・ASCII でない文字の注意と符号位置が出る（AC29）
      (3) 開いた直後のフォーカスは［承認しない］。［承認して動かす］は `disabled` で、`disabled` が外れるのを待つと押せる。**開いた直後に `Enter` を 2 回打っても、承認にならない**（印が無い。状態は `denied`）（AC-I4・S8）(4) 設定の節から［確認］で開き直し、［承認して動かす］→ 行が「動作中」になり、印が出来る。**ブラウザが送ったフレームの `extension.approve` の `digest` が、受けた `extension.list` の `approval.digest` と同じ**（AC29・AC-I2）
      (5) 登録を書き換えて［読み直す］→ トーストが出て、ダイアログに「前に承認した登録からの変更」（前と後）と、「前に承認した中身の記録は、残っています」（AC29）(6) ダイアログを開いたまま、登録を書き換えて読み直す → 「登録が変わりました」と出て、中身が替わり、［承認して動かす］が、また `disabled`・フォーカスが［承認しない］（AC-I2）(7) `Esc` で閉じると、`pending` のまま・印が無い・フォーカスが、開く前の場所へ戻る。同じ登録では、トーストは出し直されない（AC-I1・AC-I4）
      (8) （別のテストで。ページを新しく開く）キーボードだけで: トーストの［確認する］へ `Tab` → `Enter` → `Tab` でボタンを巡る → `Enter`（AC-I3）(9) 設定の画面を開いたまま、ダイアログを開いて閉じると、設定が残っている。開いている間に打ったキーが、端末へ届かない（ブラウザが送った入力のフレームが無い）（AC-I5）
      (10) 同じリポジトリに承認待ちが 2 件のとき、「2 件中 1 件目」と出て、1 件を決めると、次の 1 件に替わる。別のリポジトリの承認待ちへは、替わらずに閉じる。「すべて承認」のボタンが無い（AC-I1・AC29）(11) ダイアログを開いて、［承認して動かす］へ `Tab` で移ったまま、pane から `sodactl ask` の質問を出して閉じると、その直後、［承認して動かす］が `disabled` に戻り、フォーカスが［承認しない］にある（S8）
      (12) workspace を全部消す → 設定の「承認の記録」に、そのリポジトリの行が出て、［記録を消す］で消える（AC22）(14) `allow: ["script-html"]` の登録 → ダイアログに、固定の文 3 つが出て、「いまは、無効です」が、設定を有効にしてから開き直すと「有効です」になる（AC29・S11）(13) `chmod g+w` した設定ファイルのリポジトリ → 一覧の行とダイアログに、グループの注意。B を［承認しない］にしてから C に書き換える → ダイアログに「前に『承認しない』とした」。画面の入切で切ったプロジェクトの行に、承認の有無が出る（AC29・S19・S24）
      対象: `packages/e2e/src/specs/extensions-approval.spec.ts`（新規）、`packages/e2e/src/support/extensions.ts` / 根拠: `.aidev/conventions/e2e-observe-browser.md`、design「ブラウザ」、脅威 S7・S8・S19
      依存: T26
      AC: AC22, AC29, AC30, AC-I1, AC-I2, AC-I3, AC-I4, AC-I5
- [ ] T29: 起動確認と文書（PR3 の分）: `handoffSmoke.ts` に段 — 一時のリポジトリで workspace を作り、承認していない拡張の印のファイルが、**`soda handoff` の後も無い**（AC18）。`docs/extensions.md` に節「プロジェクトの拡張と承認」（置き場所・`cwd` は書けない・承認の流れ・鍵に入るもの・承認した中身へ戻すと動くこと・扱える pane の範囲・寿命・`allow`・承認の取り消しと「承認の記録」・記録の場所・読まれない場所〔ほかの利用者が書ける〕）と、
      「安全と限界」の残り（スクリプトの中身は鍵に入らない・同じ場所の差し替え・接続の種類は境界でない・承認の記録は同じ利用者が書ける・`sodactl` からは承認できない・取り消しが、ほかの session に届くまで数秒・中身を変えれば、聞き直される・別のマシン）。`AGENTS.md` の案内の行に、承認を足す
      対象: `packages/server/src/handoffSmoke.ts`、`docs/extensions.md`、`AGENTS.md` / 根拠: design「脅威と対策」の「残る限界」
      依存: T24
      AC: AC18, AC33
- [ ] T30: 負の対照（**test 工程で消化する**。PR ごとに、その PR の守りの分。PR1 の分は、PR1 の test 工程で）: 守りだけを外して、対応するテストが落ちることを確かめ、戻す。落ちたときの生の出力を `test-result.md` に貼る。**落ちなければ、テストを書き直す**（`regression-negative-control.md`）。
      **PR1** — (d) T7 の持ち主の検査（札つきの出来事を、pane の列にも入れる／札つきの `close` が、札を見ない／`send` が、札を見ない）を外す → T7・T11 (6)(14) が落ちる。(j) T8 の `allow` の検査を外す → T8・T11 (14) の「`allow` なし → `unsupported`」が落ちる（設定が有効のとき、通ってしまう）。(e) T6 の、グループへの合図（子の pid へだけ送る）を外す／`stop` が、子の `exit` だけで返るようにする → T6 の実際の子のテスト (i)(iii)・T11 (9) が落ちる。
      (f1) `setEnabled` の `isScreenKind` を外す → T9-2・T10 の「`external` の接続から `invalid_params`」が落ちる。(g) `startOne` の 6（`spawn` の直前に `stopped`・`epoch` を見直す）を外す → T9-2 の「読んでいる途中で `stop()`」が落ちる。(h) `onExit` の `runId` の一致の検査を外す → T9-3 の「遅れて届いた `exit`」が落ちる。(i) 出来事を渡す直前の範囲の確かめを外す → T9-4 の「範囲の外の pane の `display.action`」が落ちる。
      **PR3** — (a) 承認の検査を、**層ごとに**: (a1) `reconcile` の 4 の、承認の判定だけを外す（プロジェクトの拡張を、記録を見ずに `eligible` にする）→ 状態が `pending` であることを見るテスト（T22）は落ちるが、`startOne` の 4 が止めるので、印のファイルは出来ない（T24 (1) は通る＝二重の守りが効いている、と記録する）。
      (a2) `startOne` の 4 だけを外す → T22・T24 (5) の「記録を直接消して、すぐ落とす」が落ちる。(a3) 両方を外す → T22 のきっかけごとのテスト・T24 (1) が落ちる。
      (b) `startOne` の 3（読み直して `digest` を比べる）を外す → T22・T24 (4) が落ちる。(c) `inScope` を、いつも真にする → T22-3・T24 (6) が落ちる。(f) `approve` の `isScreenKind` を外す → T22-2・T23 が落ちる。
      (a1) の注意: 外した状態では、`startOne` の 4 が断るたびに、差を埋める仕事が予約され続ける。T22 の単体は、時計を決まった分だけ進めて、`spawn` の回数（0）と状態を見る形にする（落ちずに回り続けるテストにしない）
      対象: `packages/server/src/extensions/ExtensionHost.ts`・`ExtensionProcess.ts`・`packages/server/src/display/DisplayService.ts`（外して、戻す）、`.aidev/works/20261007-ext-host/test-result.md`（新規）/ 根拠: `.aidev/conventions/regression-negative-control.md`、requirements AC35
      依存: T11, T24
      AC: AC35
