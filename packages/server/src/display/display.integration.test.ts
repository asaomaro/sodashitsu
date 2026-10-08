import { rm } from "node:fs/promises";
import { connect as netConnect, type Socket } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import {
  DISPLAY_CONTENT_MAX_BYTES,
  DISPLAY_GET_CHUNK_BYTES,
  PANE_OP_DISPLAY_CLOSE,
  PANE_OP_DISPLAY_FEATURES,
  PANE_OP_DISPLAY_LIST,
  PANE_OP_DISPLAY_SEND,
  PANE_OP_DISPLAY_SET,
  PANE_OP_DISPLAY_WAIT,
  type DisplayChunk,
  type DisplayEvent,
  type DisplayInfo,
  type PaneSocketResponse,
} from "@sodashitsu/protocol";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import type { ComposedServer } from "../composeServer.js";
import { makeTempDir } from "../persist/atomicFile.js";

/**
 * 表示の面（`sodactl display`。20261007-soda-extensions）を、実物の `composeServer` の配線ごと確かめる。
 * pane のプログラム役は、ログイン不要の受け口（`pane.sock`）か `/ws`（external）。画面の役は `/ws` の desktop。
 * 画面（DOM）は無い——ここで見るのは、受け口・`/ws` の通信、台帳、上限、後始末。
 */
vi.setConfig({ testTimeout: 60_000 });

class Client {
  private seq = 0;
  readonly events: { event: string; data: Record<string, unknown> }[] = [];
  private readonly pending = new Map<string, (m: { result?: unknown; error?: { code: string } }) => void>();
  constructor(readonly ws: WebSocket) {
    ws.on("message", (data, isBinary) => {
      if (isBinary) return;
      const msg = JSON.parse(String(data)) as { id?: string; result?: unknown; error?: { code: string }; event?: string; data?: Record<string, unknown> };
      if (msg.id !== undefined) this.pending.get(msg.id)?.(msg);
      else if (msg.event !== undefined) this.events.push({ event: msg.event, data: msg.data ?? {} });
    });
  }
  request<T>(method: string, params: unknown): Promise<T> {
    const id = String(++this.seq);
    return new Promise((resolve, reject) => {
      this.pending.set(id, (m) => (m.error ? reject(Object.assign(new Error(m.error.code), { code: m.error.code })) : resolve(m.result as T)));
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }
  eventsOf(name: string): Record<string, unknown>[] {
    return this.events.filter((e) => e.event === name).map((e) => e.data);
  }
  waitForEvent(name: string, count = 1): Promise<Record<string, unknown>> {
    return vi.waitFor(
      () => {
        const found = this.eventsOf(name);
        if (found.length < count) throw new Error(`waiting for ${name} #${count}`);
        return found[count - 1]!;
      },
      { timeout: 5000, interval: 20 },
    );
  }
}

async function connectWs(server: ComposedServer, kind: "desktop" | "mobile" | "external"): Promise<Client> {
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
  await c.request("client.hello", { protocol: 1, kind });
  return c;
}

interface PaneConn {
  sock: Socket;
  closed: Promise<string>;
}
/** 受け口へ繋いで要求の 1 行を送る（認証の情報は何も送らない）。 */
function send(path: string, req: { op: string; paneId: string; params?: Record<string, unknown> }): Promise<PaneConn> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const sock = netConnect(path);
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => (buf += chunk));
    const closed = new Promise<string>((res) => sock.on("close", () => res(buf)));
    sock.once("error", reject);
    sock.once("connect", () => {
      sock.off("error", reject);
      sock.on("error", () => undefined);
      sock.write(`${JSON.stringify({ v: 1, ...req })}\n`);
      resolve({ sock, closed });
    });
  });
}
async function call(path: string, op: string, paneId: string, params?: Record<string, unknown>): Promise<PaneSocketResponse> {
  const c = await send(path, { op, paneId, ...(params ? { params } : {}) });
  const raw = await c.closed;
  expect(raw.indexOf("\n")).toBe(raw.length - 1);
  return JSON.parse(raw) as PaneSocketResponse;
}
const okResult = <T>(r: PaneSocketResponse): T => {
  if (!r.ok) throw new Error(`not ok: ${JSON.stringify(r)}`);
  return r.result as T;
};

