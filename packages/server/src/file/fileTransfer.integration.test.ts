import { EventEmitter } from "node:events";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { FILE_CHUNK_BYTES } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import type { ComposedServer } from "../composeServer.js";
import { makeTempDir } from "../persist/atomicFile.js";
import { FileOpener } from "./FileOpener.js";

/**
 * 実物の `composeServer` の `/ws` 越しに `file.*` を通す。方式の登録・`WsGateway` の配線（同じマシンの判定）・pane の場所からの相対パスの解決・
 * 状態ディレクトリの下の置き場所・切断で書きかけを消すことを確かめる。
 */
vi.setConfig({ testTimeout: 30_000 });

class Client {
  private seq = 0;
  private readonly pending = new Map<string, (m: { result?: unknown; error?: { code: string } }) => void>();
  constructor(readonly ws: WebSocket) {
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(String(data)) as { id?: string; result?: unknown; error?: { code: string } };
      if (msg.id !== undefined) this.pending.get(msg.id)?.(msg);
    });
  }
  request<T>(method: string, params: unknown): Promise<T> {
    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) => (m.error ? reject(new Error(m.error.code)) : resolve(m.result as T)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
}

async function connect(server: ComposedServer): Promise<Client> {
  const port = server.options.port;
  const origin = `http://127.0.0.1:${port}`;
  const res = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
    body: JSON.stringify({ token: server.freshToken }),
  });
  expect(res.status).toBe(204);
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const w = new WebSocket(`ws://127.0.0.1:${port}/ws`, { headers: { origin, host: `127.0.0.1:${port}`, cookie } });
    w.once("open", () => resolve(w));
    w.once("error", reject);
  });
  const c = new Client(ws);
  await c.request("client.hello", { protocol: 1, kind: "desktop" });
  return c;
}

function bytes(size: number): Buffer {
  const b = Buffer.alloc(size);
  for (let i = 0; i < size; i++) b[i] = (i * 31) & 0xff;
  return b;
}

describe("file.*（実物の /ws）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function start(opener?: { opened: string[] }) {
    const stateDir = await makeTempDir("soda-file-");
    const work = await makeTempDir("soda-file-work-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    cleanups.push(() => rm(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const fileOpener = opener
      ? new FileOpener({
          platform: "darwin",
          env: {},
          spawn: (_command, args) => {
            opener.opened.push(args[0]!);
            const child = new EventEmitter();
            setImmediate(() => child.emit("exit", 0));
            return Object.assign(child, { unref: () => undefined });
          },
        })
      : new FileOpener({ platform: "linux", env: {}, hasCommand: () => false });
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] }, { internal: { fileOpener } });
    cleanups.push(() => server.close());
    const c = await connect(server);
    cleanups.push(() => c.ws.close());
    // この pane の場所を work にする（相対パスを解く起点）。
    const { pane } = await c.request<{ pane: { id: string } }>("workspace.create", { cwd: work });
    return { server, stateDir, work, c, paneId: pane.id };
  }

  it("file.info は、ループバックからの接続を同じマシンと答える", async () => {
    const { c } = await start();
    expect(await c.request("file.info", {})).toEqual({ sameMachine: true, canOpen: false });
  });

  it("相対パスを pane の場所から解き、分けて読んだ中身が元のバイト列と同じ", async () => {
    const { c, work, paneId } = await start();
    const data = bytes(FILE_CHUNK_BYTES * 2 + 77);
    await mkdir(join(work, "out"));
    await writeFile(join(work, "out", "big.bin"), data);
    const { files } = await c.request<{ files: ({ path: string; kind: string; size: number } | null)[] }>("file.resolve", {
      paneId,
      paths: ["out/big.bin", "out/none.bin", "out"],
    });
    expect(files).toEqual([{ path: join(work, "out", "big.bin"), kind: "file", size: data.length }, null, { path: join(work, "out"), kind: "dir", size: 0 }]);
    const parts: Buffer[] = [];
    for (let offset = 0; offset < data.length; ) {
      const r = await c.request<{ data: string; size: number }>("file.read", { path: files[0]!.path, offset });
      expect(r.size).toBe(data.length);
      const part = Buffer.from(r.data, "base64");
      parts.push(part);
      offset += part.length;
    }
    expect(Buffer.concat(parts).equals(data)).toBe(true);
    await expect(c.request("file.read", { path: join(work, "out", "none.bin"), offset: 0 })).rejects.toThrow("file_not_found");
  });

  it("file.open は実在するパスだけを開く係へ渡す。開く手段が無ければ file_open_unavailable", async () => {
    const opener = { opened: [] as string[] };
    const { c, work } = await start(opener);
    await writeFile(join(work, "a.txt"), "x");
    await c.request("file.open", { path: join(work, "a.txt") });
    expect(opener.opened).toEqual([join(work, "a.txt")]);
    await expect(c.request("file.open", { path: join(work, "none.txt") })).rejects.toThrow("file_not_found");
    await expect(c.request("file.open", { path: "a.txt" })).rejects.toThrow("invalid_params");
    expect(opener.opened).toHaveLength(1);

    const headless = await start();
    await writeFile(join(headless.work, "a.txt"), "x");
    await expect(headless.c.request("file.open", { path: join(headless.work, "a.txt") })).rejects.toThrow("file_open_unavailable");
  });

  it("分けて送ったファイルが、状態ディレクトリの dropped-files に元の名前・同じバイト列で置かれ、そのパスが返る", async () => {
    const { c, stateDir, paneId } = await start();
    const data = bytes(FILE_CHUNK_BYTES * 2 + 100); // 3 片
    const { uploadId } = await c.request<{ uploadId: string }>("file.upload.begin", { paneId, name: "見積 書.pdf", size: data.length });
    for (let off = 0; off < data.length; off += FILE_CHUNK_BYTES) {
      await c.request("file.upload.chunk", { uploadId, offset: off, data: data.subarray(off, off + FILE_CHUNK_BYTES).toString("base64") });
    }
    const { path } = await c.request<{ path: string }>("file.upload.commit", { uploadId });
    expect(basename(path)).toBe("見積 書.pdf");
    expect(dirname(dirname(path))).toBe(join(stateDir, "dropped-files"));
    expect((await readFile(path)).equals(data)).toBe(true);
    if (process.platform !== "win32") expect((await stat(path)).mode & 0o777).toBe(0o600);
  });

  it("送っている途中で切断したら、書きかけを消す", async () => {
    const { c, stateDir, paneId } = await start();
    const { uploadId } = await c.request<{ uploadId: string }>("file.upload.begin", { paneId, name: "a.bin", size: 100 });
    await c.request("file.upload.chunk", { uploadId, offset: 0, data: bytes(10).toString("base64") });
    expect(await readdir(join(stateDir, "dropped-files"))).toHaveLength(1);
    c.ws.close();
    const deadline = Date.now() + 5_000;
    while ((await readdir(join(stateDir, "dropped-files"))).length > 0 && Date.now() < deadline) await new Promise((r) => setTimeout(r, 20));
    expect(await readdir(join(stateDir, "dropped-files"))).toEqual([]);
  });
});
