import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { CliUsageError, parseArgs, type GlobalOpts } from "../cliArgs.js";
import type { callPaneOp, PaneOpOutcome } from "../paneSocket.js";
import type { SessionStore } from "../session.js";
import { RpcFailure } from "../wsClient.js";
import { ASK_REQUEST_SLACK_MS, readStdinAll, runAsk } from "./ask.js";

const ENV = { SODA_PANE_ID: "p3", SODA_SERVER_URL: "http://127.0.0.1:7780" };
const SPEC = { title: "T", questions: [{ id: "a", label: "A", default: "x", options: ["x", "y"] }] };

/** 環境と OS は必ず明示する（このテストを soda の pane の中で走らせても、その pane の受け口・サーバを拾わない）。既定の `ENV` に socket の変数は無い。 */
function cmd(argv: string[] = [], env: NodeJS.ProcessEnv = ENV, prefix: string[] = []) {
  const c = parseArgs([...prefix, "ask", ...argv], env, "linux");
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
  withSession: async (_opts: GlobalOpts, _store: SessionStore, fn: (c: unknown) => Promise<unknown>) => {
    mockState.sessions++;
    return fn(mockState.client);
  },
}));
/** `sessions` は `withSession`（`/ws` の経路）が呼ばれた回数。 */
const mockState: { client: ReturnType<typeof setup>["client"]; sessions: number } = { client: undefined as never, sessions: 0 };
const store = {} as SessionStore;
const input = (value: unknown) => ({ readStdin: async () => Buffer.from(typeof value === "string" ? value : JSON.stringify(value)), print: vi.fn() });

