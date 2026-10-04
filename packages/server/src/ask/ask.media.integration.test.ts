import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { connect as netConnect } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { ASK_MEDIA_CHUNK_BYTES, PANE_OP_ASK_FEATURES } from "@sodashitsu/protocol";
import type { ComposedServer } from "../composeServer.js";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import { makeTempDir } from "../persist/atomicFile.js";
import type { ImageFetcher } from "./AskMedia.js";

/**
 * 実物の `composeServer` で、画像・成果物つきの質問を通す（20261004-ask-media-popup の T5）。`/ws`（画面）・`ask.media` の分割取得・
 * `ask.features`（`/ws` と `pane.sock`）・外部 URL の取得（偽の取得を差し替え）・成果物の読み出し。
 */
vi.setConfig({ testTimeout: 30_000 });

const PNG = Buffer.concat([
  Buffer.from([0x89]),
  Buffer.from("PNG\r\n"),
  Buffer.from([0x1a, 0x0a]),
  Buffer.alloc(ASK_MEDIA_CHUNK_BYTES + 100, 3),
]);

class Client {
  private seq = 0;
  readonly events: { event: string; data: Record<string, unknown> }[] = [];
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
        event?: string;
        data?: Record<string, unknown>;
      };
      if (msg.id !== undefined) this.pending.get(msg.id)?.(msg);
      else if (msg.event !== undefined)
        this.events.push({ event: msg.event, data: msg.data ?? {} });
    });
  }
  request<T>(method: string, params: unknown): Promise<T> {
    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) =>
        m.error
          ? reject(Object.assign(new Error(m.error.code), { code: m.error.code }))
          : resolve(m.result as T),
      );
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  async waitForEvent(name: string, timeoutMs = 5000): Promise<Record<string, unknown>> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const e = this.events.find((x) => x.event === name);
      if (e) return e.data;
      if (Date.now() > deadline) throw new Error(`timed out waiting for ${name}`);
      await new Promise((r) => setTimeout(r, 20));
    }
  }
}

async function connect(
  server: ComposedServer,
  kind: "desktop" | "mobile" | "external",
): Promise<Client> {
  const port = server.options.port;
  const origin = `http://127.0.0.1:${port}`;
  const res = await fetch(`${origin}/api/login`, {
    method: "POST",
    headers: { "content-type": "application/json", origin, host: `127.0.0.1:${port}` },
    body: JSON.stringify({ token: server.freshToken }),
  });
  const cookie = (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  const ws = await new Promise<WebSocket>((resolve, reject) => {
    const w = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
      headers: { origin, host: `127.0.0.1:${port}`, cookie },
    });
    w.once("open", () => resolve(w));
    w.once("error", reject);
  });
  const c = new Client(ws);
  await c.request("client.hello", { protocol: 1, kind });
  return c;
}

/** `pane.sock` へ 1 要求（ログインなし）。 */
function paneCall(
  path: string,
  op: string,
  paneId: string,
  params?: Record<string, unknown>,
): Promise<{ ok: boolean; result?: unknown; error?: { code: string } }> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const sock = netConnect(path);
    sock.setEncoding("utf8");
    sock.on("data", (d: string) => (buf += d));
    sock.on("close", () => resolve(JSON.parse(buf) as never));
    sock.once("error", reject);
    sock.once("connect", () =>
      sock.write(`${JSON.stringify({ v: 1, op, paneId, ...(params ? { params } : {}) })}\n`),
    );
  });
}

