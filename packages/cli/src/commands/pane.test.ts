import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStore } from "../session.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";
import { runPaneClose, runPaneCurrent, runPaneInput, runPaneRead, runPaneReportMetadata, runPaneRun, runPaneSplit } from "./pane.js";

vi.mock("../withSession.js", () => ({ withSession: vi.fn() }));
vi.mock("../output.js", () => ({ printJson: vi.fn(), printLine: vi.fn(), printRaw: vi.fn() }));

import { printJson, printLine, printRaw } from "../output.js";
import { withSession } from "../withSession.js";

const mockedWithSession = vi.mocked(withSession);
const mockedPrintJson = vi.mocked(printJson);
const mockedPrintLine = vi.mocked(printLine);
const mockedPrintRaw = vi.mocked(printRaw);

interface FakeClient extends SodaClient {
  emitSnapshot(paneId: string, cols: number, rows: number, text: string): void;
  emitOutput(paneId: string, chunk: Uint8Array): void;
  emitClose(code: number, reason: string): void;
}

function fakeClient(opts: { panes?: string[]; requestImpl?: (method: string, params: unknown) => unknown } = {}): FakeClient {
  const snapshotCbs: ((paneId: string, cols: number, rows: number, text: string) => void)[] = [];
  const outputCbs: ((paneId: string, chunk: Uint8Array) => void)[] = [];
  const closeCbs: ((code: number, reason: string) => void)[] = [];
  return {
    hello: vi.fn().mockResolvedValue({ clientId: "c1", snapshot: { panes: (opts.panes ?? []).map((id) => ({ id })), limits: { scrollbackLines: 5000 } } }),
    request: vi.fn((opts.requestImpl ?? (() => ({}))) as never),
    sendInput: vi.fn(),
    onEvent: vi.fn(),
    onOutput: vi.fn((cb: (paneId: string, chunk: Uint8Array) => void) => outputCbs.push(cb)),
    onSnapshot: vi.fn((cb: (paneId: string, cols: number, rows: number, text: string) => void) => snapshotCbs.push(cb)),
    onClose: vi.fn((cb: (code: number, reason: string) => void) => closeCbs.push(cb)),
    close: vi.fn(),
    emitSnapshot: (paneId: string, cols: number, rows: number, text: string) => snapshotCbs.forEach((cb) => cb(paneId, cols, rows, text)),
    emitOutput: (paneId: string, chunk: Uint8Array) => outputCbs.forEach((cb) => cb(paneId, chunk)),
    emitClose: (code: number, reason: string) => closeCbs.forEach((cb) => cb(code, reason)),
  } as unknown as FakeClient;
}

const OPTS = { url: "http://127.0.0.1:7780", token: undefined, urlExplicit: false };
const store = {} as SessionStore;

beforeEach(() => {
  mockedWithSession.mockReset();
  mockedPrintJson.mockReset();
  mockedPrintLine.mockReset();
  mockedPrintRaw.mockReset();
});

describe("runPaneSplit", () => {
  it("direction/ratio を渡して pane.split を呼ぶ", async () => {
    const client = fakeClient({ requestImpl: () => ({ pane: { id: "p2" } }) });
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    await runPaneSplit({ kind: "pane-split", opts: OPTS, target: { kind: "id", paneId: "p1" }, direction: "right", ratio: 0.3 }, store);

    expect(client.request).toHaveBeenCalledWith("pane.split", { paneId: "p1", direction: "right", ratio: 0.3 });
    expect(mockedPrintJson).toHaveBeenCalledWith({ pane: { id: "p2" } });
  });

  it("ratio 省略時はキーを持たない", async () => {
    const client = fakeClient();
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    await runPaneSplit({ kind: "pane-split", opts: OPTS, target: { kind: "id", paneId: "p1" }, direction: "down", ratio: undefined }, store);

    expect(client.request).toHaveBeenCalledWith("pane.split", { paneId: "p1", direction: "down" });
  });
});

