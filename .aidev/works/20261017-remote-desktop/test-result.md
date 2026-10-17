# リモートデスクトップPoCの実装・検証記録

日付: 2026-10-17。worktree: `/workspaces/sodashitsu-remote-desktop`、branch: `feature/remote-desktop`、起点: `72d486a5`（PR #170）。コミット・PR・mergeは未実施。

最新の追加範囲: StretchBltへの変更、取得開始を基準とするpacing、期限付きエージェントAPIと参照クライアント。最新の検証結果は末尾「追加実装の最終確認」に記載。

## 実装範囲

既存machine接続を前提に、Aの共有窓から既存RPCチャネルでBへ要求し、BがAへ専用WSSを自動接続する。viewer別の一回限りticket、Bの事前opt-inと入力許可、接続/ログアウト/停止/引き継ぎ時の失効、単一共有、1枚の描画ACK待ちを実装した。組み込み窓は移動/サイズ変更/最大化/停止とマウス・キー・確定文字入力に対応する。

Windows helperはWindows PowerShell/.NET FrameworkのGDI/JPEG/SendInputを使うソースを作成し、実Windows環境でC#コンパイルを確認した。Console.Inの同期ブロックを避ける専用reader threadと、bounded queue、独立watchdog、現地停止の小窓を含む。当初は実機操作禁止のためコンパイルだけを確認。その後、このペインでユーザーの「許可します」を受領し、専用Windowsテストアプリで実画面取得・入力の検証を実施した（下記）。インストール/実行ポリシー変更/Firewall変更等はしていない。

利用方法・制限は[docs/remote-desktop.md](../../../docs/remote-desktop.md)。調査の元メモは `/tmp/sodashitsu-remote-desktop-study.md`。

## 検証結果

- `pnpm build`: 成功。従来と同じbundle size警告あり。
- `pnpm typecheck`: 成功。
- 全体Vitest: 675 files、10,918 passed、1 skipped、1 failed（agent.test.ts）、別にdist鮮度チェックで1 suite失敗。
- agent.test.tsの失敗は、入力delayの期待1000msに対して実装300ms。起点`72d486a5`だけの別worktree `/tmp/sodashitsu-desktop-baseline-20261017` でも同じ失敗を再現。今回の差分では変更していない。
- dist鮮度チェックは全体試験中の修正によるもの。最新build後、該当PTY suiteとdesktop/protocolの関連試験を再実行し、3 files/7 tests成功。
- 関連ブラウザE2E: remote-desktop / outbound-delegation / remote-web-previewの4 tests成功。画像は実ブラウザのcanvas pixel/描画数/受信frameで確認。日本語とキーは模擬helperへの入力記録で確認し、実Windows入力と取り違えない。
- 停止/引き継ぎの結合試験: 2 files/10 tests成功。
- `pnpm smoke`: PASS。
- Windows helper（許可前のコンパイル確認）: `.ps1`のAST parseおよびC# Add-Typeコンパイル成功。Runは呼ばず、capture/SendInputを実行しなかった。`.ps1 -ValidateOnly`での起動はWindows実行ポリシーに拒否されたため、ポリシーは変えずにソースのコンパイルだけを確認した。
- 独立レビュー: 2件の指摘を修正し、修正差分の再レビューで解決確認。別記review.mdを参照。
- `git diff --check` とNodeのスクリプト構文チェック: 成功。

ログ: `/tmp/soda-desktop-build-final.log`, `/tmp/soda-desktop-typecheck-final.log`, `/tmp/soda-desktop-all-tests.log`, `/tmp/soda-desktop-baseline-agent.log`, `/tmp/soda-desktop-recheck.log`, `/tmp/soda-desktop-e2e-final.log`, `/tmp/soda-desktop-smoke.log`, `/tmp/soda-desktop-lifecycle.log`。

## 模擬ソースの性能結果

同じLinux x64ホスト内の実A/BサーバーをB発操作委譲で接続し、製品の窓をChromiumで描画。Node v24.15.0、Chromium153.0.8010.12。各100 frame、端末echoは共有あり/なし各30 sample。全体試験・build終了後、3条件を順番に実行し、同時に別の試験は流していない。

| 解像度 | 目標fps | 達成fps | 平均Mbps | relay→描画ACK p95(ms) | 端末echo p95 共有なし→あり(ms) |
|---|---:|---:|---:|---:|---:|
| 1280×720 | 10 | 9.21 | 12.66 | 16.0 | 21.6 → 38.6 |
| 1920×1080 | 10 | 8.38 | 25.20 | 40.6 | 47.4 → 28.9 |
| 1280×720 | 20 | 16.81 | 23.08 | 21.0 | 20.9 → 23.3 |

**PNGを生成する模擬sourceの伝送・復号結果であり、Windowsキャプチャ/JPEGや実回線の測定ではない。** ACKはdrawImageの完了であり、物理ディスプレイへの表示完了ではない。端末echoはブラウザ受信後の次のanimation frameまでで、文字pixelが変わったことを試験していない。各条件1回・30 echo sampleの変動から、性能の改善/無影響/安定した上限を断言しない。

source生成/PNG encodeのp95、source CPU/RSS、同じNode内のA/BのCPU/RSS、browser task時間/JS heapもJSONに記録した。短時間試験なのでメモリリークや長時間安定性の証明ではない。現行pacingは生成/encode後の待ち時間も含むため、目標fpsに届かない分にはsource側の生成/encode・待ち時間も含まれる。

生データ:
- [soda-desktop-perf-1280-10.json](soda-desktop-perf-1280-10.json)
- [soda-desktop-perf-1920-10.json](soda-desktop-perf-1920-10.json)
- [soda-desktop-perf-1280-20.json](soda-desktop-perf-1280-20.json)

## 残る受け入れ項目

- [x] 許可されたWindowsセッションの専用アプリでGDI取得/JPEG/クリック・通常キー・日本語/絵文字の確定文字入力（drag/wheel/IME変換は未検証）。
- [ ] Windowsの現地停止、通信断時の押下解除、ロック/UAC/対象画面変更時の停止。
- [ ] 通常アプリの視覚的な入力反映時間を、処理ACKと分けて測定。
- [ ] DPI/日本語配列・IME・GPU描画等の互換性。
- [ ] 実ネットワークと20Mbps/RTT100ms等の制限条件、30分の継続試験。
- [ ] 実測を基に、GDI/JPEGの改善またはDXGI/hardware encoding/WebRTCの追加判断。

現在の実装はPoCであり、実Windows1台の専用アプリでの検証に限る。全OS対応・無人ログイン対応とは扱わない。ソフトのインストール、RDP/VNC有効化、Firewall/ポート/Funnel変更、Windowsセッション切断は実施していない。


## 許可後の実Windows検証（2026-10-17）

ユーザーの「許可します」を受け、テスト専用WinFormsアプリをWindowsの一時フォルダへコンパイルして起動した。インストールや実行ポリシーの変更はしていない。既存PowerShell/.NET FrameworkのAdd-Typeで同じWindowsDesktopHost.csにMainだけを足したconsole exeを生成し、Bのローカルコマンドに設定した。`.ps1`の実行制限を変更せず、ソースをコンパイルした実行ファイルで検証した。A/Bは一時state・loopback接続、BはWSL、実際のキャプチャ/SendInputはWindows側。画像そのものを保存するtrace/screenshot/videoは無効にした。

