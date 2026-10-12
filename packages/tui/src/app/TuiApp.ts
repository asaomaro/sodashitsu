import { GraphTerminal } from "../modes/GraphTerminal.js";
import { ScheduleView } from "../modes/ScheduleView.js";
import { PluginPackages } from "../modes/PluginPackages.js";
import { GraphView } from "../modes/GraphView.js";
import { terminalViews, DockedViews } from "./DockedViews.js";
import { ViewPicker } from "../modes/ViewPicker.js";
import { BUILTIN_WORKSPACE_KEY, type BuiltinViewId } from "@sodashitsu/protocol";
import { chordOf } from "@sodashitsu/client-core";
import { WorkspaceDialog } from "../modes/WorkspaceDialog.js";
import { DisplayModel } from "../model/DisplayModel.js";
import { DisplayDialog } from "../modes/DisplayDialog.js";
import { WindowOverlay } from "../modes/WindowOverlay.js";
import { findMessageLine } from "@sodashitsu/client-core";
import { ConversationDialog } from "../modes/ConversationDialog.js";
import { headerActionsFor, loadAgentHeaderActions } from "@sodashitsu/protocol";
import { AgentForkDialog } from "../modes/AgentForkDialog.js";
import { UsageModel } from "../model/UsageModel.js";
import { UsageDialog, UsageDashboard } from "../modes/UsageView.js";
import {
  CopyMode,
  InputGate,
  NavigateMode,
  ResizeMode,
  commandKeyDefs,
  LOCAL_MACHINE_ID,
  MachineSummaryClient,
  wsUrlFor,
  loadKeyPrefs,
  resolveKeymap,
  resolveNavigateKeymap,
  type ConnectionState,
  type Mode,
  type ResolvedKeymap,
  type ResolvedNavigateKeymap,
  groupIdOfNavigateKey,
  isUngroupedNavigateKey,
} from "@sodashitsu/client-core";
import { TuiDispatcher } from "../actions/TuiDispatcher.js";
import { GotoDialog } from "../modes/GotoDialog.js";
import { SettingsDialog } from "../modes/SettingsDialog.js";
import { settingsSections } from "../settings/sections.js";
import { SettingsWriter } from "../settings/SettingsWriter.js";
import { NotificationController } from "../notify/NotificationController.js";
import { MachinesModel } from "../model/MachinesModel.js";
import { MachineWiring, type SwitchTarget } from "../net/MachineWiring.js";
import { NotificationList } from "../modes/NotificationList.js";
import { CommandPopup } from "../modes/CommandPopup.js";
import { describeDelivery, detectDelivery } from "../notify/terminalNotify.js";
import type { ToastHit } from "../render/Renderer.js";
import { ATTR } from "../render/color.js";
import type { CursorState, Grid } from "../render/Screen.js";
import { TuiCopyTarget } from "../term/CopyTarget.js";
import type { PaneTerminal } from "../term/PaneTerminal.js";
import {
  osc52,
  readClipboardImage,
  readClipboardText,
  writeClipboardTool,
  imageReadTimeoutMs,
  type ClipboardEnv,
  type Runner,
} from "../clipboard.js";
import { ImagePaster } from "../image/ImagePaster.js";
import { wrapTmux } from "../notify/terminalNotify.js";
import { KittyImages, kittyGraphicsSupported, type KittyPlacement } from "../image/kittyOutput.js";
import { truncate } from "../render/width.js";
import { UiState, type DialogContext } from "../model/UiState.js";
import { helpGroups } from "../modes/HelpDialog.js";
import type { Overlay } from "../modes/overlay.js";
import { OverlayHost } from "../modes/OverlayHost.js";
import { encodePaste, type PaneInputModes } from "../input/encode.js";
import { InputDecoder, type InputEvent } from "../input/decode.js";
import { TuiKeys } from "../input/keys.js";
import { clampTerminalSize, type CommandInfo, type SharedPrefs } from "@sodashitsu/protocol";
import { computeLayout, type LayoutResult } from "../layout/computeLayout.js";
import { spawn } from "node:child_process";
import { readTuiState, tuiStateExists, writeTuiState, type TuiState } from "../local/tuiState.js";
import { PrefsModel } from "../model/PrefsModel.js";
import { SessionModel } from "../model/SessionModel.js";
import { currentNavigableRows } from "../model/sidebarTree.js";
import { TuiNet, type TuiNetDeps } from "../net/TuiNet.js";
import type { ChromeContext } from "../render/chrome/context.js";
import type { SidebarHit, SidebarScroll } from "../render/chrome/sidebar.js";
import type { TabBarHits, TabHit, TabScroll } from "../render/chrome/tabBar.js";
import { MouseController } from "../input/mouse.js";
import { colorModeOf, ThemeColors } from "../render/color.js";
import { Renderer } from "../render/Renderer.js";
import {
  PaneRegistry,
  type RequestPort,
  type ViewCommit,
  type VisiblePane,
} from "../term/PaneRegistry.js";
import type { TuiIo, TuiTarget } from "../types.js";
import { OnboardingDialog } from "../modes/OnboardingDialog.js";
import { ENABLE_MOUSE, TerminalModes } from "./terminalModes.js";
import {
  FALLBACK_WINDOW_TITLE,
  parseWindowTitle,
  renderWindowTitle,
  strippedTerminalTitle,
  type WindowTitlePart,
} from "./windowTitle.js";

/** 関所が無いとき（接続の前）の保持：何もしない。 */
const NO_HOLD = { release: () => undefined, cancel: () => undefined, discard: () => undefined };

export interface TuiAppOptions {
  /** リンクを開く（テスト用の差し替え。無ければ OS の道具）。 */
  openUrl?: (url: string) => void;
  /** 接続の差し替え（テスト用）。 */
  net?: TuiNetDeps;
  /** クリップボードの OS の道具の呼び出しの差し替え（テスト用）。 */
  clipboardRunner?: Runner;
}

/** 描画の最短の間隔（60fps。design「描画の予約は最短 16ms」）。 */
export const RENDER_INTERVAL_MS = 16;
/** tab バーの日時を描き直す間隔。 */
const CLOCK_TICK_MS = 1000;
/** サブエージェントの一覧を開いている間の、経過時間の描き直しの間隔（20261004-subagent-display。F6「少なくとも 10 秒ごと」）。 */
const SUBAGENTS_REDRAW_MS = 10_000;
/** pane の BEL を外側の端末へ回す最短の間隔。 */
const BELL_INTERVAL_MS = 100;
/** 接続が開いていない間の打鍵の知らせ。 */
export const DROPPED_NOTICE = "未接続のため入力を送れません";
/** 外側の端末への問い合わせ（背景色）の応答を、割れた列として待つ時間。 */
export const REPLY_WAIT_MS = 500;
/** 初回の知らせを tab バーに出しておく時間（design「起動と終了」）。 */
const NOTICE_MS = 10_000;

/**
 * 端末版の組み立て（20260927-cli-mode の architecture「tui」の `app/TuiApp.ts`）。部品を作って繋ぎ、描画を予約し（dirty になったら
 * 前の描画から最短 16ms でまとめて 1 回）、割り付けが変わったら `client.view` を送り、どの終わり方でも外側の端末のモードを戻す
 * （終了・シグナル・例外・プロセスの `exit`）。
 */
export class TuiApp {
  private readonly modes: TerminalModes;
  private readonly disposers: (() => void)[] = [];
  private ended = false;
  private detaching = false;
  private resolveExit: (code: number) => void = () => undefined;

