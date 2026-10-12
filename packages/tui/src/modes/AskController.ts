import type { AskPending, ServerEvent } from "@sodashitsu/protocol";
import type { RequestPort } from "../term/PaneRegistry.js";
import type { SessionModel } from "../model/SessionModel.js";
import { paneNameOf, errorCodeOf } from "@sodashitsu/client-core";
import { AskFormDialog } from "./AskFormDialog.js";
import { WindowOverlay } from "./WindowOverlay.js";
/** 認証済みの画面として購読し、他の画面で回答された質問も閉じる。 */
export class TuiAskController {
  private generation = 0;
  private asks = new Map<string, AskPending>();
  private closed = new Set<string>();
  private current: { id: string; window: WindowOverlay } | null = null;
  constructor(
    private conn: RequestPort,
    private model: SessionModel,
    private redraw: () => void,
    private onShow: () => void = () => {},
  ) {}
  onOpened() {
    const g = ++this.generation;
    this.closed.clear();
    void this.conn
      .request("ask.subscribe", { renderer: "terminal" })
      .then((r) => {
        if (g !== this.generation) return;
        for (const a of r.asks) this.add(a);
      })
      .catch(() => {});
  }
  private add(ask: AskPending) {
    if (this.closed.has(ask.askId) || ask.media?.length || ask.view?.length) return;
    if (this.asks.size === 0) this.onShow();
    this.asks.set(ask.askId, ask);
    this.redraw();
  }
  onEvent(e: ServerEvent) {
    if (e.event === "ask.closed") {
      this.remove(e.data.askId);
      return;
    }
    if (e.event !== "ask.opened") return;
    const g = this.generation;
    void this.conn
      .request("ask.get", { askId: e.data.askId })
      .then((a) => {
        if (g === this.generation) this.add(a);
      })
      .catch(() => {});
  }
  private remove(id: string) {
    this.closed.add(id);
    this.asks.delete(id);
    if (this.current?.id === id) {
      this.current.window.dispose();
      this.current = null;
    }
    this.redraw();
  }
  reset() {
    this.generation++;
    this.asks.clear();
    this.closed.clear();
    this.current?.window.dispose();
    this.current = null;
    this.redraw();
  }
  get window() {
    const ask = this.asks.values().next().value as AskPending | undefined;
    if (!ask) return null;
    if (this.current?.id === ask.askId) return this.current.window;
    const pane = this.model.panes.get(ask.paneId),
      g = this.generation;
    const finish = async (method: "ask.answer" | "ask.cancel", body?: unknown) => {
      try {
        await this.conn.request(method, {
          askId: ask.askId,
          ...(body ? (body as object) : {}),
        } as never);
      } catch (e) {
        if (errorCodeOf(e) !== "ask_closed") throw e;
      }
      if (g === this.generation) this.remove(ask.askId);
    };
    const inner = new AskFormDialog(
      ask,
      "プログラムからの質問: " + (pane ? paneNameOf(pane) : ask.paneId.slice(0, 8)),
      (body) => {
        const { visible, lacking, ...answer } = body;
        return finish("ask.answer", answer);
      },
      () => finish("ask.cancel"),
      this.redraw,
    );
    this.current = {
      id: ask.askId,
      window: new WindowOverlay(inner, { w: 100, h: 30 }, undefined, { maximize: true }),
    };
    return this.current.window;
  }
}
