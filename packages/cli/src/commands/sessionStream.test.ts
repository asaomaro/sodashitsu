import type { ServerEvent } from "@wtm/protocol";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SessionStore } from "../session.js";
import { MAX_CONTROL_LINE_BYTES, OUTPUT_HIGH_WATERMARK_BYTES } from "../sessionStream.js";
import { RpcFailure, type WtmClient } from "../wsClient.js";
import {
  FLUSH_TIMEOUT_MS,
  MAX_WARN_PENDING_BYTES,
  runPaneControl,
  runPaneObserve,
  type StreamIo,
} from "./sessionStream.js";

vi.mock("../withSession.js", () => ({ withSession: vi.fn() }));

import { withSession } from "../withSession.js";

const mockedWithSession = vi.mocked(withSession);
const OPTS = { url: "http://127.0.0.1:7780", token: undefined };
const store = {} as SessionStore;
const enc = new TextEncoder();

interface FakeClient extends WtmClient {
  emitEvent(evt: ServerEvent): void;
  emitOutput(paneId: string, text: string | Uint8Array): void;
  emitSnapshot(paneId: string, cols: number, rows: number, text: string): void;
  emitClose(code: number, reason: string): void;
  requests: { method: string; params: unknown }[];
  flow: string[];
}

interface FakeOptions {
  attachError?: RpcFailure;
  subscribeError?: RpcFailure;
  /** subscribe の応答を返さない（切断で待ち中の要求が reject されない実物の WtmClient を模す）。 */
  subscribeHangs?: boolean;
  /** detach の応答を返さない。 */
  detachHangs?: boolean;
  /** detach を失敗させる。 */
  detachError?: RpcFailure;
  /** SNAPSHOT の中身（既定 "SNAPSHOT"）と大きさ。 */
  snapshotText?: string;
  snapshotSize?: { cols: number; rows: number };
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
  const flow: string[] = [];
  const emitEvent = (evt: ServerEvent): void => eventCbs.forEach((cb) => cb(evt));
  const emitSnapshot = (paneId: string, cols: number, rows: number, text: string): void =>
    snapshotCbs.forEach((cb) => cb(paneId, cols, rows, text));
  return {
    requests,
    flow,
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
        const size = opts.snapshotSize ?? { cols: 100, rows: 30 };
        emitSnapshot(params.paneId, size.cols, size.rows, opts.snapshotText ?? "SNAPSHOT");
        return Promise.resolve(size);
      }
      if (method === "pane.detach") {
        if (opts.detachHangs) return new Promise(() => undefined);
        if (opts.detachError) return Promise.reject(opts.detachError);
      }
      return Promise.resolve({});
    }),
    sendInput: vi.fn(),
    onEvent: vi.fn((cb: (evt: ServerEvent) => void) => eventCbs.push(cb)),
    onOutput: vi.fn((cb: (paneId: string, chunk: Uint8Array) => void) => outputCbs.push(cb)),
    onSnapshot: vi.fn((cb: (paneId: string, cols: number, rows: number, text: string) => void) =>
      snapshotCbs.push(cb),
    ),
    onClose: vi.fn((cb: (code: number, reason: string) => void) => closeCbs.push(cb)),
    pause: vi.fn(() => flow.push("pause")),
    resume: vi.fn(() => flow.push("resume")),
    close: vi.fn(() => flow.push("close")),
    emitEvent,
    emitSnapshot,
    emitOutput: (paneId: string, data: string | Uint8Array) =>
      outputCbs.forEach((cb) => cb(paneId, typeof data === "string" ? enc.encode(data) : data)),
    emitClose: (code: number, reason: string) => closeCbs.forEach((cb) => cb(code, reason)),
  } as unknown as FakeClient;
}

interface FakeIo extends StreamIo {
  out: string[];
  warnings: string[];
  pending: number;
  errPendingBytes: number;
  inStopped: boolean;
  inFlow: string[];
  flushed: number;
  drain(): void;
  outError(): void;
  input(text: string | Uint8Array): void;
  inEnd(): void;
  signal(): void;
  listeners(): number;
}