  readonly model: SessionModel;
  readonly prefs: PrefsModel;
  readonly panes: PaneRegistry;
  protected net: TuiNet | null = null;
  connectionState: ConnectionState = "connecting";
  protected theme: ThemeColors;
  private readonly renderer: Renderer;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  private lastRenderAt = -Infinity;
  private notice: string | null = null;
  private alert: string | null = null;
  private alertTimer: ReturnType<typeof setTimeout> | null = null;
  /** 外側の端末にフォーカスがあるか（フォーカスの報告で知る。報告が来ない端末ではありとみなす。design「通知」）。 */
  protected outerFocused = true;
  /** 直近のフレームの当たり判定（04 のマウスが使う）。 */
  protected lastLayout: LayoutResult | null = null;
  protected sidebarHits: SidebarHit[] = [];
  /** サブエージェントの一覧を最後に時間で描き直した時刻（epoch ms）。 */
  private subagentsDrawnAt = 0;
  protected tabHits: TabHit[] = [];
  protected newTabButton: TabBarHits["newTab"] = null;
  protected tabBarHits: TabBarHits = { tabs: [], newTab: null };
  /** サイドバーの区画・tab バーの表示の位置（描くたびに収まる範囲へ寄せ直される）。 */
  protected readonly sidebarScroll: SidebarScroll = { spaces: 0, agents: 0, reveal: null };
  protected readonly tabScroll: TabScroll = { first: 0, reveal: true };
  /** 前のフレームで見せた workspace・tab・pane・navigate の選択（変わったら区画・tab バーをそこまで動かす）。 */
  private shown = {
    workspaceId: null as string | null,
    tabId: null as string | null,
    paneId: null as string | null,
    nav: null as string | null,
  };
  protected switchButton: { x: number; w: number } | null = null;
  /** マウスの操作。 */
  readonly mouse: MouseController;
  readonly keys: TuiKeys;
  private readonly decoder = new InputDecoder();
  private escTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly dispatcher: TuiDispatcher;
  readonly ui: UiState;
  readonly usage: UsageModel;
  private readonly dashboard: UsageDashboard;
  /**
   * 共有の設定（`prefs.*`）の口：**いつもローカルのサーバ**（ローカルを見ていれば画面の接続、ほかのマシンを見ていればローカルの軽い接続。
   * web の PrefsSync の `isLocal` と同じく、ほかのマシンのサーバの設定は読み書きしない。decisions D7.4）。
   */
  readonly prefsPort: RequestPort = {
    request: (method, params) => {
      if (this.machines.selectedId === LOCAL_MACHINE_ID) return this.rpc.request(method, params);
      const local = this.wiring?.localClient();
      return local
        ? local.request(method, params)
        : Promise.reject(new Error("the local server is not connected"));
    },
  };
  /** 要求の口（接続が無ければ reject）。 */
  readonly rpc: RequestPort = {
    request: (method, params) =>
      this.net ? this.net.conn.request(method, params) : Promise.reject(new Error("not connected")),
  };
  /** 新しい pane を待つ間の入力を溜める関所（client-core の `InputGate`。接続を作ったときに作る）。 */
  protected gate: InputGate | null = null;
  private keymapSource = "";
  private keymapCommands: readonly CommandInfo[] = [];
  /** 今の割り当ての表（ヘルプ・navigate モードが引く）。 */
  protected keymap!: ResolvedKeymap;
  protected navigateKeymap!: ResolvedNavigateKeymap;
  private readonly navigateMode = new NavigateMode();
  private readonly copyMode = new CopyMode();
  /** copy モードの対象の pane（copy モードでなければ null）。 */
  private copyPaneId: string | null = null;
  /** 外側の端末へマウスの報告を出させているか（`tui.mouseCapture`）。 */
  private mouseOn = true;
  /** 保存した SSH のマシン（05 の T4）。 */
  readonly machines = new MachinesModel();
  /** 複数ホストの結線（接続を作ったときに作る）。 */
  protected wiring: MachineWiring | null = null;
  /** マシンを切り替えた後、開いたら移る workspace。 */
  private pendingMachineFocus: string | null = null;
  /** クリップボードの道具の呼び出し先（05 の T5）。 */
  protected clipboardEnv!: ClipboardEnv;
  /** 画像の貼り付け（herdr の remote_image_paste。05 の T5）。 */
  protected imagePaster!: ImagePaster;
  /** 画像を外側の端末へ出し直す（Kitty graphics を描ける端末だけ）。 */
  private readonly kitty: KittyImages | null;
  /** 直近のフレームで出し直す画像。 */
  private frameImages: KittyPlacement[] = [];
  /** 開いている独自コマンドの popup。 */
  private popup: CommandPopup | null = null;
  /** 開き終える前に閉じた popup（id → 終了コード）。 */
  private readonly closedPopups = new Map<string, number | undefined>();
  /** tmux の中のクリップボードの案内を出したか。 */
  private tmuxClipboardHinted = false;
  /** 通知（05 の T3）。 */
  readonly notify: NotificationController;
  /** 直近のフレームの知らせの当たり（押すと対象へ）。 */
  protected toastHits: ToastHit[] = [];
  /** 設定の書き込み（設定画面・05）。 */
  protected readonly settingsWriter: SettingsWriter;
  /** 外側の端末へ ?1003（ボタンを押していない動きの報告）を有効にしているか。 */
  private anyMotion = false;
  /** pane の headless ごとの copy モードの対象（捨てた headless のものは一緒に消える）。 */
  private readonly copyTargets = new WeakMap<PaneTerminal, TuiCopyTarget>();
  /** オーバーレイ（ダイアログ・メニュー）。 */
  readonly overlays: OverlayHost;
  readonly displays: DisplayModel;
  readonly dockedViews: DockedViews;
  readonly schedules: ScheduleView;
  private graphTerminal: GraphTerminal | null = null;
  readonly graphView: GraphView;
  /** この起動ではじめの案内を開いたか（2 回開かない）。 */
  private onboardingOpened = false;
  /**
   * はじめの案内を出してよい起動か（起動時に 1 回だけ決める）。自動の起動（`SODA_NO_ONBOARDING=1`・端末でない）と、この端末版を前にも使った
   * 痕跡（`tui-state.json`）がある既存の利用者には出さない（web の `isFreshBrowser`・`isAutomatedBrowser` と同じ考え）。
   */
  private readonly onboardingEligible: boolean;
  /** 直前に外側の端末へ回した BEL の時刻。 */
  private lastBellAt = -Infinity;
  /** 読んだ外側の端末のタイトルの書式（書式が変わったら読み直す）。 */
  private titleTemplate: { source: string | null; parts: WindowTitlePart[] | null } = {
    source: null,
    parts: null,
  };

  constructor(
    readonly target: TuiTarget,
    readonly io: TuiIo,
    protected readonly options: TuiAppOptions = {},
  ) {
    this.modes = new TerminalModes(io);
    this.model = new SessionModel({
      onDisplayEvent: (e) => this.displays?.apply(e),
      onUsageChanged: (data) => this.usage?.apply(data),
      onPaneClosed: (paneId) => {
        this.panes.paneClosed(paneId);
        this.notify?.onPaneClosed(paneId);
      },
      onAgentChanged: (paneId, prev, next) => this.notify?.onAgentChanged(paneId, prev, next),
      onSnapshotApplied: (panes, first) => this.notify?.onSnapshotApplied(panes, first),
      onMachinesChanged: (list) => this.wiring?.onMainMachinesChanged(list),
      onPopupClosed: (popupId, exitCode) => this.onPopupClosed(popupId, exitCode),
      onAttachChanged: (paneId, clientId) => {
        if (this.graphTerminal?.paneId === paneId) this.graphTerminal.onAttachChanged(clientId);
      },
      // 共有の設定はローカルのサーバのものだけ（ほかのマシンを見ている間の画面の接続の知らせは当てない。decisions D7.4）。
      onNotificationTest: (message) => this.ui.toast(message, { ms: 20_000 }),
      onNotificationState: (state) => this.notify.onSharedNotification(state),
      onPrefsChanged: (data) => {
        if (this.machines.selectedId === LOCAL_MACHINE_ID) this.prefs.apply(data.prefs, data.rev);
      },
    });
    this.prefs = new PrefsModel(readTuiState(target.stateDir));
    this.onboardingEligible =
      io.isTTY && io.env["SODA_NO_ONBOARDING"] !== "1" && !tuiStateExists(target.stateDir);
    this.prefs.setSystemDark(systemDarkFromEnv(io.env));
    this.theme = new ThemeColors(
      this.prefs.theme,
      this.prefs.themeOverrides,
      this.prefs.transparentBg,
    );
    this.renderer = new Renderer(
      colorModeOf(io.env, this.prefs.colorMode),
      io.platform !== "win32",
    );
    this.panes = new PaneRegistry(
      {
        request: (method, params) =>
          this.net
            ? this.net.conn.request(method, params)
            : Promise.reject(new Error("not connected")),
      },
      () => this.prefs.scrollbackLines(this.model.limits.scrollbackLines),
      () => this.scheduleRender(),
      (paneId) => this.onPaneBell(paneId),
    );
    this.disposers.push(() => this.panes.dispose());
    this.keys = new TuiKeys(
      this.resolvedKeymap(),
      {
        paneModes: () => this.focusedPaneModes(),
        sendToPane: (bytes) => this.sendToFocusedPane(bytes),
        dispatch: (action) => this.dispatcher.dispatch(action),
        dropped: () => this.inputDropped(),
        pasteImage: (fallback) => {
          const id = this.model.focusedPaneId;
          if (!id || this.connectionState !== "open") this.inputDropped();
          else this.imagePaster.fromKey(id, fallback);
        },
      },
      { navigate: this.navigateMode, copy: this.copyMode, resize: new ResizeMode() },
    );
    this.keys.router.onModeChange((m) => {
      // copy モードから prefix で別のモード（navigate・resize 等）へ移ったら、copy の pane を末尾へ戻す（遡ったまま残さない。04 ラウンド 2 の点検）。
      // 抜けるキー（y・q）の処理はモードが変わった後に同じ打鍵の中で走るので、戻すのはその後（先に選択を消すと y が写せない）。
      if (this.copyPaneId !== null && m !== "copy" && m !== "prefix") {
        const target = this.copyTargetOf(this.copyPaneId);
        queueMicrotask(() => {
          if (this.keys.mode !== "copy") target?.leave();
        });
      }
      // copy モードの対象の pane を覚える（焦点が移ったら元の pane を戻すため）。
      this.copyPaneId =
        m === "copy"
          ? (this.copyPaneId ?? this.model.focusedPaneId)
          : m === "prefix"
            ? this.copyPaneId
            : null;
      this.scheduleRender();
    });
    this.ui = new UiState(this.model);
    this.displays = new DisplayModel(
      this.rpc,
      () => this.scheduleRender(),
      (info) => {
        if (
          info.dock === "float" &&
          !info.collapsed &&
          info.paneId === this.model.focusedPaneId &&
          !this.ui.overlayOpen
        )
          this.ui.openDialogWithContext({
            kind: "display",
            paneId: info.paneId,
            displayId: info.id,
          });
      },
    );
    this.dockedViews = new DockedViews(
      this.model,
      this.ui,
      this.displays,
      this.rpc,
      () => {
        this.commitView();
        this.scheduleRender();
      },
      () => this.prefs.viewTitleVisible,
    );
    this.disposers.push(() => this.dockedViews.dispose());
    this.schedules = new ScheduleView(this.model, this.ui, this.rpc, () => this.scheduleRender());
    this.disposers.push(() => this.schedules.dispose());
    this.graphView = new GraphView(
      this.model,
      this.ui,
      this.rpc,
      () => this.scheduleRender(),
      (id) => this.ui.openDialogWithContext({ kind: "graphTerminal", paneId: id }),
      () => this.prefs.statusSymbols,
    );
    this.disposers.push(() => this.graphView.dispose());
    this.usage = new UsageModel(this.rpc, () => this.scheduleRender());
    this.dashboard = new UsageDashboard(
      this.model,
      this.ui,
      this.usage,
      (id) => this.dispatcher.focusPaneAcrossViews(id),
      () => this.prefs.statusSymbols,
    );
    this.settingsWriter = new SettingsWriter({
      prefs: this.prefs,
      conn: this.prefsPort,
      toast: (m) => this.ui.toast(m),
      setLocal: (patch) => this.setLocalState(patch as Partial<TuiState>, true),
    });
    this.disposers.push(
      this.ui.onChange(() => {
        this.schedules.sync(this.ui.screen === "schedule");
        this.graphView.sync(this.ui.screen === "graph");
        this.usage.sync(
          this.ui.screen === "dashboard" ||
            ["usage", "usageAccounts"].includes(this.ui.dialogContext?.kind ?? ""),
        );
        this.commitView();
        if (this.ui.overlayOpen || this.ui.screen !== "base")
          this.mouse?.cancel(); // オーバーレイを開いたら途中のドラッグを捨てる
        else this.maybeOpenOnboarding(); // 案内をほかのダイアログが閉じるまで待っていた
        this.scheduleRender();
      }),
    );
    this.dispatcher = new TuiDispatcher({
      model: this.model,
      machines: this.machines,
      prefsConn: this.prefsPort,
      switchMachine: (id, target) => this.switchMachine(id, target),
      ui: this.ui,
      prefs: this.prefs,
      conn: this.rpc,
      input: { holdInput: (source) => (this.gate ? this.gate.holdInput(source) : NO_HOLD) },
      keys: {
        setMode: (m) => this.keys.router.setMode(m),
        selectNumbers: (target) => {
          this.keys.router.selectNumbers(target);
        },
      },
      copyTarget: (paneId) => this.copyTargetOf(paneId),
      writeClipboard: (text) => this.writeClipboard(text),
      readClipboard: () => readClipboardText(this.clipboardEnv),
      pasteClipboard: (paneId) => this.imagePaster.pasteClipboard(paneId),
      pasteText: (paneId, text) => this.pasteText(paneId, text),
      detach: () => this.detach(),
      serverStopRequested: () => this.net?.expectStop(),
      toggleSidebar: () => this.toggleSidebar(),
      toggleSidebarSection: (section) => this.toggleSidebarSection(section),
      focusNextNotification: () => this.notify.focusNext(),
      pasteImage: () => {
        const id = this.model.focusedPaneId;
        if (id) this.imagePaster.fromKey(id, null);
      },
      setCommands: (r) => this.model.setCommands(r),
    });
    this.kitty = kittyGraphicsSupported(io.env) ? new KittyImages() : null;
    this.clipboardEnv = {
      platform: io.platform,
      env: io.env,
      ...(options.clipboardRunner ? { run: options.clipboardRunner } : {}),
    };
    this.imagePaster = new ImagePaster({
      conn: this.rpc,
      input: {
        holdInput: (paneId, opts) => (this.gate ? this.gate.holdInput(paneId, opts) : NO_HOLD),
      },
      readImage: () => readClipboardImage(this.clipboardEnv),
      readText: () => readClipboardText(this.clipboardEnv),
      bracketed: (paneId) => this.panes.get(paneId)?.modes.bracketedPasteMode ?? null,
      paneExists: (paneId) => this.model.panes.has(paneId),
      pasteText: (paneId, text) => this.pasteText(paneId, text),
      toast: (m) => this.ui.toast(m),
      status: (m) => {
        const id = this.ui.toast(m, { ms: 30_000 });
        return () => this.ui.dismissToast(id);
      },
      readTimeoutMs: imageReadTimeoutMs(this.clipboardEnv),
    });
    this.notify = new NotificationController({
      loadShared: () => this.rpc.request("notification.state", {}),
      updateShared: (n) => this.rpc.request("notification.update", n),
      model: this.model,
      ui: this.ui,
      prefs: this.prefs,
      env: io.env,
      queueChanged: () => this.scheduleRender(),
      hasFocus: () => this.outerFocused,
      // 今の割り付けで見る（前の描画の割り付けだと、同じ打鍵の中の切り替えを取り違える）。
      isPaneVisible: (paneId) => this.visiblePanes().some((b) => b.paneId === paneId),
      write: (seq) => this.io.write(seq),
      focusPane: (paneId) => this.dispatcher.focusPaneAcrossViews(paneId),
    });
    this.disposers.push(() => this.notify.dispose());
    this.overlays = new OverlayHost({
      conn: this.rpc,
      redraw: () => this.scheduleRender(),
      viewItems: (id) => this.dockedViews.menuItems(id),
      ui: this.ui,
      model: this.model,
      actions: this.dispatcher,
      helpGroups: () => helpGroups(this.keymap, this.navigateKeymap),
      extra: (ctx) => {
        const o = this.extraOverlay(ctx);
        return o &&
          [
            "workspaceView",
            "display",
            "conversation",
            "pastSessions",
            "usage",
            "usageAccounts",
            "graphTerminal",
          ].includes(ctx.kind)
          ? new WindowOverlay(
              o,
              ctx.kind === "usage" || ctx.kind === "usageAccounts"
                ? { w: 92, h: 18 }
                : { w: 110, h: 32 },
              this.viewWindowControls(ctx),
            )
          : o;
      },
    });
    this.mouse = new MouseController({
      model: this.model,
      ui: this.ui,
      actions: this.dispatcher,
      layout: () => this.lastLayout,
      paneControls: true,
      agentActions: (id) => {
        const p = this.model.panes.get(id);
        return p?.agent
          ? headerActionsFor(
              p.agent.kind,
              !!p.agentSession,
              loadAgentHeaderActions(this.prefs.shared.agentHeaderActions),
            )
          : [];
      },
      dashboardMouse: (ev) => this.dashboard.handleMouse(ev),
      sidebarHits: () => this.sidebarHits,
      tabHits: () => this.tabBarHits,
      switchButton: () => this.switchButton,
      pane: (paneId) => this.panes.get(paneId),
      sendToPane: (paneId, bytes) => this.sendToPane(paneId, bytes),
      writeClipboard: (text) => this.writeClipboard(text),
      setSidebarCols: (cols, persist) => this.setSidebarCols(cols, persist),
      setSidebarSpacesRows: (rows, persist) =>
        this.setLocalState({ sidebarSpacesRows: rows }, persist),
      openLink: (url) => this.openLink(url),
      switchMachine: (id, target) => this.switchMachine(id, target),
      toggleMachine: (id) => this.machines.toggleCollapsed(id),
      toggleSidebarSection: (section) => this.toggleSidebarSection(section),
      sectionsCollapsed: () => this.prefs.sectionsCollapsed,
      copyOnSelect: () => this.prefs.copyOnSelect,
      toastHits: () => this.toastHits,
      scrollSidebar: (section, delta) => {
        this.sidebarScroll[section] = Math.max(0, this.sidebarScroll[section] + delta);
        this.scheduleRender();
      },
      scrollTabs: (delta) => {
        this.tabScroll.first = Math.max(0, this.tabScroll.first + delta);
        this.tabScroll.reveal = false;
        this.scheduleRender();
      },
      rpc: this.rpc,
      scheduleRender: () => this.scheduleRender(),
    });
    this.disposers.push(this.model.onChange(() => this.onModelChange()));
    this.disposers.push(this.prefs.onChange(() => this.onPrefsChange()));
  }

