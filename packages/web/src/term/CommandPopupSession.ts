import type { ConnectionPort, TerminalSinkPort } from "../net/ports.js";
import { errorCodeOf } from "../net/clientError.js";

/** popup の端末に要る xterm.js の部分（テストで偽物を渡す）。 */
export interface PopupTerminalLike {
  write(data: string | Uint8Array): void;
  resize(cols: number, rows: number): void;
  onData(listener: (data: string) => void): { dispose(): void };
}

export type PopupStartResult =
  | { ok: true; popupId: string }
  | { ok: false; code: string | null }
  | { ok: false; abandoned: true };

/**
 * 独自コマンドの popup の 1 回分（20260927-custom-command-keys。architecture の状態図）。Vue に依存しない。
 *
 * starting（`command.run` の応答待ち）→ open（購読し、端末の入力を popup の id で送る）→ closed。starting の間に閉じられたら（閉じるボタン・unmount・
 * 切断）控えて、後から成功の応答が来たら表示せずに `command.popup_close` を送る（サーバに popup を残さない。残すと同じ接続の次の popup が断られる）。
 * **送るのは id・pane の id・大きさだけ**（コマンドの文字列は送らない）。
 */
export class CommandPopupSession {
  private state: "idle" | "starting" | "open" | "closed" = "idle";
  private abandoned = false;
  private popupId: string | null = null;
  private detachSink: (() => void) | null = null;
  private dataSub: { dispose(): void } | null = null;

  constructor(
    private readonly deps: {
      conn: ConnectionPort;
      registry: { attachExternal(paneId: string, sink: TerminalSinkPort): () => void };
      term: PopupTerminalLike;
      /** 購読で求める scrollback の行数。 */
      scrollbackLines?: number;
    },
  ) {}

  get id(): string | null {
    return this.popupId;
  }

  get isOpen(): boolean {
    return this.state === "open";
  }

  async start(
    commandId: string,
    paneId: string,
    cols: number,
    rows: number,
  ): Promise<PopupStartResult> {
    if (this.state !== "idle") return { ok: false, code: null };
    this.state = "starting";
    let r;
    try {
      r = await this.deps.conn.request("command.run", { commandId, paneId, cols, rows });
    } catch (err) {
      this.state = "closed";
      return this.abandoned
        ? { ok: false, abandoned: true }
        : { ok: false, code: errorCodeOf(err) };
    }
    if (r.type !== "popup") {
      this.state = "closed";
      return { ok: false, code: null };
    }
    if (this.abandoned) {
      this.state = "closed";
      void this.deps.conn
        .request("command.popup_close", { popupId: r.popupId })
        .catch(() => undefined);
      return { ok: false, abandoned: true };
    }
    this.popupId = r.popupId;
    const term = this.deps.term;
    const sink: TerminalSinkPort = {
      onOutput: (_id, chunk) => term.write(chunk),
      // SNAPSHOT：大きさを合わせ、書き込みの列の中で消してから書き直す（`TerminalRegistry.onSnapshot` と同じ理由）。
      onSnapshot: (_id, c, rw, text) => {
        term.resize(Math.max(1, c), Math.max(1, rw));
        term.write(`\x1bc${text}`);
      },
      onSizeChanged: (_id, c, rw) => term.resize(Math.max(1, c), Math.max(1, rw)),
    };
    this.detachSink = this.deps.registry.attachExternal(r.popupId, sink);
    const popupId = r.popupId;
    this.dataSub = term.onData((data) => this.deps.conn.sendInput(popupId, data));
    this.state = "open";
    void this.deps.conn
      .request("pane.subscribe", {
        paneId: popupId,
        scrollbackLines: this.deps.scrollbackLines ?? 1000,
      })
      .catch(() => undefined); // 既に終わっていれば not_found——閉じた知らせが来る
    return { ok: true, popupId };
  }

  /** 閉じるボタン・unmount：開いていれば `command.popup_close` を送る（応答は待たない）。starting なら控える。 */
  close(): void {
    if (this.state === "starting") {
      this.abandoned = true;
      return;
    }
    if (this.state !== "open") return;
    const id = this.popupId!;
    this.teardown();
    void this.deps.conn.request("command.popup_close", { popupId: id }).catch(() => undefined);
  }

  /** サーバが閉じた（コマンドの終わり・停止）・接続が切れた：要求を送らずに後始末だけ。starting なら控える（切断では応答も来ない）。 */
  closeLocal(): void {
    if (this.state === "starting") {
      this.abandoned = true;
      return;
    }
    if (this.state === "open") this.teardown();
  }

  private teardown(): void {
    this.state = "closed";
    this.dataSub?.dispose();
    this.dataSub = null;
    this.detachSink?.();
    this.detachSink = null;
  }
}
