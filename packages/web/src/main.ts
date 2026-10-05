import { TERMINAL_PALETTES, type SharedPrefs } from "@sodashitsu/protocol";
import type { ITerminalOptions } from "@xterm/xterm";
// xterm.js の必須の CSS（canvas の重ね方・入力用 textarea の隠し方）。無いと描画用の canvas が端末の下へ
// 押し出され、端末の中身が一切見えない（親の統合 test で発見。D96）。
import "@xterm/xterm/css/xterm.css";
// 境目（サイドバーの幅・pane の間・spaces と agents）の見た目。動きは composables/useResizeDrag.ts（20261004-ui-interaction-polish）。
import "./styles/resizeHandle.css";
import { createPinia } from "pinia";
import { createApp, nextTick, toRef, watch } from "vue";
import App from "./App.vue";
import { ActionDispatcher } from "./actions/ActionDispatcher.js";
import { ActionDispatcherKey, AskControllerKey, ConnectionKey, DeviceKindKey, FileTransferKey, KeyInputControllerKey, MachineSwitcherKey, NotificationControllerKey, TerminalRegistryKey, ViewSyncKey } from "./injection.js";
import { focusPaneIfShown } from "./actions/paneFocus.js";
import { MachineSwitcher } from "./actions/MachineSwitcher.js";
import { MachineWiring } from "./actions/MachineWiring.js";
import { PrefsSync } from "./actions/PrefsSync.js";
import { mobileViewportQuery, trackMediaQuery } from "./mobile/detect.js";
import { MachineSummaryClient } from "@sodashitsu/client-core";
import { LOCAL_MACHINE_ID, wsUrlFor } from "@sodashitsu/client-core";
import { useMachinesStore } from "./store/machines.js";
import { useGraphStore } from "./store/graph.js";
import { acceptsMainGraphEvent, createGraphPort, reloadsOnMainOpened } from "./store/graphRouting.js";
import { KeyInputController } from "./keys/KeyInputController.js";
import { KeyboardLockController } from "./keys/KeyboardLockController.js";
import { KeyRouter } from "@sodashitsu/client-core";
import { CopyMode } from "@sodashitsu/client-core";
import { NavigateMode } from "@sodashitsu/client-core";
import { ResizeMode } from "@sodashitsu/client-core";
import { setOptionComposes } from "@sodashitsu/client-core";
import { isCoarsePointer } from "./mobile/detect.js";
import { clientErrorMessage } from "@sodashitsu/client-core";
import { DesktopNotifier } from "./notify/DesktopNotifier.js";
import { NotificationController } from "./notify/NotificationController.js";
import { ToneSound } from "./notify/ToneSound.js";
import { Connection } from "@sodashitsu/client-core";
import { InputGate } from "@sodashitsu/client-core";
import { ImagePaster } from "./term/ImagePaster.js";
import { AskController } from "./ask/AskController.js";
import { useAskStore } from "./store/ask.js";
import { FileTransfer, isFileDrag } from "./term/FileTransfer.js";
import type { ConnectionPort, TerminalSinkPort } from "@sodashitsu/client-core";
import { documentTitle } from "./serverSession/documentTitle.js";
import { StoreAdapter } from "./store/StoreAdapter.js";
import { useNotificationsStore } from "./store/notifications.js";
import { sweepMarkSeen, useSeenStore } from "./store/seen.js";
import { useSessionStore } from "./store/session.js";
import { useOnboardingStore } from "./store/onboarding.js";
import { useSettingsStore } from "./store/settings.js";
import { isPrefsMigrated, markPrefsMigrated, onPrefsWritten, readPrefs, replaceSharedPrefs, sharedPrefsOf, useViewStore } from "./store/view.js";
import { applyPrefsToStores } from "./store/prefsApply.js";
import { useAgentIntegrationsStore } from "./store/agentIntegrations.js";
import { isMacPlatform, MouseBridge } from "./term/MouseBridge.js";
import { RendererPool } from "./term/RendererPool.js";
import { TerminalRegistry } from "./term/TerminalRegistry.js";
import { effectiveScrollback } from "./term/scrollback.js";
import { toXtermTheme } from "./term/theme.js";
import { ThemeController } from "./theme/ThemeController.js";
import { ViewSync } from "./term/ViewSync.js";

