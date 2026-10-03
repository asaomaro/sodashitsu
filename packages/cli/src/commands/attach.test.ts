import type { ServerEvent } from "@sodashitsu/protocol";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStore } from "../session.js";
import { RpcFailure, type SodaClient } from "../wsClient.js";
import {
  ENTER_SCREEN,
  processTerminal,
  RESTORE_SCREEN,
  runPaneAttach,
  type AttachTerminal,
} from "./attach.js";

vi.mock("../withSession.js", () => ({ withSession: vi.fn() }));

import { withSession } from "../withSession.js";

const mockedWithSession = vi.mocked(withSession);
const OPTS = { url: "http://127.0.0.1:7780", token: undefined, urlExplicit: false };
const store = {} as SessionStore;
const enc = new TextEncoder();
const dec = new TextDecoder();

interface FakeClient extends SodaClient {
  emitEvent(evt: ServerEvent): void;
  emitOutput(paneId: string, text: string): void;
  emitClose(code: number, reason: string): void;
  requests: { method: string; params: unknown }[];
}

interface FakeOptions {
  attachError?: RpcFailure;
  subscribeError?: RpcFailure;
  /** subscribe の応答を返さない（切断で待ち中の要求が reject されない実物の SodaClient を模す）。 */
  subscribeHangs?: boolean;
  /** detach の応答を返さない。 */
  detachHangs?: boolean;
  /** SNAPSHOT の中身（既定 "SNAPSHOT"）。 */
  snapshotText?: string;
}

/**
 * 実物の順序を模す: サーバは `pane.attach` の処理の中で `pane.attach_changed`（自分）を publish してから応答を返し、
 * `pane.subscribe` は SNAPSHOT を送ってから応答を返す。
 */
function fakeClient(opts: FakeOptions = {}): FakeClient {
  const eventCbs: ((evt: ServerEvent) => void)[] = [];
  const snapshotCbs: ((paneId: string, cols: number, rows: number, text: string) => void)[] = [];
  const outputCbs: ((paneId: string, chunk: Uint8Array) => void)[] = [];
  const closeCbs: ((code: number, reason: string) => void)[] = [];
  const requests: { method: string; params: unknown }[] = [];
  const emitEvent = (evt: ServerEvent): void => eventCbs.forEach((cb) => cb(evt));
  return {
    requests,
    hello: vi.fn((cb?: (evt: ServerEvent) => void) => {
      if (cb) eventCbs.push(cb);
      return Promise.resolve({ clientId: "me", snapshot: { panes: [{ id: "p1" }] } });
    }),
    request: vi.fn((method: string, params: { paneId: string; cols?: number; rows?: number }) => {
      requests.push({ method, params });
      if (method === "pane.attach") {
        if (opts.attachError) return Promise.reject(opts.attachError);
        emitEvent({
          event: "pane.attach_changed",
          data: { paneId: params.paneId, clientId: "me" },
        });
        return Promise.resolve({ cols: params.cols, rows: params.rows });
      }
      if (method === "pane.subscribe") {
        if (opts.subscribeError) return Promise.reject(opts.subscribeError);
        if (opts.subscribeHangs) return new Promise(() => undefined);
        snapshotCbs.forEach((cb) => cb(params.paneId, 100, 30, opts.snapshotText ?? "SNAPSHOT"));
        return Promise.resolve({ cols: 100, rows: 30 });
      }
      if (method === "pane.detach" && opts.detachHangs) return new Promise(() => undefined);
      return Promise.resolve({});
    }),
    sendInput: vi.fn(),
    onEvent: vi.fn((cb: (evt: ServerEvent) => void) => eventCbs.push(cb)),
    onOutput: vi.fn((cb: (paneId: string, chunk: Uint8Array) => void) => outputCbs.push(cb)),
    onSnapshot: vi.fn((cb: (paneId: string, cols: number, rows: number, text: string) => void) =>
      snapshotCbs.push(cb),
    ),
    onClose: vi.fn((cb: (code: number, reason: string) => void) => closeCbs.push(cb)),
    close: vi.fn(),
    emitEvent,
    emitOutput: (paneId: string, text: string) =>
      outputCbs.forEach((cb) => cb(paneId, enc.encode(text))),
    emitClose: (code: number, reason: string) => closeCbs.forEach((cb) => cb(code, reason)),
  } as unknown as FakeClient;
}

