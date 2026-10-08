import {
  DEFAULT_THEME_NAME,
  type DisplayDock,
  type DisplayEdge,
  type NewCwd,
  type SharedPrefs,
  type ThemeName,
} from "@sodashitsu/protocol";
import {
  buildNewCwd,
  effectiveScrollback,
  loadAgentSort,
  loadCollapsedAutoGroups,
  loadNewCwdPath,
  loadNewCwdPolicy,
  loadNotifyPrefs,
  loadPaneAgentNameVisible,
  loadPaneBorders,
  loadPaneGaps,
  loadScrollbackPref,
  loadDisplayBandEdge,
  loadDisplayPanelDock,
  loadDisplayPanelInitial,
  loadShellCwdTracking,
  loadStatusSymbols,
  loadWorkspaceSort,
  type NewCwdPolicy,
  type PaneBorders,
  loadTabBarPosition,
  loadTabBarRightEntries,
  loadTabBarRightSeparator,
  loadThemeOverrides,
  type TabBarRightEntry,
  type ThemeOverrides,
  loadThemePrefs,
  resolveTheme,
  type NotifyPrefs,
  type AgentSort,
  type WorkspaceSort,
} from "@sodashitsu/client-core";
import type { TuiState } from "../local/tuiState.js";
import type { ColorModePref } from "../render/color.js";
import { isTuiColor } from "../render/cssColor.js";

export const DEFAULT_SIDEBAR_COLS = 26;
export const DEFAULT_NARROW_THRESHOLD = 64;
/** 外側の端末のタイトルの既定（herdr の `default_window_title`）。 */
export const DEFAULT_WINDOW_TITLE = "{hostname}: {workspace}";

/** 外側の端末への通知の出し方（`tui.notifyDelivery`。design「通知」）。 */
export const NOTIFY_DELIVERIES = ["auto", "osc9", "osc99", "osc777", "bell", "off"] as const;
export type NotifyDelivery = (typeof NOTIFY_DELIVERIES)[number];

/**
 * 共有の設定（`prefs.get`・`prefs.changed`）と手元の状態（`tui-state.json`）を合わせた、端末版が使う値（20260927-cli-mode の
 * architecture「model/PrefsModel.ts」）。**型を信じずに正規化する**（版の違うクライアントが書いた値も届く。protocol の `SharedPrefs` の説明）。
 */
export class PrefsModel {
  /** サーバから受けた設定。 */
  private server: SharedPrefs = {};
  /** 送った後、まだ返事の無い変更（項目 → 値）。受けた設定の上に重ねて見せる（web の `PrefsSync` の `inflight` と同じ考え方）。 */
  private readonly pending = new Map<string, { token: number; value: unknown }>();
  private nextToken = 1;
  /** `server` に `pending` を重ねたもの（読む側が見る値）。 */
  private raw: SharedPrefs = {};
  private revision = -1;
  private readonly listeners = new Set<() => void>();

  constructor(private local: TuiState = {}) {}

  onChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  /** サーバから受けた設定で置き換える（古い rev は捨てる）。 */
  apply(prefs: SharedPrefs, rev: number): void {
    // 形の壊れた応答（rev が数でない）は当てない（今の設定を空で上書きしない）。
    if (typeof rev !== "number" || !Number.isFinite(rev) || rev < this.revision) return;
    this.revision = rev;
    this.server = prefs && typeof prefs === "object" ? prefs : {};
    this.recompute();
    this.emit();
  }

  /**
   * 手元で先に変える（送った変更の返事を待つ間）。返す関数は、送った結果で重ねを外す（`ok` なら受けた設定が正、失敗なら元に戻る）。
   * 同じ項目を続けて変えたら、新しい方の返事でだけ外す（古い返事で新しい値を消さない）。
   */
  overlay(patch: Record<string, unknown>): () => void {
    const token = this.nextToken++;
    for (const [k, v] of Object.entries(patch)) this.pending.set(k, { token, value: v });
    this.recompute();
    this.emit();
    return () => {
      let changed = false;
      for (const k of Object.keys(patch))
        if (this.pending.get(k)?.token === token) {
          this.pending.delete(k);
          changed = true;
        }
      if (!changed) return;
      this.recompute();
      this.emit();
    };
  }

  private recompute(): void {
    if (this.pending.size === 0) {
      this.raw = this.server;
      return;
    }
    const merged: Record<string, unknown> = { ...this.server };
    for (const [k, p] of this.pending) merged[k] = p.value;
    this.raw = merged as SharedPrefs;
  }

  setLocal(next: TuiState): void {
    this.local = next;
    this.emit();
  }

  get localState(): TuiState {
    return this.local;
  }

  /** 受け取った設定の rev（まだ受け取っていなければ -1）。 */
  get rev(): number {
    return this.revision;
  }

  get shared(): SharedPrefs {
    return this.raw;
  }

  /** 外側の端末が暗いか（`OSC 11` の応答・`CSI ? 997` の知らせ・`COLORFGBG`。分からなければ暗い）。 */
  private dark = true;

  get systemDark(): boolean {
    return this.dark;
  }