/**
 * composition root（T26。architecture.md「Web の主要な型と port」）。net/term/keys/store/actions の部品を
 * 組み立てる。**循環する port は、片方を先に実体化できないので「後から埋める」**（`KeyInputController.bind`
 * は既存の仕組み、`TerminalSinkPort` は `Connection` を先に作るために薄いフォワーダを用意する。下記参照）。
 * `kind`（`desktop`/`mobile`）は `isCoarsePointer()` で 1 回だけ判定する（04-mobile T8。design「モバイル」
 * の判定——1 列レイアウトへの切り替え（`isMobileViewport()`）とは別軸。`App.vue` 側で行う）。
 */

const DESKTOP_TERMINAL_CAPACITY = 24; // D28・D60（LRU の容量）
const DESKTOP_WEBGL_CAPACITY = 12; // D60（表示中の WebGL の上限）
const MOBILE_TERMINAL_CAPACITY = 2; // D28（モバイルの LRU＝表示中＋直前）
const MOBILE_WEBGL_CAPACITY = 2; // D60（モバイルの WebGL 上限。design.md の「4」は D28 改訂前の取り残し）

const kind = isCoarsePointer() ? "mobile" : "desktop";
const terminalCapacity = kind === "mobile" ? MOBILE_TERMINAL_CAPACITY : DESKTOP_TERMINAL_CAPACITY;
const webglCapacity = kind === "mobile" ? MOBILE_WEBGL_CAPACITY : DESKTOP_WEBGL_CAPACITY;

const pinia = createPinia();
const session = useSessionStore(pinia);
const view = useViewStore(pinia);
const seen = useSeenStore(pinia);
const settings = useSettingsStore(pinia);
// 保存した SSH のマシン（20260927-multi-host-machines）。モバイルの 1 列の画面では使わない（手元のマシンだけ。今までどおり）。
// 1 列かは窓の幅で変わる（`App.vue` と同じ media query）ので、変化を購読する。
const machines = useMachinesStore(pinia);
const mobileViewport = trackMediaQuery(mobileViewportQuery());
// 初回の案内を出すかは、接続より前（同じ読み込みの中で痕跡が書かれる前）に 1 回だけ決める（20260926-settings-onboarding の D4）。
useOnboardingStore(pinia);

const httpOrigin = ""; // 同一オリジン配信（vite dev は /api・/ws を proxy する。vite.config.ts）
const wsUrl = `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${window.location.host}/ws`;

// `Connection` は `sink: TerminalSinkPort` を要求するが、`TerminalRegistry` は `conn: ConnectionPort` を
// 要求する——どちらを先に作っても他方が無い。`TerminalSinkPort` は 3 メソッドだけなので、こちらを
// 薄いフォワーダにして `Connection` を先に作る。フォワーダは「後で埋める箱」（`registryBox`）を介して
// 本物の `TerminalRegistry` へ委譲する（箱自体は作った時点で確定するので `registry` を素の `let` にせず
// 済む——呼び出しは実際に pane を購読した後＝配線が終わった後にしか起きない）。
const registryBox: { current?: TerminalRegistry } = {};
/** マシンの切り替え（20260927-multi-host-machines）。`Connection.onOpened` の配線より後に作るので、既存の箱と同じ流儀で繋ぐ。 */
const machineSwitcherBox: { current?: MachineSwitcher } = {};
const machineWiringBox: { current?: MachineWiring } = {};
const prefsSyncBox: { current?: PrefsSync } = {};
/** 通知（20260920-agent-notifications）。`StoreAdapter` より後に作るので、既存の箱と同じ流儀で繋ぐ。 */
const notificationsBox: { current?: NotificationController } = {};
const sinkProxy: TerminalSinkPort = {
  onOutput: (paneId, chunk) => registryBox.current?.onOutput(paneId, chunk),
  onSnapshot: (paneId, cols, rows, text) => registryBox.current?.onSnapshot(paneId, cols, rows, text),
  onSizeChanged: (paneId, cols, rows) => registryBox.current?.onSizeChanged(paneId, cols, rows),
};