function fakeIo(): FakeIo {
  let drainCb: (() => void) | null = null;
  let errorCb: (() => void) | null = null;
  let inCb: ((c: Uint8Array) => void) | null = null;
  let inEndCb: (() => void) | null = null;
  let signalCb: (() => void) | null = null;
  const io: FakeIo = {
    out: [],
    warnings: [],
    pending: 0,
    errPendingBytes: 0,
    inStopped: false,
    inFlow: [],
    flushed: 0,
    writeOut: (line) => io.out.push(line),
    outPending: () => io.pending,
    onOutDrain: (cb) => {
      drainCb = cb;
      return () => (drainCb = null);
    },
    onOutError: (cb) => {
      errorCb = cb;
      return () => (errorCb = null);
    },
    warn: (line) => io.warnings.push(line),
    errPending: () => io.errPendingBytes,
    onIn: (cb) => {
      inCb = cb;
      return () => (inCb = null);
    },
    onInEnd: (cb) => {
      inEndCb = cb;
      return () => (inEndCb = null);
    },
    stopIn: () => {
      io.inStopped = true;
      io.inFlow.push("stop");
    },
    resumeIn: () => {
      io.inStopped = false;
      io.inFlow.push("resume");
    },
    flushOut: () => {
      io.flushed += 1;
      return Promise.resolve();
    },
    onSignal: (cb) => {
      signalCb = cb;
      return () => (signalCb = null);
    },
    drain: () => drainCb?.(),
    outError: () => errorCb?.(),
    input: (data) => inCb?.(typeof data === "string" ? enc.encode(data) : data),
    inEnd: () => inEndCb?.(),
    signal: () => signalCb?.(),
    listeners: () =>
      (drainCb ? 1 : 0) +
      (errorCb ? 1 : 0) +
      (inCb ? 1 : 0) +
      (inEndCb ? 1 : 0) +
      (signalCb ? 1 : 0),
  };
  return io;
}

interface Frame {
  type: string;
  seq?: number;
  encoding?: string;
  width?: number;
  height?: number;
  full?: boolean;
  bytes?: string;
  reason?: string;
}

const records = (io: FakeIo): Frame[] => io.out.map((l) => JSON.parse(l) as Frame);
const textOf = (f: Frame): string => Buffer.from(f.bytes ?? "", "base64").toString("utf8");

function useClient(client: FakeClient): void {
  mockedWithSession.mockImplementation(async (_o, _s, fn) => fn(client));
}

const observeCmd = { kind: "pane-observe" as const, opts: OPTS, paneId: "p1" };

async function waitSubscribed(client: FakeClient): Promise<void> {
  await vi.waitFor(() => expect(client.requests.map((r) => r.method)).toContain("pane.subscribe"));
  await new Promise((r) => setTimeout(r, 0)); // subscribe の応答の後始末（受信を止めてよくなる）まで進める
}

beforeEach(() => {
  mockedWithSession.mockReset();
});