  setSystemDark(dark: boolean): void {
    if (dark === this.dark) return;
    this.dark = dark;
    this.emit();
  }

  /** 色の上書き（web と同じ正規化。色は端末版で読めるものだけ）。 */
  get themeOverrides(): ThemeOverrides {
    return loadThemeOverrides(this.raw.themeOverrides, isTuiColor);
  }

  get theme(): ThemeName {
    // 明暗の自動の切り替えは外側の端末の明暗で（web の prefers-color-scheme の代わり）。
    try {
      return resolveTheme(loadThemePrefs(this.raw as Record<string, unknown>), this.dark);
    } catch {
      return DEFAULT_THEME_NAME;
    }
  }

  private tuiNumber(key: string, fallback: number, min: number, max: number): number {
    const tui = this.raw.tui;
    const v = tui && typeof tui === "object" ? (tui as Record<string, unknown>)[key] : undefined;
    return typeof v === "number" && Number.isInteger(v) && v >= min && v <= max ? v : fallback;
  }

  /** 今のサイドバーの幅：手元の今の幅 → 共有の `tui.sidebarCols` → 26。 */
  get sidebarCols(): number {
    return this.local.sidebarCols ?? this.tuiNumber("sidebarCols", DEFAULT_SIDEBAR_COLS, 10, 200);
  }

  /** サイドバーの spaces の区画の行数（手元の今の値。無ければ中身に合わせる）。 */
  get sidebarSpacesRows(): number | undefined {
    return this.local.sidebarSpacesRows;
  }

  get sidebarCollapsed(): boolean {
    return this.local.sidebarCollapsed === true;
  }

  /** サイドバーの区画（spaces・agents）の折りたたみ（手元の状態。20261004-ui-interaction-polish）。 */
  get sectionsCollapsed(): { spaces: boolean; agents: boolean } {
    const f = this.local.sidebarSectionsCollapsed;
    return { spaces: f?.spaces === true, agents: f?.agents === true };
  }

  get narrowThreshold(): number {
    return this.tuiNumber("narrowThreshold", DEFAULT_NARROW_THRESHOLD, 0, 1000);
  }

  /** サーバが受け付けた `tui` 節（手元の重ねを含まない。書き込みの土台）。 */
  get serverTui(): Record<string, unknown> {
    const tui = this.server.tui;
    return tui && typeof tui === "object" && !Array.isArray(tui)
      ? (tui as Record<string, unknown>)
      : {};
  }

  /** 共有の `tui` 節（オブジェクトでなければ空）。 */
  get tui(): Record<string, unknown> {
    const tui = this.raw.tui;
    return tui && typeof tui === "object" && !Array.isArray(tui)
      ? (tui as Record<string, unknown>)
      : {};
  }

  private tuiFlag(key: string, fallback: boolean): boolean {
    const v = this.tui[key];
    return typeof v === "boolean" ? v : fallback;
  }

  get mouseCapture(): boolean {
    return this.tuiFlag("mouseCapture", true);
  }

  /** マウスで選んだら離した時点でコピーするか（既定は入）。 */
  get copyOnSelect(): boolean {
    return this.tuiFlag("copyOnSelect", true);
  }

  /** 外側の端末への通知の出し方（既定は auto＝端末を判定）。 */
  get notifyDelivery(): NotifyDelivery {
    const v = this.tui["notifyDelivery"];
    return (NOTIFY_DELIVERIES as readonly unknown[]).includes(v) ? (v as NotifyDelivery) : "auto";
  }

  /** 共有の `tui.sidebarCols`（手元の今の幅を見ない。設定画面が出す値）。 */
  get sharedSidebarCols(): number {
    return this.tuiNumber("sidebarCols", DEFAULT_SIDEBAR_COLS, 10, 200);
  }

  /** 枠にエージェント名を出すか（web の `paneAgentNameVisible`。既定は切）。 */
  get paneAgentNameVisible(): boolean {
    return loadPaneAgentNameVisible(this.raw.paneAgentNameVisible);
  }

  /** pane の枠の描画（web の `loadPaneBorders`。既定は常に）。 */
  get paneBorders(): PaneBorders {
    return loadPaneBorders(this.raw.paneBorders);
  }

  /** 分割の間の隙間（既定は入）。 */
  get paneGaps(): boolean {
    return loadPaneGaps(this.raw.paneGaps);
  }

  get tabBarPosition(): "top" | "bottom" {
    return loadTabBarPosition(this.raw.tabBarPosition);
  }

  get tabBarRight(): TabBarRightEntry[] {
    return loadTabBarRightEntries(this.raw.tabBarRight);
  }

  get tabBarRightSeparator(): string {
    return loadTabBarRightSeparator(this.raw.tabBarRightSeparator);
  }

  /** tab が 1 つなら tab バーを隠す（端末版だけ。herdr の hide_tab_bar_when_single_tab。既定は切）。 */
  get hideTabBarWhenSingle(): boolean {
    return this.tuiFlag("hideTabBarWhenSingle", false);
  }