const storeAdapter = new StoreAdapter({
  pinia,
  onAuthRequired: () => view.onAuthRequired(),
  onConnectionState: (s) => view.onConnectionState(s),
  onPaneExited: (_paneId, exitCode) => view.toast(`pane を閉じました（終了コード ${exitCode}）`),
  // サーバの英語の固定文（`message`）は出さず、code から日本語の文言を引く（D107）。
  onClientError: (code) => view.toast(clientErrorMessage(code)),
  // ほかのマシンを選んでいる間の「開く前に閉じた」は、マシンが繋がっていない（503）ことが多く、Origin の拒否の手がかりにならない。
  onOriginRejectSuspected: (suspected) => view.setOriginRejectSuspected(suspected && machines.selectedId === LOCAL_MACHINE_ID),
  // 通知（20260920-agent-notifications）。**`notifications` はこの後で作る**ので、遅延で参照する。
  onAgentChanged: (paneId, prev, next) => notificationsBox.current?.onAgentChanged(paneId, prev, next),
  onSnapshotApplied: (panes, first) => notificationsBox.current?.onSnapshotApplied(panes, first),
  onPaneClosed: (paneId) => notificationsBox.current?.onPaneClosed(paneId),
  onAgentIntegrationChanged: (status) => useAgentIntegrationsStore(pinia).setStatus(status),
  // 画面の接続がローカルを向いているときだけ、手元の `soda serve` の一覧（リモートを向いていればそのマシンの登録簿なので捨てる）。
  onMachinesChanged: (list) => machineWiringBox.current?.onMainMachinesChanged(list),
  // 共有の設定（20260927-cli-mode）。`prefsSync` はこの後で作るので、遅延で参照する。
  onPrefsChanged: (data) => prefsSyncBox.current?.onChanged(data),
  // 連携のグラフ（20260927-agent-graph）は手元の `soda serve` のもの。画面の接続が別のマシンを向いている間の（そのマシンの）グラフは捨てる。
  onGraphEvent: (e) => {
    if (acceptsMainGraphEvent(machines.selectedId)) graph.applyEvent(e);
  },
  // 質問のフォーム（20261002-sodactl-ask）。`askController` はこの後で作るので、遅延で参照する。
  onAskEvent: (e) => askController.onEvent(e),
});

const connection = new Connection({ kind, httpOrigin, wsUrl, store: storeAdapter, sink: sinkProxy });
const conn: ConnectionPort = connection;

/**
 * 連携のグラフの口（20260927-agent-graph の design「別のマシンを見ている間も、グラフは手元のサーバのもの」）。画面の接続がローカルを向いていればそれ、
 * 別のマシンを向いていればローカルの軽い接続（`MachineWiring` が張る。作るのはこのファイルの `MachineSummaryClient` なので型を戻してよい）。
 */
const graph = useGraphStore(pinia);
graph.bind(
  createGraphPort({
    selectedId: () => machines.selectedId,
    main: conn,
    localSummary: () => machineWiringBox.current?.summaryClient(LOCAL_MACHINE_ID) as MachineSummaryClient | undefined,
  }),
);
// 接続のたびに取り直す（切れている間の変化を取りこぼさない）。上限の知らせ（AC11）のため、画面を開いていなくても持つ。
connection.onOpened(() => {
  if (reloadsOnMainOpened(machines.selectedId)) void graph.load();
});
// 端末への入力は全てこの関所を通す（xterm.js の `onData`・`KeyInputController` の直接の送信）。分割・新しい tab・
// 新しい workspace の応答を待つ間の入力を溜め、新しい pane へ流す（D99）。
const inputGate = new InputGate(conn);

// キーの割り当て（20260921-keybinding-customization）：prefix と割り当ては**設定（`settings.keymap`）から解決した表**で、設定画面で変えると即時に差し替える（AC8）。
// macOS の Option は文字を別の文字に化かすので、macOS のときだけ `code` で元へ戻す（D6b。ほかの環境で入力を書き換えない）。
setOptionComposes(isMacPlatform());
// navigate モードの6操作（20260923-navigate-mode-keys）も同じ流儀——初期表を直接渡し、設定画面で
// 変えると `settings.navigateKeymap` の watch で即時に差し替える（design「main.ts の配線」）。
const navigateMode = new NavigateMode(settings.navigateKeymap);
const router = new KeyRouter(
  settings.keymap,
  { now: () => Date.now(), setTimeout: (fn, ms) => window.setTimeout(fn, ms), clearTimeout: (h) => window.clearTimeout(h as number) },
  { navigate: navigateMode, copy: new CopyMode(), resize: new ResizeMode() },
);
watch(() => settings.keymap, (keymap) => router.setKeymap(keymap));
watch(() => settings.navigateKeymap, (keymap) => navigateMode.setKeymap(keymap));
const keys = new KeyInputController(router, inputGate);

