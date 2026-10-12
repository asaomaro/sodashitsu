import type { DisplayInfo, ServerEvent } from "@sodashitsu/protocol";
import { DISPLAY_CONTENT_MAX_BYTES, DISPLAY_GET_CHUNK_BYTES } from "@sodashitsu/protocol";
import type { RequestPort } from "../term/PaneRegistry.js";

/** 接続ごとのdisplay台帳。本文は表示するときだけ取り、版を跨いで混ぜない。 */
export class DisplayModel {
  infos = new Map<string, DisplayInfo>();
  connected = false;
  ready = false;
  private generation = 0;
  private changes = 0;
  constructor(
    private readonly conn: RequestPort,
    private readonly redraw: () => void,
    private readonly added: (info: DisplayInfo) => void,
  ) {}
  async connect() {
    const generation = ++this.generation;
    this.connected = true;
    this.ready = false;
    const changes = this.changes;
    try {
      const r = await this.conn.request("display.subscribe", {
        features: ["panel", "band", "actions", "float"],
      });
      if (generation !== this.generation) return;
      // 応答より新しいイベントが届いていた場合はもう一度完全な台帳を取り直す。
      if (changes !== this.changes) {
        void this.connect();
        return;
      }
      this.infos = new Map(r.displays.map((d) => [d.id, d]));
      this.ready = true;
      this.redraw();
    } catch {
      if (generation === this.generation) this.disconnect();
    }
  }
  disconnect() {
    this.connected = false;
    this.ready = false;
    this.generation++;
    this.infos.clear();
    this.redraw();
  }
  apply(e: ServerEvent) {
    if (!this.connected) return;
    if (e.event === "display.updated") {
      this.changes++;
      const fresh = !this.infos.has(e.data.display.id);
      this.infos.set(e.data.display.id, e.data.display);
      this.redraw();
      if (fresh) this.added(e.data.display);
    } else if (e.event === "display.removed") {
      this.changes++;
      this.infos.delete(e.data.id);
      this.redraw();
    }
  }
  async content(id: string): Promise<{ info: DisplayInfo; text: string } | null> {
    const generation = this.generation;
    const info = this.infos.get(id);
    if (!info || !this.connected) return null;
    const chunks: Buffer[] = [];
    let bytes = 0;
    for (let offset = 0; ; offset += DISPLAY_GET_CHUNK_BYTES) {
      const part = await this.conn.request("display.get", { id, offset });
      if (
        generation !== this.generation ||
        this.infos.get(id)?.rev !== info.rev ||
        part.rev !== info.rev
      )
        return null;
      if (
        part.offset !== offset ||
        part.totalBytes !== info.bytes ||
        part.totalBytes > DISPLAY_CONTENT_MAX_BYTES
      )
        throw new Error("invalid display content");
      const buf = Buffer.from(part.base64, "base64");
      bytes += buf.length;
      if (buf.length > DISPLAY_GET_CHUNK_BYTES || bytes > DISPLAY_CONTENT_MAX_BYTES)
        throw new Error("display too large");
      chunks.push(buf);
      if (part.eof) {
        if (bytes !== part.totalBytes) throw new Error("incomplete display");
        break;
      }
      if (buf.length !== DISPLAY_GET_CHUNK_BYTES) throw new Error("incomplete display chunk");
    }
    return { info, text: Buffer.concat(chunks).toString("utf8") };
  }
}
