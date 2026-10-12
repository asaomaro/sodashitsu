import type { PluginCandidate } from "@sodashitsu/protocol";
import type { KeyInput } from "@sodashitsu/client-core";
import type { UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import {
  centeredRect,
  dialogColors,
  drawBox,
  hiddenCursor,
  isEsc,
  isEnter,
  isUp,
  isDown,
  inside,
  wrapText,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";
import type { Rect } from "../render/Screen.js";
import { safeText } from "./document.js";
export class PluginPackages implements Overlay {
  private candidates: PluginCandidate[] = [];
  private selected = 0;
  private review = false;
  private scroll = 0;
  private viewedEnd = false;
  private canApprove = false;
  private busy = true;
  private error = "";
  private dead = false;
  private rect: Rect | null = null;
  private hits = new Map<number, number>();
  constructor(
    private ui: UiState,
    private conn: RequestPort,
    private redraw: () => void,
  ) {
    void this.refresh();
  }
  private async refresh() {
    this.busy = true;
    try {
      const result = await this.conn.request("plugin.discover", {});
      if (!this.dead) {
        this.candidates = result.candidates;
        this.selected = Math.min(this.selected, Math.max(0, this.candidates.length - 1));
        this.error = "";
      }
    } catch {
      if (!this.dead) this.error = "パッケージを取得できません";
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  private async register() {
    const c = this.candidates[this.selected];
    if (!c || this.busy || !this.canApprove) return;
    this.busy = true;
    try {
      await this.conn.request("plugin.register", { key: c.key, digest: c.digest });
      if (!this.dead) {
        this.review = false;
        await this.refresh();
        this.ui.toast("プラグインを登録・有効化しました");
      }
    } catch (e) {
      if (!this.dead) this.error = e instanceof Error ? e.message : String(e);
    } finally {
      this.busy = false;
      if (!this.dead) this.redraw();
    }
  }
  handleKey(k: KeyInput) {
    if (isEsc(k)) {
      if (this.review && !this.busy) this.review = false;
      else if (!this.busy) this.cancel();
      return;
    }
    if (this.busy) return;
    if (this.review && (isUp(k) || isDown(k))) {
      this.scroll = Math.max(0, this.scroll + (isUp(k) ? -1 : 1));
      return;
    }
    if (isUp(k) && !this.review) this.selected = Math.max(0, this.selected - 1);
    else if (isDown(k) && !this.review)
      this.selected = Math.min(this.candidates.length - 1, this.selected + 1);
    else if (isEnter(k)) {
      if (this.review) void this.register();
      else if (this.candidates[this.selected]) {
        this.review = true;
        this.scroll = 0;
        this.viewedEnd = false;
        this.canApprove = false;
      }
    } else if (k.key === "r" && !this.review) void this.refresh();
  }
  handleMouse(e: OverlayMouse) {
    if (!inside(this.rect, e.x, e.y)) return false;
    if (!this.busy && e.action === "down" && e.button === 0) {
      const index = this.hits.get(e.y);
      if (index !== undefined) {
        this.selected = index;
        this.review = true;
        this.scroll = 0;
        this.viewedEnd = false;
        this.canApprove = false;
      }
    }
    return true;
  }
  render({ grid, theme }: OverlayRenderContext) {
    const c = dialogColors(theme),
      r = centeredRect(grid, Math.min(90, grid.w - 2), Math.min(24, grid.h - 2)),
      a = drawBox(grid, r, c, "プラグインパッケージ");
    this.rect = r;
    this.hits.clear();
    const candidate = this.candidates[this.selected];
    const lines =
      this.review && candidate
        ? [
            `${candidate.name} ${candidate.version}`,
            candidate.description,
            `配置元: ${candidate.path}`,
            `範囲: ${candidate.scope === "user" ? "ユーザー全体" : candidate.root}`,
            `権限: ${candidate.allow.join(", ") || "追加権限なし"}`,
            `ファイル: ${candidate.files}`,
            `検証値: ${candidate.digest}`,
            "",
            "OSの利用者の権限でプログラムを起動します。",
            "Enter: 許可して登録・有効化 / Esc: キャンセル",
          ]
        : this.candidates.map(
            (p, i) =>
              `${i === this.selected ? "▶" : " "} ${p.name} ${p.version} · ${p.scope === "user" ? "ユーザー" : "PJ"}`,
          );
    if (this.review) {
      const wrapped = lines.flatMap((line) => wrapText(safeText(line), Math.max(1, a.w))),
        height = Math.max(0, a.h - 2);
      this.scroll = Math.min(this.scroll, Math.max(0, wrapped.length - height));
      this.viewedEnd ||= this.scroll + height >= wrapped.length;
      this.canApprove = a.w >= 40 && a.h >= 8 && this.viewedEnd;
      grid.text(a.x, a.y, this.busy ? "処理中…" : this.error, c.warn, c.bg, 0, a.w);
      wrapped
        .slice(this.scroll, this.scroll + height)
        .forEach((line, i) => grid.text(a.x, a.y + i + 1, line, c.fg, c.bg, 0, a.w));
      grid.text(
        a.x,
        a.y + a.h - 1,
        this.canApprove
          ? "Enter 許可して登録 / ↑↓ 確認 / Esc 取消"
          : a.w < 40 || a.h < 8
            ? "画面を広げて確認してください"
            : "↑↓ 内容を最後まで確認 / Esc 取消",
        c.fg,
        c.bg,
        0,
        a.w,
      );
      return hiddenCursor();
    }
    const start = this.review ? 0 : Math.max(0, this.selected - Math.max(1, a.h - 3) + 1);
    grid.text(a.x, a.y, this.busy ? "処理中…" : this.error, c.warn, c.bg, 0, a.w);
    lines.slice(start, start + a.h - 2).forEach((line, i) => {
      grid.text(a.x, a.y + i + 1, safeText(line), c.fg, c.bg, 0, a.w);
      if (!this.review) this.hits.set(a.y + i + 1, start + i);
    });
    if (!lines.length)
      grid.text(a.x, a.y + 1, "未登録のパッケージはありません", c.fg, c.bg, 0, a.w);
    if (!this.review)
      grid.text(
        a.x,
        a.y + a.h - 1,
        "↑↓ 選択 · Enter 確認 · r 再検索 · Esc 閉じる",
        c.fg,
        c.bg,
        0,
        a.w,
      );
    return hiddenCursor();
  }
  cancel() {
    this.ui.closeDialog();
  }
  dispose() {
    this.dead = true;
  }
}