const renderers = new RendererPool({ capacity: webglCapacity });

// `ActionDispatcher` は `registry`/`keys` の両方を要求するので、この 2 つより後にしか作れない。だが
// `TerminalRegistry.createMouseBridge` は `ActionDispatcher`（`UiPort`）を要求する——同じ「箱」の手で
// 後から埋める（呼ばれるのは pane を acquire した後＝配線完了後なので安全）。
const actionDispatcherBox: { current?: ActionDispatcher } = {};

/** `host.windowsBuild` が分かってから埋める（`client.hello` の応答は非同期）。`TerminalRegistry.create()` は
 *  pane を作るたびにこのオブジェクトを読むので、後から書き換えれば以後の pane に反映される。 */
const terminalOptions: Partial<ITerminalOptions> = {};

/**
 * pane の scrollback の行数。**このブラウザの設定 → 端末の種類 → サーバの上限**の順で決める
 * （`term/scrollback.ts` の `effectiveScrollback`。20260921-herdr-settings-gaps の D5）。「自動」（既定）は以前と同じで、
 * デスクトップは `limits.scrollbackLines`（既定 5,000・上限 10,000）、モバイルは 1,000（design「WebSocket の通信」）。
 * 数を選んだときはサーバの上限で押さえる。
 *
 * **読むのは `TerminalRegistry` が端末を作るとき**で、`pane.subscribe` で SNAPSHOT に求める行数（`ViewSync`）は、
 * その端末を作ったときの値を使う（D6。途中で設定を変えても xterm の容量と求める行数を食い違わせない。
 * 以前の xterm.js は既定の 1,000 行で、それを超える分を捨てていた——D107）。
 */
const getScrollbackLines = (): number => effectiveScrollback(settings.scrollback, kind, session.limits.scrollbackLines);

// 質問のフォーム（20261002-sodactl-ask）。`inputGate` は素通しの接続（要求だけを使う）。接続のたびに `ask.subscribe` して待っている質問を受け取る（下の `onOpened`）。
const askController = new AskController({ conn: inputGate, store: useAskStore(pinia), toast: (message) => view.toast(message) });

// クリップボードの画像の貼り付け（20260927-clipboard-image-paste。herdr の remote_image_paste）。入力は関所を通し、送っている間のキーを溜める。
// `registry` は下で作る（呼ばれるのは pane を acquire した後）。
const imagePaster = new ImagePaster({
  conn: inputGate,
  input: inputGate,
  terminalOf: (paneId) => registry.get(paneId)?.term ?? null,
  toast: (message) => view.toast(message),
  paneExists: (paneId) => session.panes.has(paneId),
});

// 端末のファイルのリンクとドロップ。ブラウザ版はローカルのファイルに触れないので、サーバ越しに開く・受け取る・送る（`term/FileTransfer.ts`）。
// `machines` は下で作る（呼ばれるのはクリック・ドロップのとき）。
const fileTransfer: FileTransfer = new FileTransfer({
  conn: inputGate,
  input: inputGate,
  terminalOf: (paneId) => registry.get(paneId)?.term ?? null,
  toast: (message) => view.toast(message),
  paneExists: (paneId) => session.panes.has(paneId),
  locality: () => settings.fileLocality,
  isLocalMachine: () => machines.selectedId === LOCAL_MACHINE_ID,
  hostOs: () => (session.host?.os === "windows" ? "windows" : "posix"),
  hostname: () => session.host?.hostname,
});

const registry = new TerminalRegistry({
  capacity: terminalCapacity,
  conn: inputGate,
  renderers,
  keys,
  createMouseBridge: (term, paneId) =>
    new MouseBridge({
      term,
      paneId,
      ui: actionDispatcherBox.current!,
      getRightClickTarget: () => session.panes.get(paneId)?.rightClick ?? "herdr",
      files: {
        resolve: (id, paths) => fileTransfer.resolve(id, paths),
        open: (file) => fileTransfer.open(file),
        openUri: (id, uri) => fileTransfer.openUri(id, uri),
      },
    }),
  hasSizeAuthority: (paneId) => {
    const pane = session.panes.get(paneId);
    return pane ? session.hasSizeAuthority(pane.tabId) : false;
  },
  terminalOptions,
  getScrollbackLines,
  // 作る端末は、いま使っているテーマの配色（20260921-theme-settings）。開いている端末は ThemeController が入れ替える。
  getTheme: () => toXtermTheme(TERMINAL_PALETTES[settings.effectiveTheme]),
  onImagePaste: (paneId, blob) => imagePaster.pasteBlob(paneId, blob),
});
registryBox.current = registry;