実機は200% DPIで、物理3200×2000、送信1280×800・設定10fps・JPEG品質65。テストアプリのボタン色がクリックで緑、入力文字が`a日本語😀`になると別パネルが青になるようにし、**Aブラウザのcanvas画素の変化**で入力反映を確認した。helperのACKだけで成功とはしなかった。閲覧状態でのクリックではアプリのclick数は増えなかった。文字のIME変換はAの入力欄で確定した文字の送信であり、Windows IME操作の成功を意味しない。

100フレームの1回測定（生データ: [soda-desktop-native-perf.json](soda-desktop-native-perf.json)）:

| 指標 | 測定値 |
|---|---:|
| 達成fps / 平均通信量 | 3.46fps / 3.93Mbps |
| GDI取得＋縮小 p95 | 181.2ms |
| JPEG encode p95 | 4.45ms |
| A relay→ブラウザdraw ACK p95 | 18.0ms |
| source CPU（1core=100%）/ peak RSS | 50.4% / 122.6MiB |
| click→色変化を試験で検出 | 535ms（1操作） |
| 確定文字送信→色変化を試験で検出 | 986ms（1操作） |

視覚検出時間はPlaywrightのclickとexpect.pollの待ち間隔も含む上限寄りの測定で、入力遅延のp95ではない。静止画面中心・同一PC内loopback・1回測定で、実回線や動画/スクロール負荷、端末echoへの影響は未評価。GDI取得＋縮小の所要時間と取得後の100ms待ちが達成fpsを制限しており、設定10fpsや実回線目標の達成は確認できていない。

検証中に、テスト側のDPI座標の誤認とカーソルに隠れる画素を修正した。また専用テストアプリの中間サロゲート文字のUTF-8書き出しと、状態ファイルの読み取り競合を修正した。いずれも一時検証ハーネス側で、製品ソースの変更ではない。共有停止直後、helperの終了前に再接続すると既存共有中として拒否される現行仕様も確認した（docsに既記載）。

