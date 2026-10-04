import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import WebSocket from "ws";
import { composeServerOnFreePort } from "../composeServerOnFreePort.js";
import type { ComposedServer } from "../composeServer.js";
import { makeTempDir } from "../persist/atomicFile.js";

/**
 * 実物の `composeServer` の `/ws` 越しに `ask.*` を通す（20261002-sodactl-ask の T3）。方式の登録・購読者の判定（hello の kind と `ask.subscribe`）・
 * `ask.opened`/`ask.closed` のイベントが id だけであること・切断の後始末・ログに中身が出ないことを確かめる。
 */
vi.setConfig({ testTimeout: 30_000 });

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

async function connect(server: ComposedServer, kind: "desktop" | "mobile" | "external"): Promise<Client> {
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

const SPEC = {
  title: "SECRET-TITLE",
  questions: [{ id: "SECRET-ID", label: "SECRET-LABEL", default: "SECRET-OPT", options: ["SECRET-OPT", "other"], allowOther: true }],
};

describe("ask.*（実物の /ws。20261002-sodactl-ask）", () => {
  const cleanups: (() => Promise<unknown> | unknown)[] = [];
  afterEach(async () => {
    for (const fn of cleanups.splice(0).reverse()) await fn();
  });

  async function start() {
    const stateDir = await makeTempDir("soda-ask-");
    cleanups.push(() => rm(stateDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 50 }));
    const server = await composeServerOnFreePort({ host: "127.0.0.1", stateDir, origin: [] });
    cleanups.push(() => server.close());
    const paneId = server.session.snapshot().panes[0]!.id;
    const open = async (kind: "desktop" | "mobile" | "external") => {
      const c = await connect(server, kind);
      cleanups.push(() => c.ws.close());
      return c;
    };
    return { server, stateDir, paneId, open };
  }

  it("画面が答えると sodactl 相当の ask.open に結果が返り、イベントは id だけ（定義・回答を載せない）", async () => {
    const { paneId, open } = await start();
    const cli = await open("external");
    const browser = await open("desktop");
    expect(await browser.request("ask.subscribe", {})).toEqual({ asks: [] });
    const result = cli.request("ask.open", { paneId, spec: SPEC, timeoutMs: 20_000 });
    const opened = await browser.waitForEvent("ask.opened");
    expect(opened).toEqual({ askId: expect.any(String), paneId });
    const askId = opened["askId"] as string;
    // external の接続にも同じイベントが届く（全接続へ配る）が、中身は id だけ
    expect(JSON.stringify(await cli.waitForEvent("ask.opened"))).not.toContain("SECRET");
    expect(await browser.request("ask.get", { askId })).toMatchObject({ askId, paneId, spec: { title: "SECRET-TITLE" } });
    await browser.request("ask.answer", { askId, answers: { "SECRET-ID": "自由" }, custom: ["SECRET-ID"], note: "SECRET-NOTE" });
    expect(await result).toEqual({ status: "answered", answers: { "SECRET-ID": "自由" }, custom: ["SECRET-ID"], note: "SECRET-NOTE" });
    expect(await cli.waitForEvent("ask.closed")).toEqual({ askId, paneId });
    for (const e of [...cli.events, ...browser.events].filter((x) => x.event.startsWith("ask."))) expect(JSON.stringify(e)).not.toContain("SECRET");
  });

  it("comments つきの回答が結果に出る。10001 文字・付けられない質問・合計の超過は invalid_params で、質問は開いたまま残る。空白だけは落ちる", async () => {
    const { paneId, open } = await start();
    const cli = await open("external");
    const browser = await open("desktop");
    await browser.request("ask.subscribe", {});
    const extra = Array.from({ length: 10 }, (_, i) => ({ id: `c${i}`, label: `C${i}`, options: ["p"] }));
    const spec = { questions: [{ id: "a", label: "A", options: ["x", "y"] }, { id: "b", label: "B", options: ["p", "q"] }, { id: "t", label: "T", type: "text" }, ...extra] };
    const result = cli.request("ask.open", { paneId, spec, timeoutMs: 20_000 });
    const askId = (await browser.waitForEvent("ask.opened"))["askId"] as string;
    const answers = { a: "x", b: "p", t: "", ...Object.fromEntries(extra.map((q) => [q.id, "p"])) };
    const rejected = (comments: unknown) => expect(browser.request("ask.answer", { askId, answers, comments })).rejects.toMatchObject({ code: "invalid_params" });
    await rejected({ a: "あ".repeat(10_001) });
    await rejected({ t: "text には付かない" });
    await rejected({ zzz: "x" });
    // 12 問 × 10000 文字 = 合計の上限（100000）を超える
    await rejected(Object.fromEntries(["a", "b", ...extra.map((q) => q.id)].map((id) => [id, "あ".repeat(10_000)])));
    // 質問が開いたまま残っている
    expect(await browser.request("ask.get", { askId })).toMatchObject({ askId });
    await browser.request("ask.answer", { askId, answers, comments: { a: "  金曜は避けたい ", b: "   " } });
    expect(await result).toEqual({ status: "answered", answers, comments: { a: "金曜は避けたい" } });
  });

  it("画面が居なければ待たずに unavailable。端末版の形（desktop で hello しただけで ask.subscribe しない）・external だけでも同じ", async () => {
    const { paneId, open } = await start();
    const cli = await open("external");
    expect(await cli.request("ask.open", { paneId, spec: SPEC, timeoutMs: 20_000 })).toEqual({ status: "unavailable", reason: expect.any(String) });
    await open("desktop"); // 端末版の形
    expect(await cli.request("ask.open", { paneId, spec: SPEC, timeoutMs: 20_000 })).toMatchObject({ status: "unavailable" });
  });

  it("external は ask.subscribe できない。購読していない接続は ask.get・ask.answer できない", async () => {
    const { paneId, open } = await start();
    const cli = await open("external");
    const browser = await open("desktop");
    const other = await open("desktop"); // 購読していない
    await expect(cli.request("ask.subscribe", {})).rejects.toMatchObject({ code: "invalid_params" });
    await browser.request("ask.subscribe", {});
    void cli.request("ask.open", { paneId, spec: SPEC, timeoutMs: 20_000 }).catch(() => undefined);
    const askId = (await browser.waitForEvent("ask.opened"))["askId"] as string;
    await expect(other.request("ask.get", { askId })).rejects.toMatchObject({ code: "ask_closed" });
    await expect(other.request("ask.answer", { askId, answers: { "SECRET-ID": "other" } })).rejects.toMatchObject({ code: "ask_closed" });
  });

  it("同じ pane の 2 つめは ask_busy、定義の誤りは invalid_ask_spec、無い pane は not_found", async () => {
    const { paneId, open } = await start();
    const cli = await open("external");
    const browser = await open("mobile");
    await browser.request("ask.subscribe", {});
    void cli.request("ask.open", { paneId, spec: SPEC, timeoutMs: 20_000 }).catch(() => undefined);
    await browser.waitForEvent("ask.opened");
    const cli2 = await open("external");
    await expect(cli2.request("ask.open", { paneId, spec: SPEC, timeoutMs: 20_000 })).rejects.toMatchObject({ code: "ask_busy" });
    await expect(cli2.request("ask.open", { paneId: "p99", spec: SPEC, timeoutMs: 20_000 })).rejects.toMatchObject({ code: "not_found" });
    await expect(cli2.request("ask.open", { paneId, spec: { questions: [] }, timeoutMs: 20_000 })).rejects.toMatchObject({ code: "invalid_ask_spec" });
  });

  // 古い sodactl × 新しいサーバ（20261003-ask-form-component の AC13）: 古い sodactl は `page`・`paging` を知らない項目として検査を通し、
  // **読んだままの定義**を送る。検査して画面へ配るのはサーバなので、項目は画面に届き（目次に出る）、不正な値はサーバが断る。
  it("読んだままの定義の page・paging・filter・showValue は、画面が受け取る定義（ask.get・ask.subscribe）に入る。不正な paging・page は invalid_ask_spec", async () => {
    const { paneId, open } = await start();
    const cli = await open("external");
    const browser = await open("desktop");
    await browser.request("ask.subscribe", {});
    const raw = {
      paging: 2,
      future: 1,
      questions: [
        { id: "a", label: "A", page: "基本", options: ["x", { value: "y", label: "ワイ" }], filter: false, showValue: false, future: 2 },
        { id: "b", label: "B", type: "multi", page: "", options: ["p"], showIf: {} },
        { id: "t", label: "T", type: "text", page: null, filter: true },
      ],
    };
    // 不正な値は、質問を待たせずに断る（その pane は空いたまま＝下の ask.open が ask_busy にならない）
    for (const bad of [{ ...raw, paging: "many" }, { ...raw, paging: 0 }, { ...raw, paging: 1.5 }, { ...raw, questions: [{ id: "a", label: "A", page: 2, options: ["x"] }] }]) {
      await expect(cli.request("ask.open", { paneId, spec: bad, timeoutMs: 20_000 })).rejects.toMatchObject({ code: "invalid_ask_spec" });
    }
    expect(browser.events.filter((e) => e.event === "ask.opened")).toEqual([]);

    const result = cli.request("ask.open", { paneId, spec: raw, timeoutMs: 20_000 });
    const askId = (await browser.waitForEvent("ask.opened"))["askId"] as string;
    const want = {
      title: "質問",
      submit: "決定",
      note: true,
      paging: 2,
      questions: [
        { id: "a", label: "A", type: "single", page: "基本", filter: false, showValue: false, options: [{ value: "x", label: "x" }, { value: "y", label: "ワイ" }], allowOther: false, required: false, multiline: false },
        { id: "b", label: "B", type: "multi", page: "", options: [{ value: "p", label: "p" }], allowOther: false, required: false, multiline: false },
        { id: "t", label: "T", type: "text", options: [], allowOther: false, required: false, multiline: false },
      ],
    };
    // 完全一致で見る: 通す項目は入り、知らない項目（future）・null の page・text の filter・空の showIf は入らない
    expect(await browser.request("ask.get", { askId })).toEqual({ askId, paneId, spec: want });
    // 後から来た画面（再読み込み・別の端末）も、同じ定義を受け取る
    const late = await open("mobile");
    expect(await late.request("ask.subscribe", {})).toEqual({ asks: [{ askId, paneId, spec: want }] });
    // ページをまたいだ回答を、今までどおり受け取れる
    await late.request("ask.answer", { askId, answers: { a: "y", b: ["p"], t: "" } });
    expect(await result).toEqual({ status: "answered", answers: { a: "y", b: ["p"], t: "" } });
  });

  it("再接続した画面は ask.subscribe で待っている質問を受け取り、答えられる（出し直し）", async () => {
    const { paneId, open } = await start();
    const cli = await open("external");
    const b1 = await open("desktop");
    await b1.request("ask.subscribe", {});
    const result = cli.request("ask.open", { paneId, spec: SPEC, timeoutMs: 20_000 });
    const askId = (await b1.waitForEvent("ask.opened"))["askId"] as string;
    b1.ws.close();
    const b2 = await open("desktop");
    expect(await b2.request("ask.subscribe", {})).toMatchObject({ asks: [{ askId, paneId }] });
    await b2.request("ask.answer", { askId, answers: { "SECRET-ID": "other" } });
    expect(await result).toMatchObject({ status: "answered", answers: { "SECRET-ID": "other" } });
  });

  it("呼び出し側が切れると質問が閉じて ask.closed が配られる。pane が閉じても cancelled", async () => {
    const { paneId, open } = await start();
    const cli = await open("external");
    const browser = await open("desktop");
    await browser.request("ask.subscribe", {});
    void cli.request("ask.open", { paneId, spec: SPEC, timeoutMs: 20_000 }).catch(() => undefined);
    const askId = (await browser.waitForEvent("ask.opened"))["askId"] as string;
    cli.ws.close();
    expect(await browser.waitForEvent("ask.closed")).toEqual({ askId, paneId });

    const cli2 = await open("external");
    // 2 つ目の pane を作って、閉じる
    const created = await cli2.request<{ pane: { id: string }; workspace: { id: string } }>("workspace.create", {});
    const t = cli2.request("ask.open", { paneId: created.pane.id, spec: SPEC, timeoutMs: 20_000 });
    await vi.waitFor(() => expect(browser.events.filter((e) => e.event === "ask.opened")).toHaveLength(2));
    await cli2.request("workspace.close", { workspaceId: created.workspace.id });
    expect(await t).toEqual({ status: "cancelled" });
  });

  it("サーバの停止で待っている質問を閉じる（timer を残さない）", async () => {
    const { server, paneId, open } = await start();
    const cli = await open("external");
    const browser = await open("desktop");
    await browser.request("ask.subscribe", {});
    const result = cli.request("ask.open", { paneId, spec: SPEC, timeoutMs: 20_000 }).catch((e: Error) => e.message);
    await browser.waitForEvent("ask.opened");
    await server.close();
    // 接続が閉じるので、応答は届かない（呼び出し側は接続が閉じたことで知る）
    void result;
  });

  it("server.log に定義・回答・補足・自由記述の文字列が出ない", async () => {
    const { stateDir, paneId, open } = await start();
    const cli = await open("external");
    const browser = await open("desktop");
    await browser.request("ask.subscribe", {});
    const result = cli.request("ask.open", { paneId, spec: SPEC, timeoutMs: 20_000 });
    const askId = (await browser.waitForEvent("ask.opened"))["askId"] as string;
    await expect(browser.request("ask.answer", { askId, answers: { "SECRET-ID": "nope" }, note: "SECRET-NOTE" })).rejects.toMatchObject({ code: "invalid_params" });
    await expect(cli.request("ask.open", { paneId, spec: { questions: [{ id: "SECRET-BAD", label: "SECRET-BAD", options: [] }] }, timeoutMs: 20_000 })).rejects.toMatchObject({ code: "invalid_ask_spec" });
    await expect(browser.request("ask.answer", { askId, answers: { "SECRET-ID": "SECRET-OPT" }, comments: { "SECRET-BAD": "SECRET-COMMENT" } })).rejects.toMatchObject({ code: "invalid_params" });
    await browser.request("ask.answer", { askId, answers: { "SECRET-ID": "SECRET-OPT" }, note: "SECRET-NOTE", comments: { "SECRET-ID": "SECRET-COMMENT" } });
    await result;
    const log = await readFile(join(stateDir, "server.log"), "utf8");
    expect(log).toContain("ask opened");
    expect(log).toContain("ask closed");
    expect(log).not.toContain("SECRET");
  });
});