beforeEach(() => {
  mockState.sessions = 0;
});

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

  it("結果は作り直さずそのまま出す（comments つきの answered も、知らない項目も。古い sodactl でも comments が出る）", async () => {
    const result = { status: "answered", answers: { a: "y" }, comments: { a: "金曜は避けたい" }, future: 1 };
    const s = setup({ result });
    mockState.client = s.client;
    const deps = input(SPEC);
    await runAsk(cmd(), store, deps);
    expect(deps.print).toHaveBeenCalledOnce();
    expect(deps.print.mock.calls[0]![0]).toBe(result); // 同じオブジェクト（作り直していない）
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

/** 20261003-sodactl-ask-socket（AC1・AC7・AC8・AC17）。受け口の側は `AskDeps.callPaneOp` を差し替える（実物の socket へは繋がない。最後の 1 件だけは差し替えず、実物の `callPaneOp` を実在しないパスへ向ける——どのサーバにも届かない）。 */
describe("runAsk — 経路の選択（ログイン不要の受け口 pane.sock）", () => {
  const SOCK_ENV = { ...ENV, SODA_PANE_SOCKET: "/s/pane.sock" } as NodeJS.ProcessEnv;
  /** 偽の受け口つきの依存。`pane` は受け口への呼び出し（`callPaneOp`）の偽物。 */
  function socketDeps(outcome: PaneOpOutcome | Error, value: unknown = SPEC) {
    const pane = vi.fn<typeof callPaneOp>(async () => {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    });
    return { ...input(value), callPaneOp: pane, pane };
  }
  const answered: PaneOpOutcome = { kind: "result", result: { status: "answered", answers: { a: "x" } } };

  it("受け口が使えれば、受け口へ ask.open（読んだままの定義・timeoutMs・待ちに余裕を足す）を送って結果を出す。/ws へは繋がない", async () => {
    const s = setup();
    mockState.client = s.client;
    const deps = socketDeps(answered, { ...SPEC, future: 1 });
    await runAsk(cmd(["--timeout", "5000"], SOCK_ENV), store, deps);
    expect(deps.pane).toHaveBeenCalledExactlyOnceWith(
      "/s/pane.sock",
      { op: "ask.open", paneId: "p3", params: { spec: { ...SPEC, future: 1 }, timeoutMs: 5000 } },
      { timeoutMs: 5000 + ASK_REQUEST_SLACK_MS },
    );
    expect(deps.print).toHaveBeenCalledExactlyOnceWith({ status: "answered", answers: { a: "x" } });
    expect(mockState.sessions).toBe(0);
    expect(s.client.hello).not.toHaveBeenCalled();
    expect(s.requests).toEqual([]);
  });

  it("受け口の 4 つの status はどれもそのまま出す", async () => {
    for (const result of [{ status: "cancelled" }, { status: "timeout" }, { status: "unavailable", reason: "no browser" }]) {
      mockState.client = setup().client;
      const deps = socketDeps({ kind: "result", result });
      await runAsk(cmd([], SOCK_ENV), store, deps);
      expect(deps.print).toHaveBeenCalledExactlyOnceWith(result);
    }
    expect(mockState.sessions).toBe(0);
  });

  it("SODA_PANE_SOCKET が無くても、SODA_AGENT_REPORT_SOCKET から導いた受け口を使う（引き継ぎを跨いだ古い pane）。--machine local でも使う", async () => {
    mockState.client = setup().client;
    const derived = socketDeps(answered);
    await runAsk(cmd([], { ...ENV, SODA_AGENT_REPORT_SOCKET: "/x/agent-report.sock" }), store, derived);
    expect(derived.pane.mock.calls[0]?.[0]).toBe("/x/pane.sock");
    const local = socketDeps(answered);
    await runAsk(cmd([], SOCK_ENV, ["--machine", "local"]), store, local);
    expect(local.pane.mock.calls[0]?.[0]).toBe("/s/pane.sock");
    expect(mockState.sessions).toBe(0);
  });

  it("受け口が fallback（繋げない・unknown_op）なら、今までの /ws の経路で送って結果を出す", async () => {
    const s = setup({ result: { status: "cancelled" } });
    mockState.client = s.client;
    const deps = socketDeps({ kind: "fallback", reason: "cannot connect to the pane socket: ENOENT" });
    await runAsk(cmd(["--timeout", "5000"], SOCK_ENV), store, deps);
    expect(deps.pane).toHaveBeenCalledOnce();
    expect(mockState.sessions).toBe(1);
    expect(s.requests).toEqual([{ method: "ask.open", params: { paneId: "p3", spec: SPEC, timeoutMs: 5000 }, opts: { timeoutMs: 5000 + ASK_REQUEST_SLACK_MS } }]);
    expect(deps.print).toHaveBeenCalledExactlyOnceWith({ status: "cancelled" });
  });

  it("fallback の先の /ws が失敗すれば、今までどおりのエラー（落ちたことは知らせない）", async () => {
    mockState.client = setup({ fail: new RpcFailure("not_found", "unknown method: ask.open") }).client;
    const deps = socketDeps({ kind: "fallback", reason: "unknown_op: unknown op: ask.open" });
    await expect(runAsk(cmd([], SOCK_ENV), store, deps)).rejects.toMatchObject({ code: "not_found", message: "unknown method: ask.open" });
    expect(deps.print).not.toHaveBeenCalled();
  });

  it("接続先を明示した（--url・SODACTL_URL。その pane のサーバと同じ URL でも）ら受け口を使わず、/ws の経路", async () => {
    for (const c of [cmd(["--url", "http://127.0.0.1:7780"], SOCK_ENV), cmd([], { ...SOCK_ENV, SODACTL_URL: "http://localhost:7780" })]) {
      const s = setup();
      mockState.client = s.client;
      mockState.sessions = 0;
      const deps = socketDeps(answered);
      await runAsk(c, store, deps);
      expect(deps.pane).not.toHaveBeenCalled();
      expect(mockState.sessions).toBe(1);
      expect(s.requests.map((r) => r.method)).toEqual(["ask.open"]);
      expect(deps.print).toHaveBeenCalledExactlyOnceWith({ status: "answered", answers: { a: "y" } }); // /ws の偽物の結果
    }
  });

  it("受け口のパスが環境に無ければ受け口へ繋がない（今までどおり /ws）。Windows では変数があっても使わない", async () => {
    mockState.client = setup().client;
    const deps = socketDeps(answered);
    await runAsk(cmd(), store, deps);
    const win = parseArgs(["ask"], SOCK_ENV, "win32");
    if (win.kind !== "ask") throw new Error("not ask");
    await runAsk(win, store, deps);
    expect(deps.pane).not.toHaveBeenCalled();
    expect(mockState.sessions).toBe(2);
  });

  it("定義の誤り・対応していない型では、受け口にも /ws にも繋がない（誤りは終了コード 2、対応していない型は unavailable）", async () => {
    mockState.client = setup().client;
    for (const raw of ["not json", "{}", { questions: [] }, { questions: [{ id: "a", label: "A", options: [] }] }]) {
      const deps = socketDeps(answered, raw);
      await expect(runAsk(cmd([], SOCK_ENV), store, deps)).rejects.toBeInstanceOf(CliUsageError);
      expect(deps.pane).not.toHaveBeenCalled();
    }
    const deps = socketDeps(answered, { questions: [{ id: "e", label: "E", type: "edit", text: "文面" }] });
    await runAsk(cmd([], SOCK_ENV), store, deps);
    expect(deps.print).toHaveBeenCalledExactlyOnceWith({ status: "unavailable", reason: expect.stringContaining('"edit"') });
    expect(deps.pane).not.toHaveBeenCalled();
    expect(mockState.sessions).toBe(0);
  });

  it("pane の外・別のサーバ向けでは、受け口のパスがあっても caller_pane_unknown（標準入力も読まず、どちらにも繋がない）", async () => {
    mockState.client = setup().client;
    const deps = socketDeps(answered);
    const readStdin = vi.spyOn(deps, "readStdin");
    await expect(runAsk(cmd([], { SODA_PANE_SOCKET: "/s/pane.sock" } as NodeJS.ProcessEnv), store, deps)).rejects.toMatchObject({ code: "caller_pane_unknown" });
    await expect(runAsk(cmd(["--url", "http://other.example:1"], SOCK_ENV), store, deps)).rejects.toMatchObject({ code: "caller_pane_unknown" });
    expect(readStdin).not.toHaveBeenCalled();
    expect(deps.pane).not.toHaveBeenCalled();
    expect(mockState.sessions).toBe(0);
  });

  it("受け口が invalid_ask_spec を返すと使い方の誤り（終了コード 2）。/ws へは落ちない", async () => {
    mockState.client = setup().client;
    const deps = socketDeps(new RpcFailure("invalid_ask_spec", "questions[0].label is required"));
    const err = await runAsk(cmd([], SOCK_ENV), store, deps).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(CliUsageError);
    expect((err as CliUsageError).message).toBe("invalid ask spec: questions[0].label is required");
    expect(mockState.sessions).toBe(0);
  });

  it("受け口のそれ以外のエラー（ask_busy・not_found・pane_socket_busy・connection_closed・timeout）はそのまま（終了コード 1）。/ws へは落ちない", async () => {
    mockState.client = setup().client;
    for (const code of ["ask_busy", "not_found", "pane_socket_busy", "connection_closed", "timeout"]) {
      const deps = socketDeps(new RpcFailure(code, `m-${code}`));
      const err = await runAsk(cmd([], SOCK_ENV), store, deps).then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(err).toBeInstanceOf(RpcFailure);
      expect(err).toMatchObject({ code, message: `m-${code}` });
      expect(deps.print).not.toHaveBeenCalled();
    }
    expect(mockState.sessions).toBe(0);
  });

  it("差し替えなし（実物の callPaneOp）: 受け口の socket が無ければ繋げず、/ws の経路で結果を出す", async () => {
    const s = setup();
    mockState.client = s.client;
    const deps = input(SPEC);
    // 実在しないディレクトリのパス（ENOENT で繋がる前に失敗する。どのサーバにも届かない）。
    await runAsk(cmd([], { ...ENV, SODA_PANE_SOCKET: "/nonexistent-sodashitsu-test/pane.sock" }), store, deps);
    expect(mockState.sessions).toBe(1);
    expect(deps.print).toHaveBeenCalledExactlyOnceWith({ status: "answered", answers: { a: "y" } });
  });
});