describe.skipIf(process.platform === "win32")("表示の面（実物のサーバ。pane.sock と /ws）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  /** `script`: スクリプトが動く表示を設定で有効にして始めるか（既定は無効なので、PR3 の筋は有効にして始める）。 */
  async function start(o: { script?: boolean } = {}) {
    const stateDir = await makeTempDir("soda-display-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    cleanups.push(() => server.close());
    const paneA = server.session.snapshot().panes[0]!.id;
    if (o.script !== false) {
      const admin = await connectWs(server, "external");
      await admin.request("prefs.set", { patch: { displayScriptEnabled: true } });
      admin.ws.close();
    }
    const sockPath = join(stateDir, "pane.sock");
    const open = async (kind: "desktop" | "mobile" | "external") => {
      const c = await connectWs(server, kind);
      cleanups.push(() => c.ws.close());
      return c;
    };
    const browser = async (features = ["panel", "band", "actions", "script-html"]) => {
      const b = await open("desktop");
      await b.request("display.subscribe", { features });
      return b;
    };
    /** 2 つ目以降の pane（別の workspace）。 */
    const newPane = async (cli: Client): Promise<string> => (await cli.request<{ pane: { id: string } }>("workspace.create", {})).pane.id;
    return { server, paneA, sockPath, open, browser, newPane };
  }

  const SET = (name: string, extra: Record<string, unknown> = {}) => ({ name, kind: "panel", format: "html", content: "<p>hi</p>", ...extra });

  it("ログインなしで set → list → wait → close が通る。画面には見出しだけのイベントが届き、中身は get で取る（AC1・AC3）", async () => {
    const { paneA, sockPath, browser } = await start();
    const b = await browser();
    const set = okResult<{ display: DisplayInfo; renderers: { panel: number }; epoch: string; next: number }>(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SET("main", { title: "T" })));
    expect(set.display).toMatchObject({ paneId: paneA, name: "main", rev: 1, title: "T", bytes: 9 });
    expect(set.renderers).toMatchObject({ panel: 1, band: 1, actions: 1 });
    const upd = await b.waitForEvent("display.updated");
    expect(upd).toEqual({ display: set.display });
    expect(JSON.stringify(upd)).not.toContain("<p>hi</p>"); // 中身はイベントに載らない
    expect(okResult<{ displays: DisplayInfo[] }>(await call(sockPath, PANE_OP_DISPLAY_LIST, paneA, {})).displays).toHaveLength(1);
    const chunk = await b.request<DisplayChunk>("display.get", { id: set.display.id, offset: 0 });
    expect(Buffer.from(chunk.base64, "base64").toString()).toBe("<p>hi</p>");

    // 利用者の操作が、待っている wait に届く
    const waiting = send(sockPath, { op: PANE_OP_DISPLAY_WAIT, paneId: paneA, params: { epoch: set.epoch, since: set.next, timeoutMs: 20_000 } });
    const w = await waiting;
    await new Promise((r) => setTimeout(r, 50));
    await b.request("display.action", { id: set.display.id, rev: 1, action: "go", data: { a: "b" } });
    const reply = JSON.parse(await w.closed) as PaneSocketResponse;
    expect(okResult<{ events: DisplayEvent[]; next: number }>(reply)).toMatchObject({ events: [{ type: "display.action", name: "main", rev: 1, action: "go", data: { a: "b" }, seq: 1 }], next: 1 });

    expect(okResult(await call(sockPath, PANE_OP_DISPLAY_CLOSE, paneA, { name: "main" }))).toEqual({ closed: ["main"] });
    expect(await b.waitForEvent("display.removed")).toMatchObject({ name: "main", reason: "closed" });
    expect(okResult(await call(sockPath, PANE_OP_DISPLAY_CLOSE, paneA, { name: "main" }))).toEqual({ closed: [] });
    const features = okResult<{ features: string[]; limits: { requestLineBytes: number } }>(await call(sockPath, PANE_OP_DISPLAY_FEATURES, paneA, {}));
    expect(features.features).toContain("format:html");
    expect(features.limits.requestLineBytes).toBe(4 * 1024 * 1024);
  });

  it("2 MiB ちょうどの中身の set が受け口を通る（AC36）。1 バイト超えは invalid_display", async () => {
    const { paneA, sockPath } = await start();
    const r = okResult<{ display: DisplayInfo }>(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SET("big", { content: "a".repeat(DISPLAY_CONTENT_MAX_BYTES) })));
    expect(r.display.bytes).toBe(DISPLAY_CONTENT_MAX_BYTES);
    expect(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SET("big2", { content: "a".repeat(DISPLAY_CONTENT_MAX_BYTES + 1) }))).toMatchObject({ ok: false, error: { code: "invalid_display" } });
  });

  it("1 行が 1 MiB を超える要求（1 MiB 超 4 MiB 以下）が受け口を通り、4 MiB を超える行は bad_request", async () => {
    const { paneA, sockPath } = await start();
    // 引用符だけの 2 MiB 弱は、JSON のエスケープで 1 行が 4 MiB に近づく
    const quotes = '"'.repeat(DISPLAY_CONTENT_MAX_BYTES - 1024);
    const r = await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SET("q", { content: quotes }));
    expect(r.ok).toBe(true);
    const tooLong = await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SET("q2", { content: '"'.repeat(DISPLAY_CONTENT_MAX_BYTES + 100) }));
    expect(tooLong).toMatchObject({ ok: false, error: { code: "bad_request" } });
  });

  it("pane A を名乗っても、pane B の面は見えず・閉じられず・待てない。引数に paneId: B を載せても B に届かない（AC14）", async () => {
    const { paneA, sockPath, open, newPane, browser } = await start();
    const cli = await open("external");
    const paneB = await newPane(cli);
    const b = await browser();
    await cli.request("display.set", { paneId: paneB, ...SET("secret") });
    await b.waitForEvent("display.updated");
    // A の一覧に B の面は無い
    expect(okResult<{ displays: unknown[] }>(await call(sockPath, PANE_OP_DISPLAY_LIST, paneA, {})).displays).toEqual([]);
    // A から B の面の名前で close しても B に届かない
    expect(okResult(await call(sockPath, PANE_OP_DISPLAY_CLOSE, paneA, { name: "secret" }))).toEqual({ closed: [] });
    expect(okResult(await call(sockPath, PANE_OP_DISPLAY_CLOSE, paneA, { all: true }))).toEqual({ closed: [] });
    // paneId を引数に載せたら invalid_params（strict）
    for (const [op, params] of [
      [PANE_OP_DISPLAY_LIST, { paneId: paneB }],
      [PANE_OP_DISPLAY_CLOSE, { paneId: paneB, name: "secret" }],
      [PANE_OP_DISPLAY_CLOSE, { paneId: paneB, all: true }],
      [PANE_OP_DISPLAY_SET, { paneId: paneB, ...SET("evil") }],
      [PANE_OP_DISPLAY_WAIT, { paneId: paneB, timeoutMs: 1000 }],
    ] as const) {
      expect(await call(sockPath, op, paneA, params)).toMatchObject({ ok: false, error: { code: "invalid_params" } });
    }
    // B の面は無傷で、A には何も出ていない
    expect(await cli.request("display.list", { paneId: paneB })).toMatchObject({ displays: [{ name: "secret", rev: 1 }] });
    expect(await cli.request("display.list", { paneId: paneA })).toMatchObject({ displays: [] });
    // A の wait は、B の面への操作を受け取らない
    const bId = (await cli.request<{ displays: DisplayInfo[] }>("display.list", { paneId: paneB })).displays[0]!.id;
    const w = await send(sockPath, { op: PANE_OP_DISPLAY_WAIT, paneId: paneA, params: { timeoutMs: 1000 } });
    await new Promise((r) => setTimeout(r, 50));
    await b.request("display.action", { id: bId, rev: 1, action: "to-b" });
    const reply = okResult<{ events: unknown[] }>(JSON.parse(await w.closed) as PaneSocketResponse);
    expect(reply.events).toEqual([]);
  });

  it("待ちの上限（pane 4）は display_busy。待っている接続を切ると待ちが外れて空きが戻る", async () => {
    const { paneA, sockPath, server } = await start();
    const conns: PaneConn[] = [];
    for (let i = 0; i < 4; i++) conns.push(await send(sockPath, { op: PANE_OP_DISPLAY_WAIT, paneId: paneA, params: { timeoutMs: 60_000 } }));
    await new Promise((r) => setTimeout(r, 100));
    expect(await call(sockPath, PANE_OP_DISPLAY_WAIT, paneA, { timeoutMs: 1000 })).toMatchObject({ ok: false, error: { code: "display_busy" } });
    conns[0]!.sock.destroy();
    await vi.waitFor(async () => {
      const r = await send(sockPath, { op: PANE_OP_DISPLAY_WAIT, paneId: paneA, params: { timeoutMs: 1000 } });
      conns.push(r);
      const raw = await Promise.race([r.closed, new Promise<string>((res) => setTimeout(() => res("pending"), 300))]);
      expect(raw).not.toContain("display_busy");
    });
    for (const c of conns) c.sock.destroy();
    await server.close();
  });

  it("/ws の経路: 2 MiB ちょうどの中身を直に set → display.updated → get を小分けで全部取って一致 → action → wait → dismiss / report → removed と closed（AC36）", async () => {
    const { paneA, open, browser } = await start();
    const cli = await open("external");
    const b = await browser();
    const content = Array.from({ length: DISPLAY_CONTENT_MAX_BYTES / 8 }, (_, i) => String(i % 10).repeat(7) + "あ".charAt(0).replace("あ", "x")).join("");
    expect(Buffer.byteLength(content)).toBe(DISPLAY_CONTENT_MAX_BYTES);
    const set = await cli.request<{ display: DisplayInfo; epoch: string; next: number }>("display.set", { paneId: paneA, ...SET("big", { content, title: "T" }) });
    expect((await b.waitForEvent("display.updated"))["display"]).toEqual(set.display);
    const parts: Buffer[] = [];
    for (let offset = 0; ; offset += DISPLAY_GET_CHUNK_BYTES) {
      const c = await b.request<DisplayChunk>("display.get", { id: set.display.id, offset });
      parts.push(Buffer.from(c.base64, "base64"));
      if (c.eof) break;
    }
    expect(parts).toHaveLength(3); // 片 3 つにまたがる
    expect(Buffer.concat(parts).toString("utf8")).toBe(content);
    await expect(b.request("display.get", { id: set.display.id, offset: 5 })).rejects.toMatchObject({ code: "invalid_params" });

    // wait は /ws でも長い要求として通る
    const waiting = cli.request<{ events: DisplayEvent[] }>("display.wait", { paneId: paneA, epoch: set.epoch, since: set.next, timeoutMs: 20_000 });
    await new Promise((r) => setTimeout(r, 50));
    await b.request("display.action", { id: set.display.id, rev: 1, action: "go" });
    expect((await waiting).events).toMatchObject([{ type: "display.action", action: "go" }]);

    // 利用者が閉じる: removed(dismissed) と、待つ側の closed(dismissed)
    const closedWait = cli.request<{ events: DisplayEvent[] }>("display.wait", { paneId: paneA, since: 1, timeoutMs: 20_000 });
    await new Promise((r) => setTimeout(r, 50));
    expect(await b.request("display.dismiss", { id: set.display.id })).toEqual({ closed: ["big"] });
    expect(await b.waitForEvent("display.removed")).toMatchObject({ id: set.display.id, paneId: paneA, name: "big", reason: "dismissed" });
    expect((await closedWait).events).toMatchObject([{ type: "display.closed", name: "big", reason: "dismissed" }]);

    // 画面の報告 navigated
    const s2 = await cli.request<{ display: DisplayInfo }>("display.set", { paneId: paneA, ...SET("again") });
    expect(await b.request("display.report", { id: s2.display.id, problem: "navigated", paneId: paneA, format: "html" })).toEqual({ closed: ["again"] });
    expect(await b.waitForEvent("display.removed", 2)).toMatchObject({ name: "again", reason: "navigated" });
    expect(await cli.request("display.wait", { paneId: paneA, since: 2, timeoutMs: 1000 })).toMatchObject({ events: [{ type: "display.closed", reason: "navigated" }] });
  });

  it("名乗っていない接続の get / action / dismiss / report は display_closed。external の subscribe は invalid_params", async () => {
    const { paneA, open, browser } = await start();
    const cli = await open("external");
    const set = await cli.request<{ display: DisplayInfo }>("display.set", { paneId: paneA, ...SET("m") });
    const notSub = await open("desktop"); // hello したが subscribe していない
    const id = set.display.id;
    await expect(notSub.request("display.get", { id, offset: 0 })).rejects.toMatchObject({ code: "display_closed" });
    await expect(notSub.request("display.action", { id, rev: 1, action: "x" })).rejects.toMatchObject({ code: "display_closed" });
    await expect(notSub.request("display.dismiss", { id })).rejects.toMatchObject({ code: "display_closed" });
    await expect(notSub.request("display.report", { id, problem: "navigated" })).rejects.toMatchObject({ code: "display_closed" });
    await expect(cli.request("display.get", { id, offset: 0 })).rejects.toMatchObject({ code: "display_closed" });
    await expect(cli.request("display.subscribe", { features: ["panel"] })).rejects.toMatchObject({ code: "invalid_params" });
    // 面は無事
    expect(await cli.request("display.list", { paneId: paneA })).toMatchObject({ displays: [{ name: "m" }] });
    // 名乗った後は通る。features の数は名乗った画面の数
    await browser();
    expect(await cli.request("display.features", {})).toMatchObject({ renderers: { panel: 1, band: 1, actions: 1 } });
  });

  it("上限: 量の頻度（続けて 8 MiB）は display_busy・中身の合計 32 MiB は display_limit。どちらも既にある面は変わらない", async () => {
    const { open, newPane, paneA } = await start();
    const cli = await open("external");
    const big = "a".repeat(DISPLAY_CONTENT_MAX_BYTES);
    // pane A: panel 4 つで 8 MiB（量の桶が空になる）
    for (let i = 0; i < 4; i++) await cli.request("display.set", { paneId: paneA, ...SET(`p${i}`, { content: big }) });
    await expect(cli.request("display.set", { paneId: paneA, ...SET("p0", { content: big }) })).rejects.toMatchObject({ code: "display_busy" });
    expect(await cli.request("display.list", { paneId: paneA })).toMatchObject({ displays: [{ name: "p0", rev: 1 }, { name: "p1" }, { name: "p2" }, { name: "p3" }] });
    // pane 3 つぶんでさらに 24 MiB（合計 32 MiB）
    const panes: string[] = [];
    for (let i = 0; i < 3; i++) panes.push(await newPane(cli));
    for (const p of panes) for (let i = 0; i < 4; i++) await cli.request("display.set", { paneId: p, ...SET(`p${i}`, { content: big }) });
    const extra = await newPane(cli);
    await expect(cli.request("display.set", { paneId: extra, ...SET("one", { content: "x" }) })).rejects.toMatchObject({ code: "display_limit" });
    expect(await cli.request("display.list", { paneId: extra })).toMatchObject({ displays: [] });
    // 閉じると空く
    await cli.request("display.close", { paneId: panes[0]!, all: true });
    await expect(cli.request("display.set", { paneId: extra, ...SET("one", { content: "x" }) })).resolves.toBeDefined();
  });

  it("pane を閉じると面が消え、display.removed(pane_closed) が配られ、待っている wait は not_found。接続を切った画面の名乗りは外れる", async () => {
    const { open, newPane, browser } = await start();
    const cli = await open("external");
    const b = await browser();
    const paneB = await newPane(cli);
    await cli.request("display.set", { paneId: paneB, ...SET("x") });
    await b.waitForEvent("display.updated");
    const waiting = cli.request("display.wait", { paneId: paneB, timeoutMs: 20_000 });
    const assertion = expect(waiting).rejects.toMatchObject({ code: "not_found" });
    await new Promise((r) => setTimeout(r, 50));
    await cli.request("pane.close", { paneId: paneB });
    await assertion;
    expect(await b.waitForEvent("display.removed")).toMatchObject({ paneId: paneB, name: "x", reason: "pane_closed" });
    await expect(cli.request("display.list", { paneId: paneB })).rejects.toMatchObject({ code: "not_found" });
    b.ws.close();
    await vi.waitFor(async () => expect(await cli.request("display.features", {})).toMatchObject({ renderers: { panel: 0, band: 0, actions: 0, scriptHtml: 0 } }));
  });

  it("サーバの停止で待っている受け口の wait が終わり、timer を残さない", async () => {
    const { paneA, sockPath, server } = await start();
    const w = await send(sockPath, { op: PANE_OP_DISPLAY_WAIT, paneId: paneA, params: { timeoutMs: 60_000 } });
    await new Promise((r) => setTimeout(r, 50));
    await server.close();
    await w.closed; // 閉じられる（返事は書かれても書かれなくてもよい）
  });

  // --- PR3: スクリプトが動く形式 -------------------------------------------------------------------
  const SCRIPT = (name: string, extra: Record<string, unknown> = {}) => ({ name, kind: "panel", format: "script-html", content: "<script>document.body.append('x')</script>", ...extra });

  it("ログインなしで script-html を set → send → 名乗った /ws の接続に display.message が届く。action の出来事に source が付く", async () => {
    const { paneA, sockPath, browser, open } = await start();
    const b = await browser();
    const other = await open("desktop");
    await other.request("display.subscribe", { features: ["panel"] }); // script-html を名乗らない
    const set = okResult<{ display: DisplayInfo; renderers: { scriptHtml: number }; epoch: string; next: number }>(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SCRIPT("g")));
    expect(set.display.format).toBe("script-html");
    expect(set.renderers.scriptHtml).toBe(1);
    const sent = okResult<{ delivered: number }>(await call(sockPath, PANE_OP_DISPLAY_SEND, paneA, { name: "g", data: { n: 1, list: [1, 2] } }));
    expect(sent).toEqual({ delivered: 1 });
    expect(await b.waitForEvent("display.message")).toEqual({ id: set.display.id, data: { n: 1, list: [1, 2] } });
    // 静的な形式の面への send は invalid_params・64 KiB 超も
    okResult(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SET("st")));
    expect(await call(sockPath, PANE_OP_DISPLAY_SEND, paneA, { name: "st", data: 1 })).toMatchObject({ ok: false, error: { code: "invalid_params" } });
    expect(await call(sockPath, PANE_OP_DISPLAY_SEND, paneA, { name: "g", data: "x".repeat(64 * 1024) })).toMatchObject({ ok: false, error: { code: "invalid_params" } });
    expect(await call(sockPath, PANE_OP_DISPLAY_SEND, paneA, { name: "nope", data: 1 })).toMatchObject({ ok: false, error: { code: "display_closed" } });
    // source
    await b.request("display.action", { id: set.display.id, rev: 1, action: "pick", data: { id: "3" } });
    const stId = okResult<{ displays: DisplayInfo[] }>(await call(sockPath, PANE_OP_DISPLAY_LIST, paneA, {})).displays.find((d) => d.name === "st")!.id;
    await b.request("display.action", { id: stId, rev: 1, action: "static-go" });
    const w = okResult<{ events: DisplayEvent[] }>(await call(sockPath, PANE_OP_DISPLAY_WAIT, paneA, { since: 0, epoch: set.epoch, timeoutMs: 1000 }));
    expect(w.events).toMatchObject([
      { type: "display.action", name: "g", action: "pick", source: "script" },
      { type: "display.action", name: "st", action: "static-go", source: "static" },
    ]);
  });

  it("/ws の経路でも同じ: display.send と features（format:script-html・send）。script-html を名乗らない接続だけなら delivered 0", async () => {
    const { paneA, open, browser } = await start();
    const cli = await open("external");
    const f = await cli.request<{ features: string[]; limits: { sendBytes: number }; renderers: { scriptHtml: number } }>("display.features", {});
    expect(f.features).toEqual(expect.arrayContaining(["format:script-html", "send"]));
    expect(f.limits.sendBytes).toBe(64 * 1024);
    expect(f.renderers.scriptHtml).toBe(0);
    await cli.request("display.set", { paneId: paneA, ...SCRIPT("g") });
    expect(await cli.request("display.send", { paneId: paneA, name: "g", data: [1] })).toEqual({ delivered: 0 });
    const b = await browser();
    expect(await cli.request("display.send", { paneId: paneA, name: "g", data: [2] })).toEqual({ delivered: 1 });
    expect((await b.waitForEvent("display.message"))["data"]).toEqual([2]);
  });

  it("pane A を名乗って pane B の面へ send できない（引数に paneId を載せても）", async () => {
    const { paneA, sockPath, open, newPane, browser } = await start();
    const cli = await open("external");
    const paneB = await newPane(cli);
    const b = await browser();
    await cli.request("display.set", { paneId: paneB, ...SCRIPT("secret") });
    await b.waitForEvent("display.updated");
    // A からは B の名前の面が見えない
    expect(await call(sockPath, PANE_OP_DISPLAY_SEND, paneA, { name: "secret", data: 1 })).toMatchObject({ ok: false, error: { code: "display_closed" } });
    // paneId を載せたら invalid_params（strict）
    expect(await call(sockPath, PANE_OP_DISPLAY_SEND, paneA, { paneId: paneB, name: "secret", data: 1 })).toMatchObject({ ok: false, error: { code: "invalid_params" } });
    expect(b.eventsOf("display.message")).toEqual([]);
  });

  it("report(focus_steal) を 2 回 → 受け口から close → set（面の id が変わる）→ もう 1 回で閉じ、wait に focus_steal が出て、直後の script-html の set は display_busy・html の set は通る", async () => {
    const { paneA, sockPath, browser, open } = await start();
    const b = await browser();
    const b2 = await open("desktop");
    await b2.request("display.subscribe", { features: ["panel", "script-html"] });
    const first = okResult<{ display: DisplayInfo; epoch: string; next: number }>(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SCRIPT("g")));
    const rep = (cl: Client, id: string) => cl.request<{ closed: string[]; steals: number }>("display.report", { id, problem: "focus_steal", paneId: paneA, format: "script-html" });
    expect(await rep(b, first.display.id)).toEqual({ closed: [], steals: 1 });
    expect(await rep(b2, first.display.id)).toEqual({ closed: [], steals: 2 }); // 2 つの接続から 1 回ずつ
    expect(okResult(await call(sockPath, PANE_OP_DISPLAY_CLOSE, paneA, { name: "g" }))).toEqual({ closed: ["g"] });
    const second = okResult<{ display: DisplayInfo }>(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SCRIPT("g")));
    expect(second.display.id).not.toBe(first.display.id);
    const wait = send(sockPath, { op: PANE_OP_DISPLAY_WAIT, paneId: paneA, params: { epoch: first.epoch, since: 1, timeoutMs: 20_000 } });
    const w = await wait;
    await new Promise((r) => setTimeout(r, 50));
    expect(await rep(b, second.display.id)).toEqual({ closed: ["g"], steals: 3 });
    const reply = okResult<{ events: DisplayEvent[] }>(JSON.parse(await w.closed) as PaneSocketResponse);
    expect(reply.events).toMatchObject([{ type: "display.closed", name: "g", reason: "focus_steal" }]);
    expect(await b.waitForEvent("display.removed", 2)).toMatchObject({ name: "g", reason: "focus_steal" });
    expect(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SCRIPT("g2"))).toMatchObject({ ok: false, error: { code: "display_busy" } });
    expect(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SET("h"))).toMatchObject({ ok: true });
    // 閉じた後の知らせ（面はもう無い）は数えられず、成功のまま（冷却は延びない）
    expect(await rep(b, second.display.id)).toMatchObject({ closed: [] });
  });

  it("閉じた直後の focus_steal も、添えられた paneId・format で数えられる（close の後に 3 回目が着いても冷却に入る）", async () => {
    const { paneA, sockPath, browser } = await start();
    const b = await browser();
    const set = okResult<{ display: DisplayInfo }>(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SCRIPT("g")));
    const rep = () => b.request<{ closed: string[]; steals: number }>("display.report", { id: set.display.id, problem: "focus_steal", paneId: paneA, format: "script-html" });
    await rep();
    await rep();
    okResult(await call(sockPath, PANE_OP_DISPLAY_CLOSE, paneA, { name: "g" }));
    expect(await rep()).toMatchObject({ closed: [], steals: 3 });
    expect(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SCRIPT("g"))).toMatchObject({ ok: false, error: { code: "display_busy" } });
  });

  // --- 設定（displayScriptEnabled。既定は無効）-------------------------------------------------------
  it("既定は無効: 受け口から script-html を set すると display_script_disabled。静的な形式は出せる。features が「無効」を示す（未対応とは別）", async () => {
    const { paneA, sockPath } = await start({ script: false });
    const r = await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SCRIPT("g"));
    expect(r).toMatchObject({ ok: false, error: { code: "display_script_disabled" } });
    expect(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SET("st"))).toMatchObject({ ok: true });
    expect(await call(sockPath, PANE_OP_DISPLAY_SEND, paneA, { name: "st", data: 1 })).toMatchObject({ ok: false, error: { code: "display_script_disabled" } });
    const f = okResult<{ features: string[]; scriptEnabled: boolean }>(await call(sockPath, PANE_OP_DISPLAY_FEATURES, paneA, {}));
    expect(f.scriptEnabled).toBe(false);
    expect(f.features).toContain("format:script-html");
  });

  it("設定を有効にすると set できる。無効に戻すと、出ている script-html の面だけ閉じる（display.closed の理由 script_disabled。待っている側に届く）。静的な面は残る", async () => {
    const { paneA, sockPath, open, browser } = await start({ script: false });
    const admin = await open("external");
    const b = await browser();
    expect(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SCRIPT("g"))).toMatchObject({ ok: false });
    await admin.request("prefs.set", { patch: { displayScriptEnabled: true } });
    const set = okResult<{ display: DisplayInfo; epoch: string; next: number }>(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SCRIPT("g")));
    okResult(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SET("st")));
    const w = await send(sockPath, { op: PANE_OP_DISPLAY_WAIT, paneId: paneA, params: { epoch: set.epoch, since: set.next + 0, timeoutMs: 20_000 } });
    await new Promise((r) => setTimeout(r, 100));
    await admin.request("prefs.set", { patch: { displayScriptEnabled: false } });
    const reply = okResult<{ events: DisplayEvent[] }>(JSON.parse(await w.closed) as PaneSocketResponse);
    expect(reply.events.filter((e) => e.type === "display.closed")).toMatchObject([{ name: "g", reason: "script_disabled" }]);
    expect(await b.waitForEvent("display.removed", 1)).toMatchObject({ reason: "script_disabled" });
    expect(okResult<{ displays: DisplayInfo[] }>(await call(sockPath, PANE_OP_DISPLAY_LIST, paneA, {})).displays.map((d) => d.name)).toEqual(["st"]);
    expect(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SCRIPT("g"))).toMatchObject({ ok: false, error: { code: "display_script_disabled" } });
  });

  it("pane.sock からは設定を変えられない（prefs.set は載っていない操作）。ログインなしの受け口から有効にできない（同じ OS の利用者が認証の情報を読んでログインすれば変えられる。それは防がない）", async () => {
    const { paneA, sockPath } = await start({ script: false });
    for (const op of ["prefs.set", "prefs.get", "client.hello"]) {
      expect(await call(sockPath, op, paneA, { patch: { displayScriptEnabled: true } })).toMatchObject({ ok: false });
    }
    expect(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, SCRIPT("g"))).toMatchObject({ ok: false, error: { code: "display_script_disabled" } });
    // 引数に設定を載せても display.set の schema が断る（strict）
    expect(await call(sockPath, PANE_OP_DISPLAY_SET, paneA, { ...SCRIPT("g"), displayScriptEnabled: true })).toMatchObject({ ok: false });
  });
});
