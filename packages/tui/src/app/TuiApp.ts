import {
  loadKeyPrefs,
  resolveKeymap,
  type Action,
  type ConnectionState,
  type Mode,
  type ResolvedKeymap,
} from "@sodashitsu/client-core";
import { TuiDispatcher } from "../actions/TuiDispatcher.js";
import { encodePaste, type PaneInputModes } from "../input/encode.js";
import { ESC_TIMEOUT_MS, InputDecoder, type InputEvent } from "../input/decode.js";
import { TuiKeys } from "../input/keys.js";
import { clampTerminalSize, type SharedPrefs } from "@sodashitsu/protocol";
import { computeLayout, type LayoutResult } from "../layout/computeLayout.js";
import { readTuiState, writeTuiState } from "../local/tuiState.js";
import { PrefsModel } from "../model/PrefsModel.js";
import { SessionModel } from "../model/SessionModel.js";
import { TuiNet, type TuiNetDeps } from "../net/TuiNet.js";
import type { ChromeContext } from "../render/chrome/context.js";
import type { SidebarHit } from "../render/chrome/sidebar.js";
import type { TabHit } from "../render/chrome/tabBar.js";
import { colorModeOf, ThemeColors } from "../render/color.js";
import { Renderer } from "../render/Renderer.js";
import { PaneRegistry, type ViewCommit, type VisiblePane } from "../term/PaneRegistry.js";
import type { TuiIo, TuiTarget } from "../types.js";
import { TerminalModes } from "./terminalModes.js";

export interface TuiAppOptions {
  /** 接続の差し替え（テスト用）。 */
  net?: TuiNetDeps;
}