この時点ではcomputer use向けは設計案のみだった。その後の追加依頼で[エージェントAPI](../../../docs/remote-desktop.md#エージェントapi実験版)と操作leaseを実装し、次節に記録した。モデルへの画像送信自体は行っていない。


実機の停止/再接続まで含めた最終試験は **1 passed（12.4秒）**。Aから共有停止→Windows helperの実終了確認→再接続は閲覧から開始→Bの停止ボタンの実座標をUI Automationで読み取り→そのボタンを共有画面経由でclick→Aに「終了」表示、machineはonlineのまま、まで確認した。ボタン位置の決め打ちは使っていない。これは停止ボタンの機能確認であり、現地の人の操作による停止を観測したものではない。

最終試験の短い21frame計測は[soda-desktop-native-stop-perf.json](soda-desktop-native-stop-perf.json)へ別記。100frame測定と混ぜて集計しない。終了後、専用Windowsアプリ/helperの残存processは0件と確認し、自分で作成したWindows一時exe/stateを削除した。検証ハーネスとC#のテストアプリは `/tmp/soda-desktop-native-validation/` に保存し、環境固有の一時specはリポジトリから外した。画像は保存していない。

最終試験ログ: `/tmp/soda-desktop-native-e2e-stop-final.log`。100frame計測を行った試験はその後の即時再接続で失敗したため、全体のpassとは数えず測定データとしてのみ記録した（その後のハーネス再試験で同名ログは更新されたため、100frameの記録は保存済みJSONを参照）。ロック/UAC/セッション切断、実回線制限、長時間試験、強制通信断時のキー解除は未実施。


## 性能改善とエージェントAPI追加（2026-10-17、追加依頼後）

ユーザーの「改善を進めて。エージェントAPI対応も進めて」に対応。性能改善は全解像度bitmapへのCopyFromScreen＋GDI+縮小を、GDI StretchBlt/HALFTONEによる出力サイズへの直接取得へ変更。HALFTONE後のSetBrushOrgExも行う。取得後に1000/fpsを加算するpacingから、取得開始を基準とするpacingへ変更した。

MicrosoftのAPI資料: [StretchBlt](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-stretchblt)、[SetStretchBltMode](https://learn.microsoft.com/en-us/windows/win32/api/wingdi/nf-wingdi-setstretchbltmode)。HALFTONEは画質を保つために選択した。ハードウェアアクセラレーションを保証するという意味ではない。複数GPU/混在モニター等は未検証。

同じ実機・物理3200×2000・送信1280×800・JPEG品質65・設定10fpsの100frame測定:

| 指標 | 改善前 | 改善後 |
|---|---:|---:|
| 達成fps | 3.46 | 8.14 |
| 平均Mbps | 3.93 | 10.56 |
| 取得＋縮小 p95(ms) | 181.2 | 95.4 |
| JPEG p95(ms) | 4.45 | 4.77 |
| relay→draw ACK p95(ms) | 18.0 | 15.1 |
| source CPU（1core=100%）| 50.4% | 56.4% |
| source peak RSS(MiB) | 122.6 | 79.8 |

各1回・時間帯や画面内容の変動もある。fpsはこの測定で約2.35倍だが、全環境の速度向上を保証しない。帯域は増えており、回線制限下の制御/安定性は未達項目のまま。改善後の100frame試験は、通常キー/日本語/絵文字/共有停止/再接続/Windows側停止ボタンを含めて **1 passed（20.9秒）**。生データ: [soda-desktop-native-optimized.json](soda-desktop-native-optimized.json)、ログ: `/tmp/soda-desktop-native-optimized.log`。

追加したAPIは `desktop.agent.attach/observe/act/release`。ブラウザが30秒一回コードを発行し、その共有と接続に限定した最大2分のleaseを使う。画像比較、入力のACK待ち・順番、操作後のフレーム指定、失効・引き取り・partial failure時の停止、画像RPCのqueue上限を含む。持続NDJSON参照クライアントは `scripts/remote-desktop/agent-client.mjs`。MCPや統合sodactlコマンド、モデル呼び出しは追加していない。

実Windowsでも新APIで画面を取得し、専用アプリへclick、KeyA、確定した日本語/絵文字を送信、Aのcanvasでボタンの緑/パネルの青を確認し、lease返却と停止/再接続まで **1 passed（9.1秒）**。外部モデルへの画像送信はしていない。記録: [soda-desktop-native-agent.json](soda-desktop-native-agent.json)、ログ `/tmp/soda-desktop-native-agent.log`。20frameを含む動作試験で、100frameの性能測定と混ぜない。開始時のホバー色やobserveの頻度制限に合わせて一時ハーネスを修正した。

実機テスト終了後、作成したWindows helper/TestApp processが0件と確認し、一時exe/stateを削除した。環境固有のspecは `/tmp/soda-desktop-native-validation/` へ保存してリポジトリから外した。画像trace/video/screenshotは無効。通常の画像内容は保存していない。

独立レビューで旧actが再発行した新grantも失効させる競合と、agent出力queue制限の不足を確認・修正し、再レビューで解決。修正箇所だけを一時的に戻すnegative controlを行い、以下の生出力のとおり回帰テストが失敗することを確認した。終了後は修正済みファイルのバイト列へ復元し一致を確認した。

### Negative control: 旧actが新grantを失効させる競合

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-desktop

 ❯ |@sodashitsu/server| src/desktop/DesktopAgentAccess.test.ts (6 tests | 1 failed | 5 skipped) 7ms
   × an interrupted old action cannot revoke a newly issued grant 6ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopAgentAccess.test.ts > an interrupted old action cannot revoke a newly issued grant
RpcError: Agent grant is missing or expired
 ❯ DesktopAgentAccess.attach src/desktop/DesktopAgentAccess.ts:53:13
     51|     this.tickets.delete(key);
     52|     if (!g || g.dead || performance.now() >= g.ticketExpires || perfor…
     53|       throw new RpcError("unauthorized", "Agent grant is missing or ex…
       |             ^
     54|     g.owner = owner;
     55|     g.lease = secret();
 ❯ src/desktop/DesktopAgentAccess.test.ts:111:14

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  16:23:10
   Duration  747ms (transform 72%, import 26%, tests 1%, worker 1%)

```

### Negative control: 画像RPC送信queueの上限

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-desktop

 ❯ |@sodashitsu/server| src/surface/methods/desktop.test.ts (1 test | 1 failed) 13ms
   × revokes a congested agent before encoding another screenshot 12ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/surface/methods/desktop.test.ts > revokes a congested agent before encoding another screenshot
AssertionError: expected { ok: true, result: { …(7) } } to match object { ok: false, …(1) }
(8 matching properties omitted from actual)

- Expected
+ Received

  {
-   "error": {
-     "code": "server_busy",
-   },
-   "ok": false,
+   "ok": true,
  }

 ❯ src/surface/methods/desktop.test.ts:14:17
     12|  const ctx={clientId:"a",sink:{clientId:"a",bufferedAmount:300000,send…
     13|  const result=await surface.invoke(ctx,"desktop.agent.observe",{leaseI…
     14|  expect(result).toMatchObject({ok:false,error:{code:"server_busy"}});e…
       |                 ^
     15|  expect(()=>api.observe("a",lease.leaseId)).toThrow(/lease/);expect(ta…
     16| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed (1)
   Start at  16:23:12
   Duration  1.76s (transform 82%, import 17%, tests 1%)

```


## 追加実装の最終確認

- build成功（`/tmp/soda-desktop-agent-build.log`）。
- 全体typecheck成功（`/tmp/soda-desktop-agent-typecheck-final.log`）。参照clientの終了試験追加後、E2E packageのtypecheckも成功（`/tmp/soda-desktop-agent-e2e-typecheck.log`）。
- desktop/provider/agent/surface/protocolの関連Vitestは4 files/13 tests成功（`/tmp/soda-desktop-agent-unit.log`）。
- 全体Vitestは677 files中669 passed/8 failed、10,916 passed/11 failed。並列数既定の高負荷下でタイムアウトや状態反映待ちが発生した。既知のagent.prompt以外の失敗7 filesを`--maxWorkers=4`で再実行し、**7 files/143 tests成功**（`/tmp/soda-desktop-agent-recheck.log`）。これにより失敗を再現せず、負荷による変動と整合するが、全体試験をgreenとは記載しない。agent.promptのdelay300ms対期待1000msは、起点mainでも再現確認済みの既知失敗のまま。新しい全体ログ: `/tmp/soda-desktop-agent-full-tests.log`。
- 共有・agent・既存操作委譲・Web previewの最終ブラウザE2Eは **6 passed（33.0秒）**（`/tmp/soda-desktop-agent-e2e-final.log`）。持続NDJSON clientを実プロセスで起動し、observe/act/release応答、exit0、ACKしない模擬helperへの入力中のSIGTERM、UIへの操作返却を確認。API画像は実際のcanvasと同じpixelになることも確認した。
- `pnpm smoke` PASS（`/tmp/soda-desktop-agent-smoke.log`）。
- Node構文と`git diff --check`成功。Windows sourceは実機exe生成・起動済み。追加のソフト導入、実行ポリシー/Firewall/RDP/VNC/Funnel変更、実セッション切断は行っていない。

参照clientのrelease後にstdin待ちで残る不具合も通し試験で検出し、finallyのreadline.close/stdin.pauseを追加した。SIGINT/SIGTERM/接続断では未完のRPC待機を中断し、接続を閉じてleaseを失効させる。最大32×1.5秒の入力ACK待ちに合わせ、clientのact timeoutは60秒とした。修正差分は独立再レビュー済み。終了処理の2行だけを戻して失敗を確認し、修正済みバイト列へ復元した生出力を下に残す。

```text

Running 1 test using 1 worker

(node:423054) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-17T07:36:34.437Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T07:36:34.437Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T07:36:34.439Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-aIJDmx/commands.json","count":0}
{"ts":"2026-10-17T07:36:35.098Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T07:36:35.099Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T07:36:35.099Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-mbA9a0/commands.json","count":0}
{"ts":"2026-10-17T07:36:45.131Z","level":"info","msg":"machine link closed","machine":"d8c67c55db0f3c32394a781422be51a4","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-agent.spec.ts:10:1 › viewer grants one agent access; observe/action and human takeover stay isolated (12.3s)


  1) src/specs/remote-desktop-agent.spec.ts:10:1 › viewer grants one agent access; observe/action and human takeover stay isolated

    Error: expect(received).toBe(expected) // Object.is equality

    Expected: 0
    Received: null

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      178 |     reference.stdin.write(JSON.stringify({ id: "release", method: "release" }) + "\n");
      179 |     await expect.poll(() => replies.find((r) => r.id === "release")?.result?.released).toBe(true);
    > 180 |     await expect.poll(() => reference?.exitCode).toBe(0);
          |                                                  ^
      181 |     await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
      182 |     await view.getByRole("button", { name: "共有停止", exact: true }).click();
      183 |     await expect(view).toHaveCount(0);
        at /workspaces/sodashitsu-remote-desktop/packages/e2e/src/specs/remote-desktop-agent.spec.ts:180:50

    Error Context: test-results/remote-desktop-agent-viewe-658d1-uman-takeover-stay-isolated/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-agent-viewe-658d1-uman-takeover-stay-isolated/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-agent-viewe-658d1-uman-takeover-stay-isolated/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-agent.spec.ts:10:1 › viewer grants one agent access; observe/action and human takeover stay isolated
undefined
/workspaces/sodashitsu-remote-desktop/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-agent.spec.ts
```

実回線制限/長時間安定性、GPU画面や混在モニター、lock/UAC/headless、文字のモデル読み取り精度、MCP/特定モデルとの連携は未評価または未実装。通常の画面共有APIと同じく、agent APIのfull-image照合は動的な画面では拒否が増える。権限失効と画像照合は、OS側の観測/操作を原子的にするものではない。

## 2026-10-17 差分転送・静止抑制

ユーザーの「VNCなど…圧縮伸張」「対応して」に基づき、独自画像プロトコルへ変更タイル検出と部分PNG転送を追加。VNC/RFB互換や動画codecではない。Windows helperは64x64の生画素比較→隣接rect統合→最大8rectのlossless PNG、8rect超/面積60%以上/PNG合計2MiB超ならJPEG全画面。静止は画像なし約1秒通知、定期30秒/手動/API必要時のfull再同期。UI初期ON、旧providerへoptionを送らない。

確認済み:

- `/tmp/soda-desktop-delta-build.log`: `pnpm build`成功（bundle size警告あり）。
- `/tmp/soda-desktop-delta-unit-final.log`: protocol/server/surface/web renderの5file17test成功、maxWorkers=4。パケット境界/重複/順序、snapshot待機中の排他と失効再検査、後続PNG decode失敗時の無描画/chain不変/bitmap解放、旧接続画像破棄を含む。
- `/tmp/soda-desktop-delta-e2e.log`: 既存desktop/agentと新deltaの4test成功。ブラウザcanvasの離れた2領域の画素、背景維持、APIの全画面画像の画素、再同期を観測。新deltaは静止画像0bytesと部分PNGの減量も確認。
- `/tmp/soda-desktop-codec-check.py`: Windowsソースを実コンパイルし、実デスクトップ取得を呼ばずreflectionでDirtyTilesを検証。初回full/同一/離れた2箇所/隣接統合/端の切り詰めで `dirty_tile_checks_passed`。
- `/tmp/soda-desktop-delta-native.log`: 実Windowsの専用TestScreenに対し6条件1test成功(45.4s)。実ログと数値は `windows-delta-comparison.json`。物理3200x2000/200%DPI→1280x800、JPEG65、設定10fps、loopback A/B/browser。各5秒、初回full約299KBを除外。static 17.254→0.00175Mbps、sparse160x100物理pixelの250ms周期変化19.144→0.505Mbps。dense全体250ms周期変化15.329→9.583Mbpsは更新32→20件（同一取得結果の抑制）の影響を含み、動画圧縮性能の証拠にしない。dense CPU46.5→50.3%core、peakRSS89.9→124.5MiBで負荷増加もある。staticでも取得は継続しCPU44.7→39.2%core。
- `/tmp/soda-desktop-delta-agent-native.log`: 差分ONの実Windows専用TestAppでAPI全画面取得→クリック、KeyA、日本語😀を実行し、ブラウザcanvasの緑/青を観測。a日本語😀を専用アプリ状態で確認。read-only無入力、lease release、再接続read-only、Windows helper側停止ボタンで終了、machine onlineを確認。1test成功(13.6s)。24パケットの測定は更新率でありcapture fpsではない。`windows-delta-agent.json`参照。クリック/文字反映画面までの484/773msはPlaywright手順・poll間隔込みの上限観測で、実ディスプレイ遅延のp95ではない。

実機試験は許可済みの通常権限一時exeのみ。capture画像のファイル保存・モデルへの送信なし。Playwright native試験のtrace/screenshot/videoはOFF。終了後DesktopHost/TestApp/TestScreenプロセス0を確認し、作成したexeと状態ファイルを削除。環境依存の一時spec/テスト画面ソースはリポジトリに残さず `/tmp/soda-desktop-native-validation/` および `/tmp/SodaDesktopTestScreen.cs` に保存。RDP/VNC/Firewall/Funnel/Windowsポリシー変更なし。

未評価: 実回線制限、長時間、GPU映像、CopyRect/動画codec、適応品質、混在DPI、lock/UAC/headless。差分は縮小後の生画素比較であり、JPEG fullとlossless patchの表示画素は完全一致しない。APIは古いfullキャッシュを差分内容へ流用せず、必要時full再取得する。

最終の型チェック `/tmp/soda-desktop-delta-typecheck.log` と smoke `/tmp/soda-desktop-delta-smoke.log` は終了コード0。`remote-desktop / agent / delta / outbound-delegation / remote-web-preview` のブラウザ回帰は7test成功(31.6s)、`/tmp/soda-desktop-delta-e2e-final.log`。差分実装後の全体VitestはmaxWorkers=4で別途実行。

全体Vitestの最終結果: 678file中677成功/1失敗、10931test中10930成功/1失敗、314.12s（`/tmp/soda-desktop-delta-all.log`）。唯一の失敗は既知の `surface/methods/agent.test.ts:88`（agent.promptのdelayMs期待1000、実際300）。前回のベース72d486a5での再現と同一で、今回の差分転送と無関係。新規の失敗はなし。全体テストが全成功したとは扱わない。`git diff --check`成功。

## 2026-10-17 接続設定・減色の追加

依頼「色情報を落とすなど、接続設定を充実」に対応。UIへ低帯域/標準/高画質プリセット、色（full/RGB565相当/RGB332相当/16階調グレー）、共有元cursorの合成ON/OFFを追加。既存の幅/fps/JPEG品質/差分とともにマシン別・ブラウザ別localStorageへ検証して保存。無効値は共有を切る前に拒否し、適用済み値と編集中の値を区別。適用時は共有を再接続し、人/agent操作権限を引き継がない。

Windowsは縮小/cursor合成→減色→diff/SHA/encodeの順。BGR byte配列のchannel lookupと明度に基づくgray16へ変換し、24bpp Bitmapへ戻す。packed RGB565/RGB332 wire formatではない。JPEGでは復号後にpalette外の色が生じる。APIの画像/内容識別も同じ設定に従い、減色で消える差を識別できない。最大fps/帯域改善は今回の試験では測定していない。画面取得や入力を新たに実施しないnative検証と模擬画面のE2Eを行った。

互換: caps.imageSettingsで交渉。旧Bにはdefault image指定を外し、非default色/cursor要求は拒否。新Windows helperのready.imageは要求した接続だけへ送り、旧Aのstrict schemaへ追加項目を渡さない。Bはhelperの適用ackと要求が異なる場合や、非default要求でackなしの場合は開始を拒否。停止中helperのcloseを最大2秒待つ際は、clientGone/disposeによってqueued startも取消し、新しいownerが消えた後にhelperを起動しない。

確認:

- `/tmp/soda-desktop-settings-unit-final.log`: 7file23test成功。protocol bounds/modes、設定の機械別保存/破損値fallback/権限混入拒否、pending reconnect取消と旧B交渉を含む。後続ready互換変更とhandoff correctionは全体/個別試験で確認。
- `/tmp/soda-desktop-settings-e2e-final.log`: remote-desktop/settings/delta/agentの5test成功。canvas内RGB332 channel値、gray16の等色/階調、960幅反映、ブラウザから出たstart設定、invalid fps時の接続維持、agent失効、窓を開き直した後の設定保持を観測。最初のsettings E2Eはrole=statusがoutputとpの2つに当たる試験側locator不備で失敗し、pへ絞って修正。
- `/tmp/soda-desktop-settings-layout.log`: 設定open後canvas height>80pxと画面確認を追加したsettings 1test成功(43.6s)。`/tmp/soda-desktop-settings-preview.png`を目視確認。画像は模擬画面のみ、資格情報なし。検証中の高負荷により既存のforegroundJob timeoutログがあるが、今回の判定はブラウザcanvas/DOM/送信フレームによる。
- `/tmp/soda-desktop-settings-native.log`: 実Windows .NET Frameworkで最新C# sourceをコンパイル、reflectionでcolor変換を呼び、各channelの異なる値の数、白/黒端点、gray16、緑>赤>青の明度、奇数幅Bitmapのstrideとwriteback、PNGのencode/decode後の画素を検証。`native_color_checks_passed: palettes, endpoints, luminance, stride, PNG roundtrip; no capture/input`。環境依存の手順とC# fixtureは `/tmp/soda-desktop-color-check.py`, `/tmp/SodaDesktopColorChecks.cs`。Run/capture/SendInputを呼んでいない。インストール・サービス・ポリシー・Firewall変更なし。
- `/tmp/soda-desktop-settings-typecheck-final.log`: 型チェック成功。最初の型チェックでは新テストのexactOptionalPropertyTypes違反（optional propertyへundefined代入）を検出し、deleteへ修正。

独立レビューで、追加したpermanent disposedフラグがhandoff失敗のrollback後に共有を再開不能にするP2を検出。従来の一時cleanupとして再利用できるdisposeへ戻し、待機要求の取消だけを維持。同じProviderでshare→dispose→shareの実WS roundtripを回帰試験に追加。`/tmp/soda-desktop-settings-handoff-fixed.log`: Provider/Relayの2file8test成功。レビュアーが修正差分を再点検しP2解決・追加指摘なしを確認。

### 接続設定の最終確認と全体試験の扱い

最終ビルド `/tmp/soda-desktop-settings-build-final.log` は成功（既存bundle size警告あり）。修正復元後にビルドしてから、全desktop関連＋PTY integrationを8file25test成功(9.71s)、`/tmp/soda-desktop-settings-corrected-tests.log`。全体でtimeoutした未変更のFileTransfer/GraphViewを別実行し2file106test成功(20.66s)、`/tmp/soda-desktop-settings-unrelated-retry.log`。最終smoke `/tmp/soda-desktop-settings-smoke.log` はPASS。全体型チェック後、Provider修正と回帰試験に対してserver型チェックも再実施した。

全体実行 `/tmp/soda-desktop-settings-all.log` は680file中675成功/5失敗、10938test中10933成功/4失敗/1skip、507.02s。既知agent.prompt delay1000vs300に加え、未変更FileTransfer/GraphViewのtimeout、修正中sourceに対するdist staleのPTY suite失敗、共有再開の回帰試験失敗を含む。全体実行中にレビュー修正が混ざったため、これは最終状態の全体成功を示す結果として扱わない。メモリ空き141MiB、swap約3.1GiB使用も観測したが、timeoutの原因をこれだけで断定しない。失敗した変更関連と未変更2fileを最終source/buildで再確認し、既知agent.prompt以外は上記の個別実行で成功した。全体試験が全成功したとは報告しない。

回帰試験のpollはhelper終了待機を含め5秒/test全体10秒を明示し、resumed socketが閉じた場合も画像なしを直接検出する。修正済みProvider bytesを保存し、永久disposedのみを戻すnegative controlを行うと再共有のframe0で失敗。finallyで保存済みbytesへ復元し、保存ファイルとの完全一致を確認。その後に最終buildと8file25testを実行した。以下はnegative controlの生出力。

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-desktop

 ❯ |@sodashitsu/server| src/desktop/DesktopRelay.test.ts (6 tests | 1 failed | 5 skipped) 248ms
   × allows a fresh share after handoff cleanup is rolled back 246ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopRelay.test.ts > allows a fresh share after handoff cleanup is rolled back
AssertionError: expected [] to have a length of 1 but got +0

- Expected
+ Received

- 1
+ 0

 ❯ src/desktop/DesktopRelay.test.ts:273:26
    271|     })
    272|     .toBe(true);
    273|   expect(resumed.frames).toHaveLength(1);
       |                          ^
    274|   expect(resumed.messages).toContainEqual(expect.objectContaining({ ty…
    275|   resumed.ws.close();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 5 skipped (6)
   Start at  18:02:06
   Duration  1.16s (transform 54%, tests 26%, import 19%, worker 1%)


```


## 動画・音声・clipboard・MCP/モデル/CLI拡張（2026-10-17 再開）

- 実装: 認証済みBブラウザ補助、WebRTCとVP8/Opus WebM中継、画像/動画の自動画質調整、短命なclipboard許可とテキスト同期、統合CLI/MCP/OpenAI adapter。実機システム音声・OS clipboard・外部モデルAPIは実行していない。
- `/tmp/soda-desktop-expansion-all-e2e.log`: 10件pass。既存WSS outbound/agent/delta/settingsに加えRTC・Recorder/MSEの実ブラウザ合成映像/無音音声track、メモリclipboard日本語/絵文字/同期/blur、実CLI/MCPの正常認証+短命grant+画像取得を確認。実機/WAN性能やサードパーティMCPホストの保証ではない。
- `/tmp/soda-desktop-expansion-final-tests.log`: 関連15files288tests pass。protocol制約、所有者/音声権限/順序/queue、Provider/Relay/API、browser render/settings/画質制御/frozen映像、CLI parser/MCP/model mock、root CSPを含む（後続CLI終了修正の追加チェックは下記へ追記）。
- `/tmp/soda-desktop-expansion-final-build.log`, `...-final-types.log`, `...-smoke.log`: build/typecheck/smoke pass。C# nativeの最新コンパイルとoffscreen palette/stride/PNG検査も `/tmp/soda-desktop-expanded-native.log` でpass。
- 独立レビューで発見: frozen動画上の誤操作(P1)、混雑時停止通知drop(P2)、stdout待機でCLI終了不能(P2)。最初の2件を修正し再レビューで解決確認。stdoutはPromiseのtimeoutだけではNodeの特殊stdoutのwriteが残ることをspawn検査で発見し、CLI境界の停止期限へ追加修正中。

### 回帰試験のnegative control（追加機能）

各修正だけを元の形へ戻して該当testを実行。3件ともexit1、終了後に元bytesを復元しSHA-256一致を確認。以下は生の出力。

#### host-stop

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-desktop

 ❯ |@sodashitsu/server| src/desktop/DesktopCompanion.test.ts (4 tests | 1 failed | 3 skipped) 32ms
   × closes a congested companion when a stop cannot be delivered 30ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopCompanion.test.ts > closes a congested companion when a stop cannot be delivered
AssertionError: expected 1 to be 3 // Object.is equality

- Expected
+ Received

- 3
+ 1

 ❯ src/desktop/DesktopCompanion.test.ts:150:29
    148|   f.host.bufferedAmount = 65536;
    149|   f.hub.fromViewer(f.owner, { type: "media", enabled: false });
    150|   expect(f.host.readyState).toBe(3);
       |                             ^
    151|   expect(f.policy).toHaveBeenLastCalledWith(false);
    152| });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 3 skipped (4)
   Start at  19:00:00
   Duration  2.41s (transform 64%, import 33%, tests 2%, worker 1%)


```

#### frozen-video

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-desktop

 ❯ |@sodashitsu/web| src/desktop/mediaReceiver.test.ts (2 tests | 1 failed | 1 skipped) 54ms
   × expires a frozen video and restores the native image via the state callback 49ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/web| src/desktop/mediaReceiver.test.ts > expires a frozen video and restores the native image via the state callback
AssertionError: expected true to be false // Object.is equality

- Expected
+ Received

- false
+ true

 ❯ src/desktop/mediaReceiver.test.ts:49:29
     47|     expect(receiver.active).toBe(true);
     48|     await vi.advanceTimersByTimeAsync(2500);
     49|     expect(receiver.active).toBe(false);
       |                             ^
     50|     expect(send).toHaveBeenCalledWith({ type: "media", enabled: false …
     51|     expect(state).toHaveBeenCalledWith("images");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 1 skipped (2)
   Start at  19:00:05
   Duration  2.28s (transform 42%, environment 40%, import 14%, tests 3%, worker 1%)


```

#### stdout

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-desktop

 ❯ |@sodashitsu/cli| src/desktopMcp.test.ts (5 tests | 1 failed | 4 skipped) 5111ms
   × settles stdout backpressure within a bounded time 5107ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/cli| src/desktopMcp.test.ts > settles stdout backpressure within a bounded time
Error: Test timed out in 5000ms.
If this is a long-running test, pass a timeout value as the last argument or configure it globally with "testTimeout".
 ❯ src/desktopMcp.test.ts:118:1
    116| });
    117|
    118| it("settles stdout backpressure within a bounded time", async () => {
       | ^
    119|   vi.useFakeTimers();
    120|   try {

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  19:00:10
   Duration  7.17s (tests 76%, transform 16%, import 7%)


```

### CLI停止期限の実プロセスnegative control

統合CLIが返すid3の画像行へテストharnessで2MiBの合法なJSON空白を付け、親はstdoutを読まない。SIGTERM後に子のexitを検査。停止時の2.5秒process終了期限だけを除去して再build→以下のFAIL。修正のbytesを復元しSHA一致確認、distも再build。修正版はsession/MCP2件ともpass（`/tmp/soda-desktop-cli-blocked-e2e.log`）。画像自体は模擬、cacheはメモリのみ。

```text

Running 1 test using 1 worker

(node:888099) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-17T10:08:46.978Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T10:08:46.978Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T10:08:46.981Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-eNUeph/commands.json","count":0}
{"ts":"2026-10-17T10:08:47.677Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T10:08:47.678Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T10:08:47.679Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-7kxf6X/commands.json","count":0}
{"ts":"2026-10-17T10:08:56.389Z","level":"info","msg":"machine link closed","machine":"1b1da1d06c79343f0c408e8829ee3861","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-cli.spec.ts:7:3 › integrated desktop session uses a browser-issued grant and returns synthetic screenshot (10.0s)


  1) src/specs/remote-desktop-cli.spec.ts:7:3 › integrated desktop session uses a browser-issued grant and returns synthetic screenshot

    Error: expect(received).not.toBeNull()

    Received: null

    Call Log:
    - Timeout 6000ms exceeded while waiting on the predicate

      110 |       await expect.poll(() => child!.stdout.readableLength).toBeGreaterThan(0);
      111 |       child.kill("SIGTERM");
    > 112 |       await expect.poll(() => child!.exitCode, { timeout: 6000 }).not.toBeNull();
          |                                                                       ^
      113 |       expect(stderr).toBe("");
      114 |       await expect(view.locator("[data-desktop-status]")).toHaveText("閲覧中");
      115 |       await view.getByRole("button", { name: "共有停止", exact: true }).click();
        at /workspaces/sodashitsu-remote-desktop/packages/e2e/src/specs/remote-desktop-cli.spec.ts:112:71

    Error Context: test-results/remote-desktop-cli-integra-d09ef-eturns-synthetic-screenshot/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-cli-integra-d09ef-eturns-synthetic-screenshot/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-cli-integra-d09ef-eturns-synthetic-screenshot/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-cli.spec.ts:7:3 › integrated desktop session uses a browser-issued grant and returns synthetic screenshot
undefined
/workspaces/sodashitsu-remote-desktop/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-cli.spec.ts --grep desktop session

```

### 動画の短時間合成画面計測

1280×720・10fps要求の動くcanvasをBで生成し、native画像を並行維持してAのcanvasが実際に描いたフレームを計測。getDisplayMediaのテスト代替も要求fpsを尊重する。RTCは40frame/4077ms=9.81fps、中継は45frame/4380ms=10.27fps（poll境界と短時間の変動を含む、上限保証/最大性能の意味ではない）。`media-auto-synthetic.json`, `media-relay-synthetic.json`。ログ `/tmp/soda-desktop-media-rate-matched.log` 2件pass、A停止/B切断→track停止・native復帰を両側で確認。全体unitテスト同時実行中の参考値でありWindows capture・WAN帯域/遅延・30分継続性能は測っていない。

### 全体テストと最終guard

`pnpm exec vitest run --maxWorkers=2`（`/tmp/soda-desktop-expansion-full.log`）は685filesのうち684pass/1fail、10955testsのうち10954pass/1fail。713.41秒。失敗は既知のbase72d486a5でも再現済みのagent.prompt待機時間（1000ms期待、実装300ms）。本作業で修正しない。既知baselineの切り分け原記録は同ファイルの以前の節を参照。全体greenとは報告しない。

```text
 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/surface/methods/agent.test.ts > agent.prompt > 本文と Enter を 2 部分にして1000msの間を置くモード付き入力として書き、送信を始めた時点のエージェントを返す（AC2・AC4）
AssertionError: expected 300 to be 1000 // Object.is equality

- Expected
+ Received

- 1000
+ 300

 ❯ src/surface/methods/agent.test.ts:88:38
     86|     expect(result).toEqual({ ok: true, result: { agent: agent() } });
     87|     expect(s.host.modal).toHaveLength(1);
     88|     expect(s.host.modal[0]!.delayMs).toBe(1000);
       |                                      ^
     89|     expect(s.host.written).toEqual(["line1\nline2", "\r"]);
     90|     expect(s.noteInteraction).toHaveBeenCalledWith("c1", "p1");

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed | 684 passed (685)
      Tests  1 failed | 10954 passed (10955)
   Start at  19:09:43
   Duration  713.41s (tests 82%, import 9%, transform 4%, environment 4%)


```

全体後の小修正は、旧Companionソケットの遅延errorが新hostを閉じる問題（旧errorは無視）と、modelの明示的incomplete/in_progressを承認・入力前に拒否する検査。fetchもredirectをerrorにする。模擬API/偽socketだけで再現し、実機や外部APIは使わない。関連3files15tests pass。各修正だけを戻したnegative controlの生出力と完全復元（SHA一致）は以下。全体テストの重複はせず、最後の差分に関連test/build/typesを実行する。

#### old-error

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-desktop

 ❯ |@sodashitsu/server| src/desktop/DesktopCompanion.test.ts (5 tests | 1 failed | 4 skipped) 11ms
   × ignores errors from a replaced companion socket 9ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/server| src/desktop/DesktopCompanion.test.ts > ignores errors from a replaced companion socket
AssertionError: expected 3 to be 1 // Object.is equality

- Expected
+ Received

- 1
+ 3

 ❯ src/desktop/DesktopCompanion.test.ts:159:27
    157|   f.hub.attach(next.socket());
    158|   f.host.emit("error", Error("late error"));
    159|   expect(next.readyState).toBe(1);
       |                           ^
    160|   next.message({ type: "heartbeat" });
    161|   expect(next.sent).toContainEqual({ type: "companion_ready" });

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯


 Test Files  1 failed (1)
      Tests  1 failed | 4 skipped (5)
   Start at  19:22:45
   Duration  664ms (transform 72%, import 25%, tests 2%, worker 1%)


```

#### incomplete-model

```text
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.
(!) Your Vite config uses features that are unsupported by `configLoader: 'native'`, which is planned to become the default in a future major version of Vite:
  - ESM syntax in a file loaded as CommonJS (vitest.config.ts:1:1). Use a `.mjs` extension or set `"type": "module"` in the closest package.json
Set `VITE_CONFIG_NATIVE_IGNORE_WARNING=true` to suppress this warning.

 RUN  v5.0.1 /workspaces/sodashitsu-remote-desktop

 ❯ |@sodashitsu/cli| src/desktopModel.test.ts (5 tests | 2 failed | 3 skipped) 31ms
   × rejects an incomplete response before approval or any input 29ms
   × rejects an incomplete call before approval or any input 2ms

⎯⎯⎯⎯⎯⎯⎯ Failed Tests 2 ⎯⎯⎯⎯⎯⎯⎯

 FAIL  |@sodashitsu/cli| src/desktopModel.test.ts > rejects an incomplete response before approval or any input
 FAIL  |@sodashitsu/cli| src/desktopModel.test.ts > rejects an incomplete call before approval or any input
AssertionError: expected [Function] to throw error including 'not completed' but got 'Cannot read properties of undefined (…'

Expected: "not completed"
Received: "Cannot read properties of undefined (reading 'afterFrameSeq')"

 ❯ src/desktopModel.test.ts:156:6
    154|         }) as typeof fetch,
    155|       }),
    156|     ).rejects.toThrow("not completed");
       |      ^
    157|     expect(session.act).not.toHaveBeenCalled();
    158|     expect(approve).not.toHaveBeenCalled();

⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/2]⎯


 Test Files  1 failed (1)
      Tests  2 failed | 3 skipped (5)
   Start at  19:22:47
   Duration  611ms (transform 70%, import 23%, tests 6%, worker 1%)


```

### 最終確認（19:24 JST）

- `/tmp/soda-desktop-last-build.log`: 最終server/CLI build成功。web/protocolは直前の全体build成功以後production差分なし。
- `/tmp/soda-desktop-last-types.log`: 最終server/CLI/E2E typecheck成功。その他packageも直前の全体typecheck成功。
- `/tmp/soda-desktop-last-related-tests.log`: 最終15files291testsすべて成功。
- 全体は684files/10954tests成功、既知baseline1件失敗。最後の小さなguard追加後は全体を重複実行せず上の関連検査を実施。
- E2Eは前述の10件成功後、unread pipe強化版session/MCP2件、fpsを合わせた実codec動画2件も成功。最後のguardは偽socket/模擬APIの回帰検査で確認。
- 独立レビューで最後のguardも確認済み、新たな重大指摘なし。`review.md`参照。
- 実機の新規audio/clipboard、外部model API、第三者MCP host、実WAN/長時間性能は未検証。環境のinstall/Firewall/port/Funnel/RDP/VNC有効化変更は行っていない。変更はfeature/remote-desktopの専用worktreeだけ、未commit/未PR。


## 窓に合わせたWindows解像度変更・等倍表示（2026-10-17追補）

### 実装範囲と許可境界

- Windows・モニター1枚を初期対象とし、Bの `SODA_DESKTOP_ALLOW_DISPLAY_RESIZE=1` とhelperの `-AllowDisplayResize` の両方が必要。既定は無効。Aの窓のチェックも毎回必要で保存しない。
- 窓の表示領域に収まる最大の対応モードを700ms後に選ぶ。収まらなければ最小モードとスクロール。Bの物理画素とAのCSSピクセルを1:1にし、Windows DPIやbrowser zoomは変更しない。任意寸法の仮想モニターは未実装。
- 再接続で操作・agent・clipboard・動画の権限を失効。終了時の幅高さ復元、異常終了用の独立guardian、device mutexによる次の共有との直列化を実装。後から現地で変えた画面geometryは上書きせず、復元要求にrefresh/depthを含めない。
- 実Windows解像度変更・新規capture/inputは実施していない。実機でのモード変更と復元、hotplug、DPI別表示は要PoC。

### 検証結果

- 全package build成功 `/tmp/soda-display-build.log`、全package typecheck成功 `/tmp/soda-display-types.log`。
- 関連11files37tests成功 `/tmp/soda-display-final-tests.log`。protocol寸法上限、Providerの二重許可とspawn前拒否、対応モード選択、設定非保存、既存desktop/media/relay経路を確認。
- 合成helperによる新E2E 1件成功 `/tmp/soda-display-e2e-fixed.log`。canvasのintrinsic/DOM実寸一致、窓の縮小による640x480切替、agent失効、display非永続化、off/再openを確認。初回E2Eは既に最小モードの窓を縮めて再接続を待っていたため失敗。初期窓を広げて大きいモードから始めるようfixtureを修正した。製品コードの変更で隠していない。同時に実施したsettings/RTC/relay mediaの既存3件も成功 `/tmp/soda-display-e2e.log`。
- nativeチェックはWindows PowerShellで実production C#と `WindowsDisplayLeaseChecks.cs` をコンパイルし、偽Driverとkernel objectだけを使用。DEVMODEW 220bytes、対応モードのみ、guardian準備前は変更不可、復元/解除/二重dispose、局所変更保持、部分失敗rollback、属性保持、guardian復元中の次の共有待機を確認。`scripts/remote-desktop/validate-display-lease.ps1` が永続的な検証入口。
- 実独立PowerShell guardianの起動・ready・device mutex所有・disarm解放を追加probeで確認。targetを幅高さ0・位置int.MinValueにして実画面と一致不能とし、OS解像度適用に到達不能。現在モードの読取りのみ。`/tmp/soda-display-guardian-probe.log`。
- 既存全体検査の結果は前節を参照。この追加では関連検査を実施し、約12分の全体suiteを重複実行していない。

### 回帰検査のnegative control（生出力）

`/tmp/soda-display-negatives.py` はguardianのmutex保持だけ、復元の幅高さ限定だけをそれぞれ一時除去し、production C#を再コンパイルした。いずれも失敗した。各試行のfinallyで元bytesへ復元しSHA256一致を確認、その後positiveを再実施して成功した。実画面の変更はない。

#### guardian-lock

```text
 "0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Restored guardian must release next lease"
発生場所 行:1 文字:221
+ ... ystem.Web.Extensions.dll; [SodaDesktopTests.DisplayModeChecks]::Run()
+                               ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception


Traceback (most recent call last):
  File "/tmp/soda-display-native-test.py", line 9, in <module>
    print(r.stdout.decode("utf-8",errors="replace"),r.stderr.decode("cp932",errors="replace"));r.check_returncode()
                                                                                               ^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.12/subprocess.py", line 502, in check_returncode
    raise CalledProcessError(self.returncode, self.args, self.stdout,
subprocess.CalledProcessError: Command '['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Add-Type -Path '\\\\wsl.localhost\\Ubuntu\\tmp\\SodaDisplayModeChecks.cs' -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll; [SodaDesktopTests.DisplayModeChecks]::Run()"]' returned non-zero exit status 2.

```

#### restore-attributes

```text
 "0" 個の引数を指定して "Run" を呼び出し中に例外が発生しました: "Restore must request dimensions only, preserving curren
t refresh/color fields"
発生場所 行:1 文字:221
+ ... ystem.Web.Extensions.dll; [SodaDesktopTests.DisplayModeChecks]::Run()
+                               ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    + CategoryInfo          : NotSpecified: (:) [], ParentContainsErrorRecordException
    + FullyQualifiedErrorId : Exception


Traceback (most recent call last):
  File "/tmp/soda-display-native-test.py", line 9, in <module>
    print(r.stdout.decode("utf-8",errors="replace"),r.stderr.decode("cp932",errors="replace"));r.check_returncode()
                                                                                               ^^^^^^^^^^^^^^^^^^^^
  File "/usr/lib/python3.12/subprocess.py", line 502, in check_returncode
    raise CalledProcessError(self.returncode, self.args, self.stdout,
subprocess.CalledProcessError: Command '['powershell.exe', '-NoProfile', '-NonInteractive', '-Command', "$ErrorActionPreference='Stop'; Add-Type -Path '\\\\wsl.localhost\\Ubuntu\\tmp\\SodaDisplayModeChecks.cs' -ReferencedAssemblies System.dll,System.Core.dll,System.Drawing.dll,System.Windows.Forms.dll,System.Web.Extensions.dll; [SodaDesktopTests.DisplayModeChecks]::Run()"]' returned non-zero exit status 1.

```

#### 復元後のpositiveと読取り専用guardian probe

```text
display_lease_checks_passed: DEVMODE220, supported-mode-only, guardian-before-apply, restore/disarm, preserve-local-change, partial-failure rollback; fake driver only; no OS mode changes

guardian_process_probe_passed: independent PowerShell readiness, device mutex ownership, disarm, release; sentinel target cannot match an active display; read-only mode enumeration; NO OS display change/capture/input


```


## リモートデスクトップ窓の最大化（2026-10-17追補）

- ブラウザviewport全体へinset=0で最大化し、buttonのaria-pressedで状態を表示。タイトルのダブルクリックでも切替できる。browser fullscreen APIは使用しない。
- 既存の最大化ボタンを共通処理へ接続し、手動resize済みのborder-boxサイズを保存して復元する。positionは維持し、最大化時にdragを解除。解像度追従は既存ResizeObserver経由で動く。
- Web build（vue-tsc含む）成功 `/tmp/soda-desktop-max-build.log`。合成画面のbrowser E2E成功 `/tmp/soda-desktop-max-e2e.log`。最大化DOMがx0/y0/1600x1200、対応解像度が拡大、canvasとCSS実寸が等倍、タイトルdblclickで720x760へ復元して640x480へ追従することを確認。
- 回帰negative control: restoredSizeの保存だけ除去してWebを再buildし同じE2Eを実行すると、初期1100x780へ戻り期待720x760と食い違って失敗。finallyで元bytesを復元しSHA256一致を確認。実画面の解像度変更/capture/inputはなし。

### negative controlの生出力

```text

Running 1 test using 1 worker

(node:1365760) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-17T13:07:54.163Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T13:07:54.164Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T13:07:54.166Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-TcIiBq/commands.json","count":0}
{"ts":"2026-10-17T13:07:54.889Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T13:07:54.889Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T13:07:54.890Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-5C94Yz/commands.json","count":0}
{"ts":"2026-10-17T13:08:05.431Z","level":"info","msg":"machine link closed","machine":"d3819403cc28332558d242e0a8005e80","kind":"transient","reason":"接続が切れました"}
  ✘  1 src/specs/remote-desktop-display.spec.ts:5:1 › window size selects a supported display mode, renders 1:1, revokes grants and never persists OS resizing (12.0s)


  1) src/specs/remote-desktop-display.spec.ts:5:1 › window size selects a supported display mode, renders 1:1, revokes grants and never persists OS resizing

    Error: expect(received).toEqual(expected) // deep equality

    - Expected  - 2
    + Received  + 2

      Object {
    -   "height": 760,
    -   "width": 720,
    +   "height": 780,
    +   "width": 1100,
      }

    Call Log:
    - Timeout 5000ms exceeded while waiting on the predicate

      128 |       const bounds = await view.boundingBox();
      129 |       return bounds && { width: bounds.width, height: bounds.height };
    > 130 |     }).toEqual({ width: 720, height: 760 });
          |        ^
      131 |     await expect(view.locator("[data-applied-display]")).toContainText("640×480");
      132 |     await expect(canvas).toHaveAttribute("data-rendered-frames", /^[1-9][0-9]*$/);
      133 |
        at /workspaces/sodashitsu-remote-desktop/packages/e2e/src/specs/remote-desktop-display.spec.ts:130:8

    Error Context: test-results/remote-desktop-display-win-eff96--never-persists-OS-resizing/error-context.md

    attachment #2: trace (application/zip) ─────────────────────────────────────────────────────────
    test-results/remote-desktop-display-win-eff96--never-persists-OS-resizing/trace.zip
    Usage:

        pnpm exec playwright show-trace test-results/remote-desktop-display-win-eff96--never-persists-OS-resizing/trace.zip

    ────────────────────────────────────────────────────────────────────────────────────────────────

  1 failed
    src/specs/remote-desktop-display.spec.ts:5:1 › window size selects a supported display mode, renders 1:1, revokes grants and never persists OS resizing
