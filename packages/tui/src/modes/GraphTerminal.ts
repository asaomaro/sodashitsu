import {
  errorCodeOf,
  clientErrorMessage,
  paneNameOf,
  type KeyInput,
  type TerminalSinkPort,
} from "@sodashitsu/client-core";
import { clampTerminalSize } from "@sodashitsu/protocol";
import type { SessionModel } from "../model/SessionModel.js";
import type { UiState } from "../model/UiState.js";
import type { RequestPort } from "../term/PaneRegistry.js";
import { PaneTerminal } from "../term/PaneTerminal.js";
import { encodeKey, encodePaste } from "../input/encode.js";
import { encodeMouse, type MouseTracking } from "../input/mouseEncode.js";
import { paintPane } from "../render/paintPane.js";
import type { Rect } from "../render/Screen.js";
import { safeText } from "./document.js";
import {
  dialogColors,
  drawBox,
  drawButtons,
  hiddenCursor,
  inside,
  type Overlay,
  type OverlayMouse,
  type OverlayRenderContext,
} from "./overlay.js";

// A rapidly reopened window must wait for its predecessor's detach/unsubscribe.
const leases = new WeakMap<RequestPort, Map<string, Promise<void>>>();
export interface GraphTerminalDeps {
  ui: UiState;
  model: SessionModel;
  conn: RequestPort;
  attachExternal(id: string, sink: TerminalSinkPort): () => void;
  sendInput(id: string, bytes: string | Uint8Array): void;
  redraw(): void;
  focus(id: string): void;
}
/** Live terminal for an existing graph node. Closing never terminates the pane. */
export class GraphTerminal implements Overlay {
  private term: PaneTerminal | null = null;
  private detachSink: (() => void) | null = null;
  private attached = false;
  private closed = false;
  private starting = false;
  private failed = "";
  private content: Rect | null = null;
  private buttons: Rect[] = [];
  private size = "";
  private work: Promise<void> = Promise.resolve();
  private release: (() => void) | null = null;
  constructor(
    readonly paneId: string,
    private readonly deps: GraphTerminalDeps,
  ) {}
  private start(cols: number, rows: number) {
    this.starting = true;
    let map = leases.get(this.deps.conn);
    if (!map) leases.set(this.deps.conn, (map = new Map()));
    const previous = map.get(this.paneId) ?? Promise.resolve();
    const lifetime = new Promise<void>((resolve) => (this.release = resolve));
    map.set(this.paneId, lifetime);
    void lifetime.then(() => {
      if (map!.get(this.paneId) === lifetime) map!.delete(this.paneId);
    });
    this.work = previous.then(async () => {
      if (this.closed) return;
      const term = new PaneTerminal(this.paneId, cols, rows, 2000, () => this.deps.redraw());
      this.term = term;
      this.detachSink = this.deps.attachExternal(this.paneId, {
        onOutput: (_, chunk) => term.output(chunk),
        onSnapshot: (_, c, r, text) => term.snapshot(c, r, text),
        onSizeChanged: (_, c, r) => term.resizeAfterWrites(c, r),
      });
      try {
        await this.deps.conn.request("pane.attach", { paneId: this.paneId, cols, rows });
        this.attached = true;
        if (!this.closed)
          await this.deps.conn.request("pane.subscribe", {
            paneId: this.paneId,
            scrollbackLines: 2000,
          });
      } catch (err) {
        if (!this.closed) {
          const code = errorCodeOf(err);
          this.failed = code ? clientErrorMessage(code) : "端末を開けませんでした";
          this.deps.redraw();
        }
      }
      this.deps.redraw();
    });
  }
  private resize(cols: number, rows: number) {
    const size = `${cols}:${rows}`;
    if (size === this.size) return;
    this.size = size;
    if (!this.starting) this.start(cols, rows);
    else
      this.work = this.work.then(async () => {
        if (this.closed || !this.attached || this.failed) return;
        try {
          await this.deps.conn.request("pane.attach_resize", { paneId: this.paneId, cols, rows });
        } catch {
          this.onLost();
        }
      });
  }
  onAttachChanged(clientId: string | null) {
    if (
      !this.closed &&
      clientId !== this.deps.model.clientId &&
      (this.attached || clientId !== null)
    )
      this.onLost();
  }
  onLost() {
    if (this.closed) return;
    this.deps.ui.toast("端末への接続が終了したため窓を閉じました");
    this.cancel();
  }
  handleKey(k: KeyInput) {
    this.handleKeyEvent({ key: k, raw: "" });
  }
  handleKeyEvent(ev: { key: KeyInput; raw: string }) {
    if (ev.key.key === "Escape" && ev.key.alt) {
      this.cancel();
      return;
    }
    if (ev.key.key === "Enter" && ev.key.ctrl) {
      this.go();
      return;
    }
    if (!this.closed && this.attached && !this.failed && this.term) {
      const bytes = encodeKey(ev, this.term.modes);
      if (bytes) this.deps.sendInput(this.paneId, bytes);
    }
  }
  handlePaste(text: string) {
    if (!this.closed && this.attached && !this.failed && this.term)
      this.deps.sendInput(this.paneId, encodePaste(text, this.term.modes));
  }
  handleMouse(ev: OverlayMouse) {
    if (ev.action === "down" && ev.button === 0) {
      if (inside(this.buttons[0] ?? null, ev.x, ev.y)) {
        this.go();
        return true;
      }
      if (inside(this.buttons[1] ?? null, ev.x, ev.y)) {
        this.cancel();
        return true;
      }
    }
    if (
      !inside(this.content, ev.x, ev.y) ||
      !this.term ||
      !this.attached ||
      this.closed ||
      this.failed
    )
      return true;
    const tracking = this.term.modes.mouseTrackingMode as MouseTracking;
    if (tracking !== "none") {
      const bytes = encodeMouse(
        {
          action: ev.action,
          button: ev.button,
          col: ev.x - this.content!.x,
          row: ev.y - this.content!.y,
          mods: { shift: false, alt: false, ctrl: false, meta: false },
        },
        this.term.mouseEncoding,
        tracking,
      );
      if (bytes !== null) this.deps.sendInput(this.paneId, bytes);
    } else if (ev.action === "wheel") {
      if (this.term.term.buffer.active.type === "alternate") {
        const prefix = this.term.modes.applicationCursorKeysMode ? "\x1bO" : "\x1b[";
        this.deps.sendInput(this.paneId, (prefix + (ev.button === 65 ? "B" : "A")).repeat(3));
      } else {
        this.term.term.scrollLines(ev.button === 65 ? 3 : -3);
        this.deps.redraw();
      }
    }
    return true;
  }
  private go() {
    if (this.closed) return;
    const id = this.paneId;
    const context = this.deps.ui.dialogContext;
    this.dispose();
    void this.work.then(() => {
      if (this.deps.ui.dialogContext !== context || context?.kind !== "graphTerminal") return;
      this.deps.ui.closeDialog();
      this.deps.ui.setScreen("base");
      this.deps.focus(id);
    });
  }
  cancel() {
    this.dispose();
    if (
      this.deps.ui.dialogContext?.kind === "graphTerminal" &&
      this.deps.ui.dialogContext.paneId === this.paneId
    )
      this.deps.ui.closeDialog();
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.detachSink?.();
    this.detachSink = null;
    this.term?.dispose();
    this.term = null;
    this.work = this.work
      .then(async () => {
        this.detachSink?.();
        this.detachSink = null;
        this.term?.dispose();
        this.term = null;
        if (this.attached) {
          await this.deps.conn
            .request("pane.detach", { paneId: this.paneId })
            .catch(() => undefined);
          await this.deps.conn
            .request("pane.unsubscribe", { paneId: this.paneId })
            .catch(() => undefined);
        }
      })
      .finally(() => this.release?.());
  }
  render({ grid, theme }: OverlayRenderContext) {
    const pane = this.deps.model.panes.get(this.paneId);
    if (!pane) {
      this.cancel();
      return hiddenCursor();
    }
    const c = dialogColors(theme);
    const area = drawBox(
      grid,
      { x: 1, y: 1, w: Math.max(1, grid.w - 2), h: Math.max(1, grid.h - 2) },
      c,
      "端末 · " + safeText(paneNameOf(pane)),
    );
    const stacked = area.w < 26;
    this.content = { ...area, h: Math.max(1, area.h - (stacked ? 3 : 2)) };
    const size = clampTerminalSize(this.content.w, this.content.h);
    this.resize(size.cols, size.rows);
    this.buttons = stacked
      ? [
          ...drawButtons(grid, area.x, area.y + area.h - 2, ["端末へ移動"], -1, c),
          ...drawButtons(grid, area.x, area.y + area.h - 1, ["閉じる"], -1, c),
        ]
      : drawButtons(grid, area.x, area.y + area.h - 1, ["端末へ移動", "閉じる"], -1, c);
    if (this.failed || !this.attached || !this.term) {
      grid.text(area.x, area.y, this.failed || "接続中…", c.fg, c.bg, 0, area.w);
      return hiddenCursor();
    }
    return paintPane(grid, this.term, this.content, theme.solid);
  }
}