describe("画像・成果物つきの質問（実物の /ws・pane.sock。20261004-ask-media-popup）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function start(fetcher?: ImageFetcher) {
    const stateDir = await makeTempDir("soda-askm-");
    const files = await mkdtemp(join(tmpdir(), "soda-askm-files-"));
    cleanups.push(
      () => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }),
      () => rm(files, { recursive: true, force: true }),
    );
    const server = await composeServerOnFreePort(
      { host: "127.0.0.1", stateDir, origin: [] },
      { internal: { ...(fetcher ? { askImageFetcher: fetcher } : {}) } },
    );
    cleanups.push(() => server.close());
    const paneId = server.session.snapshot().panes[0]!.id;
    const open = async (kind: "desktop" | "mobile" | "external") => {
      const c = await connect(server, kind);
      cleanups.push(() => c.ws.close());
      return c;
    };
    return { server, stateDir, files, paneId, open };
  }

  it("画像・外部 URL・成果物を、ask.media の分割取得で受け取れる。ask.opened はメディアが揃ってから", async () => {
    const fetched: string[] = [];
    const { paneId, files, open } = await start({
      fetchImage: async (url) => (fetched.push(url), { bytes: PNG, contentType: "image/png" }),
    });
    await writeFile(join(files, "a.png"), PNG);
    await writeFile(join(files, "doc.md"), "# 見出し\n");
    const browser = await open("desktop");
    await browser.request("ask.subscribe", {});
    const cli = await open("external");
    const result = cli.request("ask.open", {
      paneId,
      timeoutMs: 20_000,
      spec: {
        questions: [
          {
            id: "q",
            label: "Q",
            options: [
              { value: "a", image: join(files, "a.png") },
              { value: "b", image: "https://example.com/b.png" },
              { value: "c", image: "https://example.com/gone.png" },
            ],
          },
        ],
        view: [{ file: join(files, "doc.md") }, { text: "memo" }],
      },
    });
    const { askId } = (await browser.waitForEvent("ask.opened")) as { askId: string };
    const got = await browser.request<{
      spec: { questions: { options: { image?: string }[] }[]; view?: unknown };
      media: { id: number; kind: string; bytes: number }[];
      view: { kind: string; media: number }[];
      warnings?: number;
    }>("ask.get", { askId });
    expect(fetched.sort()).toEqual(["https://example.com/b.png", "https://example.com/gone.png"]);
    expect(got.spec.questions[0]!.options.map((o) => o.image)).toEqual([
      "media:0",
      "media:1",
      "media:2",
    ]); // 参照（パス・URL）ごとに別のメディア
    expect(got.spec).not.toHaveProperty("view");
    expect(got.view.map((v) => v.kind)).toEqual(["markdown", "text"]);
    // 分割取得して元のバイト列に戻る
    const info = got.media.find((m) => m.kind === "image")!;
    let offset = 0;
    const parts: Buffer[] = [];
    for (;;) {
      const r = await browser.request<{ base64: string; size: number; eof: boolean }>("ask.media", {
        askId,
        id: info.id,
        offset,
      });
      parts.push(Buffer.from(r.base64, "base64"));
      offset += ASK_MEDIA_CHUNK_BYTES;
      if (r.eof) break;
    }
    expect(Buffer.concat(parts).equals(PNG)).toBe(true);
    await browser.request("ask.answer", { askId, answers: { q: "a" } });
    expect(await result).toMatchObject({ status: "answered" });
  });

  it("取得に失敗した外部 URL の画像は外れ、warnings に数える（質問は出る）", async () => {
    const { paneId, open } = await start({
      fetchImage: async () => Promise.reject(new Error("down")),
    });
    const browser = await open("desktop");
    await browser.request("ask.subscribe", {});
    const cli = await open("external");
    const result = cli.request("ask.open", {
      paneId,
      timeoutMs: 20_000,
      spec: {
        questions: [
          { id: "q", label: "Q", options: [{ value: "a", image: "https://example.com/a.png" }] },
        ],
      },
    });
    const { askId } = (await browser.waitForEvent("ask.opened")) as { askId: string };
    const got = await browser.request<{
      spec: { questions: { options: { image?: string }[] }[] };
      warnings?: number;
      media?: unknown;
    }>("ask.get", { askId });
    expect(got.warnings).toBe(1);
    expect(got.media).toBeUndefined();
    expect(got.spec.questions[0]!.options[0]).not.toHaveProperty("image");
    await browser.request("ask.cancel", { askId });
    expect(await result).toEqual({ status: "cancelled" });
  });

  it("ローカルの誤り（存在しない・偽装・相対パス）は ask.open が invalid_ask_spec で返り、画面には何も出ない", async () => {
    const { paneId, files, open } = await start();
    await writeFile(join(files, "fake.png"), "root:x:0:0\n");
    const browser = await open("desktop");
    await browser.request("ask.subscribe", {});
    const cli = await open("external");
    for (const image of [
      join(files, "missing.png"),
      join(files, "fake.png"),
      "relative.png",
      "file:///etc/passwd",
    ]) {
      await expect(
        cli.request("ask.open", {
          paneId,
          timeoutMs: 20_000,
          spec: { questions: [{ id: "q", label: "Q", options: [{ value: "a", image }] }] },
        }),
      ).rejects.toMatchObject({ code: "invalid_ask_spec" });
    }
    expect(browser.events.filter((e) => e.event.startsWith("ask."))).toEqual([]);
  });

  it("ask.media は購読している画面だけ・知らない askId は ask_closed", async () => {
    const { paneId, files, open } = await start();
    await writeFile(join(files, "a.png"), PNG);
    const browser = await open("desktop");
    await browser.request("ask.subscribe", {});
    const other = await open("desktop"); // 購読していない
    const cli = await open("external");
    void cli.request("ask.open", {
      paneId,
      timeoutMs: 20_000,
      spec: {
        questions: [
          { id: "q", label: "Q", options: [{ value: "a", image: join(files, "a.png") }] },
        ],
      },
    });
    const { askId } = (await browser.waitForEvent("ask.opened")) as { askId: string };
    await expect(other.request("ask.media", { askId, id: 0, offset: 0 })).rejects.toMatchObject({
      code: "ask_closed",
    });
    await expect(
      browser.request("ask.media", { askId: "nope", id: 0, offset: 0 }),
    ).rejects.toMatchObject({ code: "ask_closed" });
    await expect(browser.request("ask.media", { askId, id: 5, offset: 0 })).rejects.toMatchObject({
      code: "invalid_params",
    });
    await browser.request("ask.cancel", { askId });
  });

  it("ask.features は /ws でも pane.sock（ログインなし）でも同じ内容を返す", async () => {
    const { paneId, stateDir, open } = await start();
    const c = await open("external");
    const viaWs = await c.request<{ features: string[]; limits: Record<string, number> }>(
      "ask.features",
      {},
    );
    expect(viaWs.features).toEqual(expect.arrayContaining(["media", "view"]));
    expect(viaWs.limits["fileBytes"]).toBe(8 * 1024 * 1024);
    if (process.platform !== "win32") {
      const viaSock = await paneCall(join(stateDir, "pane.sock"), PANE_OP_ASK_FEATURES, paneId);
      expect(viaSock).toEqual({ ok: true, result: viaWs });
      // 知らない操作は unknown_op（古い受け口が返す形。sodactl はこれで古いサーバと見分ける）
      expect(await paneCall(join(stateDir, "pane.sock"), "ask.nope", paneId)).toMatchObject({
        ok: false,
        error: { code: "unknown_op" },
      });
    }
  });
});