  run(): Promise<number> {
    // 初回の token など（ブラウザ用。二度と出ない）は、代替画面に入る前に標準エラーへ（design「起動と終了」）。
    // 端末でなく端末版を開けないときも出す——ここで出さないと token は二度と得られない。
    if (this.target.startupNotice) this.io.writeError(`${this.target.startupNotice}\n`);
    // 止め方の注意（Windows の WMI の失敗等）も、token と一緒のときも出す（統合の review）。
    if (this.target.stopHint) this.io.writeError(`${this.target.stopHint}\n`);
    if (!this.io.isTTY) {
      this.io.writeError("soda: the terminal UI needs a terminal on both stdin and stdout\n");
      return Promise.resolve(1);
    }
    const done = new Promise<number>((resolve) => {
      this.resolveExit = resolve;
    });
    this.disposers.push(this.io.onExit(() => this.modes.restore()));
    this.disposers.push(this.io.onSignal(() => this.detach()));
    this.disposers.push(
      this.io.onFatal((err) => this.finish(1, `soda: unexpected error: ${describeError(err)}\n`)),
    );
    try {
      // `tui.mouseCapture` は prefs.get の前なので、ここでは既定（有効）。受け取った後に切なら `onPrefsChange` が止める。
      this.mouseOn = this.prefs.mouseCapture;
      this.modes.enable(this.mouseOn);
      // 起動の列で背景色を訊いた（OSC 11）。応答が読みで割れても打鍵にしないよう、少しの間は待つ。
      this.decoder.expectReply(REPLY_WAIT_MS);
      this.start();
    } catch (err) {
      this.finish(1, `soda: ${describeError(err)}\n`);
    }
    return done;
  }

  /** 画面の部品の組み立て。 */
  protected start(): void {
    // 知らせは 1 行ずつ：初回の token の後に止め方の注意（どちらか一方でも出す）。
    const notices = [this.target.startupNotice, this.target.stopHint].filter(
      (n): n is string => !!n,
    );
    this.showNotices(notices);
    this.disposers.push(
      this.io.onResize(() => {
        this.renderer.invalidate();
        this.commitView();
        this.scheduleRender();
      }),
    );
    this.disposers.push(() => {
      if (this.renderTimer !== null) clearTimeout(this.renderTimer);
      this.renderTimer = null;
      if (this.escTimer !== null) clearTimeout(this.escTimer);
      this.escTimer = null;
    });
    this.disposers.push(this.io.onInput((bytes) => this.onInput(bytes)));
    // tab バーの右端に日時を出していれば、毎秒描き直す（差分だけが出る）。
    const clock = setInterval(() => {
      if (this.lastLayout?.tabBar.h && this.prefs.tabBarRight.some((e) => e.kind === "datetime"))
        this.scheduleRender();
      // サブエージェントの一覧を開いている間だけ、経過時間を進めるために 10 秒ごとに描き直す（閉じたら何もしない。20261004-subagent-display）。
      if (this.ui.dialogContext?.kind === "subagents") {
        const now = Date.now();
        if (now - this.subagentsDrawnAt >= SUBAGENTS_REDRAW_MS) {
          this.subagentsDrawnAt = now;
          this.scheduleRender();
        }
      }
    }, CLOCK_TICK_MS);
    clock.unref?.();
    this.disposers.push(() => clearInterval(clock));
    const net = new TuiNet(
      this.target,
      {
        model: this.model,
        sink: this.panes,
        onState: (s) => this.onConnectionState(s),
        onOpened: (clientId) => this.onConnectionOpened(clientId),
        onClosed: () => this.onConnectionClosed(),
        onFatal: (message) => this.finish(1, message),
        onStatus: (message) => this.showAlert(message, 5000),
        // 利用者が止めたサーバが居なくなった：異常ではないので終了コード 0（統合の review）。
        onStopped: () =>
          this.finish(0, "soda: サーバを止めました（もう一度 soda を実行すると起動します）\n"),
      },
      this.options.net,
    );
    this.net = net;
    this.gate = new InputGate(net.conn);
    const wiring = new MachineWiring({
      machines: this.machines,
      switchTo: (id, target, opts) => this.switchMachine(id, target, opts),
      requestMainList: () => net.conn.request("machine.list", {}),
      createSummaryClient: (opts) =>
        new MachineSummaryClient({ ...opts, createWebSocket: (url) => net.createSocket(url) }),
      baseWsUrl: net.baseWsUrl,
      onLocalSummaryOpened: () => this.loadPrefs(),
      onLocalPrefsChanged: (data) => this.prefs.apply(data.prefs, data.rev),
    });
    this.wiring = wiring;
    this.disposers.push(() => wiring.stop());
    this.disposers.push(this.machines.onChange(() => this.scheduleRender()));
    this.disposers.push(() => net.stop());
    this.scheduleRender();
    void net.start();
  }

