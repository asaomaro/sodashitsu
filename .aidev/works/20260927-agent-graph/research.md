# 調査: エージェントの連携をノードとして画面で設定する（agent-graph）

調査は 3 本に分け、根拠つきの詳細を付録に置いた（すべての事実に `file:line` か出典の URL）。本書は索引つきの要約。

| 付録 | 中身 |
|---|---|
| `research-server.md` | pane ID の寿命・エージェントの状態機械と「1 回だけ」の検出・サーバ内から使える方式・保存の形・複数ホスト・sodactl と skill |
| `research-web.md` | 画面への差し込み口・ダイアログの状態・キーと操作表（tui への影響）・既存のドラッグ・描画・入口・状態とイベント・テスト |
| `research-ui.md` | ノードエディタの確立した操作（React Flow/Vue Flow・Node-RED・n8n・ComfyUI・Blender・Unreal・draw.io）と WCAG/WAI-ARIA。操作ごとの推奨 |

## 調査の問い

- Q1: pane が移動・サーバの再起動・handoff をしても、線の端（pane）を同じ ID で指し続けられるか。
- Q2: 「A が done/blocked/idle になった」を、状態の変化 1 回につき 1 回だけ検出できるか。
- Q3: サーバの中から prompt の送信・画面の読み取り・キーの送信を呼べるか。
- Q4: グラフをどう保存し、変更を全クライアントへ配るか。
- Q5: 別のマシンの pane を線の端にするとき、手元のサーバからそのマシンのエージェントを操作・購読できるか。
- Q6: 監督役のエージェントへ「配下」を知らせる手段は何があるか。
- Q7: web のどこにグラフ画面を差し込み、キー・ドラッグ・描画をどう作るか。tui への影響は。
- Q8: ノードエディタの確立した操作は何か（開閉・接続・パン/ズーム・選択・設定・削除・キーボード・モバイル）。

## 判明した事実

### Q1 pane ID の寿命
- F1.1: pane ID は、tab・workspace 間の移動・分割・入れ替え、サーバの再起動（`session.json` の ID をそのまま復元）、`soda handoff` のどれでも変わらない（`research-server.md` §1。採番は `SessionModel.nextId` だけ、`SessionModel.ts:96-105`）。
- F1.2: 例外が 3 つ。`pane.replace` はドロップ先の pane を閉じる（`SessionModel.ts:777-806`）。`move_to_new_tab` は tab ID が新しい。**`session.json` が無い・壊れていると ID を 1 から振り直す**（`composeServer.ts:543-548`）——そのとき保存したグラフの `p3` が別の pane を指してしまう。

### Q2 状態と検出
- F2.1: サーバが判定する状態は `working/blocked/idle/unknown` の 4 つ。`done` は `idle` かつ `completionSeq > seenSeq` から導く。判定の間隔は出力のある pane で 500ms、無い pane で 1s。検出の直後 3 秒は `unknown`。working→idle は 700ms か 3 回の確認まで保留（`research-server.md` §2）。
- F2.2: `completionSeq` が増えるのは working→idle だけ。`instanceId` は検出のたびに振り直され、再起動・handoff の後は新しく、`completionSeq` も 0 に戻る。
- F2.3: 状態の変化のイベント `pane.agent_status_changed` を出すのは `SessionService.updatePaneRuntime` の 1 か所（`SessionService.ts:1050`）。
- F2.4: 「1 回だけ」の鍵: done は `(instanceId, completionSeq)` の増加（ブラウザの通知と同じ鍵）。blocked は prev→next の変化（ブラウザは揺れを避けて 1 秒待つ）。idle は同じ instanceId で前が unknown でないこと。

### Q3 サーバの中から使える方式
- F3.1: `ControlSurface.invoke({clientId:"graph", sink}, "agent.prompt", …)` で既存の方式をそのまま呼べる（`research-server.md` §3）。`agent.prompt` は bracketed paste＋300ms で Enter、blocked は `agent_blocked` で断るが、**working は断らない**。
- F3.2: 画面の末尾は `terminals.get(id).mirror.bottomLines(n)` で読める。`agent wait`・`agent read` は CLI 側の実装でサーバの方式ではない。
- F3.3: `EventBus` は同期・型付きだが、購読者の例外を捕まえない（購読者が自分で try/catch する）。