/**
 * テーマ（20260921-theme-settings の design D5）。**ここで当てる**——`app.mount` より前、接続より前。`public/theme-boot.js` が控えから
 * 先に当てた値も、ここで設定から当て直す。サーバへの `client.theme` は接続が無ければ捨て、新しい接続ごとに送り直す（下の `onOpened`）。
 */
const themeController = new ThemeController({
  settings,
  root: document.documentElement,
  media: typeof window.matchMedia === "function" ? window.matchMedia("(prefers-color-scheme: dark)") : null,
  setTerminalTheme: (palette) => registry.setTheme(toXtermTheme(palette)),
  sendTheme: (theme) => void conn.request("client.theme", { theme }).catch(() => undefined),
  storage: (() => {
    try {
      return window.localStorage; // 取得そのものが投げる環境がある（サンドボックスの iframe 等）
    } catch {
      return null;
    }
  })(),
});
themeController.start();

/**
 * 全画面のとき、ブラウザ予約キーの一部を Keyboard Lock で受け取れるようにする
 * （20260922-keybinding-usability。design「US4」）。`navigator.keyboard` の無い環境
 * （Firefox・Safari 等）では feature-detect で null にし、無害に何もしない（AC14）。
 */
const keyboardLockController = new KeyboardLockController({
  settings,
  doc: document,
  keyboard:
    (
      navigator as Navigator & {
        keyboard?: { lock(codes?: string[]): Promise<void>; unlock(): void };
      }
    ).keyboard ?? null,
});
keyboardLockController.start();

const viewSync = new ViewSync({ conn, registry, getScrollbackLines });
// 新しい接続の `client.hello` が通るたび（初回・自動の再接続・503 等からの再試行・再ログイン・「再接続」ボタン）に、表示と
// 購読を張り直す（D107）。サーバは接続ごとに新しい clientId を振り、前の接続の購読・表示・fit を引き継がない。
connection.onOpened(() => viewSync.onConnectionOpened());
// サーバは接続ごとに新しい clientId を振り、前の接続のテーマを持たない（色の問い合わせの答えに使う。20260921-theme-settings の design D6）。
// 起動の直後の `start()` は接続より前で送れないので、接続の直後に今のテーマを届ける経路はここだけ（接続中の変化は `apply` が送る）。
connection.onOpened(() => themeController.resend());
// 質問を出せる画面として名乗り、待っている質問を受け取る（接続ごと。再読み込み・再接続・マシンの切り替えの出し直し）。
connection.onOpened(() => askController.onOpened());
connection.onClosed(() => askController.onClosed());
// この接続から見たサーバ（同じマシンか・ファイルを開く手段があるか）は接続ごとに聞き直す（マシンを切り替えた後の接続も同じ）。
connection.onOpened(() => fileTransfer.onOpened());
// 名前付き session の数（サイドバーの session の入口。20260926-named-session-ui）。`actionDispatcher` は下で作るので、呼ぶ時点で読む。
connection.onOpened(() => void actionDispatcherBox.current?.refreshServerSessions());
// 保存した SSH のマシン（20260927-multi-host-machines）: 切り替えの直後の `workspace.focus`、ローカルを向いているときのマシンの一覧。
connection.onOpened(() => machineSwitcherBox.current?.onOpened());
connection.onOpened(() => machineWiringBox.current?.onMainOpened());
// 独自コマンドの一覧（20260927-custom-command-keys。サーバ全体の設定）。接続ごとに取り直す（切れている間の読み直しを取りこぼさない）。
connection.onOpened(() => void actionDispatcherBox.current?.refreshCommands());
// 閉じてから次の hello が通るまでは、`client.view`・`pane.subscribe` を送らない（D107）。
connection.onClosed(() => viewSync.onConnectionClosed());
// 設定の置き場所はサーバ（20260927-cli-mode の design「設定」）。接続のたびに受け取り（初回は移行）、以後の変更を送る。判断は `PrefsSync`。
const prefsSync = new PrefsSync({
  getPrefs: () => conn.request("prefs.get", {}),
  // 送るのは web のストアが `writePrefs` で書いた値そのもの（`SharedPrefs` の形で書いている。サーバは形を問わない）。
  setPrefs: (patch, baseRev) => conn.request("prefs.set", { patch: patch as SharedPrefs, baseRev }),
  isLocal: () => machines.selectedId === LOCAL_MACHINE_ID,
  readLocal: () => readPrefs(),
  sharedOf: sharedPrefsOf,
  replaceShared: replaceSharedPrefs,
  applyToStores: (raw) => applyPrefsToStores(pinia, raw),
  toast: (message) => view.toast(message),
  migrated: isPrefsMigrated,
  markMigrated: markPrefsMigrated,
});
prefsSyncBox.current = prefsSync;
onPrefsWritten((patch) => prefsSync.onWritten(patch));
connection.onOpened(() => prefsSync.onOpened());
connection.onClosed(() => prefsSync.onClosed());