  private showAlert(text: string, ms = 2000): void {
    this.alert = text;
    this.scheduleRender();
    if (this.alertTimer !== null) clearTimeout(this.alertTimer);
    this.alertTimer = setTimeout(() => {
      this.alertTimer = null;
      this.alert = null;
      this.scheduleRender();
    }, ms);
    this.alertTimer.unref?.();
  }

  /** 知らせを順に 1 つずつ（前のものの時間が切れたら次）。 */
  private showNotices(texts: readonly string[], ms = NOTICE_MS): void {
    const [first, ...rest] = texts;
    if (first === undefined) return;
    this.showNotice(first, ms);
    if (rest.length === 0) return;
    const timer = setTimeout(() => {
      if (!this.ended) this.showNotices(rest, ms);
    }, ms);
    timer.unref?.();
  }

  private showNotice(text: string | null, ms = NOTICE_MS): void {
    if (!text) return;
    const line = text.split("\n")[0] ?? null;
    this.notice = line;
    this.scheduleRender();
    const timer = setTimeout(() => {
      if (this.notice === line) this.notice = null;
      this.scheduleRender();
    }, ms);
    // unref：知らせの時間切れでプロセスを残さない（終えた後は `scheduleRender` が何もしない）。
    timer.unref?.();
  }

  protected onConnectionState(s: ConnectionState): void {
    this.connectionState = s;
    // サーバが閉じた `client.detach` の後（自分で切り離した）。
    if (s === "detached") {
      this.finish(0);
      return;
    }
    if (s === "open") this.maybeOpenOnboarding();
    this.scheduleRender();
  }

  protected onConnectionOpened(_clientId: string): void {
    this.panes.connectionOpened();
    this.usage.connected();
    void this.displays.connect();
    this.commitView();
    this.scheduleRender();
    const net = this.net;
    if (!net) return;
    // 共有の設定（`prefs.get`。ローカルを見ているときだけ。ほかのマシンのときはローカルの軽い接続が開いたときに読む）と、
    // pane の色の問い合わせにサーバが答える配色（`client.theme`。web と同じ）。
    if (this.machines.selectedId === LOCAL_MACHINE_ID) this.loadPrefs();
    net.conn.request("client.theme", { theme: this.theme.name }).catch(() => undefined);
    // 保存した SSH のマシン（web の MachineWiring と同じ）。切り替えた直後なら、選んだ workspace へ移る。
    this.wiring?.onMainOpened();
    const focusWs = this.pendingMachineFocus;
    this.pendingMachineFocus = null;
    if (focusWs && this.model.workspaces.has(focusWs)) this.dispatcher.focusWorkspaceById(focusWs);
    // 独自コマンドの一覧（接続ごとに取り直す。web の main.ts と同じ）。
    net.conn
      .request("command.list", {})
      .then((r) => this.model.setCommands(r))
      .catch(() => undefined);
  }

  /** 共有の設定をローカルのサーバから読む。 */
  private loadPrefs(): void {
    this.prefsPort
      .request("prefs.get", {})
      .then((r) => {
        this.prefs.apply(r.prefs as SharedPrefs, r.rev);
        this.maybeOpenOnboarding();
      })
      .catch(() => undefined);
  }

  /** 独自コマンドの popup が閉じた。開いている popup なら閉じ、まだ開き終えていなければ覚えておく（web の commands の store の closedPopups）。 */
  private onPopupClosed(popupId: string, exitCode: number | undefined): void {
    if (this.popup?.id === popupId) {
      this.popup.onClosed(exitCode);
      this.popup = null;
      return;
    }
    this.closedPopups.set(popupId, exitCode);
    while (this.closedPopups.size > 32)
      this.closedPopups.delete(this.closedPopups.keys().next().value!);
  }

  protected onConnectionClosed(): void {
    if (this.ui.dialogContext?.kind === "graphTerminal") this.ui.closeDialog();
    if (this.popup) {
      this.popup.onDisconnected();
      this.popup = null;
    }
    this.usage.disconnected();
    this.displays.disconnect();
    this.dockedViews.release();
    this.panes.connectionClosed();
  }

  protected onModelChange(): void {
    this.refreshKeymap();
    // copy モードのまま焦点が別の pane へ移ったら、元の pane の選択を消して末尾へ戻し、新しい pane のカーソルを合わせ直す（04 の点検）。
    const focused = this.model.focusedPaneId;
    if (this.copyPaneId !== null && focused !== this.copyPaneId) {
      this.copyTargetOf(this.copyPaneId)?.leave();
      if (focused) this.copyTargetOf(focused)?.resetCursor();
      this.copyPaneId = focused;
    }
    // ダイアログを開いている間に戻り先の pane が閉じられたら、戻す先を今の焦点へ差し替える（web の D97）。
    const back = this.ui.preDialogFocusPaneId;
    if (back !== null && !this.model.panes.has(back))
      this.ui.retargetPreDialogFocus(this.model.focusedPaneId);
    this.closeSubagentsIfGone();
    this.commitView();
    this.scheduleRender();
  }

  /**
   * サブエージェントの一覧を開いている間に、対象のエージェントが居なくなった・入れ替わった（`instanceId` が変わった）・pane が閉じたら閉じる
   * （20261004-subagent-display。web の `SubagentListDialog` の監視と同じ）。
   */
  private closeSubagentsIfGone(): void {
    const ctx = this.ui.dialogContext;
    if (ctx?.kind !== "subagents") return;
    const agent = this.model.panes.get(ctx.paneId)?.agent;
    if (!agent || agent.instanceId !== ctx.instanceId) this.ui.closeDialog();
  }

  protected onPrefsChange(): void {
    // `tui.mouseCapture` を実行中に切り替えた：外側の端末のマウスの報告を出し直す・止める。
    const mouse = this.prefs.mouseCapture;
    if (mouse !== this.mouseOn) {
      this.mouseOn = mouse;
      this.anyMotion = false;
      this.mouse.cancel();
      this.modes.setMouse(mouse);
    }
    this.renderer.setColorMode(colorModeOf(this.io.env, this.prefs.colorMode));
    this.refreshKeymap();
    const theme = this.prefs.theme;
    const next = new ThemeColors(theme, this.prefs.themeOverrides, this.prefs.transparentBg);
    if (next.key !== this.theme.key) {
      const nameChanged = theme !== this.theme.name;
      this.theme = next;
      this.renderer.invalidate();
      // pane の色の問い合わせにサーバが答える配色（web の ThemeController と同じく、テーマが変わったときだけ）。
      if (nameChanged && this.connectionState === "open")
        this.net?.conn.request("client.theme", { theme }).catch(() => undefined);
    }
    this.commitView();
    this.scheduleRender();
  }

  /** キーのモード（prefix 待ちなら tab バーに `PREFIX`）。 */
  protected keyMode(): Mode {
    return this.keys.mode;
  }

  /** 割り当て（`prefs.keys`）か独自コマンドの一覧が変わったら表を作り直す。 */
  private refreshKeymap(): void {
    const source = JSON.stringify(this.prefs.shared.keys ?? null);
    if (source !== this.keymapSource || this.model.commands.commands !== this.keymapCommands)
      this.keys.setKeymap(this.resolvedKeymap());
  }

  /** 共有の設定（`prefs.keys`）から解いた割り当ての表（web と同じ `loadKeyPrefs` → `resolveKeymap`。AC8）。 */
  private resolvedKeymap(): ResolvedKeymap {
    const raw = this.prefs.shared.keys;
    this.keymapSource = JSON.stringify(raw ?? null);
    const keyPrefs = loadKeyPrefs(raw);
    this.navigateKeymap = resolveNavigateKeymap(keyPrefs.navigateKeys).keymap;
    this.navigateMode.setKeymap(this.navigateKeymap);
    // 独自コマンドの一覧も渡す（web の settings.ts と同じ。一覧に無いコマンドの割り当ては載らない・衝突の検査にも入る）。
    this.keymapCommands = this.model.commands.commands;
    this.keymap = resolveKeymap(keyPrefs, commandKeyDefs(this.keymapCommands)).keymap;
    return this.keymap;
  }

  // --- 入力 ---

  private onInput(bytes: Uint8Array): void {
    if (this.ended) return;
    if (this.escTimer !== null) {
      clearTimeout(this.escTimer);
      this.escTimer = null;
    }
    for (const ev of this.decoder.feed(bytes)) this.handleInput(ev);
    this.armEscTimer();
  }

  /** ESC 単独か、列の途中で切れたか。少し待って確定する（design「input/decode.ts」）。問い合わせの応答の途中なら締め切りまで待ち直す。 */
  private armEscTimer(): void {
    if (!this.decoder.waiting || this.ended) return;
    this.escTimer = setTimeout(() => {
      this.escTimer = null;
      for (const ev of this.decoder.flush()) this.handleInput(ev);
      this.armEscTimer();
    }, this.decoder.waitMs);
  }