describe("pane split・pane current の対象（20260927-caller-pane-default）", () => {
  const IN_P3 = { ...OPTS, caller: { paneId: "p3", serverUrl: "http://127.0.0.1:7780" } };
  const CALLER = { kind: "caller" as const, paneId: "p3", explicit: false };
  const SNAPSHOT = {
    panes: [
      { id: "p3", tabId: "t2", label: null, cwd: "/w" },
      { id: "p4", tabId: "t9", label: "x", cwd: "/x" },
      { id: "p7", tabId: "t1", label: null, cwd: "/y" },
    ],
    tabs: [
      { id: "t1", workspaceId: "w1" },
      { id: "t2", workspaceId: "w2" },
    ],
    focus: { workspaceId: "w1", tabId: "t1", paneId: "p7" },
    limits: { scrollbackLines: 5000 },
  };
  function clientWith(snapshot: unknown = SNAPSHOT): FakeClient {
    const client = fakeClient({ requestImpl: () => ({ pane: { id: "p9" } }) });
    (client.hello as ReturnType<typeof vi.fn>).mockResolvedValue({ clientId: "c1", snapshot });
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));
    return client;
  }

  it("pane の中で対象を省いた split は呼び出し元の pane を分ける（AC1・AC14——自分の pane を分けるのは断らない）", async () => {
    const client = clientWith();
    await runPaneSplit({ kind: "pane-split", opts: IN_P3, target: CALLER, direction: "right", ratio: undefined }, store);
    expect(client.request).toHaveBeenCalledWith("pane.split", { paneId: "p3", direction: "right", callerPaneId: "p3" });
    await runPaneSplit({ kind: "pane-split", opts: IN_P3, target: { ...CALLER, explicit: true }, direction: "down", ratio: undefined }, store);
    expect(client.request).toHaveBeenLastCalledWith("pane.split", { paneId: "p3", direction: "down", callerPaneId: "p3" });
  });

  it("明示の ID は呼び出し元より優先して、その pane を分ける（AC2）", async () => {
    const client = clientWith();
    await runPaneSplit({ kind: "pane-split", opts: IN_P3, target: { kind: "id", paneId: "p4" }, direction: "down", ratio: undefined }, store);
    expect(client.request).toHaveBeenCalledWith("pane.split", { paneId: "p4", direction: "down", callerPaneId: "p3" });
  });

  it("フォーカスの pane を分ける（pane の外・AC12）。フォーカスが無ければ not_found で pane.split を送らない（AC13）", async () => {
    let client = clientWith();
    await runPaneSplit({ kind: "pane-split", opts: OPTS, target: { kind: "focused" }, direction: "right", ratio: undefined }, store);
    expect(client.request).toHaveBeenCalledWith("pane.split", { paneId: "p7", direction: "right" });

    client = clientWith({ ...SNAPSHOT, focus: null });
    await expect(
      runPaneSplit({ kind: "pane-split", opts: OPTS, target: { kind: "focused" }, direction: "right", ratio: undefined }, store),
    ).rejects.toMatchObject({ code: "not_found" });
    expect(client.request).not.toHaveBeenCalled();
  });

  it.each([
    ["別の origin", { ...IN_P3, url: "http://127.0.0.1:7781" }],
    ["SODA_SERVER_URL が無い", OPTS],
  ])("%s なら split・current は接続せずに caller_pane_unknown、明示の ID なら通る（AC9）", async (_label, opts) => {
    await expect(runPaneSplit({ kind: "pane-split", opts, target: CALLER, direction: "right", ratio: undefined }, store)).rejects.toMatchObject({
      code: "caller_pane_unknown",
    });
    await expect(runPaneCurrent({ kind: "pane-current", opts, target: { ...CALLER, explicit: true } }, store)).rejects.toMatchObject({
      code: "caller_pane_unknown",
    });
    expect(mockedWithSession).not.toHaveBeenCalled();

    const client = clientWith();
    await runPaneSplit({ kind: "pane-split", opts, target: { kind: "id", paneId: "p3" }, direction: "right", ratio: undefined }, store);
    expect(client.request).toHaveBeenCalledWith("pane.split", { paneId: "p3", direction: "right" });
    await runPaneCurrent({ kind: "pane-current", opts, target: { kind: "id", paneId: "p3" } }, store);
    expect(mockedPrintJson).toHaveBeenLastCalledWith({ pane: expect.objectContaining({ id: "p3", workspaceId: "w2" }) });
  });

  it("pane current は呼び出し元の pane に今の workspaceId と focused を足して出し、hello のほかは送らない（AC5・AC8）", async () => {
    const client = clientWith();
    await runPaneCurrent({ kind: "pane-current", opts: IN_P3, target: CALLER }, store);
    expect(mockedPrintJson).toHaveBeenCalledWith({
      pane: { id: "p3", tabId: "t2", label: null, cwd: "/w", workspaceId: "w2", focused: false },
    });
    expect(client.request).not.toHaveBeenCalled();
    expect(client.sendInput).not.toHaveBeenCalled();
  });

  it("pane current --pane は指した pane、省略（pane の外）はフォーカスの pane（AC7・AC12）。tab が無ければ workspaceId は null", async () => {
    clientWith();
    await runPaneCurrent({ kind: "pane-current", opts: IN_P3, target: { kind: "id", paneId: "p4" } }, store);
    expect(mockedPrintJson).toHaveBeenLastCalledWith({ pane: { id: "p4", tabId: "t9", label: "x", cwd: "/x", workspaceId: null, focused: false } });
    await runPaneCurrent({ kind: "pane-current", opts: OPTS, target: { kind: "focused" } }, store);
    expect(mockedPrintJson).toHaveBeenLastCalledWith({ pane: { id: "p7", tabId: "t1", label: null, cwd: "/y", workspaceId: "w1", focused: true } });
  });

  it("pane current: 無い pane・フォーカスが無いときは not_found で何も出さない（AC7・AC13）", async () => {
    clientWith();
    await expect(runPaneCurrent({ kind: "pane-current", opts: IN_P3, target: { kind: "id", paneId: "p404" } }, store)).rejects.toMatchObject({
      code: "not_found",
      message: expect.stringContaining("p404"),
    });
    clientWith({ ...SNAPSHOT, focus: null });
    await expect(runPaneCurrent({ kind: "pane-current", opts: OPTS, target: { kind: "focused" } }, store)).rejects.toMatchObject({ code: "not_found" });
    expect(mockedPrintJson).not.toHaveBeenCalled();
  });
});