undefined
/workspaces/sodashitsu-remote-desktop/packages/e2e:
 ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL  Command failed with exit code 1: playwright test remote-desktop-display.spec.ts

```

### 原bytes復元後の最終確認

Web build（vue-tsc含む）と同一browser E2Eの再実行が成功。`/tmp/soda-desktop-max-final-build.log`、`/tmp/soda-desktop-max-final-e2e.log`。

```text

Running 1 test using 1 worker

(node:1366800) Warning: The 'NO_COLOR' env is ignored due to the 'FORCE_COLOR' env being set.
(Use `node --trace-warnings ...` to show where the warning was created)
{"ts":"2026-10-17T13:08:22.507Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T13:08:22.508Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T13:08:22.509Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-1EQgyK/commands.json","count":0}
{"ts":"2026-10-17T13:08:22.957Z","level":"info","msg":"agent manifest extended","kind":"copilot","path":"github-copilot-extra.toml","added":1}
{"ts":"2026-10-17T13:08:22.957Z","level":"info","msg":"agent manifests loaded","ok":23,"total":23}
{"ts":"2026-10-17T13:08:22.957Z","level":"info","msg":"custom commands loaded","file":"/tmp/soda-e2e-ZepJ21/commands.json","count":0}
{"ts":"2026-10-17T13:08:29.137Z","level":"info","msg":"machine link closed","machine":"0a7a4603d87fb82d097c3a3871798e52","kind":"transient","reason":"接続が切れました"}
  ✓  1 src/specs/remote-desktop-display.spec.ts:5:1 › window size selects a supported display mode, renders 1:1, revokes grants and never persists OS resizing (6.8s)

  1 passed (7.8s)

```