  protected handleInput(ev: InputEvent): void {
    if (this.ended || this.detaching) return;
    // オーバーレイが開いている間のキー・貼り付け・マウスはオーバーレイへ（pane へは流さない。AC-I5）。
    if (ev.kind === "colorScheme") {
      // 外側の端末の明暗（テーマの自動の切り替え。web の prefers-color-scheme の代わり）。
      this.prefs.setSystemDark(ev.dark);
      return;
    }
    if (ev.kind !== "focus" && this.overlays.active) {
      if (ev.kind === "key") this.overlays.handleKey(ev.key, ev.raw);
      else if (ev.kind === "paste") this.overlays.handlePaste(ev.text);
      else this.overlays.handleMouse(ev);
      this.scheduleRender();
      return;
    }
    if (this.ui.screen === "base" && this.keys.mode === "terminal") {
      if (ev.kind === "key") {
        const chord = chordOf(ev.key);
        if (chord === this.keymap.prefix || (chord !== null && this.keymap.directMap.has(chord)))
          this.dockedViews.release();
        else if (this.dockedViews.key(ev.key)) return;
      } else if (ev.kind === "paste" && this.dockedViews.paste(ev.text)) return;
      else if (ev.kind === "mouse" && this.dockedViews.mouse(ev)) return;
    }
    if (
      this.ui.screen === "graph" &&
      (ev.kind === "key" || ev.kind === "paste" || ev.kind === "mouse")
    ) {
      if (ev.kind === "key") {
        if (chordOf(ev.key) === this.keymap.prefix || this.keys.mode !== "terminal")
          this.keys.handle(ev);
        else this.graphView.handleKey(ev.key);
      } else if (ev.kind === "mouse" && !this.graphView.handleMouse(ev)) {
        this.mouse.handle(ev);
        return;
      }
      this.scheduleRender();
      return;
    }
    if (
      this.ui.screen === "schedule" &&
      (ev.kind === "key" || ev.kind === "paste" || ev.kind === "mouse")
    ) {
      if (ev.kind === "key") {
        const chord = chordOf(ev.key);
        if (chord === this.keymap.prefix || this.keys.mode !== "terminal") this.keys.handle(ev);
        else this.schedules.handleKey(ev.key);
      } else if (ev.kind === "paste") this.schedules.handlePaste(ev.text);
      else if (!this.schedules.handleMouse(ev)) {
        this.mouse.handle(ev);
        return;
      }
      this.scheduleRender();
      return;
    }
    if (this.ui.screen === "dashboard" && (ev.kind === "paste" || ev.kind === "key")) {
      if (ev.kind === "key") this.dashboard.handleKey(ev.key);
      this.scheduleRender();
      return;
    }
    switch (ev.kind) {
      case "key":
        if (ev.key.key === "Escape" && this.mouse.itemDragging) {
          // サイドバーの項目の掴みの途中の Esc は取り消し（離しても何も送らない）。
          this.mouse.cancel();
          this.scheduleRender();
          return;
        }
        if (this.mouse.selection) {
          this.mouse.selection = null; // 打鍵で選択の表示を消す（コピーは済んでいる）
          this.scheduleRender();
        }
        this.keys.handle(ev);
        // モードの中のキー（copy のカーソル・navigate の選択）は画面を変える。
        if (this.keys.mode !== "terminal") this.scheduleRender();
        return;
      case "paste": {
        const modes = this.focusedPaneModes();
        if (modes) this.sendToFocusedPane(encodePaste(ev.text, modes));
        else this.inputDropped();
        return;
      }
      case "focus": {
        this.outerFocused = ev.focused;
        if (!ev.focused)
          this.mouse.cancel(); // 外側の端末を離れた：離す事象は届かないので、ドラッグを捨てる
        // 外側の端末に戻ったら全部描き直す（`tui.redrawOnFocusGained`。herdr の redraw_on_focus_gained。まれな外側の端末の表示の崩れを残さない）。
        else if (this.prefs.redrawOnFocusGained) this.renderer.invalidate();
        // pane がフォーカスの報告を求めていれば伝える（`CSI ? 1004 h`）。
        const term = this.model.focusedPaneId
          ? this.panes.get(this.model.focusedPaneId)
          : undefined;
        if (this.ui.screen === "base" && term?.modes.sendFocusMode)
          this.sendToFocusedPane(ev.focused ? "\x1b[I" : "\x1b[O");
        this.scheduleRender();
        return;
      }
      case "mouse":
        this.handleMouse(ev);
        return;
    }
  }

  /**
   * pane の BEL を外側の端末へ回す（H29d。herdr の TerminalBell）。`tui.forwardBell` が入で、外側の端末にフォーカスがあり、その pane が
   * 今の画面に見えているときだけ。続けて鳴っても {@link BELL_INTERVAL_MS} に 1 回。
   */
  protected onPaneBell(paneId: string): void {
    if (this.ui.screen !== "base" || this.ended || !this.prefs.forwardBell || !this.outerFocused)
      return;
    if (!this.layout().panes.some((b) => b.paneId === paneId)) return;
    const now = performance.now();
    if (now - this.lastBellAt < BELL_INTERVAL_MS) return;
    this.lastBellAt = now;
    this.io.write("\x07");
  }

  /** マウス（`input/mouse.ts`。design「マウス」の全操作）。 */
  protected handleMouse(ev: Extract<InputEvent, { kind: "mouse" }>): void {
    this.mouse.handle(ev);
  }

  /** 送り先が無くて打鍵を捨てた。接続が開いていないなら短く知らせる（黙って捨てない）。 */
  private inputDropped(): void {
    if (this.connectionState !== "open") this.showAlert(DROPPED_NOTICE);
  }

  private focusedPaneModes(): PaneInputModes | null {
    const id = this.model.focusedPaneId;
    if (!id || this.connectionState !== "open") return null;
    const term = this.panes.get(id);
    // 購読前（headless がまだ無い）でも送れるように、既定のモードで扱う。
    return term
      ? term.modes
      : {
          applicationCursorKeysMode: false,
          applicationKeypadMode: false,
          bracketedPasteMode: false,
        };
  }

  private sendToFocusedPane(bytes: string): void {
    const id = this.model.focusedPaneId;
    if (!id) return;
    this.sendToPane(id, bytes);
  }

  /** pane へ入力を送る（関所を通す。新しい pane を待つ間は溜まる）。 */
  protected sendToPane(paneId: string, bytes: string | Uint8Array): void {
    if (this.gate) this.gate.sendInput(paneId, bytes);
    else this.net?.conn.sendInput(paneId, bytes);
  }

  /** pane へ貼り付ける（pane のブラケットペーストに合わせて包む）。 */
  protected pasteText(paneId: string, text: string): void {
    const term = this.panes.get(paneId);
    const modes = term
      ? term.modes
      : {
          applicationCursorKeysMode: false,
          applicationKeypadMode: false,
          bracketedPasteMode: false,
        };
    this.sendToPane(paneId, encodePaste(text, modes));
  }

  /** copy モードの対象（T3 で pane の headless の上に作る）。 */
  protected copyTargetOf(paneId: string): TuiCopyTarget | undefined {
    const term = this.panes.get(paneId);
    if (!term) return undefined;
    let t = this.copyTargets.get(term);
    if (!t) {
      t = new TuiCopyTarget(term.term);
      this.copyTargets.set(term, t);
    }
    return t;
  }

  /**
   * クリップボードへ写す：外側の端末へ OSC 52（SSH 越し・tmux の中でも効く）と、手元なら OS の道具でも（OSC 52 を受けない端末のため）。
   */
  protected writeClipboard(text: string): Promise<boolean> {
    const seq = osc52(text);
    this.io.write(seq);
    if (this.io.env["TMUX"]) {
      // tmux の中：素通しの包み（allow-passthrough）でも出す。tmux の設定によっては黙って捨てられるので、最初の 1 回だけ設定を案内する。
      this.io.write(wrapTmux(seq));
      if (!this.tmuxClipboardHinted) {
        this.tmuxClipboardHinted = true;
        this.ui.toast(
          "tmux の中です。写せないときは tmux に `set -g set-clipboard on`（か `set -g allow-passthrough on`）を設定してください",
          { ms: 10_000 },
        );
      }
    }
    void writeClipboardTool(this.clipboardEnv, text);
    return Promise.resolve(true);
  }

  private viewWindowControls(ctx: DialogContext) {
    const info =
      ctx.kind === "display" && ctx.displayId ? this.displays.infos.get(ctx.displayId) : undefined;
    const id =
      ctx.kind === "display" || ctx.kind === "workspaceView"
        ? (ctx.viewInstanceId ??
          (info
            ? [...this.model.tabs.values()]
                .flatMap((t) => t.views ?? [])
                .find(
                  (v) =>
                    v.paneId === info.paneId &&
                    (v.display === info.name || v.terminalDisplay === info.name),
                )?.id
            : undefined))
        : undefined;
    if (!id) return undefined;
    void this.dockedViews.prepare(id);
    return {
      showTitle: () => this.prefs.viewTitleVisible,
      busy: () => this.dockedViews.isPending(id),
      preview: (grid: Grid, theme: ThemeColors, x: number, y: number) =>
        this.dockedViews.drawDropPreview(grid, theme, id, x, y),
      fold: () => {
        this.dockedViews.fold(id);
        this.ui.closeDialog();
      },
      close: () => {
        void this.dockedViews.close(id).then((ok) => {
          if (ok && this.ui.dialogContext === ctx) this.ui.closeDialog();
        });
      },
      menu: (x: number, y: number) => {
        this.ui.closeDialog();
        void this.dockedViews.menu(id, x, y);
      },
      drop: (x: number, y: number, canLeave?: () => boolean) => {
        void this.dockedViews.drop(id, x, y, canLeave);
      },
    };
  }
  /** ダイアログのうち、基本の部品（入力欄・確認・一覧・ヘルプ）以外のもの（goto。T3）。 */
  protected extraOverlay(ctx: DialogContext): Overlay | null {
    if (ctx.kind === "workspaceView") {
      if (ctx.viewId)
        return new WorkspaceDialog(
          ctx.tabId,
          ctx.paneId,
          this.model,
          this.ui,
          this.rpc,
          () => this.scheduleRender(),
          ctx.viewId,
        );
      return new ViewPicker(
        ctx.tabId,
        ctx.paneId,
        this.model,
        this.ui,
        this.rpc,
        () => this.scheduleRender(),
        (v) => {
          this.ui.closeDialog();
          if (v.placement !== "float") {
            this.dockedViews.focus(v.id);
            this.commitView();
          } else if (v.extensionKey === BUILTIN_WORKSPACE_KEY && v.viewId !== "statusline")
            this.ui.openDialogWithContext({
              kind: "workspaceView",
              tabId: ctx.tabId,
              viewId: v.viewId as BuiltinViewId,
              viewInstanceId: v.id,
            });
          else {
            const info = [...this.displays.infos.values()].find(
              (d) => d.paneId === v.paneId && d.name === (v.terminalDisplay ?? v.display),
            );
            this.ui.openDialogWithContext({
              kind: "display",
              paneId: v.paneId,
              viewInstanceId: v.id,
              ...(info ? { displayId: info.id } : {}),
            });
          }
        },
      );
    }
    if (ctx.kind === "display")
      return new DisplayDialog(
        ctx.paneId,
        ctx.displayId,
        this.displays,
        this.rpc,
        this.ui,
        () => this.scheduleRender(),
        (info) => {
          const pane = this.model.panes.get(info.paneId),
            tab = pane ? this.model.tabs.get(pane.tabId) : undefined;
          if (!tab) return false;
          const v = tab.views?.find(
            (v) => (v.terminalDisplay ?? v.display) === info.name && v.paneId === info.paneId,
          );
          if (v && v.placement !== "float") {
            this.ui.closeDialog();
            this.dockedViews.open(v.id);
            return true;
          }
          if (info.source?.type !== "builtin" || v?.viewId === "statusline") return false;
          this.ui.openDialogWithContext({
            kind: "workspaceView",
            tabId: tab.id,
            ...(v?.target === "pane" ? { paneId: info.paneId } : {}),
            viewId: (v?.viewId ?? "development") as BuiltinViewId,
            ...(v ? { viewInstanceId: v.id } : {}),
          });
          return true;
        },
        undefined,
        (info) => {
          const tab = this.model.tabs.get(this.model.panes.get(ctx.paneId)?.tabId ?? "");
          return !!tab?.views?.some(
            (v) =>
              v.target === "tab" &&
              v.paneId === info.paneId &&
              (v.terminalDisplay ?? v.display) === info.name,
          );
        },
      );
    if (ctx.kind === "conversation" || ctx.kind === "pastSessions")
      return new ConversationDialog(
        ctx.kind === "pastSessions" ? "sessions" : ctx.mode,
        ctx.kind === "pastSessions" ? null : ctx.paneId,
        this.ui,
        this.rpc,
        this.prefs,
        this.model,
        () => this.scheduleRender(),
        (id) => this.dispatcher.focusPaneAcrossViews(id),
        (id, text) => {
          const terminal = this.panes.get(id)?.term;
          if (terminal) {
            const line = findMessageLine(terminal.buffer.active, text);
            if (line !== null) {
              terminal.scrollToLine(line);
              this.scheduleRender();
            }
          }
        },
      );
    if (ctx.kind === "agentFork")
      return new AgentForkDialog(
        ctx.paneId,
        this.ui,
        this.rpc,
        () => this.scheduleRender(),
        (id) => this.dispatcher.focusPaneAcrossViews(id),
      );
    if (ctx.kind === "goto")
      return new GotoDialog({
        ui: this.ui,
        model: this.model,
        actions: this.dispatcher,
        statusSymbols: () => this.prefs.statusSymbols,
        machines: this.machines,
      });
    if (ctx.kind === "pluginPackages")
      return new PluginPackages(this.ui, this.rpc, () => this.scheduleRender());
    if (ctx.kind === "settings") return this.settingsDialog(ctx.section);
    if (ctx.kind === "onboarding")
      return new OnboardingDialog({
        prefix: () => this.keymap.prefix,
        hintFor: (id) => this.keymap.hintFor(id),
        complete: () => this.completeOnboarding(),
      });
    if (ctx.kind === "usageAccounts") return new UsageDialog(null, this.model, this.ui, this.usage);
    if (ctx.kind === "usage") return new UsageDialog(ctx.paneId, this.model, this.ui, this.usage);
    if (ctx.kind === "notifications") return new NotificationList(this.ui, this.notify);
    if (ctx.kind === "graphTerminal")
      return (this.graphTerminal = new GraphTerminal(ctx.paneId, {
        ui: this.ui,
        model: this.model,
        conn: this.rpc,
        sendInput: (id, bytes) => this.net?.conn.sendInput(id, bytes),
        attachExternal: (id, sink) => this.panes.attachExternal(id, sink),
        redraw: () => this.scheduleRender(),
        focus: (id) => this.dispatcher.focusPaneAcrossViews(id),
      }));
    if (ctx.kind === "commandPopup") {
      const popup = new CommandPopup(ctx, {
        ui: this.ui,
        conn: this.rpc,
        sendInput: (id, bytes) => this.net?.conn.sendInput(id, bytes),
        attachExternal: (id, sink) => this.panes.attachExternal(id, sink),
        area: () => (this.lastLayout ?? this.layout()).paneArea,
        takeClosed: (id) => {
          if (!this.closedPopups.has(id)) return { closed: false };
          const exitCode = this.closedPopups.get(id);
          this.closedPopups.delete(id);
          return { closed: true, exitCode };
        },
        requestRender: () => this.scheduleRender(),
      });
      this.popup = popup;
      return popup;
    }
    return null;
  }

