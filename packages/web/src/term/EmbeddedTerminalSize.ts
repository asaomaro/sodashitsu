import type { ServerEvent } from "@sodashitsu/protocol";
import type { AuxiliaryConnection } from "@sodashitsu/client-core";
/** One PTY has one grid. Never steal another attachment; closing the private connection restores it. */
export class EmbeddedTerminalSize {
  private connection: AuxiliaryConnection | undefined;
  private size: { cols: number; rows: number } | undefined;
  private ready = false;
  private attached = false;
  private busy = false;
  private dirty = false;
  private generation = 0;
  private closed = false;
  private blocked = false;
  private releases = 0;
  constructor(
    private paneId: string,
    create: (
      state: (ready: boolean) => void,
      event: (event: ServerEvent) => void,
    ) => AuxiliaryConnection | undefined,
    private failed: (failed: boolean) => void,
  ) {
    this.connection = create(
      (ready) => {
        if (this.closed) return;
        this.blocked = false;
        this.ready = ready;
        this.attached = false;
        this.busy = false;
        this.generation++;
        this.dirty = true;
        if (ready) void this.flush();
      },
      (event) => {
        if (
          this.closed ||
          event.event !== "pane.attach_changed" ||
          event.data.paneId !== this.paneId ||
          event.data.clientId !== null
        )
          return;
        this.releases++;
        this.blocked = false;
        this.dirty = true;
        this.attached = false;
        void this.flush();
      },
    );
    this.connection?.connect();
  }
  resize(cols: number, rows: number) {
    if (this.closed || (this.size?.cols === cols && this.size.rows === rows)) return;
    this.size = { cols, rows };
    this.dirty = true;
    void this.flush();
  }
  private async flush() {
    if (
      this.closed ||
      !this.ready ||
      this.blocked ||
      !this.connection ||
      !this.size ||
      this.busy ||
      !this.dirty
    )
      return;
    this.busy = true;
    this.dirty = false;
    const gen = this.generation,
      releases = this.releases,
      size = this.size;
    try {
      if (this.attached)
        await this.connection.request("pane.attach_resize", { paneId: this.paneId, ...size });
      else await this.connection.request("pane.attach", { paneId: this.paneId, ...size });
      if (this.closed || gen !== this.generation) return;
      this.attached = releases === this.releases;
      if (!this.attached) this.dirty = true;
      this.failed(false);
    } catch {
      if (this.closed || gen !== this.generation) return;
      this.failed(true);
      // Retry only after an ownership-release event (including a release racing this response).
      this.blocked = releases === this.releases;
      if (!this.blocked) this.dirty = true;
    } finally {
      if (gen === this.generation) {
        this.busy = false;
        if (this.dirty) void this.flush();
      }
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.generation++;
    this.connection?.dispose();
  }
}
