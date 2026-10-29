import type { DesktopInteractiveResource } from "./DesktopInteractiveOwner.js";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import type { DesktopHelper } from "./DesktopSharedCapture.js";

/** Physical helper identity and private ACK parser survive viewer teardown.
 * Fences use the same FIFO as old commands and delay stdin end until cleanup. */
export class DesktopResourceChannel extends EventEmitter implements DesktopHelper {
  readonly resourceChannel = this;
  readonly stdin: Writable;
  readonly stdout = new PassThrough();
  readonly stderr: DesktopHelper["stderr"];
  private closed = false;
  private proof = false;
  private epochs = new Map<DesktopInteractiveResource, string>();
  private terminal = new Set<string>();
  private seenReady = false;
  private pending = new Map<DesktopInteractiveResource, { id: string; epoch: string }>();
  private finish: (() => void) | undefined;
  private ending = false;
  private shutdown: ReturnType<typeof setTimeout> | undefined;
  private buffer = "";
  constructor(
    private child: DesktopHelper,
    private hooks: {
      ack(source: DesktopResourceChannel, id: string): void;
      close(source: DesktopResourceChannel): void;
    },
  ) {
    super();
    this.stderr = child.stderr;
    this.stdin = new Writable({
      write: (chunk, encoding, done) => {
        if (this.closed || this.terminal.size > 0) {
          done(Error("Desktop helper closed"));
          return;
        }
        child.stdin.write(chunk, encoding, done);
      },
      final: (done) => {
        this.finish = done;
        this.ending = true;
        if (this.pending.size) {
          this.shutdown = setTimeout(() => this.child.kill(), 6000);
          this.shutdown.unref();
        }
        this.endIfReady();
      },
    });
    this.stdin.on("error", () => this.fail());
    child.stdin.on("error", () => this.fail());
    child.on("error", () => this.fail());
    child.once("close", (code, signal) => {
      if (this.closed) return;
      this.closed = true;
      this.pending.clear();
      if (this.shutdown) clearTimeout(this.shutdown);
      const done = this.finish;
      this.finish = undefined;
      done?.();
      this.stdout.end();
      this.hooks.close(this);
      this.emit("close", code, signal);
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      if (this.closed) return;
      this.buffer += chunk;
      if (this.buffer.length > 3 * 1024 * 1024) {
        this.fail();
        return;
      }
      let at: number;
      while ((at = this.buffer.indexOf("\n")) >= 0) {
        const line = this.buffer.slice(0, at);
        this.buffer = this.buffer.slice(at + 1);
        if (!line.trim()) continue;
        try {
          const value = JSON.parse(line);
          if (!value || typeof value !== "object" || Array.isArray(value))
            throw Error("Invalid helper record");
          if (value.type === "resource_fence_ack") {
            if (
              typeof value.id !== "string" ||
              !uuid(value.id) ||
              !(
                Object.keys(value).length === 2 ||
                (Object.keys(value).length === 3 && value.terminal === true)
              )
            )
              throw Error("Invalid helper cleanup ACK");
            if (value.terminal === true) {
              if ([...this.epochs.values()].includes(value.id)) {
                this.terminal.add(value.id);
                for (const [resource, pending] of this.pending)
                  if (pending.epoch === value.id) {
                    this.pending.delete(resource);
                    this.hooks.ack(this, pending.id);
                  }
                this.endIfReady();
              }
              continue;
            }
            for (const [resource, pending] of this.pending)
              if (pending.id === value.id && this.proof) {
                this.pending.delete(resource);
                this.hooks.ack(this, value.id);
                this.endIfReady();
                break;
              }
            continue;
          }
          if (value.type === "ready" && !this.seenReady) {
            this.seenReady = true;
            this.proof = value.resourceFences === true;
          }
          if (this.stdout.readableLength > 3 * 1024 * 1024) throw Error("Helper output queue full");
          this.stdout.write(line + "\n");
        } catch {
          this.fail();
          return;
        }
      }
    });
  }
  get exitCode() {
    return this.child.exitCode;
  }
  get signalCode() {
    return this.child.signalCode;
  }
  get supported() {
    return this.proof && !this.closed && !this.terminal.size;
  }
  begin(epoch: string, resource: DesktopInteractiveResource = "control"): boolean {
    if (
      !uuid(epoch) ||
      !this.supported ||
      this.pending.has(resource) ||
      this.ending ||
      !this.stdin.writable
    )
      return false;
    this.epochs.set(resource, epoch);
    this.stdin.write(
      JSON.stringify({ type: "resource_epoch", id: epoch, resource }) + "\n",
      (error) => {
        if (error) this.fail();
      },
    );
    return true;
  }
  clean(epoch: string): boolean {
    return this.terminal.has(epoch);
  }
  get fencing() {
    return this.pending.size > 0;
  }
  fence(id: string, resource: DesktopInteractiveResource = "control"): boolean {
    const epoch = this.epochs.get(resource);
    if (!uuid(id) || !epoch) return false;
    if (this.terminal.has(epoch)) {
      this.hooks.ack(this, id);
      return true;
    }
    if (!this.supported || this.ending || !this.stdin.writable || this.stdin.writableLength > 65536)
      return false;
    const pending = this.pending.get(resource);
    if (pending) return pending.id === id;
    this.pending.set(resource, { id, epoch });
    this.stdin.write(
      JSON.stringify({ type: "resource_fence", id, epoch, resource }) + "\n",
      (error) => {
        if (error) this.fail();
      },
    );
    return true;
  }
  private endIfReady() {
    if (!this.ending || this.pending.size || !this.finish) return;
    const done = this.finish;
    this.finish = undefined;
    this.child.stdin.end(done);
  }
  private fail() {
    if (this.closed) return;
    this.proof = false;
    this.child.kill();
  }
  kill(signal?: NodeJS.Signals | number): boolean {
    return this.child.kill(signal);
  }
}
function uuid(value: string): boolean {
  return (
    typeof value === "string" &&
    /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(value) &&
    value !== "00000000-0000-0000-0000-000000000000"
  );
}