  /**
   * はじめの案内（H25b。herdr の onboarding）を起動後に 1 回だけ開く：出してよい起動（{@link onboardingEligible}）で、ローカルのサーバの
   * 共有の設定を受け取っていて、初めての利用者（一度も書かれていない＝rev 0。案内の項目ができる前から設定を使っていた既存の利用者〔rev が
   * 1 以上で `onboarding` が無い〕には出さない）か `onboarding: true`（明示して出し直す）で、`onboarding: false`（案内済み。web で
   * 済ませたものも同じ項目）でなく、接続が開いていて、ほかのダイアログ・メニューが無いとき。
   */
  protected maybeOpenOnboarding(): void {
    const flag = this.prefs.shared.onboarding;
    if (
      !this.onboardingEligible ||
      this.onboardingOpened ||
      this.ended ||
      this.prefs.rev < 0 ||
      flag === false ||
      (flag !== true && this.prefs.rev > 0) ||
      this.connectionState !== "open" ||
      this.ui.dialogContext !== null ||
      this.ui.contextMenu !== null
    )
      return;
    this.onboardingOpened = true;
    this.ui.openDialogWithContext({ kind: "onboarding" });
  }

  /** 案内を確定した：案内済みにして（共有の設定。herdr の `onboarding = false`）設定画面の「エージェント連携」の節を開く（herdr の complete_onboarding・select_settings_section）。 */
  private completeOnboarding(): void {
    this.settingsWriter.setShared({ onboarding: false });
    this.ui.openDialogWithContext({ kind: "settings", section: "agents" });
  }

  /** 設定画面（05 の T1）。開くたびにエージェント連携の状態を読み直す（サーバ全体の設定なので hello に乗らない。web と同じ）。 */
  protected settingsDialog(section?: string): Overlay {
    this.rpc
      .request("agent_integration.status", {})
      .then((status) => {
        this.model.agentIntegration = status;
        this.scheduleRender();
      })
      .catch(() => undefined);
    return new SettingsDialog(
      this.ui,
      (message) =>
        settingsSections({
          prefs: this.prefs,
          write: this.settingsWriter,
          keymap: () => this.keymap,
          navigateKeymap: () => this.navigateKeymap,
          commandsProblem: () => this.model.commands.problem,
          detectedDelivery: () => describeDelivery(detectDelivery(this.io.env)),
          scrollbackLimit: () => this.model.limits.scrollbackLines,
          agentIntegration: {
            status: () => this.model.agentIntegration,
            install: (kind) => this.rpc.request("agent_integration.install", { kind }),
            uninstall: (kind) => this.rpc.request("agent_integration.uninstall", { kind }),
            setAutoResume: (enabled) =>
              this.rpc
                .request("agent_integration.set_auto_resume", { enabled })
                .then(() => undefined),
          },
          message,
          openOnboarding: () => this.ui.openDialogWithContext({ kind: "onboarding" }),
        }),
      () => this.scheduleRender(),
      section,
    );
  }

  /**
   * マシンを切り替える（web の MachineSwitcher と同じ順）：選んだマシンを覚え、通知・セッション・pane の headless を空にして、画面の接続の
   * 行き先を `?machine=<id>` へ替える。開いたら `target` の workspace へ移る。選べない（繋がっていない）マシンは知らせて何もしない。
   */
  switchMachine(id: string, target?: SwitchTarget, opts: { force?: boolean } = {}): void {
    const net = this.net;
    if (!net) return;
    if (id === this.machines.selectedId) {
      if (target) this.dispatcher.focusWorkspaceById(target.workspaceId);
      return;
    }
    if (!opts.force && !this.machines.isSelectable(id)) {
      const label = this.machines.sections.find((s) => s.id === id)?.label ?? id;
      this.ui.toast(`${label} には今は切り替えられません（繋がっていません）`);
      return;
    }
    this.machines.select(id);
    this.pendingMachineFocus = target?.workspaceId ?? null;
    // キーのモードを戻す（web の resetView。前のマシンの navigate・copy のまま次のマシンへ持ち込まない）。
    this.keys.router.setMode("terminal");
    this.notify.resetForMachineSwitch();
    this.imagePaster.resetForMachineSwitch();
    this.ui.closeDialog();
    this.ui.closeContextMenu();
    this.dockedViews.dispose();
    this.schedules.reset();
    this.graphView.reset();
    this.model.reset(id);
    this.panes.reset();
    net.conn.retarget(wsUrlFor(net.baseWsUrl, id));
    this.wiring?.reconcileSummaryClients();
    this.scheduleRender();
  }

  /** 手元の状態の一部を替える（`persist` なら `tui-state.json` に残す）。 */
  protected setLocalState(patch: Partial<TuiState>, persist: boolean): void {
    const next = { ...this.prefs.localState, ...patch };
    this.prefs.setLocal(next);
    if (persist) writeTuiState(this.target.stateDir, next).catch(() => undefined);
  }

  /**
   * リンクを開く（M6）。手元なら OS の道具（`xdg-open`・`open`・`start`）で。SSH 越し（`SSH_CONNECTION`・`SSH_TTY`）では手元の画面で開けないので、
   * 外側の端末のクリップボードへ写して知らせる。
   */
  protected openLink(url: string): void {
    if (this.options.openUrl) {
      this.options.openUrl(url);
      return;
    }
    const env = this.io.env;
    if (env["SSH_CONNECTION"] || env["SSH_TTY"]) {
      void this.writeClipboard(url);
      this.ui.toast(`リンクをコピーしました（SSH 越しなので手元では開けません）: ${url}`);
      return;
    }
    const command = linkCommand(this.io.platform, url);
    if (!command) {
      this.ui.toast(`このリンクは開きません（http・https だけ）: ${url}`);
      return;
    }
    try {
      const child = spawn(command.cmd, command.args, {
        detached: true,
        stdio: "ignore",
        windowsHide: true,
      });
      child.on("error", () => this.ui.toast(`リンクを開けませんでした: ${url}`));
      child.unref();
    } catch {
      this.ui.toast(`リンクを開けませんでした: ${url}`);
    }
  }

  /** サイドバーの幅（境界のドラッグ。離したら `tui-state.json` に残す）。 */
  protected setSidebarCols(cols: number, persist: boolean): void {
    const next = { ...this.prefs.localState, sidebarCols: Math.max(10, Math.min(cols, 200)) };
    if (next.sidebarCols !== this.prefs.sidebarCols) this.prefs.setLocal(next);
    if (persist) writeTuiState(this.target.stateDir, next).catch(() => undefined);
  }

  /** `toggle_sidebar`：折りたたみを切り替え、`tui-state.json` に残す（design「画面」）。 */
  protected toggleSidebar(): void {
    const next = { ...this.prefs.localState, sidebarCollapsed: !this.prefs.sidebarCollapsed };
    this.prefs.setLocal(next);
    writeTuiState(this.target.stateDir, next).catch(() => undefined);
  }