describe("runPaneObserve（20260926-pane-observe-control）", () => {
  it("最初の行は full:true のフレームで、seq は 1・大きさは SNAPSHOT の大きさ・bytes は画面（AC1）", async () => {
    const client = fakeClient({
      snapshotText: "画面\r\n$ ",
      snapshotSize: { cols: 120, rows: 40 },
    });
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    client.emitEvent({ event: "pane.exited", data: { paneId: "p1", exitCode: 0 } } as ServerEvent);
    await running;
    const [first] = records(io);
    expect(first).toEqual({
      type: "terminal.frame",
      seq: 1,
      encoding: "ansi",
      width: 120,
      height: 40,
      full: true,
      bytes: Buffer.from("画面\r\n$ ", "utf8").toString("base64"),
    });
  });

  it("以後の出力は full:false で seq が 1 ずつ増え、SNAPSHOT の送り直しは full:true（AC2）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    client.emitOutput("p1", "one");
    client.emitOutput("p2", "other pane");
    client.emitOutput("p1", "two");
    client.emitSnapshot("p1", 100, 30, "REDRAW");
    client.emitOutput("p1", "three");
    client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    await running;
    const frames = records(io).filter((r) => r.type === "terminal.frame");
    expect(frames.map((f) => [f.seq, f.full, textOf(f)])).toEqual([
      [1, true, "SNAPSHOT"],
      [2, false, "one"],
      [3, false, "two"],
      [4, true, "REDRAW"],
      [5, false, "three"],
    ]);
  });

  it("UTF-8 の文字が出力の区切りをまたいでも 1 文字に戻し、SNAPSHOT で書きかけを捨てる", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    const bytes = enc.encode("あい");
    client.emitOutput("p1", bytes.subarray(0, 2));
    client.emitOutput("p1", bytes.subarray(2));
    client.emitOutput("p1", bytes.subarray(0, 1)); // 書きかけのまま
    client.emitSnapshot("p1", 100, 30, "S");
    client.emitOutput("p1", "x");
    client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    await running;
    const texts = records(io)
      .filter((r) => r.type === "terminal.frame")
      .map(textOf);
    expect(texts).toEqual(["SNAPSHOT", "あい", "S", "x"]);
  });

  it("端末への問い合わせはフレームから取り除き、取り除いて空になった出力はフレームにしない（D3）", async () => {
    const client = fakeClient({ snapshotText: "A\x1b[cB" });
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    client.emitOutput("p1", "\x1b[6n");
    client.emitOutput("p1", "C\x1b[>c");
    client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    await running;
    const frames = records(io).filter((r) => r.type === "terminal.frame");
    expect(frames.map((f) => [f.seq, textOf(f)])).toEqual([
      [1, "AB"],
      [2, "C"],
    ]);
  });

  it("出力の終わりで書きかけの問い合わせの列は SNAPSHOT に持ち越さない", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    client.emitOutput("p1", "A\x1b["); // 列の途中で区切れた（次の出力まで持ち越される）
    client.emitSnapshot("p1", 100, 30, "6nB");
    client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    await running;
    const texts = records(io)
      .filter((r) => r.type === "terminal.frame")
      .map(textOf);
    expect(texts).toEqual(["SNAPSHOT", "A", "6nB"]);
  });

  it("pane.size_changed の後のフレームは新しい大きさ（AC3）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    client.emitEvent({ event: "pane.size_changed", data: { paneId: "p2", cols: 1, rows: 1 } });
    client.emitOutput("p1", "a");
    client.emitEvent({ event: "pane.size_changed", data: { paneId: "p1", cols: 90, rows: 25 } });
    client.emitOutput("p1", "b");
    client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    await running;
    const frames = records(io).filter((r) => r.type === "terminal.frame");
    expect(frames.map((f) => [textOf(f), f.width, f.height])).toEqual([
      ["SNAPSHOT", 100, 30],
      ["a", 100, 30],
      ["b", 90, 25],
    ]);
  });

  it.each([
    ["pane.exited", { event: "pane.exited", data: { paneId: "p1", exitCode: 0 } }],
    ["pane.closed", { event: "pane.closed", data: { paneId: "p1" } }],
  ])(
    "%s で terminal.closed(pane_closed) を書いて正常に終わり、以後は何も書かない（AC4）",
    async (_n, evt) => {
      const client = fakeClient();
      useClient(client);
      const io = fakeIo();
      const running = runPaneObserve(observeCmd, store, io);
      await waitSubscribed(client);
      client.emitEvent(evt as ServerEvent);
      await expect(running).resolves.toBeUndefined();
      client.emitOutput("p1", "late");
      client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
      client.emitClose(1006, "late");
      expect(records(io).at(-1)).toEqual({ type: "terminal.closed", reason: "pane_closed" });
      expect(records(io).filter((r) => r.type === "terminal.closed")).toHaveLength(1);
      expect(io.listeners()).toBe(0);
    },
  );

  it("別の pane の終わりでは終わらない", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    client.emitEvent({ event: "pane.closed", data: { paneId: "p2" } } as ServerEvent);
    client.emitOutput("p1", "still");
    client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    await running;
    expect(records(io).map((r) => r.type)).toEqual([
      "terminal.frame",
      "terminal.frame",
      "terminal.closed",
    ]);
  });

  it("接続が切れたら terminal.closed(connection_closed) を書いて connection_closed で失敗する（AC4）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    client.emitClose(1006, "gone");
    await expect(running).rejects.toMatchObject({ code: "connection_closed" });
    expect(records(io).at(-1)).toEqual({ type: "terminal.closed", reason: "connection_closed" });
  });

  it("subscribe の応答待ちの間に切れても、終わりを待って connection_closed で失敗する", async () => {
    const client = fakeClient({ subscribeHangs: true });
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    client.emitClose(1006, "gone");
    await expect(running).rejects.toMatchObject({ code: "connection_closed" });
  });

  it("pane が無ければ stdout に何も書かず not_found で失敗する（AC4）", async () => {
    const client = fakeClient({
      subscribeError: new RpcFailure("not_found", "pane not found: p1"),
    });
    useClient(client);
    const io = fakeIo();
    await expect(runPaneObserve(observeCmd, store, io)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(io.out).toEqual([]);
    expect(io.listeners()).toBe(0);
  });

  it("サーバへ送る要求は pane.subscribe だけ（所有者・大きさ・入力に触れない。AC5）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    client.emitOutput("p1", "x");
    client.emitEvent({ event: "pane.attach_changed", data: { paneId: "p1", clientId: "other" } });
    client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    await running;
    expect(client.requests.map((r) => r.method)).toEqual(["pane.subscribe"]);
    expect(client.requests[0]!.params).toEqual({ paneId: "p1", scrollbackLines: 0 });
    expect(client.sendInput).not.toHaveBeenCalled();
    expect(io.inStopped).toBe(false);
  });

  it("書き出し待ちが上限を超えたら受信を止め、drain で再開する。止めるのは 1 回だけ（AC14）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    io.pending = OUTPUT_HIGH_WATERMARK_BYTES; // ちょうどでは止めない
    client.emitOutput("p1", "a");
    expect(client.flow).toEqual([]);
    io.pending = OUTPUT_HIGH_WATERMARK_BYTES + 1;
    client.emitOutput("p1", "b");
    client.emitOutput("p1", "c");
    expect(client.flow).toEqual(["pause"]);
    io.pending = 0;
    io.drain();
    io.drain(); // 止めていなければ何もしない
    expect(client.flow).toEqual(["pause", "resume"]);
    // 止めている間に捨てられた出力の代わりに、再開後の SNAPSHOT が full:true で届く。
    client.emitSnapshot("p1", 100, 30, "AFTER");
    client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    await running;
    const frames = records(io).filter((r) => r.type === "terminal.frame");
    expect(frames.at(-1)).toMatchObject({ full: true, seq: 5 });
    expect(textOf(frames.at(-1)!)).toBe("AFTER");
  });

  it("SNAPSHOT のフレームで上限を超えたら、subscribe の応答を受け取ってから受信を止める（応答が読めなくならないように）", async () => {
    const client = fakeClient({ subscribeHangs: true });
    useClient(client);
    const io = fakeIo();
    io.pending = OUTPUT_HIGH_WATERMARK_BYTES + 1;
    let answer!: () => void;
    vi.mocked(client.request).mockImplementation((method: string, params: unknown) => {
      client.requests.push({ method, params });
      client.emitSnapshot("p1", 100, 30, "BIG");
      return new Promise((resolve) => (answer = () => resolve({ cols: 100, rows: 30 } as never)));
    });
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    expect(records(io)).toHaveLength(1);
    expect(client.flow).toEqual([]);
    answer();
    await vi.waitFor(() => expect(client.flow).toEqual(["pause"]));
    client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    await running;
  });

  it("受信を止めたまま終わっても、接続を閉じる前に受信を再開する（close フレームを読めるように）", async () => {
    const client = fakeClient();
    // 実物の withSession と同じく、fn の後で接続を閉じる。
    mockedWithSession.mockImplementation(async (_o, _s, fn) => {
      try {
        return await fn(client);
      } finally {
        client.close();
      }
    });
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    io.pending = OUTPUT_HIGH_WATERMARK_BYTES + 1;
    client.emitOutput("p1", "flood");
    expect(client.flow).toEqual(["pause"]);
    client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    await running;
    expect(client.flow).toEqual(["pause", "resume", "close"]);
  });

  it("最初の SNAPSHOT より前の OUTPUT はフレームにしない", async () => {
    const client = fakeClient({ subscribeHangs: true });
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    client.emitOutput("p1", "early");
    client.emitSnapshot("p1", 100, 30, "S");
    client.emitOutput("p1", "late");
    client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
    await running;
    const frames = records(io).filter((r) => r.type === "terminal.frame");
    expect(frames.map((f) => [f.seq, f.full, textOf(f)])).toEqual([
      [1, true, "S"],
      [2, false, "late"],
    ]);
  });

  it("stdout に書けなくなったら terminal.closed を書かずに output_closed で失敗する", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneObserve(observeCmd, store, io);
    await waitSubscribed(client);
    io.outError();
    await expect(running).rejects.toMatchObject({ code: "output_closed" });
    expect(records(io).map((r) => r.type)).toEqual(["terminal.frame"]);
    expect(io.listeners()).toBe(0);
  });
});

