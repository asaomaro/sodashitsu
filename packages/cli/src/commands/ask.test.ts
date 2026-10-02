import { Readable } from "node:stream";
import { describe, expect, it, vi } from "vitest";
import { CliUsageError, parseArgs, type GlobalOpts } from "../cliArgs.js";
import type { SessionStore } from "../session.js";
import { RpcFailure } from "../wsClient.js";
import { ASK_REQUEST_SLACK_MS, readStdinAll, runAsk } from "./ask.js";

const ENV = { SODA_PANE_ID: "p3", SODA_SERVER_URL: "http://127.0.0.1:7780" };
const SPEC = { title: "T", questions: [{ id: "a", label: "A", default: "x", options: ["x", "y"] }] };

function cmd(argv: string[] = [], env: NodeJS.ProcessEnv = ENV) {
  const c = parseArgs(["ask", ...argv], env);
  if (c.kind !== "ask") throw new Error("not ask");
  return c;
}

describe("parseArgs ask", () => {
  it("--timeout の既定は 540000。範囲は 1000〜86400000 の整数", () => {
    expect(cmd().timeoutMs).toBe(540_000);
    expect(cmd(["--timeout", "5000"]).timeoutMs).toBe(5000);
    for (const bad of ["999", "86400001", "1.5", "abc", "-1", "0"]) expect(() => cmd(["--timeout", bad])).toThrowError(CliUsageError);
  });
  it("位置引数・--pane・知らないオプションは使い方の誤り（対象は呼び出し元の pane だけ）", () => {
    expect(() => cmd(["p1"])).toThrowError(CliUsageError);
    expect(() => cmd(["--pane", "p1"])).toThrowError(CliUsageError);
    expect(() => cmd(["--current"])).toThrowError(CliUsageError);
  });
  it("--machine は local 以外では使えない（local は通る）", () => {
    expect(() => parseArgs(["--machine", "other", "ask"], ENV)).toThrowError(/ask/);
    expect(parseArgs(["--machine", "local", "ask"], ENV).kind).toBe("ask");
  });
  it("--url・--token を取る。SODA_PANE_ID と SODA_SERVER_URL があれば caller になる", () => {
    const c = cmd(["--url", "http://h:1", "--token", "t"]);
    expect(c.opts).toMatchObject({ url: "http://h:1", token: "t", caller: { paneId: "p3", serverUrl: "http://127.0.0.1:7780" } });
  });
});

describe("readStdinAll", () => {
  it("端末（TTY）からは読まずに使い方の誤り", async () => {
    await expect(readStdinAll(Object.assign(new Readable({ read() {} }), { isTTY: true }))).rejects.toBeInstanceOf(CliUsageError);
  });
  it("読めない標準入力（error）は使い方の誤り", async () => {
    const r = new Readable({ read() { this.destroy(new Error("EBADF")); } });
    await expect(readStdinAll(r)).rejects.toBeInstanceOf(CliUsageError);
  });
  it("最後まで読む。上限を超えたら使い方の誤り", async () => {
    expect((await readStdinAll(Readable.from([Buffer.from("ab"), Buffer.from("cd")]))).toString()).toBe("abcd");
    await expect(readStdinAll(Readable.from([Buffer.alloc(11)]), 10)).rejects.toBeInstanceOf(CliUsageError);
  });
});

/** 偽のクライアントと保存先。 */
function setup(over: { result?: unknown; fail?: unknown } = {}) {
  const requests: { method: string; params: unknown; opts: unknown }[] = [];
  let closeCb: ((code: number, reason: string) => void) | undefined;
  const client = {
    hello: vi.fn(async () => ({ clientId: "c", snapshot: {} })),
    request: vi.fn(async (method: string, params: unknown, opts?: unknown) => {
      requests.push({ method, params, opts });
      if (over.fail) throw over.fail;
      return over.result ?? { status: "answered", answers: { a: "y" } };
    }),
    onClose: (cb: (code: number, reason: string) => void) => void (closeCb = cb),
    close: vi.fn(),
  };
  return { client, requests, closeNow: (reason = "") => closeCb?.(1006, reason) };
}

vi.mock("../withSession.js", () => ({
  withSession: async (_opts: GlobalOpts, _store: SessionStore, fn: (c: unknown) => Promise<unknown>) => fn(mockState.client),
}));
const mockState: { client: ReturnType<typeof setup>["client"] } = { client: undefined as never };
const store = {} as SessionStore;
const input = (value: unknown) => ({ readStdin: async () => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)), print: vi.fn() });

