import {
  errorCodeOf,
  clientErrorMessage,
  type KeyInput,
  type TerminalSinkPort,
} from "@sodashitsu/client-core";
import {
  parsePopupDimension,
  POPUP_RUN_SIZE_MAX,
  POPUP_RUN_SIZE_MIN,
  type PopupDimension,
} from "@sodashitsu/protocol";
import type { UiState } from "../model/UiState.js";
import { encodeKey, encodePaste } from "../input/encode.js";
import { encodeMouse, type MouseTracking } from "../input/mouseEncode.js";

const NO_MODS = { shift: false, alt: false, ctrl: false, meta: false };
import type { Rect } from "../render/Screen.js";
import { ATTR } from "../render/color.js";
import { paintPane } from "../render/paintPane.js";
import { stringWidth, truncate } from "../render/width.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import { PaneTerminal } from "../term/PaneTerminal.js";
import type { CursorState } from "../render/Screen.js";
import {
  dialogColors,
  drawBox,
  inside,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";

export const POPUP_MIN_COLS = 10;
export const POPUP_MIN_ROWS = 3;

/** popup の大きさ（web の `term/popupSize.ts` の `popupCells` と同じ規則：省略は半分・% は割合・最小と使える広さの間・サーバの範囲）。 */
export function popupCells(
  width: PopupDimension | undefined,
  height: PopupDimension | undefined,
  area: { cols: number; rows: number },
): { cols: number; rows: number } {
  const one = (dim: PopupDimension | undefined, available: number, min: number): number => {
    const parsed = dim === undefined ? null : parsePopupDimension(dim);
    let v =
      parsed === null
        ? Math.floor(available / 2)
        : parsed.kind === "cells"
          ? parsed.value
          : Math.floor((available * parsed.value) / 100);
    v = Math.min(Math.max(v, min), available);
    return Math.min(POPUP_RUN_SIZE_MAX, Math.max(POPUP_RUN_SIZE_MIN, v));
  };
  return {
    cols: one(width, area.cols, POPUP_MIN_COLS),
    rows: one(height, area.rows, POPUP_MIN_ROWS),
  };
}

export interface CommandPopupDeps {
  ui: UiState;
  conn: RequestPort;
  sendInput(popupId: string, bytes: string | Uint8Array): void;
  attachExternal(id: string, sink: TerminalSinkPort): () => void;
  /** 使える広さ（pane の場所。外側の端末の桁・行）。 */
  area(): Rect;
  /** 開く前に閉じた知らせが届いていたか（`command.popup_closed` が `command.run` の返事より先に来たとき）。 */
  takeClosed(popupId: string): { closed: false } | { closed: true; exitCode: number | undefined };
  requestRender(): void;
}

/**
 * 独自コマンドの popup（web の `CommandPopup.vue`・`CommandPopupSession.ts`。herdr の popup の端末）。pane の場所の真ん中に浮いた端末を出し、
 * **開いている間は全てのキー（Esc・prefix を含む）を popup の端末へ送る**（herdr・web と同じ）。閉じるのはコマンドの終了（`command.popup_closed`）と
 * 見出しの「×」。外側を押しても閉じない。
 */
export class CommandPopup implements Overlay {
  private term: PaneTerminal | null = null;
  private popupId: string | null = null;
  private detach: (() => void) | null = null;
  private state: "starting" | "open" | "closed" = "starting";
  private abandoned = false;
  private rect: Rect | null = null;
  private closeButton: Rect | null = null;
  /** 端末を描いた場所（マウスの座標の元）。 */
  private content: Rect | null = null;

  constructor(
    private readonly ctx: {
      commandId: string;
      paneId: string;
      title: string;
      width?: PopupDimension;
      height?: PopupDimension;
    },
    private readonly deps: CommandPopupDeps,
  ) {
    void this.start();
  }

  private async start(): Promise<void> {
    const area = this.deps.area();
    const { cols, rows } = popupCells(this.ctx.width, this.ctx.height, {
      cols: Math.max(1, area.w - 4),
      rows: Math.max(1, area.h - 3),
    });
    let r;
    try {
      r = await this.deps.conn.request("command.run", {
        commandId: this.ctx.commandId,
        paneId: this.ctx.paneId,
        cols,
        rows,
      });
    } catch (err) {
      if (this.abandoned) return;
      const code = errorCodeOf(err);
      this.finish(undefined, code ? clientErrorMessage(code) : "popup を開けませんでした。");
      return;
    }
    if (r.type !== "popup") {
      if (!this.abandoned) this.finish(undefined, "popup を開けませんでした。");
      return;
    }
    // 閉じた後（切断・× で止めた）に返事が来たら開かずに止める。
    if (this.abandoned || this.finished) {
      void this.deps.conn
        .request("command.popup_close", { popupId: r.popupId })
        .catch(() => undefined);
      return;
    }
    const term = new PaneTerminal(r.popupId, r.cols, r.rows, 1000, () => this.deps.requestRender());
    this.term = term;
    this.popupId = r.popupId;
    this.detach = this.deps.attachExternal(r.popupId, {
      onOutput: (_id, chunk) => term.output(chunk),
      onSnapshot: (_id, c, rw, text) => term.snapshot(Math.max(1, c), Math.max(1, rw), text),
      onSizeChanged: (_id, c, rw) => term.resizeAfterWrites(Math.max(1, c), Math.max(1, rw)),
    });
    this.state = "open";
    void this.deps.conn
      .request("pane.subscribe", { paneId: r.popupId, scrollbackLines: 1000 })
      .catch(() => undefined); // 既に終わっていれば not_found——閉じた知らせが来る
    const early = this.deps.takeClosed(r.popupId);
    if (early.closed) this.onClosed(early.exitCode);
    this.deps.requestRender();
  }

  /** popup の id（閉じた知らせの照合）。 */
  get id(): string | null {
    return this.popupId;
  }

  /** コマンドが終わった（`command.popup_closed`）。 */
  onClosed(exitCode: number | undefined): void {
    this.teardown();
    this.finish(exitCode);
  }

  /** 接続が切れた。 */
  onDisconnected(): void {
    if (this.state === "closed") return;
    this.teardown();
    this.finish(undefined, "接続が切れたため popup を閉じました。");
  }

  handleKey(k: KeyInput): void {
    this.handleKeyEvent({ key: k, raw: "" });
  }

  /** 全てのキーを popup の端末へ（pane のモードに合わせて符号化）。 */
  handleKeyEvent(ev: { key: KeyInput; raw: string }): void {
    if (this.state !== "open" || !this.term || !this.popupId) return;
    const bytes = encodeKey(ev, this.term.modes);
    if (bytes !== "") this.deps.sendInput(this.popupId, bytes);
  }

  handlePaste(text: string): void {
    if (this.state !== "open" || !this.term || !this.popupId) return;
    this.deps.sendInput(this.popupId, encodePaste(text, this.term.modes));
  }

  handleMouse(ev: OverlayMouse): boolean {
    if (ev.action === "down" && ev.button === 0 && inside(this.closeButton, ev.x, ev.y)) {
      this.close();
      return true;
    }
    const term = this.term;
    const c = this.content;
    if (!term || !this.popupId || !c || !inside(c, ev.x, ev.y)) return true; // 外側を押しても閉じない（web と同じ）
    const col = ev.x - c.x;
    const row = ev.y - c.y;
    const tracking = term.modes.mouseTrackingMode as MouseTracking;
    // popup の中のプログラムがマウスを求めていれば、pane と同じ符号化で渡す（web の popup の xterm と同じ）。
    if (tracking !== "none") {
      const bytes = encodeMouse(
        { action: ev.action, button: ev.button, col, row, mods: NO_MODS },
        term.mouseEncoding,
        tracking,
      );
      if (bytes !== null) this.deps.sendInput(this.popupId, bytes);
      return true;
    }
    if (ev.action === "wheel" && (ev.button === 64 || ev.button === 65)) {
      if (term.term.buffer.active.type === "alternate") {
        // 代替画面（less・fzf 等）：矢印キーを 3 回（pane と同じ。DECCKM に従う）。
        const seq = `${term.modes.applicationCursorKeysMode ? "\x1bO" : "\x1b["}${ev.button === 65 ? "B" : "A"}`;
        this.deps.sendInput(this.popupId, seq.repeat(3));
      } else {
        term.term.scrollLines(ev.button === 65 ? 3 : -3);
        this.deps.requestRender();
      }
    }
    return true;
  }

  /** 見出しの「×」：コマンドを止めて閉じる。 */
  close(): void {
    if (this.state === "starting") {
      this.abandoned = true;
      this.finish();
      return;
    }
    const id = this.popupId;
    this.teardown();
    if (id)
      void this.deps.conn.request("command.popup_close", { popupId: id }).catch(() => undefined);
    this.finish();
  }

  /** 別のダイアログに置き換わった（まだ閉じていなければコマンドを止める）。 */
  dispose(): void {
    if (!this.finished) this.close();
  }

  cancel(): void {
    // Esc も popup へ送るので、ここへは来ない（OverlayHost の外側の押下の取り消しは handleMouse が止める）。
  }

  private teardown(): void {
    this.state = "closed";
    this.detach?.();
    this.detach = null;
    this.term?.dispose();
    this.term = null;
  }

  private finished = false;

  private finish(exitCode?: number, message?: string): void {
    if (this.finished) return;
    this.finished = true;
    this.state = "closed";
    if (this.deps.ui.dialogContext?.kind === "commandPopup") this.deps.ui.closeDialog();
    if (message) this.deps.ui.toast(message);
    else if (exitCode !== undefined && exitCode !== 0)
      this.deps.ui.toast(`「${this.ctx.title}」が終了コード ${exitCode} で終わりました。`);
  }

  render({ grid, theme }: OverlayRenderContext): CursorState | null {
    const c = dialogColors(theme);
    const area = this.deps.area();
    const term = this.term;
    const cols = term?.cols ?? 20;
    const rows = term?.rows ?? 3;
    const w = Math.min(area.w, cols + 4);
    const h = Math.min(area.h, rows + 2);
    const r: Rect = {
      x: area.x + Math.max(0, Math.floor((area.w - w) / 2)),
      y: area.y + Math.max(0, Math.floor((area.h - h) / 2)),
      w,
      h,
    };
    this.rect = r;
    const inner = drawBox(grid, r, c, truncate(this.ctx.title, Math.max(0, w - 12)));
    const label = "[×]";
    const bx = r.x + r.w - 2 - stringWidth(label);
    grid.text(bx, r.y, label, c.accentFg, c.accent, ATTR.bold);
    this.closeButton = { x: bx, y: r.y, w: stringWidth(label), h: 1 };
    if (!term) {
      grid.text(inner.x, inner.y, "開いています…", c.dim, c.bg);
      return null;
    }
    const content: Rect = {
      x: inner.x,
      y: inner.y,
      w: Math.min(inner.w, cols),
      h: Math.min(inner.h, rows),
    };
    this.content = content;
    return paintPane(grid, term, content, theme);
  }
}
