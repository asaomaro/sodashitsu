import { type ConnectionState, type Mode } from "@sodashitsu/client-core";
import { clampTerminalSize, type SharedPrefs } from "@sodashitsu/protocol";
import { computeLayout, type LayoutResult } from "../layout/computeLayout.js";
import { readTuiState } from "../local/tuiState.js";
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
    this.disposers.push(this.model.onChange(() => this.onModelChange()));
    this.disposers.push(this.prefs.onChange(() => this.onPrefsChange()));
  }

  run(): Promise<number> {
    if (!this.io.isTTY) {
      this.io.writeError("soda: the terminal UI needs a terminal on both stdin and stdout\n");
      return Promise.resolve(1);
    }
    const done = new Promise<number>((resolve) => {
      this.resolveExit = resolve;
    });
    // 初回の token など（ブラウザ用。二度と出ない）は、代替画面に入る前に標準エラーへ（design「起動と終了」）。
    if (this.target.startupNotice) this.io.writeError(`${this.target.startupNotice}\n`);
    this.disposers.push(this.io.onExit(() => this.modes.restore()));
    this.disposers.push(this.io.onSignal(() => this.detach()));
    this.disposers.push(
      this.io.onFatal((err) => this.finish(1, `soda: unexpected error: ${describeError(err)}\n`)),
    );
    try {
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
    });
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

  private showNotice(text: string | null): void {
    if (!text) return;
    this.notice = text.split("\n")[0] ?? null;
    const timer = setTimeout(() => {
      this.notice = null;
      this.scheduleRender();
    }, NOTICE_MS);
    timer.unref?.();
    this.disposers.push(() => clearTimeout(timer));
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
    const theme = this.prefs.theme;
    if (theme !== this.theme.name) {
      this.theme = new ThemeColors(theme);
      if (this.connectionState === "open")
        this.net?.conn.request("client.theme", { theme }).catch(() => undefined);
    }
    this.commitView();
    this.scheduleRender();
  }

  /** キーのモード（T5 で KeyRouter のモードを返す）。 */
  protected keyMode(): Mode {
    return "terminal";
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
