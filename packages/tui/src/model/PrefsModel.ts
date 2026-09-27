import {
  DEFAULT_THEME_NAME,
  type NewCwd,
  type SharedPrefs,
  type ThemeName,
} from "@sodashitsu/protocol";
import {
  loadThemePrefs,
  resolveTheme,
  type AgentSort,
  type WorkspaceSort,
} from "@sodashitsu/client-core";
import type { TuiState } from "../local/tuiState.js";
import type { ColorModePref } from "../render/color.js";

export const DEFAULT_SIDEBAR_COLS = 26;
export const DEFAULT_NARROW_THRESHOLD = 64;

/**
 * 共有の設定（`prefs.get`・`prefs.changed`）と手元の状態（`tui-state.json`）を合わせた、端末版が使う値（20260927-cli-mode の
 * architecture「model/PrefsModel.ts」）。**型を信じずに正規化する**（版の違うクライアントが書いた値も届く。protocol の `SharedPrefs` の説明）。
 */
export class PrefsModel {
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
    if (rev < this.revision) return;
    this.revision = rev;
    this.raw = prefs && typeof prefs === "object" ? prefs : {};
    this.emit();
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

  get theme(): ThemeName {
    // OS の明暗は外側の端末から分からない（05 で OSC 11 から判定する）ので暗い扱い（web で matchMedia が無いときと同じ）。
    try {
      return resolveTheme(loadThemePrefs(this.raw as Record<string, unknown>), true);
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

  get sidebarCollapsed(): boolean {
    return this.local.sidebarCollapsed === true;
  }

  get narrowThreshold(): number {
    return this.tuiNumber("narrowThreshold", DEFAULT_NARROW_THRESHOLD, 0, 1000);
  }

  get mouseCapture(): boolean {
    const tui = this.raw.tui;
    const v =
      tui && typeof tui === "object" ? (tui as Record<string, unknown>)["mouseCapture"] : undefined;
    return typeof v === "boolean" ? v : true;
  }

  /** 色の出し方（`tui.colorMode`。壊れた値は auto）。 */
  get colorMode(): ColorModePref {
    const tui = this.raw.tui;
    const v =
      tui && typeof tui === "object" ? (tui as Record<string, unknown>)["colorMode"] : undefined;
    return v === "truecolor" || v === "256" ? v : "auto";
  }

  get workspaceSort(): WorkspaceSort {
    return this.raw.workspaceSort === "name" ? "name" : "opened";
  }

  get agentSort(): AgentSort {
    return this.raw.agentSort === "priority" ? "priority" : "grouped";
  }

  get collapsedAutoGroups(): ReadonlySet<string> {
    const v = this.raw.collapsedAutoGroups;
    return new Set(Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : []);
  }

  /** 新しく開く場所の方針（web の `loadNewCwdPolicy` と同じ正規化。既定は「引き継ぐ」）。 */
  get newCwdPolicy(): NewCwd["policy"] {
    const v = this.raw.newCwdPolicy;
    return v === "follow" || v === "home" || v === "current" || v === "path" ? v : "follow";
  }

  get newCwdPath(): string {
    return typeof this.raw.newCwdPath === "string" ? this.raw.newCwdPath : "";
  }

  /**
   * 作成の要求に載せる形（web の `buildNewCwd` と同じ）。`sourcePaneId` は「引き継ぐ」のときだけ載せる（null なら載せない → サーバが以前と同じ場所で開く）。
   */
  newCwd(sourcePaneId: string | null): NewCwd {
    const policy = this.newCwdPolicy;
    switch (policy) {
      case "follow":
        return sourcePaneId === null ? { policy } : { policy, sourcePaneId };
      case "home":
      case "current":
        return { policy };
      case "path":
        return { policy, path: this.newCwdPath };
    }
  }

  /** 購読で求める行数（`auto` はサーバの上限。数ならサーバの上限以下）。 */
  scrollbackLines(serverLimit: number): number {
    const v = this.raw.scrollback;
    return typeof v === "number" && Number.isInteger(v) && v >= 0
      ? Math.min(v, serverLimit)
      : serverLimit;
  }

  private emit(): void {
    for (const cb of [...this.listeners]) cb();
  }
}