// 通知（20260920-agent-notifications）。`registry`（表示中の pane を引く）より後、
// `ActionDispatcher`（`prefix+o` の行き先に使う）より前にしか置けない。
const notifications = new NotificationController({
  pinia,
  desktop: new DesktopNotifier(),
  sound: new ToneSound(),
  isPaneVisible: (paneId) => registry.isVisible(paneId),
  onFocusPane: (paneId) => void conn.request("pane.focus", { paneId }).catch(() => undefined),
});
// 利用者がトーストを消したのを拾う唯一の観測点（`sticky` は自動消去に掛からない）。
watch(
  () => view.toasts.map((t) => t.id),
  () => notifications.syncToasts(),
);
// 案内は「見ていないタブに出して消費される」のを避けるため、フォーカスが戻ってから出す。
window.addEventListener("focus", () => notifications.showHintIfDue());

// 自動再生の解除（AC13）。**制限はページの読み込みごとに掛かり直す**ので、設定を「入」にした操作だけでは
// 読み込み直した後に鳴らない。**最初の操作で解除しておく**（`capture` で受けるのは、端末や
// ダイアログが握って止めても届かせるため。`passive` で既定の動作には触らない）。
//
// **`pointerup` を外さない**——HTML 仕様が「操作」と数えるのは `pointerdown` では
// `pointerType === "mouse"` のときだけで、**タッチとペンは `pointerup` でしか活性化しない**。
// `pointerdown` だけにすると、携帯の最初のタップで `AudioContext` を `suspended` のまま作ってしまい、
// **結線を足す前より悪くなる**（タップ 1 回 → 放置 → 最初の知らせ、が鳴らなくなる。タスク点検 T24 の指摘）。
// モバイルは OS 通知を出せない（research F79）ので、音が唯一の経路になる。
for (const type of ["pointerdown", "pointerup", "keydown"] as const) {
  window.addEventListener(type, () => notifications.noteUserGesture(), { capture: true, passive: true });
}

notificationsBox.current = notifications;
// 履歴の 7 日の期限は、ページを開いたままでも落とす（掃除の契機は出来事の変化だけでは足りない）。
setInterval(() => useNotificationsStore(pinia).pruneExpiredHistory(), 30_000);

const actionDispatcher = new ActionDispatcher({ conn, pinia, registry, keys, input: inputGate, notifications, imagePaste: imagePaster });
actionDispatcherBox.current = actionDispatcher;

/** サイドバーの workspace の選択と同じ（同じマシンのとき。`Sidebar.vue` の `focusWorkspace`）。 */
function focusWorkspaceHere(workspaceId: string): void {
  const ws = session.workspaces.get(workspaceId);
  if (!ws) return;
  const tab = session.tabs.get(ws.activeTabId);
  view.setView(workspaceId, ws.activeTabId);
  if (tab) view.focusPane(tab.focusedPaneId);
  void conn.request("workspace.focus", { workspaceId }).catch(() => undefined);
}

