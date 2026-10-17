# 段階的な作業と点検

状態: PC補助方式でCLI/外向き転送/UIの初期実装と実ブラウザE2Eが成立。以下の当初計画には未実施の拡張・互換性測定を残す。現在仕様はdesign.mdを正とする。

## 今回

- [x] mainの追跡済みHEADから専用worktree/branchを作成する。
- [x] 調査メモをwork内へ持ち込み、要件・設計と結ぶ。
- [x] エージェントの起動→実port登録→A画面open→状態確認の契約を設計する。
- [x] pane.sockの権限と画面選択の既存構造を確認し、追加設計が必要な箇所を記録する。
- [x] 入口方式へのユーザー回答を反映する（PC側の補助プログラムを許可）。
- [x] 全体設計を別コンテキストで独立点検し、指摘を反映する（配送先、接続/app世代、gateway cookie）。修正分の再点検はreview.md参照。

## 方式決定後の実装単位

数十ファイルにまたがる変更を一度にレビューしない。下記を独立した差分単位とし、各単位で実物の入口まで配線して検証する。ファイル数が大きくなる場合はさらに分ける。公開・導入・PR/mergeは別途依頼範囲に従う。

### P0 ブラウザ入口のPoC

- [x] 採用候補で2appのroot配信・同名cookie・JS親Domain cookie注入・storage分離を測定する（現環境のLinux Chromiumのみ）。
- [x] Linux Chromium 153で実LoopbackGatewayを使い、2appのroot配信・cookie/storage・JS親Domain/予約cookie偽装・module/CSS/HTTP/SSE/uploadを検証する。WS transport自体はfixtureであり本物の遠隔転送ではない。
- [x] 公開URL風のHTTPS originの模擬で、LNA権限なしの拒否と付与後のiframe成立を確認する。システム証明書の導入やブラウザの安全機能無効化はしない。
- [ ] HTTPS親からの埋込み、OS/browser差、ローカルネットワーク許可、必要なユーザー操作を確認する。
- [ ] 補助機能なし/許可なし/iframe拒否を診断し、別タブ導線の成立範囲を記録する。
- 独立taskcheck: **必要**（origin/資格情報/セッション分離）。この成立前に製品UIへ固定方式を配線しない。

### P1 明示登録・許可・CLI

- [ ] 登録schema・UUID/prefix・generation・保存/非active復元・上限を実装する。
- [ ] register/list/status/replace/stop/removeと既存CLI入口を配線する。
- [ ] caller paneの実在/所属・別server・別workspace・管理port・不正address・同名別paneを検証する。
- [ ] 認証済み操作を先行し、限定grantの設計が成立してからpane内の候補操作を追加する。
- 独立taskcheck: **必要**（状態/保存/安全境界）。CLI parsingだけの細分は全体crossへまとめる。

### P2 外向き転送とSSH

- [ ] capability交渉、新HTTP/WSチャネル、固定upstream connector、cancel/credit/limitを実装する。
- [ ] 実サーバー2台と既存の外向き委譲でHTTPが往復することを確認する。次にSSHも確認する。
- [ ] 旧版、不正frame、不正HTTP、失効/切断/世代変更、slow reader、チャネル枯渇を検証する。
- 独立taskcheck: **必要**（protocol/認証/背圧）。通常端末の動作も対象にする。

### P3 Sodashitsu内画面とagent open

- [ ] PreviewView、app選択、閉じる/更新/新session/転送停止を配線する。
- [ ] B caller pane→A viewer配送、viewer選択、grant/lease、open intentとackを実装する。
- [ ] no_viewer/ambiguous viewer/別利用者/CLI切断/timeout/複数Aへの委譲で誤配送しないことを確認する。
- [ ] エージェントが実サーバーを起動し、CLIでportを登録してAの実ブラウザへ表示する一巡を検証する。
- 独立taskcheck: **配送/認可/寿命は必要**。表示だけの調整は全体crossへまとめる。

### P4 実アプリ互換性と受入

