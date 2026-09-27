import { mkdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { IMAGE_CHUNK_BYTES } from "@sodashitsu/protocol";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import type { ComposedServer } from "../composeServer.js";
import { makeTempDir } from "../persist/atomicFile.js";
import { DEFAULT_IMAGE_UPLOAD_LIMITS } from "./ImageUploads.js";

/**
 * 実物の `composeServer` の `/ws` 越しに `pane.image.begin`/`chunk`/`commit` を通す（20260927-clipboard-image-paste の T3）。
 * 方式の登録・`WsGateway` の配線・状態ディレクトリの下の置き場所・切断で送信を捨てることを確かめる。
 */
vi.setConfig({ testTimeout: 30_000 });

class Client {
  private seq = 0;
  private readonly pending = new Map<
    string,
    (m: { result?: unknown; error?: { code: string } }) => void
  >();
  constructor(readonly ws: WebSocket) {
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(String(data)) as {
        id?: string;
        result?: unknown;
        error?: { code: string };
      };
      if (msg.id !== undefined) this.pending.get(msg.id)?.(msg);
    });
  }
  request<T>(method: string, params: unknown): Promise<T> {
    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) =>
        m.error ? reject(new Error(m.error.code)) : resolve(m.result as T),
      );
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
    const w = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { origin, host: `127.0.0.1:${port}`, cookie },
    });
    w.once("open", () => resolve(w));
    w.once("error", reject);
  });
  const c = new Client(ws);
  await c.request("client.hello", { protocol: 1, kind: "desktop" });
  return c;
}

function png(size: number): Buffer {
  const b = Buffer.alloc(size);
  for (let i = 0; i < size; i++) b[i] = (i * 31) & 0xff;
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b);
  return b;
}

/** ブラウザ（`ImagePaster`）と同じ手順で送る。 */
async function uploadImage(c: Client, paneId: string, data: Buffer): Promise<string> {
  const { uploadId } = await c.request<{ uploadId: string }>("pane.image.begin", {
    paneId,
    mime: "image/png",
    size: data.length,
  });
  for (let off = 0; off < data.length; off += IMAGE_CHUNK_BYTES) {
    await c.request("pane.image.chunk", {
      uploadId,
      offset: off,
      data: data.subarray(off, off + IMAGE_CHUNK_BYTES).toString("base64"),
    });
  }
  return (await c.request<{ path: string }>("pane.image.commit", { uploadId })).path;
}

describe("pane.image.*（実物の /ws。20260927-clipboard-image-paste）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function start(): Promise<{ server: ComposedServer; stateDir: string }> {
    const stateDir = await makeTempDir("soda-image-");
    cleanups.push(() =>
      rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    );
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    cleanups.push(() => server.close());
    return { server, stateDir };
  }

  it("分けて送った画像が状態ディレクトリの clipboard-images に同じバイト列で置かれ、そのパスが返る", async () => {
    const { server, stateDir } = await start();
    const c = await connect(server);
    cleanups.push(() => c.ws.close());
    const paneId = server.session.snapshot().panes[0]!.id;
    const data = png(IMAGE_CHUNK_BYTES * 2 + 100); // 3 片
    const path = await uploadImage(c, paneId, data);
    expect(path.startsWith(join(stateDir, "clipboard-images"))).toBe(true);
    expect((await readFile(path)).equals(data)).toBe(true);
    if (process.platform !== "win32") {
      expect((await stat(path)).mode & 0o777).toBe(0o600);
      expect((await stat(join(stateDir, "clipboard-images"))).mode & 0o777).toBe(0o700);
    }
  });

  it("起動したときに 24 時間より古い画像を消す（貼らなくなっても残さない）", async () => {
    const stateDir = await makeTempDir("soda-image-");
    cleanups.push(() =>
      rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
    );
    const dir = join(stateDir, "clipboard-images");
    await mkdir(dir, { mode: 0o700 });
    const old = join(dir, "soda-image-20260101T000000Z-0123456789abcdef.png");
    const fresh = join(dir, "soda-image-20260101T000000Z-fedcba9876543210.png");
    await writeFile(old, "x");
    await writeFile(fresh, "y");
    const t = (Date.now() - 25 * 60 * 60 * 1000) / 1000;
    await utimes(old, t, t);
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    cleanups.push(() => server.close());
    const deadline = Date.now() + 5_000;
    const exists = (p: string): Promise<boolean> =>
      stat(p).then(
        () => true,
        () => false,
      );
    while ((await exists(old)) && Date.now() < deadline)
      await new Promise((r) => setTimeout(r, 50));
    expect(await exists(old)).toBe(false);
    expect(await exists(fresh)).toBe(true);
  });

  it("知らない pane は not_found、4 種類以外は invalid_params、16 MiB 超は image_too_large", async () => {
    const { server } = await start();
    const c = await connect(server);
    cleanups.push(() => c.ws.close());
    const paneId = server.session.snapshot().panes[0]!.id;
    await expect(
      c.request("pane.image.begin", { paneId: "nope", mime: "image/png", size: 10 }),
    ).rejects.toThrow("not_found");
    await expect(
      c.request("pane.image.begin", { paneId, mime: "image/bmp", size: 10 }),
    ).rejects.toThrow("invalid_params");
    await expect(
      c.request("pane.image.begin", { paneId, mime: "image/png", size: 16 * 1024 * 1024 + 1 }),
    ).rejects.toThrow("image_too_large");
  });

  it("接続が切れたら受け取り中の送信は捨てられ、同じ id は別の接続から使えない", async () => {
    const { server } = await start();
    const a = await connect(server);
    const paneId = server.session.snapshot().panes[0]!.id;
    const { uploadId } = await a.request<{ uploadId: string }>("pane.image.begin", {
      paneId,
      mime: "image/png",
      size: 10,
    });
    const b = await connect(server);
    cleanups.push(() => b.ws.close());
    await expect(b.request("pane.image.commit", { uploadId })).rejects.toThrow(
      "image_upload_expired",
    );
    // 残りの 3 つの枠を埋める（全体で 4 つ）。
    for (let i = 0; i < 3; i++) {
      const c = await connect(server);
      cleanups.push(() => c.ws.close());
      await c.request("pane.image.begin", { paneId, mime: "image/png", size: 10 });
    }
    const d = await connect(server);
    cleanups.push(() => d.ws.close());
    await expect(
      d.request("pane.image.begin", { paneId, mime: "image/png", size: 10 }),
    ).rejects.toThrow("image_upload_busy");
    a.ws.close();
    // 切断の後始末（サーバ側の close の処理）で a の枠が空く。
    // 待つのは時間切れ（idleMs）の半分まで——切断の配線（onClientGone）が無いと、枠は時間切れでしか空かず、ここで落ちる。
    const deadline = Date.now() + DEFAULT_IMAGE_UPLOAD_LIMITS.idleMs / 2;
    for (;;) {
      const r = await d.request("pane.image.begin", { paneId, mime: "image/png", size: 10 }).then(
        () => "ok",
        (e: unknown) => String(e),
      );
      if (r === "ok") break;
      expect(r).toContain("image_upload_busy");
      if (Date.now() > deadline) throw new Error("the slot of the closed connection was not freed");
      await new Promise((res) => setTimeout(res, 50));
    }
  });
});