const machineSwitcher = new MachineSwitcher({
  selectedId: () => machines.selectedId,
  selectMachine: (id) => machines.select(id),
  isSelectable: (id) => machines.isSelectable(id),
  setViewScope: (id) => view.setMachineScope(id),
  // 応答せずに閉じた知らせの履歴もマシンごと（20261005-notify-bell。pane・エージェントの id がマシンをまたいで衝突するため）。
  setSeenScope: (id) => {
    seen.setScope(id);
    useNotificationsStore(pinia).setHistoryScope(id);
  },
  rememberView: (workspaceId, tabId) => view.rememberView(workspaceId, tabId),
  forgetStoredView: () => view.forgetStoredView(),
  focusWorkspaceHere,
  resetNotifications: () => notifications.resetForMachineSwitch(),
  resetBaseline: () => storeAdapter.resetBaseline(),
  clearSession: () => session.clear(),
  // 表示・ダイアログ等を捨て、キーの受け方（navigate・copy・resize・dialog）も端末へ戻す（view だけではキーの側のモードが残る）。
  resetView: () => {
    view.resetForMachineSwitch();
    keys.setMode("terminal");
    imagePaster.resetForMachineSwitch(); // 前のマシンの pane へ始めた画像の貼り付けを、次のマシンの同じ id の pane へ届けない
    askController.resetForMachineSwitch(); // 前のマシンの質問を捨てる（pane の id が重なる）。次の接続の ask.subscribe が取り直す
    fileTransfer.resetForMachineSwitch(); // ファイルのドロップ・ダウンロードも同じ
  },
  nextTick: () => nextTick(),
  disposeTerminals: () => registry.disposeAll(),
  retarget: (url) => connection.retarget(url),
  wsUrlFor: (id) => wsUrlFor(wsUrl, id),
  requestWorkspaceFocus: (workspaceId) => void conn.request("workspace.focus", { workspaceId }).catch(() => undefined),
  requestPaneFocus: (paneId) =>
    void focusPaneIfShown(
      {
        paneTab: (id) => session.panes.get(id)?.tabId,
        shownTab: () => view.tabId,
        focus: (id) => {
          view.focusPane(id);
          void conn.request("pane.focus", { paneId: id }).catch(() => undefined);
        },
      },
      paneId,
    ),
});
machineSwitcherBox.current = machineSwitcher;

/** 保存した SSH のマシンの配線（判断は `MachineWiring`。ここは呼ぶだけ）。 */
const machineWiring = new MachineWiring({
  machines,
  switcher: machineSwitcher,
  requestMainList: () => conn.request("machine.list", {}),
  createSummaryClient: (opts) => new MachineSummaryClient(opts),
  baseWsUrl: wsUrl,
  mobileViewport,
  onLocalGraphEvent: (e) => graph.applyEvent(e),
  onLocalOpened: () => void graph.load(),
  graphOpen: toRef(view, "graphOpen"),
});
machineWiringBox.current = machineWiring;
watch([() => machines.selectedId, () => machines.machines.map((m) => m.id).join("\n"), mobileViewport, () => view.graphOpen], () => machineWiring.reconcileSummaryClients());
// 1 列の画面になったらローカルへ戻り一覧を空にする（サイドバーにマシンの見出しが無く戻れなくなるため）。広げたら一覧を読み直す。
watch(mobileViewport, (mobile) => machineWiring.onMobileChanged(mobile));
// 1 列の画面でも連携のグラフ画面を開いている間は、別のマシンのノードの状態を出すため一覧と軽い接続を保つ（統合レビュー R1）。
watch(() => view.graphOpen, (open) => machineWiring.onGraphOpenChanged(open));
keys.bind({ action: actionDispatcher, focus: actionDispatcher, mode: { onModeChange: (m) => view.onModeChange(m) }, imagePaste: imagePaster });

// Windows のホストなら ConPTY 向けのオプションを足す（design「エージェントの argv[0]」隣接。H-cfg 相当）。
watch(
  () => session.host,
  (host) => {
    if (host?.os === "windows") terminalOptions.windowsPty = { backend: "conpty", buildNumber: host.windowsBuild ?? 0 };
    // マシンを切り替えて Windows でないホストになったら外す（ホストはマシンごと。20260927-multi-host-machines）。
    else if (host) delete terminalOptions.windowsPty;
  },
);

// 接続が `open` でない間は端末への入力を止める（D95。打った文字を表示もせずに捨てない。止めていることは
// `ReconnectOverlay` が示す）。
watch(
  () => view.connectionState,
  (state) => registry.setInputEnabled(state === "open"),
  { immediate: true },
);

