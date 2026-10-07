/**
 * `packages/server` の公開面（05-e2e-docs T1。design には無い追加判断）。
 * このパッケージはこれまで CLI（`bin: soda`）としてしか公開しておらず、外の package から import する経路が
 * 無かった。`packages/e2e` は `smoke.ts`（01・03-web-desktop T26）と同じ土台（実サーバをプロセス内で組み立て、
 * Playwright の実ブラウザから駆動する）で E2E を書くため、必要な最小限だけをここでバレル公開する
 * （`package.json` の `main`/`types` はこのファイルを指す）。
 */
export { composeServer, type ComposedServer } from "./composeServer.js";
export type { ImageFetcher } from "./ask/AskMedia.js";
export type { RawServeArgs, ServeOptions } from "./config.js";
/**
 * 起動時に表示する LAN の IPv4 を選ぶ純関数（サーバ自身が使うもの）。e2e の tls-lan が「このマシンに表示されるべき
 * LAN の IPv4 があるのにサーバが 1 つも表示しない」退行を skip ではなく失敗にするために、同じ条件を重ねて持たずに使う（D103）。
 */
export { lanIpv4Addresses, type InterfaceAddress } from "./util/net.js";
/**
 * node-pty の実装（20260926-pane-direct-connect）。cli の smoke が、ビルド済みの `sodactl pane attach` を本物の端末（PTY）の中で
 * 動かして raw モード・切り離しキーを確かめるのに使う（cli に node-pty を足さずに済む。decisions D5）。
 */
export { NodePtyBackend } from "./pty/NodePtyBackend.js";
/**
 * 空いているポートで組み立てて待ち受けさせる（20260926-load-flaky-tests の D3）。cli の結合テストが、番号だけ取って後で待ち受ける
 * 間に別のテストにポートを取られて `EADDRINUSE` で落ちないように使う。
 */
export {
  composeServerOnFreePort,
  getFreePort,
  type ComposeOnFreePortOptions,
} from "./composeServerOnFreePort.js";
/**
 * ログイン不要の受け口（`pane.sock`。20261003-sodactl-ask-socket）。cli の結合テストが、実物の受け口にテスト用の操作を登録して、
 * 実物のクライアント（`callPaneOp`）で呼ぶのに使う（受け口・クライアントのコードに手を入れずに新しい操作が通ることを確かめる。AC13）。
 */
export { PaneSocket, type PaneSocketDeps, type PaneSocketLimits } from "./panesocket/PaneSocket.js";
export { PaneOpRegistry, type PaneOpContext, type PaneOpDef } from "./panesocket/PaneOpRegistry.js";
/** 表示の面の台帳（20261007-soda-extensions）。結合テストが、時計や id を差し替えて組み立てるのに使う。 */
export { DisplayService, type DisplayClock, type DisplayServiceOptions } from "./display/DisplayService.js";