const controlCmd = (over: Partial<{ takeover: boolean; cols: number; rows: number }> = {}) => ({
  kind: "pane-control" as const,
  opts: OPTS,
  paneId: "p1",
  takeover: false,
  cols: 120,
  rows: 40,
  ...over,
});

const sentInputs = (client: FakeClient): string[] =>
  vi.mocked(client.sendInput).mock.calls.map(([, bytes]) => Buffer.from(bytes).toString("latin1"));

describe("runPaneControl（20260926-pane-observe-control）", () => {
  it("所有者になって大きさを当ててから購読し、observe と同じ形のフレームを流す（AC6）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneControl(controlCmd({ cols: 90, rows: 25, takeover: true }), store, io);
    await waitSubscribed(client);
    expect(client.requests.map((r) => r.method)).toEqual(["pane.attach", "pane.subscribe"]);
    expect(client.requests[0]!.params).toEqual({
      paneId: "p1",
      cols: 90,
      rows: 25,
      takeover: true,
    });
    client.emitOutput("p1", "out");
    io.input('{"type":"terminal.release"}\n');
    await running;
    expect(records(io).map((r) => [r.type, r.seq, r.full])).toEqual([
      ["terminal.frame", 1, true],
      ["terminal.frame", 2, false],
      ["terminal.closed", undefined, undefined],
    ]);
  });

  it("terminal.input の text と bytes を INPUT で送り、空の入力は送らない（AC7）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    io.input(
      '{"type":"terminal.input","text":"ls\\r"}\n{"type":"terminal.input","bytes":"Aw=="}\n',
    );
    io.input('{"type":"terminal.input","text":""}\n');
    io.input('{"type":"terminal.input","te');
    io.input('xt":"split"}\n');
    expect(sentInputs(client)).toEqual(["ls\r", "\x03", "split"]);
    expect(vi.mocked(client.sendInput).mock.calls.every(([p]) => p === "p1")).toBe(true);
    io.input('{"type":"terminal.release"}\n');
    await running;
    expect(io.warnings).toEqual([]);
  });

  it("terminal.resize は pane.attach_resize。失敗しても続ける（AC8）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    io.input('{"type":"terminal.resize","cols":100,"rows":30,"cell_width_px":8}\n');
    await vi.waitFor(() =>
      expect(client.requests.at(-1)).toEqual({
        method: "pane.attach_resize",
        params: { paneId: "p1", cols: 100, rows: 30 },
      }),
    );
    io.input('{"type":"terminal.release"}\n');
    await running;
  });

  it.each([
    ["terminal.release", (io: FakeIo) => io.input('{"type":"terminal.release"}\n')],
    ["stdin の終わり", (io: FakeIo) => io.inEnd()],
    ["シグナル", (io: FakeIo) => io.signal()],
  ])(
    "%s で所有を返し、terminal.closed(released) を書いて正常に終わる（AC9）",
    async (_n, trigger) => {
      const client = fakeClient();
      useClient(client);
      const io = fakeIo();
      const running = runPaneControl(controlCmd(), store, io);
      await waitSubscribed(client);
      trigger(io);
      await expect(running).resolves.toBeUndefined();
      expect(client.requests.map((r) => r.method)).toContain("pane.detach");
      expect(client.requests.find((r) => r.method === "pane.detach")!.params).toEqual({
        paneId: "p1",
      });
      expect(records(io).at(-1)).toEqual({ type: "terminal.closed", reason: "released" });
      expect(io.listeners()).toBe(0);
      expect(io.inStopped).toBe(true);
    },
  );

  it("stdin の終わりでは、改行の無い最後の行を処理してから所有を返す", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    io.input('{"type":"terminal.input","text":"last"}');
    io.inEnd();
    await running;
    expect(sentInputs(client)).toEqual(["last"]);
  });

  it("detach が失敗しても released で終わる", async () => {
    const client = fakeClient({ detachError: new RpcFailure("connection_closed", "x") });
    useClient(client);
    const io = fakeIo();
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    io.inEnd();
    await expect(running).resolves.toBeUndefined();
    expect(records(io).at(-1)).toEqual({ type: "terminal.closed", reason: "released" });
  });

  it.each([
    [
      "奪取",
      (c: FakeClient) =>
        c.emitEvent({ event: "pane.attach_changed", data: { paneId: "p1", clientId: "other" } }),
    ],
    [
      "pane の終了",
      (c: FakeClient) =>
        c.emitEvent({ event: "pane.exited", data: { paneId: "p1", exitCode: 0 } } as ServerEvent),
    ],
    [
      "pane の close",
      (c: FakeClient) =>
        c.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent),
    ],
    ["切断", (c: FakeClient) => c.emitClose(1006, "gone")],
  ])(
    "解放中（detach の応答待ち）に届いた%sは released として終える。以後の行は処理しない",
    async (_n, trigger) => {
      const client = fakeClient({ detachHangs: true });
      useClient(client);
      const io = fakeIo();
      const running = runPaneControl(controlCmd(), store, io);
      await waitSubscribed(client);
      io.input('{"type":"terminal.release"}\n{"type":"terminal.input","text":"after"}\n');
      trigger(client);
      await expect(running).resolves.toBeUndefined();
      expect(records(io).at(-1)).toEqual({ type: "terminal.closed", reason: "released" });
      expect(client.sendInput).not.toHaveBeenCalled();
    },
  );

  it("別の所有者がいれば stdout に何も書かず pane_attached で失敗する（AC10）", async () => {
    const client = fakeClient({
      attachError: new RpcFailure(
        "pane_attached",
        "pane p1 already has an attached client; retry with --takeover",
      ),
    });
    useClient(client);
    const io = fakeIo();
    await expect(runPaneControl(controlCmd(), store, io)).rejects.toMatchObject({
      code: "pane_attached",
    });
    expect(io.out).toEqual([]);
    expect(client.requests.map((r) => r.method)).toEqual(["pane.attach"]);
    expect(io.listeners()).toBe(0);
  });

  it("奪われたら terminal.closed(taken_over) を書いて attach_taken_over で失敗する（AC10）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    client.emitEvent({ event: "pane.attach_changed", data: { paneId: "p9", clientId: "other" } });
    client.emitEvent({ event: "pane.attach_changed", data: { paneId: "p1", clientId: "other" } });
    await expect(running).rejects.toMatchObject({ code: "attach_taken_over" });
    expect(records(io).at(-1)).toEqual({ type: "terminal.closed", reason: "taken_over" });
    expect(io.listeners()).toBe(0);
    expect(io.inStopped).toBe(true);
  });

  it("自分が所有者になる前に届いた別の clientId では奪われたとしない", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    // hello の応答と同じ受信の塊で（自分の clientId を知る前に）別の直結の変化が届く（前の所有者が抜けた等）。
    vi.mocked(client.hello).mockImplementationOnce((cb?: (evt: ServerEvent) => void) => {
      const result = Promise.resolve({
        clientId: "me",
        snapshot: { panes: [{ id: "p1" }] },
      } as never);
      if (cb) {
        client.onEvent(cb);
        queueMicrotask(() =>
          client.emitEvent({
            event: "pane.attach_changed",
            data: { paneId: "p1", clientId: "old" },
          }),
        );
      }
      return result;
    });
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    io.input('{"type":"terminal.release"}\n');
    await expect(running).resolves.toBeUndefined();
  });

  it("pane が終わったら terminal.closed(pane_closed) で正常に終わる。接続断は connection_closed（AC9・AC4）", async () => {
    const a = fakeClient();
    useClient(a);
    const ioA = fakeIo();
    const runningA = runPaneControl(controlCmd(), store, ioA);
    await waitSubscribed(a);
    a.emitEvent({ event: "pane.exited", data: { paneId: "p1", exitCode: 0 } } as ServerEvent);
    await expect(runningA).resolves.toBeUndefined();
    expect(records(ioA).at(-1)).toEqual({ type: "terminal.closed", reason: "pane_closed" });

    const b = fakeClient();
    useClient(b);
    const ioB = fakeIo();
    const runningB = runPaneControl(controlCmd(), store, ioB);
    await waitSubscribed(b);
    b.emitClose(1006, "gone");
    await expect(runningB).rejects.toMatchObject({ code: "connection_closed" });
    expect(records(ioB).at(-1)).toEqual({ type: "terminal.closed", reason: "connection_closed" });
  });

  it("不正な行はサーバに何も送らず stderr に 1 行ずつ理由を出し、後の正しい行は処理する。空行は黙って無視（AC11）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    const before = client.requests.length;
    io.input(
      [
        "not json",
        '{"type":"terminal.exec","text":"x"}',
        '{"type":"terminal.input","text":"x","paneId":"p2"}',
        '{"type":"terminal.input","text":"x","bytes":"eA=="}',
        '{"type":"terminal.input","bytes":"not base64"}',
        '{"type":"terminal.resize","cols":0,"rows":24}',
        '{"type":"terminal.scroll","direction":"up","lines":1}',
        "",
        "   ",
        '{"type":"terminal.input","text":"ok"}',
        "",
      ].join("\n"),
    );
    expect(io.warnings).toHaveLength(7);
    for (const w of io.warnings) {
      expect(w).toMatch(/^wtmctl: pane control input ignored: .+\n$/);
    }
    expect(io.warnings[6]).toContain("terminal.scroll is not supported");
    expect(sentInputs(client)).toEqual(["ok"]);
    expect(client.requests.length).toBe(before);
    io.input('{"type":"terminal.release"}\n');
    await running;
  });

  it("1 MiB を超える行は送らずに 1 回だけ警告し、次の行から処理を続ける（途中で分割されて届いても同じ。AC12）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    const huge = `{"type":"terminal.input","text":"${"a".repeat(MAX_CONTROL_LINE_BYTES)}"}`;
    io.input(huge.slice(0, 600_000));
    io.input(huge.slice(600_000));
    io.input('\n{"type":"terminal.input","text":"next"}\n');
    expect(io.warnings).toEqual([
      `wtmctl: pane control input ignored: line exceeds ${MAX_CONTROL_LINE_BYTES} bytes\n`,
    ]);
    expect(sentInputs(client)).toEqual(["next"]);
    io.input('{"type":"terminal.release"}\n');
    await running;
  });

  it("所有の後に subscribe が失敗したら、そのエラーで終わり stdout に何も書かない", async () => {
    const client = fakeClient({
      subscribeError: new RpcFailure("not_found", "pane not found: p1"),
    });
    useClient(client);
    const io = fakeIo();
    await expect(runPaneControl(controlCmd(), store, io)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(io.out).toEqual([]);
    expect(io.listeners()).toBe(0);
    expect(io.inStopped).toBe(true);
  });

  it("attach が通る前に届いた pane の終わりでは何も書かず、attach の失敗で終わる（始まる前の失敗は stdout に何も書かない）", async () => {
    const client = fakeClient({ attachError: new RpcFailure("not_found", "pane not found: p1") });
    useClient(client);
    const io = fakeIo();
    vi.mocked(client.hello).mockImplementationOnce((cb?: (evt: ServerEvent) => void) => {
      if (cb) {
        client.onEvent(cb);
        queueMicrotask(() =>
          client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent),
        );
      }
      return Promise.resolve({ clientId: "me", snapshot: { panes: [{ id: "p1" }] } } as never);
    });
    await expect(runPaneControl(controlCmd(), store, io)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(io.out).toEqual([]);
  });

  it("受信を止めている間に解放を始めたら受信を再開する（detach の応答が読めるように）", async () => {
    const client = fakeClient({ detachHangs: true });
    useClient(client);
    const io = fakeIo();
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    io.pending = OUTPUT_HIGH_WATERMARK_BYTES + 1;
    client.emitOutput("p1", "flood");
    expect(client.flow).toEqual(["pause"]);
    io.input('{"type":"terminal.release"}\n');
    expect(client.flow).toEqual(["pause", "resume"]);
    client.emitOutput("p1", "more"); // 解放中は止め直さない
    expect(client.flow).toEqual(["pause", "resume"]);
    // detach の応答が返らなくても、2 度目のシグナルで終える。
    io.signal();
    await expect(running).resolves.toBeUndefined();
    expect(records(io).at(-1)).toEqual({ type: "terminal.closed", reason: "released" });
  });

  it("subscribe の応答より先に解放を始めたら、応答の後も受信を止めない（detach の応答が読めるように）", async () => {
    const client = fakeClient({ detachHangs: true });
    useClient(client);
    const io = fakeIo();
    let answer!: () => void;
    const base = vi.mocked(client.request).getMockImplementation()!;
    vi.mocked(client.request).mockImplementation((method: string, params: unknown) => {
      if (method !== "pane.subscribe") return base(method as never, params as never);
      client.requests.push({ method, params });
      client.emitSnapshot("p1", 100, 30, "S");
      return new Promise((resolve) => (answer = () => resolve({ cols: 100, rows: 30 } as never)));
    });
    const running = runPaneControl(controlCmd(), store, io);
    await vi.waitFor(() =>
      expect(client.requests.map((r) => r.method)).toContain("pane.subscribe"),
    );
    io.inEnd();
    answer();
    await new Promise((r) => setTimeout(r, 0));
    io.pending = OUTPUT_HIGH_WATERMARK_BYTES + 1;
    client.emitOutput("p1", "flood");
    expect(client.flow).toEqual([]);
    io.signal();
    await expect(running).resolves.toBeUndefined();
  });

  it("attach の応答と同じ受信の塊で直後に届いた pane の終わりも取りこぼさない（溜めて attach の後に渡す）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const base = vi.mocked(client.request).getMockImplementation()!;
    vi.mocked(client.request).mockImplementation((method: string, params: unknown) => {
      const result = base(method as never, params as never);
      if (method === "pane.attach") {
        // 応答の Promise は解決済みだが、`await` の続き（microtask）より先に同期でイベントが届く。
        client.emitEvent({ event: "pane.closed", data: { paneId: "p1" } } as ServerEvent);
      }
      return result;
    });
    const running = runPaneControl(controlCmd(), store, io);
    await expect(running).resolves.toBeUndefined();
    expect(records(io)).toEqual([{ type: "terminal.closed", reason: "pane_closed" }]);
  });

  it("attach の応答待ちの間に切れたら、stdout に何も書かず connection_closed で終わる（時間切れを待たない）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    vi.mocked(client.request).mockImplementation((method: string, params: unknown) => {
      client.requests.push({ method, params });
      return new Promise(() => undefined);
    });
    const running = runPaneControl(controlCmd(), store, io);
    await vi.waitFor(() => expect(client.requests.map((r) => r.method)).toEqual(["pane.attach"]));
    client.emitClose(1006, "gone");
    await expect(running).rejects.toMatchObject({ code: "connection_closed" });
    expect(io.out).toEqual([]);
  });

  it("受信を止めている間は stdin も止め、再開したら stdin も再開する（奪取を読めないまま入力を送り続けない）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    io.pending = OUTPUT_HIGH_WATERMARK_BYTES + 1;
    client.emitOutput("p1", "flood");
    expect(io.inFlow).toEqual(["stop"]);
    io.pending = 0;
    io.drain();
    expect(io.inFlow).toEqual(["stop", "resume"]);
    io.input('{"type":"terminal.release"}\n');
    await running;
  });

  it("失敗で終わるときは stdout を書き出してから知らせる（terminal.closed が exit で失われないように）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    let flush!: () => void;
    io.flushOut = () => new Promise<void>((resolve) => (flush = resolve));
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    let settled = false;
    running.catch(() => undefined).finally(() => (settled = true));
    client.emitEvent({ event: "pane.attach_changed", data: { paneId: "p1", clientId: "other" } });
    await new Promise((r) => setTimeout(r, 0));
    expect(settled).toBe(false);
    expect(records(io).at(-1)).toEqual({ type: "terminal.closed", reason: "taken_over" });
    flush();
    await expect(running).rejects.toMatchObject({ code: "attach_taken_over" });
  });

  it("読み手が止まって書き出しが終わらなくても、上限の時間で失敗として終える", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    io.flushOut = () => new Promise<void>(() => undefined);
    const running = runPaneControl(controlCmd(), store, io);
    running.catch(() => undefined); // 時間を進める間に reject される（下で確かめる）
    await waitSubscribed(client);
    vi.useFakeTimers();
    try {
      client.emitEvent({ event: "pane.attach_changed", data: { paneId: "p1", clientId: "other" } });
      await vi.advanceTimersByTimeAsync(FLUSH_TIMEOUT_MS);
      await expect(running).rejects.toMatchObject({ code: "attach_taken_over" });
    } finally {
      vi.useRealTimers();
    }
  });

  it("attach の応答と同じ受信の塊で直後に切れたら、始めてから connection_closed で終える", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const base = vi.mocked(client.request).getMockImplementation()!;
    vi.mocked(client.request).mockImplementation((method: string, params: unknown) => {
      const result = base(method as never, params as never);
      if (method === "pane.attach") client.emitClose(1006, "gone");
      return result;
    });
    await expect(runPaneControl(controlCmd(), store, io)).rejects.toMatchObject({
      code: "connection_closed",
    });
    expect(records(io)).toEqual([{ type: "terminal.closed", reason: "connection_closed" }]);
  });

  it("stderr の書き出し待ちが上限を超えている間は警告を捨てる（読まない stderr でメモリを使い続けない）", async () => {
    const client = fakeClient();
    useClient(client);
    const io = fakeIo();
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    io.errPendingBytes = MAX_WARN_PENDING_BYTES; // ちょうどでは捨てない
    io.input("bad\n");
    io.errPendingBytes = MAX_WARN_PENDING_BYTES + 1;
    io.input('bad\n{"type":"terminal.scroll"}\n');
    io.errPendingBytes = 0;
    io.input("bad\n");
    expect(io.warnings).toHaveLength(2);
    io.input('{"type":"terminal.release"}\n');
    await running;
  });

  it("stdout に書けなくなったら解放中でも output_closed で終わる", async () => {
    const client = fakeClient({ detachHangs: true });
    useClient(client);
    const io = fakeIo();
    const running = runPaneControl(controlCmd(), store, io);
    await waitSubscribed(client);
    io.inEnd();
    io.outError();
    await expect(running).rejects.toMatchObject({ code: "output_closed" });
    expect(records(io).map((r) => r.type)).toEqual(["terminal.frame"]);
  });
});