interface FakeTerminal extends AttachTerminal {
  writes: string[];
  raw: boolean[];
  cols: number;
  rows: number;
  type(text: string): void;
  resizeTo(cols: number, rows: number): void;
  signal(): void;
  listeners(): number;
}

function fakeTerminal(isTTY = true): FakeTerminal {
  let inputCb: ((b: Uint8Array) => void) | null = null;
  let resizeCb: (() => void) | null = null;
  let signalCb: (() => void) | null = null;
  const term: FakeTerminal = {
    isTTY,
    writes: [],
    raw: [],
    cols: 100,
    rows: 30,
    size: () => ({ cols: term.cols, rows: term.rows }),
    setRawMode: (on) => term.raw.push(on),
    write: (data) => term.writes.push(typeof data === "string" ? data : dec.decode(data)),
    onInput: (cb) => {
      inputCb = cb;
      return () => (inputCb = null);
    },
    onResize: (cb) => {
      resizeCb = cb;
      return () => (resizeCb = null);
    },
    onSignal: (cb) => {
      signalCb = cb;
      return () => (signalCb = null);
    },
    signal: () => signalCb?.(),
    type: (text) => inputCb?.(enc.encode(text)),
    resizeTo: (cols, rows) => {
      term.cols = cols;
      term.rows = rows;
      resizeCb?.();
    },
    listeners: () => (inputCb ? 1 : 0) + (resizeCb ? 1 : 0) + (signalCb ? 1 : 0),
  };
  return term;
}

function useClient(client: FakeClient): void {
  mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));
}

const cmd = (takeover = false) => ({
  kind: "pane-attach" as const,
  opts: OPTS,
  paneId: "p1",
  takeover,
});

/** 直結が始まる（subscribe まで送る）のを待つ。 */
async function waitAttached(client: FakeClient): Promise<void> {
  await vi.waitFor(() => expect(client.requests.map((r) => r.method)).toContain("pane.subscribe"));
}

/** 終わるときに手元の端末を戻したか（最後の書き込みが RESTORE で、raw モードを入れて戻した）。 */
function expectRestored(term: FakeTerminal): void {
  expect(term.writes.at(-1)).toBe(RESTORE_SCREEN);
  expect(term.raw).toEqual([true, false]);
  expect(term.listeners()).toBe(0);
}

let stderr: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  mockedWithSession.mockReset();
  stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
});
afterEach(() => {
  stderr.mockRestore();
});