  /** 区画（spaces・agents）の折りたたみを切り替え、`tui-state.json` に残す（20261004-ui-interaction-polish）。畳んだ区画だけを持つ。 */
  protected toggleSidebarSection(section: "spaces" | "agents"): void {
    // agents が 0 件のときは区切りの行が出ず畳む対象が無い（描画と同じ規則）。黙って状態だけ反転させない。
    if (section === "agents" && ![...this.model.panes.values()].some((p) => p.agent)) return;
    const now = this.prefs.sectionsCollapsed;
    const next = { ...now, [section]: !now[section] };
    const keep: { spaces?: true; agents?: true } = {};
    if (next.spaces) keep.spaces = true;
    if (next.agents) keep.agents = true;
    const { sidebarSectionsCollapsed: _drop, ...rest } = this.prefs.localState;
    void _drop;
    const state: TuiState =
      Object.keys(keep).length > 0 ? { ...rest, sidebarSectionsCollapsed: keep } : rest;
    this.prefs.setLocal(state);
    writeTuiState(this.target.stateDir, state).catch(() => undefined);
    this.scheduleRender();
  }

  /** navigate に入ったとき、畳んだ spaces を開く（web と同じ。行の選択の枠が見えない）。 */
  private navigateWasOn = false;
  private openSpacesForNavigate(): void {
    const on = this.keys.mode === "navigate";
    if (on && !this.navigateWasOn && this.prefs.sectionsCollapsed.spaces)
      this.toggleSidebarSection("spaces");
    this.navigateWasOn = on;
  }

  /** 見せる workspace・tab・pane・navigate の選択が変わったら、サイドバーの区画と tab バーをそこまで動かす。 */
  private revealChanges(): void {
    this.openSpacesForNavigate();
    const { workspaceId, tabId, focusedPaneId } = this.model;
    const nav = this.ui.navigateSelection;
    const s = this.shown;
    if (s.workspaceId !== workspaceId || s.nav !== nav || s.paneId !== focusedPaneId)
      this.sidebarScroll.reveal = { workspaceId: nav ?? workspaceId, paneId: focusedPaneId };
    if (s.tabId !== tabId) this.tabScroll.reveal = true;
    this.shown = { workspaceId, tabId, paneId: focusedPaneId, nav };
  }

  /** 今の割り付け（純粋な `computeLayout` に今の大きさ・モデル・設定を渡す）。 */
  protected layout(): LayoutResult {
    const { cols, rows } = this.io.size();
    const tab = this.model.currentTab();
    const views = this.ui.screen === "base" ? (tab ? terminalViews(tab) : []) : [];
    const docked = this.dockedViews.hasDocked(views);
    const layout = computeLayout({
      cols,
      rows,
      paneTopRows: this.dockedViews.hasTray(views) ? 1 : 0,
      singleRowPanes: views
        .filter((v) => v.placement.startsWith("band-"))
        .map((v) => "view:" + v.id),
      sidebarVisible: !this.prefs.sidebarCollapsed,
      collapsedSidebarStrip: true,
      sidebarCols: this.prefs.sidebarCols,
      narrowThreshold: this.prefs.narrowThreshold,
      tab: tab
        ? {
            layout: this.dockedViews.tree(
              docked && tab.zoomedPaneId ? { type: "pane", paneId: tab.zoomedPaneId } : tab.layout,
              views,
            ),
            zoomedPaneId: docked ? null : tab.zoomedPaneId,
          }
        : null,
      focusedPaneId: this.dockedViews.focusedId() ?? this.model.focusedPaneId,
      navigateOverlay: this.keys.mode === "navigate",
      paneBorders: this.prefs.paneBorders,
      paneGaps: this.prefs.paneGaps,
      paneControls: true,
      tabBarPosition: this.prefs.tabBarPosition,
      // tab が 1 つなら隠す（herdr の hide_tab_bar_when_single_tab）。サイドバーを畳んでいる間は開く「»」が tab バーにあるので隠さない。
      hideTabBar:
        this.prefs.hideTabBarWhenSingle &&
        !this.prefs.sidebarCollapsed &&
        (this.model.workspaceId ? this.model.tabsOf(this.model.workspaceId).length : 0) <= 1,
    });
    return layout;
  }

  /** 見えている pane と、自分の割り付けで決まる大きさ（申告する値。design「pane の大きさ」）。 */
  protected visiblePanes(layout = this.layout()): VisiblePane[] {
    if (this.ui.screen !== "base") return [];
    return layout.panes
      .filter((b) => this.model.panes.has(b.paneId))
      .map((b) => ({ paneId: b.paneId, ...clampTerminalSize(b.content.w, b.content.h) }));
  }

  /** 表示（`client.view`）と見えている pane の購読を今のモデル・割り付けに合わせる（同じ内容なら送らない）。 */
  protected commitView(): void {
    if (this.ended) return;
    const { workspaceId, tabId } = this.model;
    if (!workspaceId || !tabId) return;
    const view: ViewCommit = { workspaceId, tabId, visible: this.visiblePanes() };
    this.panes.commit(view, (paneId) => this.model.panes.get(paneId));
  }