describe("runAsk", () => {
  it("呼び出し元の pane へ ask.open を送り（読んだままの定義・timeoutMs・要求の時間切れに余裕を足す）、結果を 1 行出す", async () => {
    const s = setup();
    mockState.client = s.client;
    const deps = input({ ...SPEC, future: 1 });
    await runAsk(cmd(["--timeout", "5000"]), store, deps);
    expect(s.requests).toEqual([{ method: "ask.open", params: { paneId: "p3", spec: { ...SPEC, future: 1 }, timeoutMs: 5000 }, opts: { timeoutMs: 5000 + ASK_REQUEST_SLACK_MS } }]);
    expect(deps.print).toHaveBeenCalledWith({ status: "answered", answers: { a: "y" } });
    expect(s.client.hello).toHaveBeenCalledOnce();
  });

  it("4 つの status はどれもそのまま出す（unavailable の reason を含む）", async () => {
    for (const result of [{ status: "cancelled" }, { status: "timeout" }, { status: "unavailable", reason: "no browser" }]) {
      const s = setup({ result });
      mockState.client = s.client;
      const deps = input(SPEC);
      await runAsk(cmd(), store, deps);
      expect(deps.print).toHaveBeenCalledWith(result);
    }
  });

  it("BOM つきの JSON も読める", async () => {
    const s = setup();
    mockState.client = s.client;
    const deps = { readStdin: async () => Buffer.from("\uFEFF" + JSON.stringify(SPEC)), print: vi.fn() };
    await runAsk(cmd(), store, deps);
    expect(deps.print).toHaveBeenCalled();
  });

  it("対応していない型の質問（edit・rank・table）があれば、接続もサーバへの送信もせず unavailable（終了コード 0）。黙って落とさない（追補）", async () => {
    for (const type of ["edit", "rank", "table"]) {
      const s = setup();
      mockState.client = s.client;
      const deps = input({ questions: [{ id: "a", label: "A", options: ["x"] }, { id: "e", label: "E", type, text: "文面", rows: ["r1"], options: ["x"] }] });
      await runAsk(cmd(), store, deps);
      expect(deps.print).toHaveBeenCalledWith({ status: "unavailable", reason: expect.stringContaining(`"${type}"`) });
      expect(s.client.hello).not.toHaveBeenCalled();
      expect(s.requests).toEqual([]);
    }
  });

  it("定義の誤り（JSON でない・検査に落ちる・上限）は使い方の誤り。何も送らない・接続しない", async () => {
    for (const raw of ["not json", "{}", { questions: [{ id: "a" }] }, { questions: [{ id: "a", label: "A", options: [] }] }]) {
      const s = setup();
      mockState.client = s.client;
      await expect(runAsk(cmd(), store, input(raw))).rejects.toBeInstanceOf(CliUsageError);
      expect(s.client.hello).not.toHaveBeenCalled();
      expect(s.requests).toEqual([]);
    }
  });

  it("pane の外（SODA_PANE_ID・SODA_SERVER_URL が無い）・別のサーバへ向けると caller_pane_unknown。接続しない", async () => {
    const s = setup();
    mockState.client = s.client;
    await expect(runAsk(cmd([], {}), store, input(SPEC))).rejects.toMatchObject({ code: "caller_pane_unknown" });
    await expect(runAsk(cmd(["--url", "http://other.example:1"]), store, input(SPEC))).rejects.toMatchObject({ code: "caller_pane_unknown" });
    expect(s.client.hello).not.toHaveBeenCalled();
  });

  it("サーバの invalid_ask_spec は使い方の誤り（終了コード 2）。ask_busy・not_found はそのまま（終了コード 1）", async () => {
    mockState.client = setup({ fail: new RpcFailure("invalid_ask_spec", "bad") }).client;
    await expect(runAsk(cmd(), store, input(SPEC))).rejects.toBeInstanceOf(CliUsageError);
    mockState.client = setup({ fail: new RpcFailure("ask_busy", "busy") }).client;
    await expect(runAsk(cmd(), store, input(SPEC))).rejects.toMatchObject({ code: "ask_busy" });
    mockState.client = setup({ fail: new RpcFailure("not_found", "unknown method: ask.open") }).client;
    await expect(runAsk(cmd(), store, input(SPEC))).rejects.toMatchObject({ code: "not_found" });
  });

  it("結果が出る前に接続が切れたら connection_closed（保留の要求は reject されないので onClose で拾う）", async () => {
    const s = setup();
    s.client.request = vi.fn(() => new Promise(() => undefined)) as never; // 応答しない
    mockState.client = s.client;
    const done = runAsk(cmd(), store, input(SPEC));
    await vi.waitFor(() => expect(s.client.request).toHaveBeenCalled());
    s.closeNow("server shutting down");
    await expect(done).rejects.toMatchObject({ code: "connection_closed" });
  });
});