describe("runPaneAttach（20260926-pane-direct-connect）", () => {
  it("端末でなければ繋がずに not_a_tty（AC5）", async () => {
    const term = fakeTerminal(false);
    await expect(runPaneAttach(cmd(), store, term)).rejects.toMatchObject({ code: "not_a_tty" });
    expect(mockedWithSession).not.toHaveBeenCalled();
    expect(term.writes).toEqual([]);
    expect(term.raw).toEqual([]);
  });

  it("手元の大きさで attach し、代替画面に入って SNAPSHOT と出力を書き、打鍵を送り、Ctrl+B q で detach して正常に返る（AC1・AC2・AC6・AC7）", async () => {
    const client = fakeClient();
    useClient(client);
    const term = fakeTerminal();

    const running = runPaneAttach(cmd(), store, term);
    await waitAttached(client);
    expect(client.requests[0]).toEqual({
      method: "pane.attach",
      params: { paneId: "p1", cols: 100, rows: 30, takeover: false },
    });
    expect(client.requests[1]).toEqual({
      method: "pane.subscribe",
      params: { paneId: "p1", scrollbackLines: 0 },
    });
    expect(term.writes.slice(0, 2)).toEqual([ENTER_SCREEN, "SNAPSHOT"]);

    client.emitOutput("p1", "hello");
    client.emitOutput("p2", "other pane");
    expect(term.writes.slice(2)).toEqual(["hello"]);

    term.type("ls\r");
    expect(client.sendInput).toHaveBeenLastCalledWith("p1", enc.encode("ls\r"));

    term.type("x\x02q");
    await running;
    expect(client.sendInput).toHaveBeenLastCalledWith("p1", enc.encode("x"));
    expect(client.requests.at(-1)).toEqual({ method: "pane.detach", params: { paneId: "p1" } });
    expectRestored(term);
    expect(stderr).toHaveBeenCalledWith("sodactl: detached from p1\n");
  });

  it("手元の大きさが変わると pane.attach_resize で追従する（AC3）", async () => {
    const client = fakeClient();
    useClient(client);
    const term = fakeTerminal();
    const running = runPaneAttach(cmd(), store, term);
    await waitAttached(client);

    term.resizeTo(90, 25);
    expect(client.requests.at(-1)).toEqual({
      method: "pane.attach_resize",
      params: { paneId: "p1", cols: 90, rows: 25 },
    });

    term.type("\x02q");
    await running;
  });

  // 20260927-server-size-input-limits の AC15・AC4。サーバのスキーマの上限の外は invalid_params で繋げないので、送る前に丸める。
  it("手元の大きさがサーバの上限（1 辺 4096・面積 1,000,000）を超えれば丸めて attach・attach_resize する", async () => {
    const client = fakeClient();
    useClient(client);
    const term = fakeTerminal();
    term.cols = 5000;
    term.rows = 30;
    const running = runPaneAttach(cmd(), store, term);
    await waitAttached(client);
    expect(client.requests[0]).toEqual({
      method: "pane.attach",
      params: { paneId: "p1", cols: 4096, rows: 30, takeover: false },
    });

    term.resizeTo(2000, 3000);
    expect(client.requests.at(-1)).toEqual({
      method: "pane.attach_resize",
      params: { paneId: "p1", cols: 2000, rows: 500 },
    });

    term.type("\x02q");
    await running;
  });

  it("--takeover を pane.attach に渡し、別のクライアントが所有者になったら attach_taken_over で終わる（AC9・AC7）", async () => {
    const client = fakeClient();
    useClient(client);
    const term = fakeTerminal();
    const running = runPaneAttach(cmd(true), store, term);
    await waitAttached(client);
    expect(client.requests[0]?.params).toMatchObject({ takeover: true });

    // 別の pane の所有者の変化と、自分の detach の結果（null）では終わらない。
    client.emitEvent({ event: "pane.attach_changed", data: { paneId: "p2", clientId: "other" } });
    client.emitEvent({ event: "pane.attach_changed", data: { paneId: "p1", clientId: "me" } });
    client.emitEvent({ event: "pane.attach_changed", data: { paneId: "p1", clientId: "other" } });

    await expect(running).rejects.toMatchObject({ code: "attach_taken_over" });
    expectRestored(term);
    expect(client.requests.map((r) => r.method)).not.toContain("pane.detach");
  });

  it.each([[["other", null]], [[null, "other"]]])(
    "自分が所有者になる前に届いた別のクライアントの所有者の変化（%j の順）では終わらない",
    async (order) => {
      const client = fakeClient();
      const hello = vi.mocked(client.hello).getMockImplementation()!;
      // hello の応答と同じ受信の塊で（自分の clientId を知る前・attach を送る前に）、別のクライアントの直結の知らせが届く。
      vi.mocked(client.hello).mockImplementation(async (cb) => {
        const res = await hello(cb);
        for (const clientId of order)
          client.emitEvent({ event: "pane.attach_changed", data: { paneId: "p1", clientId } });
        return res;
      });
      useClient(client);
      const term = fakeTerminal();
      const running = runPaneAttach(cmd(), store, term);
      await waitAttached(client);

      term.type("\x02q");
      await expect(running).resolves.toBeUndefined();
    },
  );

  it.each(["pane.exited", "pane.closed"] as const)(
    "%s で pane_closed で終わる（AC13・AC7）",
    async (event) => {
      const client = fakeClient();
      useClient(client);
      const term = fakeTerminal();
      const running = runPaneAttach(cmd(), store, term);
      await waitAttached(client);

      client.emitEvent(
        event === "pane.exited"
          ? { event, data: { paneId: "p2", exitCode: 0 } }
          : { event, data: { paneId: "p2" } },
      );
      client.emitEvent(
        event === "pane.exited"
          ? { event, data: { paneId: "p1", exitCode: 0 } }
          : { event, data: { paneId: "p1" } },
      );

      await expect(running).rejects.toMatchObject({ code: "pane_closed" });
      expectRestored(term);
    },
  );

  it("サーバ側の切断で connection_closed で終わる（AC7）", async () => {
    const client = fakeClient();
    useClient(client);
    const term = fakeTerminal();
    const running = runPaneAttach(cmd(), store, term);
    await waitAttached(client);

    client.emitClose(1006, "");

    await expect(running).rejects.toMatchObject({ code: "connection_closed" });
    expectRestored(term);
  });

  it("raw モードに入った後の想定外の失敗（pane.subscribe の失敗）でも端末を戻してからエラーを返す（AC7）", async () => {
    const client = fakeClient({
      subscribeError: new RpcFailure("not_found", "pane not found: p1"),
    });
    useClient(client);
    const term = fakeTerminal();

    await expect(runPaneAttach(cmd(), store, term)).rejects.toMatchObject({ code: "not_found" });
    expectRestored(term);
  });

  it("pane.attach が拒まれたら（pane_attached）手元の端末に触らずにエラーを返す（AC8）", async () => {
    const client = fakeClient({
      attachError: new RpcFailure(
        "pane_attached",
        "pane p1 already has an attached client; retry with --takeover",
      ),
    });
    useClient(client);
    const term = fakeTerminal();

    await expect(runPaneAttach(cmd(), store, term)).rejects.toMatchObject({
      code: "pane_attached",
    });
    expect(term.writes).toEqual([]);
    expect(term.raw).toEqual([]);
    expect(client.requests.map((r) => r.method)).toEqual(["pane.attach"]);
  });

  it("pane.subscribe の応答を待つ間に切断されても、要求の時間切れを待たずに connection_closed で終わる（AC7）", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const client = fakeClient({ subscribeHangs: true });
      useClient(client);
      const term = fakeTerminal();
      const running = runPaneAttach(cmd(), store, term);
      running.catch(() => undefined);
      await vi.waitFor(() =>
        expect(client.requests.map((r) => r.method)).toContain("pane.subscribe"),
      );

      client.emitClose(1006, "");

      await expect(running).rejects.toMatchObject({ code: "connection_closed" });
      expectRestored(term);
    } finally {
      vi.useRealTimers();
    }
  });

  it("終わった後に届いた出力は書かない", async () => {
    const client = fakeClient();
    useClient(client);
    const term = fakeTerminal();
    const running = runPaneAttach(cmd(), store, term);
    await waitAttached(client);
    client.emitClose(1006, "gone");
    await expect(running).rejects.toMatchObject({ code: "connection_closed" });
    const writes = term.writes.length;

    client.emitOutput("p1", "late");
    expect(term.writes).toHaveLength(writes);
  });
  it("出力と SNAPSHOT から端末への問い合わせを取り除いて書く（手元の端末に答えさせない。D8）", async () => {
    const client = fakeClient({ snapshotText: "A\x1b]11;?\x07B" });
    useClient(client);
    const term = fakeTerminal();
    const running = runPaneAttach(cmd(), store, term);
    await waitAttached(client);
    expect(term.writes.slice(0, 2)).toEqual([ENTER_SCREEN, "AB"]);

    client.emitOutput("p1", "x\x1b[c\x1b[1my");
    client.emitOutput("p1", "\x1b[");
    client.emitOutput("p1", "6nz");
    expect(term.writes.slice(2)).toEqual(["x\x1b[1my", "z"]);

    term.type("\x02q");
    await running;
  });

  it("Ctrl+B q の後は detach の応答を待つ間も打鍵を送らず、その間の切断も切り離しとして正常に終える", async () => {
    const client = fakeClient({ detachHangs: true });
    useClient(client);
    const term = fakeTerminal();
    const running = runPaneAttach(cmd(), store, term);
    await waitAttached(client);

    term.type("\x02q");
    term.type("ls\r");
    expect(client.sendInput).not.toHaveBeenCalled();
    client.emitClose(1006, "");

    await expect(running).resolves.toBeUndefined();
    expectRestored(term);
  });

  it("SIGTERM・SIGHUP（onSignal）は切り離しと同じに扱う", async () => {
    const client = fakeClient();
    useClient(client);
    const term = fakeTerminal();
    const running = runPaneAttach(cmd(), store, term);
    await waitAttached(client);

    term.signal();

    await expect(running).resolves.toBeUndefined();
    expect(client.requests.at(-1)).toEqual({ method: "pane.detach", params: { paneId: "p1" } });
    expectRestored(term);
  });
  it("SNAPSHOT は前の出力の書きかけの列を持ち越さずに描く", async () => {
    const client = fakeClient();
    useClient(client);
    const term = fakeTerminal();
    const running = runPaneAttach(cmd(), store, term);
    await waitAttached(client);

    client.emitOutput("p1", "a\x1b]0;ti");
    // 流量制御からの再開などで SNAPSHOT が送り直される。
    const snap = vi.mocked(client.onSnapshot).mock.calls[0]![0];
    snap("p1", 100, 30, "\x1b[H\x1b[2Jscreen");
    expect(term.writes.slice(-2)).toEqual(["a", "\x1b[H\x1b[2Jscreen"]);

    term.type("\x02q");
    await running;
  });

  it.each(["taken", "closed"] as const)(
    "切り離しを始めた後に届いた %s は切り離しとして正常に終える",
    async (what) => {
      const client = fakeClient({ detachHangs: true });
      useClient(client);
      const term = fakeTerminal();
      const running = runPaneAttach(cmd(), store, term);
      await waitAttached(client);

      term.type("\x02q");
      client.emitEvent(
        what === "taken"
          ? { event: "pane.attach_changed", data: { paneId: "p1", clientId: "other" } }
          : { event: "pane.closed", data: { paneId: "p1" } },
      );

      await expect(running).resolves.toBeUndefined();
      expectRestored(term);
    },
  );
});

describe("processTerminal（実物の process への配線）", () => {
  it("onSignal は SIGTERM と SIGHUP に付け、解除で両方から外す", () => {
    const cb = (): void => undefined;
    const off = processTerminal().onSignal(cb);
    expect(process.listeners("SIGTERM")).toContain(cb);
    expect(process.listeners("SIGHUP")).toContain(cb);
    off();
    expect(process.listeners("SIGTERM")).not.toContain(cb);
    expect(process.listeners("SIGHUP")).not.toContain(cb);
  });
});

describe("runPaneAttach — 自分の pane（20260926-agent-skill-file。AC11）", () => {
  it("自分の pane には、端末を触らず・接続せずに self_target", async () => {
    const term = fakeTerminal();
    const own = {
      ...cmd(),
      opts: { ...OPTS, caller: { paneId: "p1", serverUrl: "http://127.0.0.1:7780" } },
    };
    await expect(runPaneAttach(own, store, term)).rejects.toMatchObject({
      code: "self_target",
      message: expect.stringContaining("SODA_PANE_ID= sodactl"),
    });
    expect(mockedWithSession).not.toHaveBeenCalled();
    expect(term.writes).toEqual([]);
    expect(term.raw).toEqual([]);
  });
});