  /** 次の描画を予約する（前の描画から最短 16ms。まとめて 1 回）。 */
  scheduleRender(): void {
    if (this.ended || this.renderTimer !== null) return;
    const wait = Math.max(0, RENDER_INTERVAL_MS - (performance.now() - this.lastRenderAt));
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      this.renderNow();
    }, wait);
  }

  /** 今すぐ 1 フレーム描く。 */
  renderNow(): void {
    if (this.ended) return;
    this.notify.syncToasts();
    this.lastRenderAt = performance.now();
    const layout = this.layout();
    this.lastLayout = layout;
    this.revealChanges();
    const ctx: ChromeContext = {
      model: this.model,
      screen: this.ui.screen,
      chromeControls: true,
      notificationCount: this.notify.queued.length,
      sidebarDrag: this.mouse.sidebarFeedback,
      dropTabId: this.mouse.dropTarget?.kind === "tab" ? this.mouse.dropTarget.tabId : undefined,
      dragNotice: this.mouse.sidebarFeedback
        ? this.mouse.sidebarFeedback.plan.kind === "refuse"
          ? "移動不可: " + this.mouse.sidebarFeedback.plan.reason
          : this.mouse.sidebarFeedback.plan.kind === "move"
            ? "移動中 · ▶ ここへ配置"
            : "移動中 · 移動先を選択"
        : this.mouse.dropTarget?.kind === "tab"
          ? "ペインを別タブへ移動 · 離して確定"
          : undefined,
      sidebarCollapsed: layout.sidebarCollapsed === true,
      prefs: this.prefs,
      theme: this.theme,
      mode: this.keyMode(),
      numberTarget: this.keys.router.numberTarget,
      navigateSelection: this.ui.navigateSelection,
      connection: this.connectionState,
      notice: this.notice,
      alert: this.alert,
      session: this.target.session,
      machines: this.machines,
      sidebarScroll: this.sidebarScroll,
      tabScroll: this.tabScroll,
    };
    const result = this.renderer.render(layout, ctx, this.panes, {
      decorate: (grid) => {
        if (this.ui.screen === "graph")
          return this.graphView.render(grid, layout.paneArea, this.theme);
        if (this.ui.screen === "schedule")
          return this.schedules.render(grid, layout.paneArea, this.theme);
        if (this.ui.screen === "dashboard") {
          this.dashboard.render(grid, layout.paneArea, this.theme);
          return { x: 0, y: 0, visible: false, style: "block", blink: false };
        }
        const cursor = this.decorate(grid, layout);
        return this.dockedViews.render(grid, layout, this.theme) ?? cursor;
      },
      toasts: this.ui.toasts.map((t) => ({ id: t.id, message: t.message, clickable: !!t.onClick })),
      overlay: (grid) => this.overlays.render(grid, this.theme),
    });
    this.sidebarHits = result.sidebarHits;
    this.tabHits = result.tabHits;
    this.newTabButton = result.newTabButton;
    this.tabBarHits = result.tabBar;
    this.toastHits = result.toastHits;
    this.switchButton = result.switchButton;
    this.openRequestedNavigateMenu(layout);
    this.syncAnyMotion(layout);
    let output = result.output;
    // 外側の端末へ出し直す画像（Kitty graphics。対応する端末だけ。変わったときだけ列が出る）。全体を描き直した（2J）ら置き直す。
    // 同期の更新（?2026）の中に入れる（ちらつかない）。
    if (this.kitty) {
      if (output.includes("\x1b[2J")) this.kitty.forget();
      const seq = this.kitty.sync(this.frameImages, this.heldImageKeys(layout));
      if (seq) {
        const end = output.lastIndexOf("\x1b[?2026l");
        output = end < 0 ? output + seq : output.slice(0, end) + seq + output.slice(end);
      }
    }
    this.io.write(output);
    // 外側の端末のタイトルは、サーバの状態（ホスト名・workspace）を受け取ってから置く（接続中の空の値を置かない）。
    if (this.model.host) this.modes.setTitle(this.windowTitle());
    // 見えている pane の既読を進める（外側の端末にフォーカスがあるときだけ。web の sweepMarkSeen と同じ規則）。
    const visible = new Set(layout.panes.map((b) => b.paneId));
    this.model.sweepSeen((id) => visible.has(id), this.outerFocused);
  }

  /**
   * 外側の端末のタイトル（H14。`tui.windowTitle` の書式。herdr の ui.window_title）。書式が空・読めなければ null（タイトルに触らない・置いていたら戻す）。
   */
  protected windowTitle(): string | null {
    const template = this.prefs.windowTitle;
    if (template !== this.titleTemplate.source) {
      let parts: WindowTitlePart[] | null = null;
      try {
        parts = parseWindowTitle(template);
      } catch {
        parts = null; // herdr と同じく、読めない書式ではタイトルに触らない
      }
      this.titleTemplate = { source: template, parts };
    }
    const parts = this.titleTemplate.parts;
    if (!parts) return this.notify.queued.length > 0 ? "🔔 " + FALLBACK_WINDOW_TITLE : null;
    const m = this.model;
    const ws = m.workspaceId ? m.workspaces.get(m.workspaceId) : undefined;
    const tab = m.currentTab();
    const pane = m.focusedPaneId ? m.panes.get(m.focusedPaneId) : undefined;
    return (
      (this.notify.queued.length > 0 ? "🔔 " : "") +
      (renderWindowTitle(parts, {
        hostname: m.host?.hostname ?? "",
        workspace: ws?.label ?? "",
        tab: tab?.label ?? "",
        pane: pane?.label ?? "",
        terminal_title: pane?.title ? (strippedTerminalTitle(pane.title) ?? "") : "",
      }) ?? FALLBACK_WINDOW_TITLE)
    );
  }

  /** pane の上の印（copy モードの選択とカーソル）。何も描かなければ undefined。 */
  protected decorate(grid: Grid, layout: LayoutResult): CursorState | null | undefined {
    let drew = this.decorateImages(grid, layout);
    // マウスの選択（M4）
    const msel = this.mouse.selection;
    const mbox = msel ? layout.panes.find((b) => b.paneId === msel.paneId) : undefined;
    const mterm = msel ? this.panes.get(msel.paneId) : undefined;
    if (msel && mbox && mterm) {
      invertRange(
        grid,
        mbox.content,
        mterm.term.buffer.active.viewportY,
        msel.from,
        msel.to,
        false,
      );
      drew = true;
    }
    // pane の名前のドラッグの落とし先（W01〜W03）
    const drop = this.mouse.dropTarget;
    if (drop?.kind === "pane") {
      const r = drop.rect;
      for (let y = r.y; y < r.y + r.h; y++)
        for (let x = r.x; x < r.x + r.w; x++)
          grid.bg[y * grid.w + x] = this.theme.ui("--soda-accent");
      drew = true;
    }
    if (this.keys.mode !== "copy") return drew ? null : undefined;
    const paneId = this.model.focusedPaneId;
    const box = paneId ? layout.panes.find((b) => b.paneId === paneId) : undefined;
    const target = paneId ? this.copyTargetOf(paneId) : undefined;
    const term = paneId ? this.panes.get(paneId) : undefined;
    if (!box || !target || !term) return undefined;
    const top = term.term.buffer.active.viewportY;
    const { content } = box;
    const sel = target.selection();
    if (sel) invertRange(grid, content, top, sel.from, sel.to, sel.linewise);
    const cy = target.cursor.row - top;
    if (cy < 0 || cy >= content.h) return null;
    return {
      x: content.x + Math.min(target.cursor.col, content.w - 1),
      y: content.y + cy,
      visible: true,
      style: "block",
      blink: false,
    };
  }

  /** 見えている pane がまだ持つ画像の鍵（置かないときも外側の端末に中身を残す）。 */
  private heldImageKeys(layout: LayoutResult): Set<string> {
    const keys = new Set<string>();
    for (const box of layout.panes)
      for (const im of this.panes.get(box.paneId)?.liveImages() ?? []) keys.add(im.hash);
    return keys;
  }

  /**
   * pane の中の画像（05 の T5。design「image/」）：外側の端末が Kitty graphics を描けて、画像が pane の中に丸ごと入るなら出し直し
   * （`frameImages`）、そうでなければ左上に「[画像]」の印を描く。ダイアログ・メニューを開いている間は出さない（下地の上に透けて見えるので）。
   * 何か描いたら true。
   */
  private decorateImages(grid: Grid, layout: LayoutResult): boolean {
    this.frameImages = [];
    // ダイアログ・メニュー・狭い幅の navigate で重ねたサイドバーの間は出さない（下地の上に透けて見える・印が重なる）。
    if (this.ui.overlayOpen || layout.sidebarOverlay) return false;
    let drew = false;
    const fg = this.theme.ui("--soda-accent-fg");
    const bg = this.theme.ui("--soda-accent");
    for (const box of layout.panes) {
      const term = this.panes.get(box.paneId);
      if (!term || term.images.length === 0) continue;
      const top = term.term.buffer.active.viewportY;
      const w = Math.min(box.content.w, term.cols);
      const h = Math.min(box.content.h, term.rows);
      for (const im of term.liveImages()) {
        const row = im.row - top;
        if (row + im.rows <= 0 || row >= h || im.col >= w) continue;
        if (this.kitty && row >= 0 && row + im.rows <= h && im.col + im.cols <= w) {
          this.frameImages.push({
            // 中身で見分ける（pane の headless を作り直して id が重なっても、古い画像を置かない）。
            imageKey: im.hash,
            base64: im.base64,
            x: box.content.x + im.col,
            y: box.content.y + row,
            cols: im.cols,
            rows: im.rows,
          });
          continue;
        }
        const y = box.content.y + Math.max(0, row);
        const x = box.content.x + im.col;
        grid.text(x, y, truncate("[画像]", Math.min(im.cols, w - im.col)), fg, bg, 0);
        drew = true;
      }
    }
    return drew || this.frameImages.length > 0;
  }

  /**
   * 見えている pane のどれかが全部の動きを求めていれば（`?1003`）、外側の端末にもボタンを押していない動きを報告させる（無くなれば戻す）。
   * 戻すのは `RESTORE_SEQUENCE` も行う。
   */
  private syncAnyMotion(layout: LayoutResult): void {
    const capture = this.prefs.mouseCapture;
    const want =
      capture &&
      layout.panes.some((b) => this.panes.get(b.paneId)?.modes.mouseTrackingMode === "any");
    if (want === this.anyMotion) return;
    this.anyMotion = want;
    // `?1003l` はマウスの報告を全部止める端末がある（xterm は報告の種類を 1 つだけ持つ）。戻すときはボタンとドラッグの報告を出し直す
    // （`tui.mouseCapture` が入のときだけ。04 ラウンド 2 の点検）。
    this.io.write(want ? "\x1b[?1003h" : `\x1b[?1003l${capture ? ENABLE_MOUSE : ""}`);
  }

  /**
   * navigate モードの Space（`navigate_open_menu`）：選んでいる行の横にメニューを開く（web の Sidebar と同じ役）。workspace の行なら
   * workspace のメニュー、グループの見出しならグループのメニュー、「グループなし」の見出しならそのメニュー（`layout` の無い古いサーバでは
   * 出す項目が無いので開かない）。見出しが消えているのに選択が残っていたら、何も開かず選択を外す。
   */
  private openRequestedNavigateMenu(layout: LayoutResult): void {
    if (!this.ui.navigateMenuRequested) return;
    this.ui.clearNavigateMenuRequest();
    const key = this.ui.navigateSelection;
    if (!key) return;
    const groupId = groupIdOfNavigateKey(key);
    const ungrouped = isUngroupedNavigateKey(key);
    const hit = this.sidebarHits.find((h) =>
      ungrouped
        ? h.kind === "ungrouped"
        : groupId !== null
          ? h.kind === "group" && h.groupId === groupId
          : (h.kind === "workspace" || h.kind === "autoGroup") && h.workspaceId === key,
    );
    const at = hit
      ? { x: layout.sidebar ? layout.sidebar.x + 2 : 0, y: hit.y + 1 }
      : { x: 2, y: 2 };
    if (ungrouped) {
      if (!currentNavigableRows(this.model, this.prefs).some((r) => r.kind === "ungrouped"))
        this.ui.setNavigateSelection(null);
      else if (this.model.hasServerLayout) this.ui.openContextMenu({ kind: "ungrouped" }, at);
      return;
    }
    if (groupId !== null) {
      if (!this.model.groups.has(groupId)) this.ui.setNavigateSelection(null);
      else this.ui.openContextMenu({ kind: "group", groupId }, at);
      return;
    }
    this.ui.openContextMenu({ kind: "workspace", workspaceId: key }, at);
  }

  /** 切り離し（`prefix+q`・SIGHUP・SIGTERM・SIGINT）。`client.detach` を送れるなら送る。サーバとエージェントは動き続ける。 */
  detach(): void {
    if (this.detaching || this.ended) return;
    this.detaching = true;
    const net = this.net;
    if (!net || this.connectionState !== "open") {
      this.finish(0);
      return;
    }
    void net.detach().then(() => this.finish(0));
  }

  /** 1 回だけ：後始末 → モードを戻す → 案内 → 終了コードを返す。 */
  finish(code: number, message?: string): void {
    if (this.ended) return;
    this.ended = true;
    for (const dispose of this.disposers.splice(0).reverse()) {
      try {
        dispose();
      } catch {
        // 後始末の失敗で、モードを戻すのを止めない。
      }
    }
    // 出し直した画像を消してから戻す。
    const clear = this.kitty?.clear() ?? "";
    if (clear) {
      try {
        this.io.write(clear);
      } catch {
        // 書けなければ何もしない。
      }
    }
    this.modes.restore();
    if (message) this.io.writeError(message);
    // セッションを返してから終わる（`POST /api/logout`。起動のたびにセッションが増えないように）。
    const net = this.net;
    if (net) void net.logout().then(() => this.resolveExit(code));
    else this.resolveExit(code);
  }

  get isEnded(): boolean {
    return this.ended;
  }
}

/**
 * リンクを開く OS の道具と引数（M6）。http・https だけ（`URL` で読めて、その scheme のもの。web の D110 と同じ——file: 等は実行ファイルを起動しうる）。**シェルを通さない**——Windows は
 * `cmd /c start` だと `&` などで任意のコマンドが走るので、`rundll32 url.dll,FileProtocolHandler`（シェルの解釈を通らない）を使う（04 ラウンド 2 の点検）。
 */
export function linkCommand(platform: string, url: string): { cmd: string; args: string[] } | null {
  let href: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    href = u.href;
  } catch {
    return null;
  }
  if (platform === "win32") return { cmd: "rundll32", args: ["url.dll,FileProtocolHandler", href] };
  if (platform === "darwin") return { cmd: "open", args: [href] };
  return { cmd: "xdg-open", args: [href] };
}

/**
 * 起動時の明暗の見当（`COLORFGBG`＝`前景;背景` の背景が 7・9〜15 なら明るい）。無ければ暗い（web で matchMedia が無いときと同じ）。
 * 外側の端末が `OSC 11` の問い合わせに答えれば、その応答で置き換える。
 */
export function systemDarkFromEnv(env: Readonly<Record<string, string | undefined>>): boolean {
  const bg = Number((env["COLORFGBG"] ?? "").split(";").at(-1));
  if (!Number.isInteger(bg) || bg < 0 || bg > 15) return true;
  return !(bg === 7 || bg >= 9);
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}

/** pane の中身の上の範囲（絶対行）を反転して見せる。 */
function invertRange(
  grid: Grid,
  content: { x: number; y: number; w: number; h: number },
  top: number,
  from: { row: number; col: number },
  to: { row: number; col: number },
  linewise: boolean,
): void {
  for (let row = Math.max(from.row, top); row <= Math.min(to.row, top + content.h - 1); row++) {
    const y = content.y + row - top;
    const a = linewise || row > from.row ? 0 : from.col;
    const b = linewise || row < to.row ? content.w - 1 : to.col;
    for (let col = a; col <= Math.min(b, content.w - 1); col++)
      grid.attrs[y * grid.w + content.x + col]! ^= ATTR.inverse;
  }
}