  /** 外側の端末のタイトル（herdr の window_title。空なら触らない。既定は "{hostname}: {workspace}"）。 */
  get windowTitle(): string {
    const v = this.tui["windowTitle"];
    return typeof v === "string" ? v : DEFAULT_WINDOW_TITLE;
  }

  /** 外側の端末にフォーカスが戻ったら全部描き直す（herdr の redraw_on_focus_gained。既定は入）。 */
  get redrawOnFocusGained(): boolean {
    return this.tuiFlag("redrawOnFocusGained", true);
  }

  /** pane の BEL を外側の端末へ（herdr の前面のクライアントへのベル。既定は入）。 */
  get forwardBell(): boolean {
    return this.tuiFlag("forwardBell", true);
  }

  /** 閉じる前に確かめる（herdr の confirm_close。既定は入）。 */
  get confirmClose(): boolean {
    return this.tuiFlag("confirmClose", true);
  }

  /** 新しい tab の名前を先に聞く（herdr の prompt_new_tab_name。既定は入）。 */
  get promptNewTabName(): boolean {
    return this.tuiFlag("promptNewTabName", true);
  }

  /** 新しい workspace の名前を先に聞く（herdr の prompt_new_workspace_name。既定は切）。 */
  get promptNewWorkspaceName(): boolean {
    return this.tuiFlag("promptNewWorkspaceName", false);
  }

  /** 状態を色に加えて記号でも示すか（web の `loadStatusSymbols`。既定は入）。 */
  get statusSymbols(): boolean {
    return loadStatusSymbols(this.raw.statusSymbols);
  }

  /** Windows で pane のシェルに場所の知らせを差し込むか（web の `loadShellCwdTracking`。既定は入。読むのはサーバ）。 */
  get shellCwdTracking(): boolean {
    return loadShellCwdTracking(this.raw.shellCwdTracking);
  }

  /** 表示のパネルの初めの状態（web の `loadDisplayPanelInitial`。既定は開く。効くのはブラウザ版。20261008-display-layout）。 */
  get displayPanelInitial(): "open" | "collapsed" {
    return loadDisplayPanelInitial(this.raw.displayPanelInitial);
  }

  /** 表示のパネルの既定の置き場所（web の `loadDisplayPanelDock`。既定は右）。 */
  get displayPanelDock(): DisplayDock {
    return loadDisplayPanelDock(this.raw.displayPanelDock);
  }

  /** 表示の帯の既定の場所（web の `loadDisplayBandEdge`。既定は上）。 */
  get displayBandEdge(): DisplayEdge {
    return loadDisplayBandEdge(this.raw.displayBandEdge);
  }

  /** 通知の種類（web の `loadNotifyPrefs` と同じ正規化）。 */
  get notify(): NotifyPrefs {
    return loadNotifyPrefs(this.raw.notify);
  }

  /** 色の出し方（手元の `tui-state.json` の `colorMode`。端末ごと。無ければ auto）。 */
  get colorMode(): ColorModePref {
    return this.local.colorMode ?? "auto";
  }

  /** 背景を透過するか（手元の `tui-state.json` の `transparentBg`。端末ごと。既定は透かさない）。 */
  get transparentBg(): boolean {
    return this.local.transparentBg === true;
  }

  get workspaceSort(): WorkspaceSort {
    return loadWorkspaceSort(this.raw.workspaceSort);
  }

  get agentSort(): AgentSort {
    return loadAgentSort(this.raw.agentSort);
  }

  get collapsedAutoGroups(): ReadonlySet<string> {
    return loadCollapsedAutoGroups(this.raw.collapsedAutoGroups);
  }

  /** 「グループなし」を畳んでいるか（共有の設定 `ungroupedCollapsed`。`true` のときだけ畳む。web の `loadUngroupedCollapsed` と同じ）。 */
  get ungroupedCollapsed(): boolean {
    return this.raw.ungroupedCollapsed === true;
  }

  /** 新しく開く場所の方針（web の `loadNewCwdPolicy` と同じ正規化。既定は「引き継ぐ」）。 */
  get newCwdPolicy(): NewCwdPolicy {
    return loadNewCwdPolicy(this.raw.newCwdPolicy);
  }

  get newCwdPath(): string {
    return loadNewCwdPath(this.raw.newCwdPath);
  }

  /**
   * 作成の要求に載せる形（web の `buildNewCwd` と同じ）。`sourcePaneId` は「引き継ぐ」のときだけ載せる（null なら載せない → サーバが以前と同じ場所で開く）。
   */
  newCwd(sourcePaneId: string | null): NewCwd {
    return buildNewCwd(this.newCwdPolicy, this.newCwdPath, sourcePaneId);
  }

  /** 購読で求める行数（`auto` はサーバの上限。数ならサーバの上限以下）。 */
  scrollbackLines(serverLimit: number): number {
    // 端末版はデスクトップの扱い（`auto` はサーバの上限）。
    return effectiveScrollback(loadScrollbackPref(this.raw.scrollback), "desktop", serverLimit);
  }

  private emit(): void {
    for (const cb of [...this.listeners]) cb();
  }
}