### Q4 保存
- F4.1: `PrefsStore` の形（待ち行列＋`writeFileAtomic` 0600＋rev＋`bus.publish`、壊れていれば退避）がそのまま使える。置き場所は状態ディレクトリ（session ごと）。読み込みはロックの後・`agentMonitor.start()` の前。handoff と終了時の flush に加える（`research-server.md` §5）。

### Q5 複数ホスト
- F5.1: 今のサーバは中継だけで、サーバ自身がリモートへ RPC を送るコードは無い。ただし `machines.route(sel).link.openChannel()` がリモートの認証済み `/ws` の接続そのもので、`client.hello{kind:"external"}` を送ればイベントの購読も `agent.prompt` も呼べる（手本は client-core の `MachineSummaryClient`）。
- F5.2: 切れている間のイベントは失われる。繋ぎ直したときの snapshot の `completionSeq` で切断中の完了を拾える。
- F5.3: リモートの pane ID は名前空間を持たない。ノードの鍵は `(machineId | "local", paneId)`。machineId は名前を変えても変わらない。手元の監督役は `sodactl --machine X agent …` でリモートの配下を操作できる（逆向きの経路は無い）。

### Q6 監督役へ知らせる手段
- F6.1: 動いているエージェントへ文章を渡す手段は、pane への入力（prompt／send-keys）だけ。`agent-report.sock` はエージェント→サーバの一方向（会話 ID の報告）。環境変数・フックは起動時にしか効かない（`research-server.md` §8）。

### Q7 web
- F7.1: 差し込み口は `App.vue:84-98` の重ねものの並び。`position:fixed; inset:0` の全画面の重ねもの（前例 `CommandPopup.vue:222-227`）。`.app-panes` を差し替えると xterm が作り直されるので避ける（`research-web.md` §1）。
- F7.2: ダイアログの状態は 1 枠（`view.ts:308-312, 467-488`）。グラフ画面をダイアログの一種にすると、線の削除の確認を開いた時点でグラフ画面が閉じる → 別の状態（`graphOpen`）にし、dialog モードへの切り替え・keydown の抑止・ドラッグの取り消し・マシン切り替えの 4 か所に効かせる。
- F7.3: dialog モードでは `KeyRouter` が全キーを捨てるので、「同じ prefix＋キーで閉じる」（AC-I1）はグラフ画面の keydown で keymap を使って判定する必要がある。
- F7.4: 操作（action）を足すと tui の `TuiDispatcher` の `satisfies never` と件数を固定したテストが壊れる。web だけの操作の前例は無い（`research-web.md` §2）。
- F7.5: ドラッグは `PaneFrame.vue:110-231` と `Sidebar.vue:285-380` に同じ型（6px の閾値・setPointerCapture・Esc で取り消し・lostpointercapture）。座標の判定は純関数にしてテストする慣習（`paneDragZone.ts`）。web に SVG・canvas の使用は 0 件。色は `var(--soda-*)`（`uiTokens.ts:16-36`）の既存の値で賄える。
- F7.6: 選んでいないマシンの要約の pane は `{tabId, agent}` しか持たず、呼び名が無い（`machines.ts:24-25`）。別のマシンを見ている間の手元のグラフは、手元の軽い接続でやりとりする必要がある。

### Q8 ノードエディタの操作
- F8.1: 推奨（`research-ui.md` の操作ごとの表）: 全画面の自前 `role="dialog"`、Esc は 1 段ずつ戻る。ノードはチェックリストで載せる。ドラッグは 4px から・20px グリッド。ホイールでパン、Ctrl＋ホイールでズーム、`1` で全体表示。線は出力のハンドルからドラッグし先のノードの本体で離す。空白で離す・Esc は作らない。作った直後に設定パネル（右のサイドパネル）を開く。
- F8.2: ドラッグ以外の接続（WCAG 2.5.7・AC-I3）は「接続モード」（キーで元を選び Tab/矢印で先を選んで Enter）。削除は Delete/Backspace＋確認。線の種類は色・線種・矢印の形・ラベルで区別（色だけに頼らない。WCAG 1.4.1）。実行中の表示は短い動き＋回数、reduced-motion では動かさない。undo/redo は作らない。描画は DOM のノード＋背面の SVG 1 枚。モバイルは読み取り専用で 1 本指パン・2 本指ピンチ＋ボタン。

## 影響範囲