/** 描画の最短の間隔（60fps。design「描画の予約は最短 16ms」）。 */
export const RENDER_INTERVAL_MS = 16;
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
  /** 外側の端末にフォーカスがあるか（フォーカスの報告で知る。報告が来ない端末ではありとみなす。design「通知」）。 */
  protected outerFocused = true;
  /** 直近のフレームの当たり判定（04 のマウスが使う）。 */
  protected lastLayout: LayoutResult | null = null;
  protected sidebarHits: SidebarHit[] = [];
  protected tabHits: TabHit[] = [];
  readonly keys: TuiKeys;
  private readonly decoder = new InputDecoder();
  private escTimer: ReturnType<typeof setTimeout> | null = null;
  protected readonly dispatcher: TuiDispatcher;
  private keymapSource = "";

  constructor(
    readonly target: TuiTarget,
    readonly io: TuiIo,
    protected readonly options: TuiAppOptions = {},
  ) {
    this.modes = new TerminalModes(io);
    this.model = new SessionModel({
      onPaneClosed: (paneId) => this.panes.paneClosed(paneId),
      onPrefsChanged: (data) => this.prefs.apply(data.prefs, data.rev),
    });
    this.prefs = new PrefsModel(readTuiState(target.stateDir));
    this.theme = new ThemeColors(this.prefs.theme);
    this.renderer = new Renderer(colorModeOf(io.env), io.platform !== "win32");
    this.panes = new PaneRegistry(
      {
        request: (method, params) =>
          this.net
            ? this.net.conn.request(method, params)
            : Promise.reject(new Error("not connected")),
      },
      () => this.prefs.scrollbackLines(this.model.limits.scrollbackLines),
      () => this.scheduleRender(),
    );
    this.disposers.push(() => this.panes.dispose());
    this.keys = new TuiKeys(this.resolvedKeymap(), {
      paneModes: () => this.focusedPaneModes(),
      sendToPane: (bytes) => this.sendToFocusedPane(bytes),
      dispatch: (action) => this.dispatcher.dispatch(action),
    });
    this.keys.router.onModeChange(() => this.scheduleRender());
    this.dispatcher = new TuiDispatcher({
      model: this.model,
      conn: {
        request: (method, params) =>
          this.net
            ? this.net.conn.request(method, params)
            : Promise.reject(new Error("not connected")),
      },
      detach: () => this.detach(),
      toggleSidebar: () => this.toggleSidebar(),
      unsupported: (action) => this.unsupported(action),
    });
    this.disposers.push(this.model.onChange(() => this.onModelChange()));
    this.disposers.push(this.prefs.onChange(() => this.onPrefsChange()));
  }

  run(): Promise<number> {
    // 初回の token など（ブラウザ用。二度と出ない）は、代替画面に入る前に標準エラーへ（design「起動と終了」）。
    // 端末でなく端末版を開けないときも出す——ここで出さないと token は二度と得られない。
    if (this.target.startupNotice) this.io.writeError(`${this.target.startupNotice}\n`);
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
      // TODO(05-tui-features)：`tui.mouseCapture` は prefs.get の前なので、ここでは常に既定（有効）。受け取った後の切り替え（マウスの報告の
      // 有効・無効を出し直す）は 05 の設定画面と一緒に配線する（.aidev/works/20260927-cli-mode/05-tui-features）。
      this.modes.enable(this.prefs.mouseCapture);
      this.start();
    } catch (err) {
      this.finish(1, `soda: ${describeError(err)}\n`);
    }
    return done;
  }

  /** 画面の部品の組み立て。 */
  protected start(): void {
    this.showNotice(this.target.startupNotice ?? this.target.stopHint ?? null);
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
    const net = new TuiNet(
      this.target,
      {
        model: this.model,
        sink: this.panes,
        onState: (s) => this.onConnectionState(s),
        onOpened: (clientId) => this.onConnectionOpened(clientId),
        onClosed: () => this.onConnectionClosed(),
        onFatal: (message) => this.finish(1, message),
      },
      this.options.net,
    );
    this.net = net;
    this.disposers.push(() => net.stop());
    this.scheduleRender();
    void net.start();
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
    this.scheduleRender();
  }

  protected onConnectionOpened(_clientId: string): void {
    this.panes.connectionOpened();
    this.commitView();
    this.scheduleRender();
    const net = this.net;
    if (!net) return;
    // 共有の設定（`prefs.get`）と、pane の色の問い合わせにサーバが答える配色（`client.theme`。web と同じ）。
    net.conn
      .request("prefs.get", {})
      .then((r) => this.prefs.apply(r.prefs as SharedPrefs, r.rev))
      .catch(() => undefined);
    net.conn.request("client.theme", { theme: this.theme.name }).catch(() => undefined);
  }

  protected onConnectionClosed(): void {
    this.panes.connectionClosed();
  }

  protected onModelChange(): void {
    this.commitView();
    this.scheduleRender();
  }

  protected onPrefsChange(): void {
    const source = JSON.stringify(this.prefs.shared.keys ?? null);
    if (source !== this.keymapSource) this.keys.setKeymap(this.resolvedKeymap());
    const theme = this.prefs.theme;
    if (theme !== this.theme.name) {
      this.theme = new ThemeColors(theme);
      if (this.connectionState === "open")
        this.net?.conn.request("client.theme", { theme }).catch(() => undefined);
    }
    this.commitView();
    this.scheduleRender();
  }

  /** キーのモード（prefix 待ちなら tab バーに `PREFIX`）。 */
  protected keyMode(): Mode {
    return this.keys.mode;
  }

  /** 共有の設定（`prefs.keys`）から解いた割り当ての表（web と同じ `loadKeyPrefs` → `resolveKeymap`。AC8）。 */
  private resolvedKeymap(): ResolvedKeymap {
    const raw = this.prefs.shared.keys;
    this.keymapSource = JSON.stringify(raw ?? null);
    return resolveKeymap(loadKeyPrefs(raw)).keymap;
  }

  // --- 入力 ---

  private onInput(bytes: Uint8Array): void {
    if (this.ended) return;
    if (this.escTimer !== null) {
      clearTimeout(this.escTimer);
      this.escTimer = null;
    }
    for (const ev of this.decoder.feed(bytes)) this.handleInput(ev);
    if (this.decoder.waiting) {
      // ESC 単独か、列の途中で切れたか。少し待って確定する（design「input/decode.ts」）。
      this.escTimer = setTimeout(() => {
        this.escTimer = null;
        for (const ev of this.decoder.flush()) this.handleInput(ev);
      }, ESC_TIMEOUT_MS);
    }
  }

  protected handleInput(ev: InputEvent): void {
    if (this.ended || this.detaching) return;
    switch (ev.kind) {
      case "key":
        this.keys.handle(ev);
        return;
      case "paste": {
        const modes = this.focusedPaneModes();
        if (modes) this.sendToFocusedPane(encodePaste(ev.text, modes));
        return;
      }
      case "focus": {
        this.outerFocused = ev.focused;
        // pane がフォーカスの報告を求めていれば伝える（`CSI ? 1004 h`）。
        const term = this.model.focusedPaneId
          ? this.panes.get(this.model.focusedPaneId)
          : undefined;
        if (term?.modes.sendFocusMode) this.sendToFocusedPane(ev.focused ? "\x1b[I" : "\x1b[O");
        this.scheduleRender();
        return;
      }
      case "mouse":
        this.handleMouse(ev);
        return;
    }
  }

  /** マウス（03 では pane のクリックで焦点を移すだけ。当たり判定とドラッグ・pane への受け渡しは 04 の `input/mouse.ts`）。 */
  protected handleMouse(ev: Extract<InputEvent, { kind: "mouse" }>): void {
    if (ev.action !== "down" || ev.button !== 0) return;
    const box = this.lastLayout?.panes.find(
      (b) =>
        ev.x >= b.frame.x &&
        ev.x < b.frame.x + b.frame.w &&
        ev.y >= b.frame.y &&
        ev.y < b.frame.y + b.frame.h,
    );
    if (!box || box.paneId === this.model.focusedPaneId) return;
    this.model.focusPane(box.paneId);
    this.net?.conn.request("pane.focus", { paneId: box.paneId }).catch(() => undefined);
  }

  private focusedPaneModes(): PaneInputModes | null {
    const id = this.model.focusedPaneId;
    if (!id || this.connectionState !== "open") return null;
    const term = this.panes.get(id);
    // 購読前（headless がまだ無い）でも送れるように、既定のモードで扱う。
    return term ? term.modes : { applicationCursorKeysMode: false, bracketedPasteMode: false };
  }

  private sendToFocusedPane(bytes: string): void {
    const id = this.model.focusedPaneId;
    if (!id || !this.net) return;
    this.net.conn.sendInput(id, bytes);
  }

  /** `toggle_sidebar`：折りたたみを切り替え、`tui-state.json` に残す（design「画面」）。 */
  protected toggleSidebar(): void {
    const next = { ...this.prefs.localState, sidebarCollapsed: !this.prefs.sidebarCollapsed };
    this.prefs.setLocal(next);
    writeTuiState(this.target.stateDir, next).catch(() => undefined);
  }

  /** まだ端末版に無い操作（04 で足す）。モードに入る操作はモードを戻す（解釈が無いまま入るとキーを奪う）。 */
  protected unsupported(action: Action): void {
    if (this.keys.mode !== "terminal" && this.keys.mode !== "prefix")
      this.keys.router.setMode("terminal");
    this.showNotice(`未対応の操作です: ${action.type}`, 2000);
  }

  /** 今の割り付け（純粋な `computeLayout` に今の大きさ・モデル・設定を渡す）。 */
  protected layout(): LayoutResult {
    const { cols, rows } = this.io.size();
    const tab = this.model.currentTab();
    return computeLayout({
      cols,
      rows,
      sidebarVisible: !this.prefs.sidebarCollapsed,
      sidebarCols: this.prefs.sidebarCols,
      narrowThreshold: this.prefs.narrowThreshold,
      tab: tab ? { layout: tab.layout, zoomedPaneId: tab.zoomedPaneId } : null,
      focusedPaneId: this.model.focusedPaneId,
    });
  }

  /** 見えている pane と、自分の割り付けで決まる大きさ（申告する値。design「pane の大きさ」）。 */
  protected visiblePanes(layout = this.layout()): VisiblePane[] {
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
    this.lastRenderAt = performance.now();
    const layout = this.layout();
    this.lastLayout = layout;
    const ctx: ChromeContext = {
      model: this.model,
      prefs: this.prefs,
      theme: this.theme,
      mode: this.keyMode(),
      connection: this.connectionState,
      notice: this.notice,
      session: this.target.session,
    };
    const result = this.renderer.render(layout, ctx, this.panes);
    this.sidebarHits = result.sidebarHits;
    this.tabHits = result.tabHits;
    this.io.write(result.output);
    // 見えている pane の既読を進める（外側の端末にフォーカスがあるときだけ。web の sweepMarkSeen と同じ規則）。
    const visible = new Set(layout.panes.map((b) => b.paneId));
    this.model.sweepSeen((id) => visible.has(id), this.outerFocused);
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
    this.modes.restore();
    if (message) this.io.writeError(message);
    this.resolveExit(code);
  }

  get isEnded(): boolean {
    return this.ended;
  }
}

export function describeError(err: unknown): string {
  if (err instanceof Error) return err.stack ?? err.message;
  return String(err);
}