// ダイアログの開閉と `KeyRouter` のモードを同期する（design の状態遷移図「prefix --> dialog」「dialog -->
// terminal」）。ダイアログ自身が Esc/Enter 等の全キーを処理するので、KeyRouter 側はここでは何も横取りしない
// （`KeyRouter.handle` は mode:"dialog" のとき常に consume を返すのみ）。
// 連携のグラフ画面（20260927-agent-graph）もダイアログの 1 枠とは別の状態で同じく扱う（`view.modalOpen`。research-web §1.5）。
watch(
  () => view.modalOpen,
  (open) => keys.setMode(open ? "dialog" : "terminal"),
);

// 端末以外（サイドバー・tab バー等）にフォーカスがあるときの keydown（design「フォーカスの抜け道」）。
// **xterm.js の内部 textarea にフォーカスがある間は何もしない**——`attachCustomKeyEventHandler` は
// `preventDefault()` はしても `stopPropagation()` はしないため、この window レベルの listener にも
// 同じ keydown が届いてしまう（実機の Chromium で確認済み。二重処理すると例えば「端末フォーカス中に
// Ctrl+B を押す」が「prefix に入る→直後に \x02 が送られて抜ける」という壊れた動きになる）。
// ダイアログが開いている間も同様にここでは何もしない（ダイアログ自身が処理する。上の watch 参照）。
window.addEventListener("keydown", (ev) => {
  if (view.modalOpen) return;
  if (document.activeElement?.classList.contains("xterm-helper-textarea")) return;
  const passThrough = keys.handleDomKey(ev);
  if (!passThrough) ev.preventDefault();
});

// 既読の送出（design「エラー処理 / 異常系」隣接、D56 の訂正 6）。pane ごとに「実際に表示
// されているか」×「ウィンドウにフォーカスがあるか」を見てから既読を進める
// （20260925-seen-semantics-fix。design「設計方針」）。`registry.isVisible` は Vue の
// reactive ではないため、`nextTick()` の後に読む（`TerminalRegistry.ts` の契約どおり）。
function markVisibleAgentsSeen(): void {
  void nextTick(() => {
    sweepMarkSeen(session.panes.values(), (paneId) => registry.isVisible(paneId), document.hasFocus(), seen.markSeen);
  });
}
watch(() => [...session.panes.values()].map((p) => p.agent?.completionSeq ?? -1), markVisibleAgentsSeen, { deep: true });
window.addEventListener("focus", markVisibleAgentsSeen);

// ブラウザのタブのタイトル（H14／AC4）：`{hostname}: {workspace}`。どちらか欠けていれば既定の製品名 "Sodashitsu"。
// 名前付き session はその名前を添える（20260926-named-session-ui の AC3。`documentTitle`）。
watch(
  () => [session.host?.hostname, session.host?.sessionName, view.workspaceId ? session.workspaces.get(view.workspaceId)?.label : null] as const,
  ([hostname, sessionName, workspaceLabel]) => {
    document.title = documentTitle(hostname, sessionName, workspaceLabel);
  },
);

// ファイルを pane の外（サイドバー・tab バー等）へ落としても、ブラウザにそのファイルを開かせない（この画面から離れてしまう）。
// pane の上のドロップは `TerminalPane` が先に受けて止めている（`defaultPrevented`）。
window.addEventListener("dragover", (ev) => {
  if (ev.defaultPrevented || !isFileDrag(ev.dataTransfer)) return;
  ev.preventDefault();
  if (ev.dataTransfer) ev.dataTransfer.dropEffect = "none";
});
window.addEventListener("drop", (ev) => {
  if (!ev.defaultPrevented && isFileDrag(ev.dataTransfer)) ev.preventDefault();
});

const app = createApp(App);
app.use(pinia);
app.provide(ConnectionKey, conn);
app.provide(ActionDispatcherKey, actionDispatcher);
app.provide(MachineSwitcherKey, machineSwitcher);
app.provide(TerminalRegistryKey, registry);
app.provide(AskControllerKey, askController);
app.provide(FileTransferKey, fileTransfer);
app.provide(ViewSyncKey, viewSync);
app.provide(DeviceKindKey, kind);
app.provide(KeyInputControllerKey, keys);
app.provide(NotificationControllerKey, notifications);
app.mount("#app");

conn.connect();