describe("runPaneClose", () => {
  it("pane.close を呼ぶ", async () => {
    const client = fakeClient();
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));
    await runPaneClose({ kind: "pane-close", opts: OPTS, paneId: "p1" }, store);
    expect(client.request).toHaveBeenCalledWith("pane.close", { paneId: "p1" });
  });
});

describe("runPaneInput / runPaneRun", () => {
  it("snapshot に paneId があれば sendInput をそのまま送る（改行を付けない）", async () => {
    const client = fakeClient({ panes: ["p1"] });
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    await runPaneInput({ kind: "pane-input", opts: OPTS, paneId: "p1", text: "ls" }, store);

    expect(client.sendInput).toHaveBeenCalledWith("p1", new TextEncoder().encode("ls"));
    expect(mockedPrintJson).toHaveBeenCalledWith({ ok: true, paneId: "p1" });
  });

  it("run は末尾に改行を1つ足して送る", async () => {
    const client = fakeClient({ panes: ["p1"] });
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    await runPaneRun({ kind: "pane-run", opts: OPTS, paneId: "p1", command: "echo hi" }, store);

    expect(client.sendInput).toHaveBeenCalledWith("p1", new TextEncoder().encode("echo hi\n"));
  });

  it("snapshot に paneId が無ければサーバへ行かず not_found で失敗する（依拠する既存の事実）", async () => {
    const client = fakeClient({ panes: ["other"] });
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    await expect(runPaneInput({ kind: "pane-input", opts: OPTS, paneId: "p1", text: "ls" }, store)).rejects.toThrow(RpcFailure);
    expect(client.sendInput).not.toHaveBeenCalled();
  });
});