- server: グラフの保存と配布（新 `persist/GraphStore.ts`）・実行の仕組み（新 `graph/`：状態の購読・トリガの判定・prompt の送信・履歴・上限・一時停止）・RPC（`graph.*`）・リモートの接続（`machine` の LinkChannel の adapter）。
- protocol: `graph.*` の方式とイベント。
- web: グラフ画面（新 `components/graph/`）・`view` の状態・入口（サイドバーのメニュー・モバイルの上部バー）・操作表への追加。
- client-core: 操作表（graph を開く操作）。
- tui: 操作表の追加に伴う case（「ブラウザでだけ開けます」の知らせ）。
- cli: `sodactl graph …`・skill ファイル。

## 実現性 / リスク

- サーバ内の実行は既存の方式の再利用で実現できる（F3.1・F3.2）。
- 最大のリスクは「1 回だけ」の判定の正しさ（F2.1〜F2.4 の保留・揺れ・instanceId の振り直し）と、`session.json` が失われたときの ID の振り直し（F1.2）。
- 複数ホストはサーバからのリモートへの接続を新しく作る必要がある（F5.1）。規模と障害の扱いが増える。
- 監督役への知らせは prompt で送るしかない（F6.1）。作業中のエージェントへ送ると割り込みになる。

## 実装アンカー

- A1: 状態の変化のイベント（`packages/server/src/session/SessionService.ts:1050` `updatePaneRuntime`）。
- A2: 内部から方式を呼ぶ（`packages/server/src/surface/ControlSurface.ts` `invoke`）。`agent.prompt` の実装（`packages/server/src/surface/methods/agent.ts`）。
- A3: 画面の末尾（`packages/server/src/terminal/Mirror.ts` `bottomLines`）。
- A4: 保存の手本（`packages/server/src/persist/PrefsStore.ts`）と配線（`packages/server/src/composeServer.ts` の prefs の読み込み・flush）。
- A5: リモートの接続（`packages/server/src/machine/MachineManager.ts` `route`・`link.openChannel()`）、手本（`packages/client-core/src/net/MachineSummaryClient.ts`）。
- A6: web の差し込み口（`packages/web/src/App.vue:84-98`）・状態（`packages/web/src/store/view.ts:308-312,428,467-488`）・keydown（`packages/web/src/main.ts:379-391`）。
- A7: ドラッグの型（`packages/web/src/components/PaneFrame.vue:110-231`・`Sidebar.vue:285-380`）・純関数の手本（`packages/web/src/term/paneDragZone.ts`）。
- A8: 入口（`packages/web/src/components/ContextMenu.vue:120-126`・`Sidebar.vue:529-541`・`mobile/MobileShell.vue:84-87`）。
- A9: 操作表（`packages/client-core/src/keys/bindings.ts`）・tui の網羅（`packages/tui/src/actions/TuiDispatcher.ts:237-239`）。
- A10: sodactl（`packages/cli/src/cliArgs.ts` `USAGE_LINES`・`main.ts`・`skills/sodactl/SKILL.md`。`skill.test.ts` が USAGE と SKILL.md の一致を検査）。

## 実装時の注意

- `EventBus` の購読者は例外を自分で捕まえる（F3.3）。
- `agent.prompt` は working を断らない（F3.1）。「待つ・見送る」はグラフ側で決める。
- `session.json` が読めなかった起動では、保存したグラフのノードを全部「無効」にしてから始める（F1.2）。
- 選んでいないマシンの pane は呼び名を持たない（F7.6）。
- happy-dom はレイアウトしないので、座標の計算は純関数にしてテストする（F7.5）。

## design への申し送り

1. トリガの「1 回だけ」の鍵と揺れの抑え方（F2.4）。done は `(instanceId, completionSeq)`、blocked は 1 秒の保留、idle の扱い（idle と done の違いを利用者にどう見せるか）。
2. 先のエージェントが working のときの「待つ・見送る」の既定と、待つ上限。
3. 監督役への知らせ（prompt で送る文面・送る時機〔監督役が idle になるまで待つ〕・配下の変化の知らせ直し）（F6.1）。
4. 出力の受け渡しを「線の種類」にするか「状態トリガの属性」にするか（`research-ui.md` §5）。
5. 複数ホスト: 手元のサーバからリモートへの接続を常時張るか、線があるマシンだけか。切断中の変化の扱い（見送って履歴に残すか、繋ぎ直しで拾うか）（F5.1・F5.2）。
6. グラフ画面は `graphOpen` の別状態、操作表への追加と tui の扱い（F7.2〜F7.4）。
7. 実行回数の上限の既定値と、上限に達した線の再開の手順。
8. 保存したグラフと `session.json` の ID の食い違いの検出（F1.2）。
