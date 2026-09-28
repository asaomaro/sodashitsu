import type { MethodName, ParamsOf, ResultOf } from "@sodashitsu/protocol";
import type { TerminalSinkPort } from "@sodashitsu/client-core";
import { PaneTerminal } from "./PaneTerminal.js";

export interface RequestPort {
  request<M extends MethodName>(method: M, params: ParamsOf<M>): Promise<ResultOf<M>>;
}

export interface VisiblePane {
  paneId: string;
  /** 申告する大きさ（自分の割り付けの中身の大きさ）。 */
  cols: number;
  rows: number;
}

export interface ViewCommit {
  workspaceId: string;
  tabId: string;
  visible: VisiblePane[];
}

/**
 * 見えている pane の headless と購読の管理（20260927-cli-mode の tasks T3。web の `term/ViewSync.ts`＋`TerminalRegistry.ts` の役）。
 * - `client.view`（表示と大きさ）→ まだ購読していない見えている pane の `pane.subscribe` の順に送る（サーバは大きさを決めてから SNAPSHOT を取る。
 *   `request` は呼んだ時点で同期的に送るので、応答を待たずに続けて呼べば順序は保たれる）。同じ内容の `client.view` は送り直さない。
 * - 見えなくなった pane は購読を外して headless を捨てる（次に見えたときに SNAPSHOT で取り直す。research F1.3 の選択肢）。
 * - 接続が替わるたびに（新しい clientId は前の購読・表示を持たない）表示と購読を張り直す。閉じてから次の hello までは何も送らない（web の D107 と同じ）。
 */
export class PaneRegistry implements TerminalSinkPort {
  private readonly terms = new Map<string, PaneTerminal>();
  private readonly subscribed = new Set<string>();
  private ready = false;
  private lastView = "";
  private current: ViewCommit | null = null;

  constructor(
    private readonly conn: RequestPort,
    private readonly scrollbackLines: () => number,
    private readonly onDirty: (paneId: string) => void,
  ) {}

  get(paneId: string): PaneTerminal | undefined {
    return this.terms.get(paneId);
  }

  isSubscribed(paneId: string): boolean {
    return this.subscribed.has(paneId);
  }

  // --- TerminalSinkPort ---

  onOutput(paneId: string, chunk: Uint8Array): void {
    const ext = this.externals.get(paneId);
    if (ext) ext.onOutput(paneId, chunk);
    else this.terms.get(paneId)?.output(chunk);
  }

  onSnapshot(paneId: string, cols: number, rows: number, text: string): void {
    const ext = this.externals.get(paneId);
    if (ext) ext.onSnapshot(paneId, cols, rows, text);
    else this.terms.get(paneId)?.snapshot(cols, rows, text);
  }

  onSizeChanged(paneId: string, cols: number, rows: number): void {
    const ext = this.externals.get(paneId);
    if (ext) ext.onSizeChanged(paneId, cols, rows);
    else this.terms.get(paneId)?.resizeAfterWrites(cols, rows);
  }

  /** 表示の割り付けの外の端末（独自コマンドの popup）の出力の受け先（web の `TerminalRegistry.attachExternal`）。外す関数を返す。 */
  private readonly externals = new Map<string, TerminalSinkPort>();
  attachExternal(id: string, sink: TerminalSinkPort): () => void {
    this.externals.set(id, sink);
    return () => {
      if (this.externals.get(id) === sink) this.externals.delete(id);
    };
  }

  // --- 接続 ---

  connectionOpened(): void {
    this.ready = true;
    this.lastView = "";
    this.subscribed.clear();
    if (this.current) this.commit(this.current, () => undefined);
  }

  connectionClosed(): void {
    this.ready = false;
  }

  /**
   * 今の表示を確定する。`sizeOf(paneId)` は headless を新しく作るときの大きさ（サーバの pane の大きさ。SNAPSHOT で合わせ直る）。
   */
  commit(
    view: ViewCommit,
    sizeOf: (paneId: string) => { cols: number; rows: number } | undefined,
  ): void {
    this.current = view;
    const visibleIds = new Set(view.visible.map((v) => v.paneId));
    for (const v of view.visible) {
      if (!this.terms.has(v.paneId)) {
        const size = sizeOf(v.paneId) ?? { cols: v.cols, rows: v.rows };
        this.terms.set(
          v.paneId,
          new PaneTerminal(v.paneId, size.cols, size.rows, this.scrollbackLines(), this.onDirty),
        );
      }
    }
    if (this.ready) {
      const serialized = JSON.stringify(view);
      if (serialized !== this.lastView) {
        this.lastView = serialized;
        void this.conn.request("client.view", view).catch(() => undefined);
      }
      for (const v of view.visible) {
        if (this.subscribed.has(v.paneId)) continue;
        this.subscribed.add(v.paneId);
        void this.conn
          .request("pane.subscribe", {
            paneId: v.paneId,
            scrollbackLines: this.terms.get(v.paneId)?.scrollback ?? this.scrollbackLines(),
          })
          .catch(() => {
            // 購読に失敗した（閉じた pane・切断）。次の commit でやり直せるよう印を外す。
            this.subscribed.delete(v.paneId);
          });
      }
      for (const paneId of [...this.subscribed]) {
        if (visibleIds.has(paneId)) continue;
        this.subscribed.delete(paneId);
        void this.conn.request("pane.unsubscribe", { paneId }).catch(() => undefined);
      }
    }
    for (const [paneId, term] of [...this.terms]) {
      if (visibleIds.has(paneId) || this.subscribed.has(paneId)) continue;
      term.dispose();
      this.terms.delete(paneId);
    }
  }

  /** pane が閉じた（サーバが購読も外している）。 */
  paneClosed(paneId: string): void {
    this.subscribed.delete(paneId);
    this.terms.get(paneId)?.dispose();
    this.terms.delete(paneId);
  }

  /** マシンを切り替える：headless を全部捨て、表示の申告もやり直す（新しい行き先の pane は別物）。 */
  reset(): void {
    this.dispose();
    this.current = null;
    this.lastView = "";
    this.ready = false;
  }

  dispose(): void {
    for (const term of this.terms.values()) term.dispose();
    this.terms.clear();
    this.subscribed.clear();
  }
}