- [ ] Vite/Nextの対象版を記録し、root assets/API、deep-link、dynamic import、CSS/fonts/images、redirect/cookieを確認する。
- [ ] WS binary/HMR、SSE/SSR streaming、multipart/Range/HEAD/304、abortを実ブラウザで観測する。
- [ ] セッション失効/metadata/管理API/任意URL拒否と、飽和時の端末遅延・メモリ上限を測定する。
- [ ] 必要な設定と無改修範囲、iframeで動かない条件、SWを含む対象外を文書化する。
- taskcheck: テスト・文書追加だけの差分は**不要**。実装の修正が入れば、その安全/状態差分を再点検する。

### P5 任意の追加adapter/連携

- [ ] 公開済みB HTTPS adapterの要否を判断し、必要なら同じ受入テストを通す。
- [ ] plugin operations/TUI状態表示/agent skillへの導線を整える。
- [ ] SW対応は明示的な後段とし、旧SWによるbootstrap捕捉と失効後cacheを含めて検証する。

## 全体の検証とreview

受け入れテストは[research.mdのA1–A13](research.md#受け入れテスト)に、agent追加分として以下を足す。

- G1: Bのpane内agentから登録→openし、Aの選ばれたブラウザだけに正しいappが表示される。
- G2: port変更・再実行で同一登録が更新され、旧generationの転送が止まる。
- G3: no_viewer/複数viewer/期限切れ/補助機能なしでは虚偽の成功を返さず、遅れて全ブラウザを開かない。
- G4: agentには管理/委譲/gateway資格情報を返さず、別workspaceや別利用者のviewを操作できない。
- G5: 読込みackとアプリ機能テストの成功を混同しない。404/500/認証画面/iframe拒否の状態を区別する。
- G6: 同じB paneを複数Aが操作するとき、配送先未指定なら一意性を確認し、曖昧ならどこにも送らない。A1再接続でA2の正常streamを失効しない。
- G7: gateway認証cookieと同名/異Path/親DomainのcookieをJSとHTTP応答から注入しても、権限を得たり別appのcookieで認証されたりしない。重複認証cookieは拒否し、予約namespaceがB upstreamへ一切届かない。

E2E判定は`.aidev/conventions/e2e-observe-browser.md`に従って利用者のブラウザDOM/HTTP/WSで行う。修正の回帰テストを足す場合は`.aidev/conventions/regression-negative-control.md`の対照確認を行う。

全体test/build/typecheckは実装したコンテキストで1回実施し、結果を記録する。受取り側は新たな変更がなければ重複実行せず、外部worktreeのsmokeと関連E2Eを行う。最終差分の独立レビューを省かず、修正差分にも再レビューを掛ける。

## 初期実装の到達点（2026-10-17）

- [x] メモリ内登録・UUID/prefix・replace/generation・停止・管理port拒否（永続化は見送り）。
- [x] register/list/viewers/helper/open/stop/remove CLI、caller pane限定pane.sock操作。
- [x] 既存JSON RPC転送上の新HTTP/WS pull型、固定127.0.0.1接続、byte/count/timeout/cancel上限。専用binaryチャネルは未導入。
- [x] 専用Webプレビュー窓、pane許可、viewer/helper lease、選択viewer配送、ACK、取消・切断・停止失効。
- [x] 実2サーバー・B発外向き委譲・本物のhelperとagent CLIによる実ブラウザ受入試験。
- [x] 脆弱な状態/転送タスクと全体差分の独立レビュー、指摘差分の再レビュー。
- [ ] 実Vite/Next・SSH実機・OS/browser横断・実公開HTTPS親・帯域競合の性能測定。
- [ ] helper自動起動、永続化、plugin operations、TUI、別account ACL。

- [x] 再起動後のfocused31件・外向き転送E2Eを復元。設定画面timeoutは限定再実行pass、既存agent.prompt不一致は記録。
- [x] 実Vite8.3.0のJS/CSS HMR、document維持、stopをブラウザで確認し、追加PoCを独立レビュー。Next等は未検証のまま残す。
