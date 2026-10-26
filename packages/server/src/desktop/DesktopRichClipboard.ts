import {
  DesktopRichClipboardRequest,
  DesktopRichClipboardResult,
  type DesktopRichClipboardRequest as Request,
  type DesktopRichClipboardResult as Result,
} from "@sodashitsu/protocol";
/** One viewer-owned transaction, with no payload assembly on the server. */
export class DesktopRichClipboard {
  private dead = false;
  private current:
    | {
        id: string;
        generation: number;
        read: boolean;
        size: number;
        offset: number;
        started: number;
        last: number;
        waiting?: { op: Request["operation"]; next?: number };
      }
    | undefined;
  private timeout: ReturnType<typeof setTimeout> | undefined;
  private retired = new Set<string>();
  constructor(
    private hooks: {
      allowed(write: boolean): boolean;
      generation(): number;
      write(value: unknown): void;
      send(value: Result): boolean;
      now?(): number;
    },
  ) {}
  private now() {
    return this.hooks.now?.() ?? Date.now();
  }
  private finish() {
    clearTimeout(this.timeout);
    this.timeout = undefined;
    const c = this.current;
    this.current = undefined;
    if (c) {
      this.retired.add(c.id);
      if (this.retired.size > 32) this.retired.delete(this.retired.values().next().value!);
    }
    return c;
  }
  private failure(id: string) {
    const c = this.finish();
    if (c)
      this.hooks.write({
        type: "clipboard_rich",
        id: c.id,
        operation: "cancel",
        generation: this.hooks.generation(),
        expiresAt: this.now() + 1000,
      });
    if (!this.dead)
      this.hooks.send({ type: "clipboard_rich_result", id, ok: false, stage: "done" });
  }
  fromViewer(raw: unknown) {
    const m = DesktopRichClipboardRequest.parse(raw);
    if (this.dead) return;
    if (m.operation === "cancel") {
      if (this.current?.id === m.id) {
        const c = this.finish()!;
        this.hooks.write({ ...m, generation: c.generation, expiresAt: this.now() + 1000 });
      }
      this.hooks.send({ type: "clipboard_rich_result", id: m.id, ok: true, stage: "cancelled" });
      return;
    }
    if (
      this.current &&
      (this.now() - this.current.last > 5000 || this.now() - this.current.started > 60000)
    )
      this.failure(this.current.id);
    const start = m.operation === "read" || m.operation === "begin";
    if (start) {
      if (this.current || this.retired.has(m.id) || !this.hooks.allowed(m.operation === "begin")) {
        this.hooks.send({ type: "clipboard_rich_result", id: m.id, ok: false, stage: "done" });
        return;
      }
      this.current = {
        id: m.id,
        generation: this.hooks.generation(),
        read: m.operation === "read",
        size: m.operation === "begin" ? m.size : 0,
        offset: 0,
        started: this.now(),
        last: this.now(),
      };
    }
    const c = this.current;
    if (!c || m.id !== c.id) {
      this.hooks.send({ type: "clipboard_rich_result", id: m.id, ok: false, stage: "done" });
      return;
    }
    if (
      c.waiting ||
      c.generation !== this.hooks.generation() ||
      !this.hooks.allowed(!c.read) ||
      this.now() - c.started > 60000
    ) {
      this.failure(c.id);
      return;
    }
    if (
      (m.operation === "pull" && (!c.read || m.offset !== c.offset || c.offset >= c.size)) ||
      (m.operation === "push" && (c.read || m.offset !== c.offset)) ||
      (m.operation === "commit" && (c.read || c.offset !== c.size))
    ) {
      this.failure(c.id);
      return;
    }
    const next =
      m.operation === "push" ? c.offset + Buffer.from(m.data, "base64").length : undefined;
    if (next !== undefined && next > c.size) {
      this.failure(c.id);
      return;
    }
    clearTimeout(this.timeout);
    c.last = this.now();
    c.waiting = { op: m.operation, ...(next === undefined ? {} : { next }) };
    this.timeout = setTimeout(() => {
      if (this.current === c) this.failure(c.id);
    }, 3000);
    this.timeout.unref();
    this.hooks.write({ ...m, generation: c.generation, expiresAt: this.now() + 1000 });
  }
  fromHelper(raw: unknown) {
    if ((raw as { type?: string }).type !== "clipboard_rich_result") return false;
    if (this.dead) return true;
    const m = DesktopRichClipboardResult.parse(raw),
      c = this.current;
    if (!c || m.id !== c.id) return true;
    if (
      c.generation !== this.hooks.generation() ||
      !this.hooks.allowed(!c.read) ||
      this.now() - c.started > 60000
    ) {
      this.failure(c.id);
      return true;
    }
    const pending = c.waiting;
    if (!pending) {
      this.failure(c.id);
      return true;
    }
    clearTimeout(this.timeout);
    this.timeout = undefined;
    if (!m.ok) {
      this.failure(c.id);
      return true;
    }
    if (pending.op === "read" || pending.op === "begin") {
      if (
        m.stage !== "begin" ||
        m.size === undefined ||
        m.offset !== undefined ||
        m.data !== undefined ||
        (!c.read && m.size !== c.size)
      ) {
        this.failure(c.id);
        return true;
      }
      c.size = m.size;
    } else if (pending.op === "pull") {
      const count = m.data === undefined ? 0 : Buffer.from(m.data, "base64").length;
      if (
        m.stage !== "chunk" ||
        !count ||
        m.size !== undefined ||
        m.offset !== c.offset + count ||
        m.offset > c.size
      ) {
        this.failure(c.id);
        return true;
      }
      c.offset = m.offset;
    } else if (pending.op === "push") {
      if (
        m.stage !== "chunk" ||
        m.data !== undefined ||
        m.size !== undefined ||
        m.offset !== pending.next
      ) {
        this.failure(c.id);
        return true;
      }
      c.offset = m.offset!;
    } else if (pending.op === "commit") {
      if (
        m.stage !== "done" ||
        m.data !== undefined ||
        m.offset !== undefined ||
        m.size !== undefined
      ) {
        this.failure(c.id);
        return true;
      }
    } else {
      this.failure(c.id);
      return true;
    }
    delete c.waiting;
    if (!this.hooks.send(m)) {
      this.failure(c.id);
      return true;
    }
    if (pending.op === "commit" || (c.read && c.offset === c.size)) this.finish();
    else {
      c.last = this.now();
      this.timeout = setTimeout(
        () => {
          if (this.current === c) this.failure(c.id);
        },
        Math.max(1, Math.min(5000, 60000 - (this.now() - c.started))),
      );
      this.timeout.unref();
    }
    return true;
  }
  revoke() {
    if (this.current) this.failure(this.current.id);
  }
  stop() {
    if (this.dead) return;
    this.dead = true;
    const c = this.finish();
    if (c)
      this.hooks.write({
        type: "clipboard_rich",
        id: c.id,
        operation: "cancel",
        generation: c.generation,
        expiresAt: this.now() + 1000,
      });
  }
}