describe("runPaneRead", () => {
  it("SNAPSHOT を受けたら既定で ANSI を除去して printLine し、--follow 無しなら unsubscribe して終わる", async () => {
    const client = fakeClient({ requestImpl: (method) => (method === "pane.subscribe" ? { cols: 80, rows: 24 } : {}) });
    (client.request as ReturnType<typeof vi.fn>).mockImplementation(async (method: string) => {
      if (method === "pane.subscribe") {
        // subscribe を受けたら SNAPSHOT を配る（実サーバの挙動を模す）。
        queueMicrotask(() => client.emitSnapshot("p1", 80, 24, "\u001B[31mhello\u001B[0m"));
      }
      return {};
    });
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    await runPaneRead({ kind: "pane-read", opts: OPTS, paneId: "p1", follow: false, raw: false, timeoutMs: 1000 }, store);

    expect(mockedPrintLine).toHaveBeenCalledWith("hello");
    expect(client.request).toHaveBeenCalledWith("pane.subscribe", { paneId: "p1", scrollbackLines: 5000 });
    expect(client.request).toHaveBeenCalledWith("pane.unsubscribe", { paneId: "p1" });
  });

  it("--follow 無しでは、SNAPSHOT を表示してから unsubscribe する（解除の応答を待たずに表示する）", async () => {
    const order: string[] = [];
    const client = fakeClient({
      panes: ["p1"],
      requestImpl: (method) => {
        order.push(method);
        return method === "pane.unsubscribe" ? new Promise(() => undefined) : {};
      },
    });
    mockedPrintLine.mockImplementation(() => void order.push("printLine"));
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    void runPaneRead({ kind: "pane-read", opts: OPTS, paneId: "p1", follow: false, raw: false, timeoutMs: 1000 }, store);
    await vi.waitFor(() => expect(client.request).toHaveBeenCalledWith("pane.subscribe", expect.anything()));
    client.emitSnapshot("p1", 80, 24, "hello");
    await vi.waitFor(() => expect(order).toContain("pane.unsubscribe"));
    expect(order).toEqual(["pane.subscribe", "printLine", "pane.unsubscribe"]);
  });

  it("--raw なら ANSI をそのまま出す", async () => {
    const client = fakeClient();
    (client.request as ReturnType<typeof vi.fn>).mockImplementation(async (method: string) => {
      if (method === "pane.subscribe") queueMicrotask(() => client.emitSnapshot("p1", 80, 24, "\u001B[31mhello\u001B[0m"));
      return {};
    });
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    await runPaneRead({ kind: "pane-read", opts: OPTS, paneId: "p1", follow: false, raw: true, timeoutMs: 1000 }, store);

    expect(mockedPrintLine).toHaveBeenCalledWith("\u001B[31mhello\u001B[0m");
  });

  it("timeoutMs までに SNAPSHOT が来なければ timeout で失敗する", async () => {
    const client = fakeClient();
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    await expect(runPaneRead({ kind: "pane-read", opts: OPTS, paneId: "p1", follow: false, raw: false, timeoutMs: 20 }, store)).rejects.toThrow(RpcFailure);
  }, 2000);

  it("--follow ありなら以後の OUTPUT を継続して printRaw する（ANSI 除去つき）", async () => {
    const client = fakeClient();
    (client.request as ReturnType<typeof vi.fn>).mockImplementation(async (method: string) => {
      if (method === "pane.subscribe") queueMicrotask(() => client.emitSnapshot("p1", 80, 24, "initial"));
      return {};
    });
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));

    const promise = runPaneRead({ kind: "pane-read", opts: OPTS, paneId: "p1", follow: true, raw: false, timeoutMs: 1000 }, store);
    // SNAPSHOT が届くまで待ってから OUTPUT を流す（マイクロタスクの順序に依存しないよう少し待つ）。
    await new Promise((r) => setTimeout(r, 10));
    client.emitOutput("p1", new TextEncoder().encode("\u001B[1mbold\u001B[0m"));
    client.emitClose(1006, "abnormal closure");

    await expect(promise).rejects.toThrow(RpcFailure);
    expect(mockedPrintRaw).toHaveBeenCalledWith("bold");
  });
});

