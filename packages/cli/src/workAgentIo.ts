import { createConnection, type Socket } from "node:net";
import { lstat, readFile } from "node:fs/promises";
import { StringDecoder } from "node:string_decoder";
import type { Readable } from "node:stream";

export async function* workAgentLines(input: Readable) {
  const decoder = new StringDecoder("utf8"); let buffer = "";
  for await (const chunk of input) {
    buffer += typeof chunk === "string" ? chunk : decoder.write(chunk);
    let end: number;
    while ((end = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, end); buffer = buffer.slice(end + 1);
      if (Buffer.byteLength(line) > 4 * 1024 * 1024) throw Error("work agent message exceeds 4MiB");
      if (line.trim()) yield line;
    }
    if (Buffer.byteLength(buffer) > 4 * 1024 * 1024) throw Error("work agent message exceeds 4MiB");
  }
  buffer += decoder.end();
  if (buffer.trim()) { if (Buffer.byteLength(buffer) > 4 * 1024 * 1024) throw Error("work agent message exceeds 4MiB"); yield buffer; }
}
export class WorkAgentClient {
  private id = 0;
  private readonly pending = new Map<number, { resolve(v: unknown): void; reject(e: Error): void; timer: ReturnType<typeof setTimeout> }>();
  private closed = false;
  private constructor(private readonly socket: Socket, private readonly secret: string) {
    socket.on("error", () => this.close()); socket.on("close", () => this.close());
    void (async () => {
      try {
        for await (const line of workAgentLines(socket)) {
          const m = JSON.parse(line), p = this.pending.get(m.id);
          if (!p) continue;
          this.pending.delete(m.id); clearTimeout(p.timer);
          if (m.error) p.reject(Error(String(m.error))); else p.resolve(m.result);
        }
      } catch { /* Reject all requests without logging private input. */ }
      finally { this.close(); }
    })();
  }
  static async open(file: string) {
    const st = await lstat(file);
    if (!st.isFile() || st.isSymbolicLink() || st.size > 16384 || (process.platform !== "win32" && (st.mode & 0o077) !== 0)) throw Error("invalid work agent capability file");
    const p = JSON.parse(await readFile(file, "utf8"));
    if (typeof p.socketPath !== "string" || !/^[a-f0-9]{64}$/.test(p.secret)) throw Error("invalid work agent capability");
    const socket = createConnection(p.socketPath);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => { socket.destroy(); reject(Error("work agent proxy timed out")); }, 5000);
      socket.once("error", e => { clearTimeout(timer); reject(e); });
      socket.once("connect", () => { clearTimeout(timer); resolve(); });
    });
    return new WorkAgentClient(socket, p.secret);
  }
  request<T = unknown>(operation: "describe" | "tool" | "ask" | "close" | "started" | "cancel", tool?: unknown): Promise<T> {
    if (this.closed) return Promise.reject(Error("作業先proxyが終了しました。ローカルでは代行しません"));
    return new Promise<T>((resolve, reject) => {
      const id = ++this.id;
      const line = JSON.stringify({ id, secret: this.secret, operation, ...(tool === undefined ? {} : { tool }) }) + "\n";
      if (Buffer.byteLength(line) > 4 * 1024 * 1024) { reject(Error("work agent message exceeds 4MiB")); return; }
      const timer = setTimeout(() => { this.pending.delete(id); reject(Error("remote operation timed out; do not retry an uncertain write")); this.close(); }, 320000);
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject, timer });
      this.socket.write(line);
    });
  }
  close() {
    if (this.closed) return; this.closed = true; this.socket.destroy();
    for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(Error("作業先proxyが切断されました。ローカルでは代行しません")); }
    this.pending.clear();
  }
}