describe("自分の pane の歯止め（20260926-agent-skill-file。AC11・AC13・AC14）", () => {
  const IN_P1 = { ...OPTS, caller: { paneId: "p1", serverUrl: "http://127.0.0.1:7780" } };

  it.each([
    ["pane close", () => runPaneClose({ kind: "pane-close", opts: IN_P1, paneId: "p1" }, store)],
    ["pane input", () => runPaneInput({ kind: "pane-input", opts: IN_P1, paneId: "p1", text: "x" }, store)],
    ["pane run", () => runPaneRun({ kind: "pane-run", opts: IN_P1, paneId: "p1", command: "x" }, store)],
  ])("%s p1 は接続せずに self_target", async (_label, run) => {
    await expect(run()).rejects.toMatchObject({ code: "self_target", message: expect.stringContaining("SODA_PANE_ID= sodactl") });
    expect(mockedWithSession).not.toHaveBeenCalled();
  });

  it("別の pane（p2）なら送る", async () => {
    const client = fakeClient({ panes: ["p1", "p2"] });
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));
    await runPaneClose({ kind: "pane-close", opts: IN_P1, paneId: "p2" }, store);
    await runPaneRun({ kind: "pane-run", opts: IN_P1, paneId: "p2", command: "ls" }, store);
    expect(client.request).toHaveBeenCalledWith("pane.close", { paneId: "p2" });
    expect(client.sendInput).toHaveBeenCalledWith("p2", new TextEncoder().encode("ls\n"));
  });

  it("接続先が pane のサーバと別の origin なら断らない", async () => {
    const client = fakeClient({ panes: ["p1"] });
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));
    await runPaneInput({ kind: "pane-input", opts: { ...IN_P1, url: "http://127.0.0.1:7781" }, paneId: "p1", text: "x" }, store);
    expect(client.sendInput).toHaveBeenCalled();
  });

  it("自分の pane の split・read は断らない", async () => {
    const client = fakeClient({ panes: ["p1"], requestImpl: () => ({ pane: { id: "p2" } }) });
    mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));
    await runPaneSplit({ kind: "pane-split", opts: IN_P1, target: { kind: "id", paneId: "p1" }, direction: "right", ratio: undefined }, store);
    expect(client.request).toHaveBeenCalledWith("pane.split", { paneId: "p1", direction: "right", callerPaneId: "p1" });

    const readPromise = runPaneRead({ kind: "pane-read", opts: IN_P1, paneId: "p1", follow: false, raw: false, timeoutMs: 1000 }, store);
    await vi.waitFor(() => expect(client.request).toHaveBeenCalledWith("pane.subscribe", expect.objectContaining({ paneId: "p1" })));
    client.emitSnapshot("p1", 80, 24, "hello");
    await readPromise;
    expect(mockedPrintLine).toHaveBeenCalledWith("hello");
  });
});

describe("runPaneReportMetadata（20260927-sidebar-row-tokens の AC2・AC8）", () => {
  it("hello の後に pane.report_metadata を呼ぶ。自分の pane（caller）でも断らない。seq・ttlMs を省くとキーごと付けない", async () => {
    const order: string[] = [];
    const client = fakeClient({ panes: ["p1"] });
    (client.hello as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("hello");
      return { clientId: "c1", snapshot: { panes: [{ id: "p1" }] } };
    });
    (client.request as ReturnType<typeof vi.fn>).mockImplementation(async () => {
      order.push("request");
      return {};
    });
    mockedWithSession.mockImplementation(async (_opts, _store, fn) => fn(client));
    const opts = { ...OPTS, caller: { paneId: "p1", serverUrl: OPTS.url } };

    await runPaneReportMetadata({ kind: "pane-report-metadata", opts, paneId: "p1", report: { source: "hook", tokens: [{ name: "summary", value: "x" }] } }, store);

    expect(order).toEqual(["hello", "request"]);
    expect(client.request).toHaveBeenCalledWith("pane.report_metadata", { paneId: "p1", source: "hook", tokens: [{ name: "summary", value: "x" }] });
    expect(mockedPrintJson).toHaveBeenCalledWith({});
  });
});
