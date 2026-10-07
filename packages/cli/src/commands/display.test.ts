import { DISPLAY_CONTENT_MAX_BYTES, type DisplayLine, type DisplayWaitResult } from "@sodashitsu/protocol";
import { describe, expect, it, vi } from "vitest";
import { CliUsageError, parseArgs, type Command } from "../cliArgs.js";
import type { callPaneOp } from "../paneSocket.js";
import type { SessionStore } from "../session.js";
import { RpcFailure } from "../wsClient.js";
import {
  DISPLAY_RECONNECT_MS,
  DisplayUnsupported,
  isReconnectable,
  runDisplay,
  runWaitLoop,
  type DisplayDeps,
  type DisplayTransport,
  type WaitLoopIo,
} from "./display.js";

const PANE = "11111111-2222-3333-4444-555555555555";
const URL_ = "http://127.0.0.1:7780";
const IN_PANE = { SODA_PANE_ID: PANE, SODA_SERVER_URL: URL_, SODA_PANE_SOCKET: "/s/pane.sock" } as NodeJS.ProcessEnv;
const store = {} as SessionStore; // transport を差し替えるテストでは使わない

function parse(argv: string[], env: NodeJS.ProcessEnv = IN_PANE): Extract<Command, { kind: "display" }> {
  const cmd = parseArgs(["display", ...argv], env, "linux");
  if (cmd.kind !== "display") throw new Error("not display");
  return cmd;
}

class Out {
  lines: unknown[] = [];
  closed = false;
  deps(over: Partial<DisplayDeps> = {}): DisplayDeps {
    return {
      readStdin: () => Promise.reject(new Error("stdin is not expected")),
      readFile: () => Promise.reject(new Error("readFile is not expected")),
      print: (v) => void this.lines.push(v),
      outputClosed: () => this.closed,
      ...over,
    };
  }
}

/** 呼ばれた操作を記録し、操作ごとの結果を返す transport。 */
function stub(results: Record<string, unknown | (() => unknown)> = {}): DisplayTransport & { calls: { op: string; params: Record<string, unknown>; timeoutMs: number }[] } {
  const calls: { op: string; params: Record<string, unknown>; timeoutMs: number }[] = [];
  return {
    calls,
    call: async (op, params, timeoutMs) => {
      calls.push({ op, params, timeoutMs });
      const r = results[op];
      if (typeof r === "function") return (r as () => unknown)();
      if (r === undefined) throw new Error(`unexpected op ${op}`);
      return r;
    },
  };
}

const FEATURES = {
  features: ["panel", "band", "format:html"],
  limits: { contentBytes: DISPLAY_CONTENT_MAX_BYTES, requestLineBytes: 4 * 1024 * 1024 },
  renderers: { panel: 1, band: 1, actions: 1 },
  epoch: "E1",
};
const INFO = { id: "d1", paneId: PANE, name: "main", kind: "panel", format: "html", title: "main", size: 320, rev: 1, bytes: 3, updatedAt: "2026-01-01T00:00:00.000Z" };
const LIST = { displays: [], seq: 7, epoch: "E1" };
const SET_RESULT = { display: INFO, renderers: FEATURES.renderers, epoch: "E1", next: 4 };

describe("runDisplay set", () => {
  it("--html-file を読んで display.set を送り、結果を 1 行で出す", async () => {
    const out = new Out();
    const tr = stub({ "display.set": SET_RESULT });
    const readFile = vi.fn(async () => Buffer.from("<p>x</p>"));
    const code = await runDisplay(parse(["set", "main", "--kind", "panel", "--title", " T ", "--size", "400", "--html-file", "a.html"]), store, out.deps({ transport: tr, readFile }));
    expect(code).toBe(0);
    expect(readFile).toHaveBeenCalledWith("a.html", DISPLAY_CONTENT_MAX_BYTES);
    expect(tr.calls).toHaveLength(1);
    expect(tr.calls[0]).toMatchObject({ op: "display.set", params: { name: "main", kind: "panel", format: "html", content: "<p>x</p>", title: "T", size: 400 } });
    expect(out.lines).toEqual([{ status: "ok", display: INFO, renderers: FEATURES.renderers, epoch: "E1", next: 4 }]);
  });

  it("標準入力は --format の形で送る（省くと text）。--text はそのまま", async () => {
    const out = new Out();
    const tr = stub({ "display.set": SET_RESULT });
    const readStdin = vi.fn(async () => Buffer.from("# hi"));
    await runDisplay(parse(["set", "a", "--kind", "band"]), store, out.deps({ transport: tr, readStdin }));
    await runDisplay(parse(["set", "a", "--kind", "band", "--format", "markdown"]), store, out.deps({ transport: tr, readStdin }));
    await runDisplay(parse(["set", "a", "--kind", "band", "--text", "plain"]), store, out.deps({ transport: tr }));
    expect(tr.calls.map((c) => [c.params["format"], c.params["content"]])).toEqual([
      ["text", "# hi"],
      ["markdown", "# hi"],
      ["text", "plain"],
    ]);
    expect(readStdin).toHaveBeenCalledWith(DISPLAY_CONTENT_MAX_BYTES);
  });

  it("中身の誤りは、サーバへ送る前に使い方の誤り（2 MiB 超・UTF-8 でない・題の制御文字）", async () => {
    const out = new Out();
    const tr = stub({ "display.set": SET_RESULT });
    await expect(runDisplay(parse(["set", "a", "--kind", "band", "--text", "x".repeat(DISPLAY_CONTENT_MAX_BYTES + 1)]), store, out.deps({ transport: tr }))).rejects.toBeInstanceOf(CliUsageError);
    await expect(runDisplay(parse(["set", "a", "--kind", "band"]), store, out.deps({ transport: tr, readStdin: async () => Buffer.from([0xff, 0xfe, 0x41]) }))).rejects.toThrow(/UTF-8/);
    await expect(runDisplay(parse(["set", "a", "--kind", "band", "--text", "x", "--title", "a\nb"]), store, out.deps({ transport: tr }))).rejects.toBeInstanceOf(CliUsageError);
    expect(tr.calls).toEqual([]);
  });

  it("2 MiB ちょうどは送る。引用符だらけで 1 行が 4 MiB を超えるものは、送る前に使い方の誤り", async () => {
    const out = new Out();
    const tr = stub({ "display.set": SET_RESULT, "display.features": FEATURES });
    const exact = "a".repeat(DISPLAY_CONTENT_MAX_BYTES);
    await runDisplay(parse(["set", "a", "--kind", "band", "--text", exact]), store, out.deps({ transport: tr }));
    expect(tr.calls.at(-1)).toMatchObject({ op: "display.set" });
    const before = tr.calls.length;
    await expect(runDisplay(parse(["set", "a", "--kind", "band", "--text", '"'.repeat(DISPLAY_CONTENT_MAX_BYTES)]), store, out.deps({ transport: tr }))).rejects.toThrow(/too many characters that need escaping/);
    expect(tr.calls).toHaveLength(before);
  });

  it("1 行が 1 MiB を超えるときは、先に display.features を呼ぶ。サーバの上限を超えるなら使い方の誤り。古いサーバは unsupported", async () => {
    const out = new Out();
    const big = "a".repeat(1024 * 1024 + 10);
    const tr = stub({ "display.set": SET_RESULT, "display.features": FEATURES });
    await runDisplay(parse(["set", "a", "--kind", "band", "--text", big]), store, out.deps({ transport: tr }));
    expect(tr.calls.map((c) => c.op)).toEqual(["display.features", "display.set"]);
    // 小さい中身では features を呼ばない
    const tr2 = stub({ "display.set": SET_RESULT, "display.features": FEATURES });
    await runDisplay(parse(["set", "a", "--kind", "band", "--text", "small"]), store, out.deps({ transport: tr2 }));
    expect(tr2.calls.map((c) => c.op)).toEqual(["display.set"]);
    // サーバの 1 行の上限が小さい（途中の版）
    const tr3 = stub({ "display.set": SET_RESULT, "display.features": { ...FEATURES, limits: { ...FEATURES.limits, requestLineBytes: 2 * 1024 * 1024 } } });
    await expect(runDisplay(parse(["set", "a", "--kind", "band", "--text", "a".repeat(2 * 1024 * 1024)]), store, out.deps({ transport: tr3 }))).rejects.toThrow(/larger than this server accepts/);
    expect(tr3.calls.map((c) => c.op)).toEqual(["display.features"]);
    // 古いサーバ
    const old: DisplayTransport = { call: () => Promise.reject(new DisplayUnsupported()) };
    const out2 = new Out();
    expect(await runDisplay(parse(["set", "a", "--kind", "band", "--text", big]), store, out2.deps({ transport: old }))).toBe(0);
    expect(out2.lines).toEqual([{ status: "unsupported", reason: "this server does not support display surfaces (update soda)" }]);
  });

  it("中身の指定が無く標準入力が空（/dev/null・空のパイプ）なら使い方の誤り。--text \"\" なら空の面を出せる", async () => {
    const tr = stub({ "display.set": SET_RESULT });
    await expect(runDisplay(parse(["set", "a", "--kind", "band"]), store, new Out().deps({ transport: tr, readStdin: async () => Buffer.alloc(0) }))).rejects.toBeInstanceOf(CliUsageError);
    await expect(runDisplay(parse(["set", "a", "--kind", "band"]), store, new Out().deps({ transport: tr, readStdin: async () => Buffer.alloc(0) }))).rejects.toThrow(/stdin/);
    expect(tr.calls).toEqual([]);
    await runDisplay(parse(["set", "a", "--kind", "band", "--text", ""]), store, new Out().deps({ transport: tr }));
    expect(tr.calls[0]).toMatchObject({ op: "display.set", params: { content: "" } });
  });

  it("要求の 1 行が上限の近く（余裕の内側）なら、送らずに使い方の誤り。余裕の外側なら送る", async () => {
    const tr = stub({ "display.set": SET_RESULT, "display.features": FEATURES });
    const lineOf = (n: number): number => Buffer.byteLength(JSON.stringify({ v: 1, op: "display.set", paneId: PANE, params: { name: "a", kind: "band", format: "text", content: '"'.repeat(n) } })) + 1;
    const LIMIT = 4 * 1024 * 1024;
    // 引用符は 1 文字が 2 バイトになる。1 行が LIMIT − 100 になる長さ（余裕 512 の内側）と、LIMIT − 1000 になる長さ（外側）
    const n = (target: number): number => Math.floor((target - lineOf(0)) / 2);
    const inside = n(LIMIT - 100);
    const outside = n(LIMIT - 1000);
    expect(LIMIT - lineOf(inside)).toBeLessThan(512);
    expect(LIMIT - lineOf(outside)).toBeGreaterThan(512);
    // 中身は 2 MiB 以内であること（引用符 inside 個 ≒ 2 MiB − 50）
    expect(inside).toBeLessThanOrEqual(DISPLAY_CONTENT_MAX_BYTES);
    await expect(runDisplay(parse(["set", "a", "--kind", "band", "--text", '"'.repeat(inside)]), store, new Out().deps({ transport: tr }))).rejects.toThrow(/too large|escaping/);
    expect(tr.calls).toEqual([]);
    await runDisplay(parse(["set", "a", "--kind", "band", "--text", '"'.repeat(outside)]), store, new Out().deps({ transport: tr }));
    expect(tr.calls.at(-1)).toMatchObject({ op: "display.set" });
  });

  it("サーバの invalid_display は使い方の誤り（終了コード 2）に読み替える。ほかのエラーはそのまま", async () => {
    const out = new Out();
    const bad: DisplayTransport = { call: () => Promise.reject(new RpcFailure("invalid_display", "name is bad")) };
    await expect(runDisplay(parse(["set", "a", "--kind", "band", "--text", "x"]), store, out.deps({ transport: bad }))).rejects.toBeInstanceOf(CliUsageError);
    const limit: DisplayTransport = { call: () => Promise.reject(new RpcFailure("display_limit", "too many")) };
    await expect(runDisplay(parse(["set", "a", "--kind", "band", "--text", "x"]), store, out.deps({ transport: limit }))).rejects.toMatchObject({ code: "display_limit" });
  });

  it("pane の中でない（--pane も無い）と caller_pane_unknown。接続先が別のサーバだと確かめられなくても同じ", async () => {
    const out = new Out();
    await expect(runDisplay(parse(["list"], {} as NodeJS.ProcessEnv), store, out.deps({ transport: stub() }))).rejects.toMatchObject({ code: "caller_pane_unknown" });
    const other = { ...IN_PANE, SODACTL_URL: "http://127.0.0.1:9999" } as NodeJS.ProcessEnv;
    await expect(runDisplay(parse(["list"], other), store, out.deps({ transport: stub() }))).rejects.toMatchObject({ code: "caller_pane_unknown" });
  });
});

describe("runDisplay close / list / --features", () => {
  it("close は name か all、list は結果の一覧を出す", async () => {
    const out = new Out();
    const tr = stub({ "display.close": { closed: ["a"] }, "display.list": { displays: [INFO] } });
    await runDisplay(parse(["close", "a"]), store, out.deps({ transport: tr }));
    await runDisplay(parse(["close", "--all"]), store, out.deps({ transport: tr }));
    await runDisplay(parse(["list"]), store, out.deps({ transport: tr }));
    expect(tr.calls.map((c) => [c.op, c.params])).toEqual([["display.close", { name: "a" }], ["display.close", { all: true }], ["display.list", {}]]);
    expect(out.lines).toEqual([{ status: "ok", closed: ["a"] }, { status: "ok", closed: ["a"] }, { status: "ok", displays: [INFO] }]);
  });

  it("古いサーバは close・list も unsupported で終了コード 0", async () => {
    const out = new Out();
    const old: DisplayTransport = { call: () => Promise.reject(new DisplayUnsupported()) };
    expect(await runDisplay(parse(["close", "a"]), store, out.deps({ transport: old }))).toBe(0);
    expect(await runDisplay(parse(["list"]), store, out.deps({ transport: old }))).toBe(0);
    expect(out.lines.map((l) => (l as { status: string }).status)).toEqual(["unsupported", "unsupported"]);
  });

  it("--features は sodactl の機能・上限とサーバの機能を出す。失敗は server: null で、常に終了コード 0", async () => {
    const out = new Out();
    expect(await runDisplay(parse(["--features"]), store, out.deps({ transport: stub({ "display.features": FEATURES }) }))).toBe(0);
    expect(out.lines[0]).toMatchObject({ sodactl: expect.arrayContaining(["panel", "band", "format:html", "actions"]), limits: { contentBytes: DISPLAY_CONTENT_MAX_BYTES, requestLineBytes: 4 * 1024 * 1024 }, server: FEATURES });
    const out2 = new Out();
    const down: DisplayTransport = { call: () => Promise.reject(new RpcFailure("connection_closed", "x")) };
    expect(await runDisplay(parse(["--features"]), store, out2.deps({ transport: down }))).toBe(0);
    expect(out2.lines[0]).toMatchObject({ server: null });
    const out3 = new Out();
    const old: DisplayTransport = { call: () => Promise.reject(new DisplayUnsupported()) };
    expect(await runDisplay(parse(["--features"], {} as NodeJS.ProcessEnv), store, out3.deps({ transport: old }))).toBe(0);
    expect(out3.lines[0]).toMatchObject({ server: null });
  });
});

describe("受け口の経路（callPaneOp を差し替える）", () => {
  const fake = (results: Record<string, () => ReturnType<typeof callPaneOp>>) => {
    const calls: { path: string; req: { op: string; paneId: string; params?: Record<string, unknown> } }[] = [];
    const fn = (async (path: string, req: { op: string; paneId: string; params?: Record<string, unknown> }) => {
      calls.push({ path, req });
      return results[req.op]!();
    }) as typeof callPaneOp;
    return { fn, calls };
  };

  it("呼び出し元の pane の受け口に、pane を名乗って送る。paneId は引数に載せない", async () => {
    const out = new Out();
    const { fn, calls } = fake({ "display.list": async () => ({ kind: "result", result: { displays: [] } }) });
    await runDisplay(parse(["list"]), store, out.deps({ callPaneOp: fn }));
    expect(calls).toEqual([{ path: "/s/pane.sock", req: { op: "display.list", paneId: PANE, params: {} } }]);
  });

  it("受け口が unknown_op を返したら /ws へ落とさず、古いサーバとして unsupported（events は display.end）", async () => {
    const out = new Out();
    const { fn, calls } = fake({
      "display.list": async () => ({ kind: "fallback", reason: "unknown_op: unknown op: display.list" }),
      "display.features": async () => ({ kind: "fallback", reason: "unknown_op: unknown op: display.features" }),
    });
    expect(await runDisplay(parse(["list"]), store, out.deps({ callPaneOp: fn }))).toBe(0);
    expect(await runDisplay(parse(["events"]), store, out.deps({ callPaneOp: fn }))).toBe(0);
    expect(out.lines).toEqual([{ status: "unsupported", reason: "this server does not support display surfaces (update soda)" }, { type: "display.end", reason: "unsupported" }]);
    expect(calls.map((c) => c.req.op)).toEqual(["display.list", "display.features"]);
  });
});

describe("runWaitLoop", () => {
  const ev = (seq: number, action = "go"): DisplayLine => ({ type: "display.action", seq, paneId: PANE, name: "main", rev: 1, action, at: "t" });
  const res = (o: Partial<DisplayWaitResult> = {}): DisplayWaitResult => ({ epoch: "E1", next: 0, events: [], dropped: 0, reset: false, ...o });

  function io(script: (params: Record<string, unknown>, timeoutMs: number) => Promise<DisplayWaitResult>) {
    const lines: DisplayLine[] = [];
    const calls: { params: Record<string, unknown>; timeoutMs: number }[] = [];
    let t = 0;
    const slept: number[] = [];
    const impl: WaitLoopIo = {
      call: (params, timeoutMs) => {
        calls.push({ params, timeoutMs });
        return script(params, timeoutMs);
      },
      emit: (l) => void lines.push(l),
      now: () => t,
      sleep: async (ms) => {
        slept.push(ms);
        t += ms;
      },
    };
    return { impl, lines, calls, slept, advance: (ms: number) => (t += ms) };
  }

  it("once: 最初の出来事を 1 つだけ出して終わる。epoch を必ず渡し、names も渡す", async () => {
    const h = io(async () => res({ next: 7, events: [ev(6, "a") as never, ev(7, "b") as never] }));
    const out = await runWaitLoop(h.impl, { names: ["main"], since: 5, epoch: "E1", mode: "once", totalTimeoutMs: undefined });
    expect(out).toEqual({ end: "done" });
    expect(h.lines).toEqual([ev(6, "a")]);
    expect(h.calls[0]).toEqual({ params: { since: 5, epoch: "E1", names: ["main"] }, timeoutMs: 30_000 });
  });

  it("空の結果ならすぐ次を呼ぶ（since・epoch は返ってきた値に進む）。since を省いた最初の呼び出しは since を載せない", async () => {
    let n = 0;
    const h = io(async () => (++n < 3 ? res({ next: n }) : res({ next: 3, events: [ev(3) as never] })));
    await runWaitLoop(h.impl, { names: [], since: undefined, epoch: "E1", mode: "once", totalTimeoutMs: undefined });
    expect(h.calls.map((c) => c.params)).toEqual([{ epoch: "E1" }, { since: 1, epoch: "E1" }, { since: 2, epoch: "E1" }]);
  });

  it("stream: 出来事を全部出し続ける。dropped は行にする。reset は行を出して新しい epoch で続ける", async () => {
    const script = [res({ next: 2, events: [ev(1) as never, ev(2) as never], dropped: 5 }), res({ epoch: "E2", next: 0, reset: true }), res({ epoch: "E2", next: 1, events: [ev(1) as never] })];
    let i = 0;
    const h = io(async () => {
      const r = script[i++];
      if (r === undefined) throw new RpcFailure("not_found", "pane not found");
      return r;
    });
    const out = await runWaitLoop(h.impl, { names: [], since: undefined, epoch: "E1", mode: "stream", totalTimeoutMs: undefined });
    expect(out.end).toBe("pane_closed");
    expect(h.lines).toEqual([{ type: "display.dropped", count: 5 }, ev(1), ev(2), { type: "display.reset", reason: "server_restarted", epoch: "E2" }, ev(1)]);
    expect(h.calls.map((c) => c.params)).toEqual([{ epoch: "E1" }, { since: 2, epoch: "E1" }, { since: 0, epoch: "E2" }, { since: 1, epoch: "E2" }]);
  });

  it("once: reset の行を出して終わる", async () => {
    const h = io(async () => res({ epoch: "E2", next: 0, reset: true }));
    expect(await runWaitLoop(h.impl, { names: [], since: undefined, epoch: "E1", mode: "once", totalTimeoutMs: undefined })).toEqual({ end: "done" });
    expect(h.lines).toEqual([{ type: "display.reset", reason: "server_restarted", epoch: "E2" }]);
  });

  it("全体の時間切れで display.timeout。1 回の待ちは残りの時間まで", async () => {
    const h = io(async (_p, ms) => {
      h.advance(ms);
      return res();
    });
    const out = await runWaitLoop(h.impl, { names: [], since: undefined, epoch: "E1", mode: "once", totalTimeoutMs: 45_000 });
    expect(out).toEqual({ end: "done" });
    expect(h.calls.map((c) => c.timeoutMs)).toEqual([30_000, 15_000]);
    expect(h.lines).toEqual([{ type: "display.timeout" }]);
  });

  it("全体の時間切れは残りの時間で数える: 残りが 1 秒に満たないときは、サーバに聞かず残りだけ待って display.timeout（約 1 秒長引かない）", async () => {
    const h = io(async (_p, ms) => {
      h.advance(ms);
      return res();
    });
    const out = await runWaitLoop(h.impl, { names: [], since: undefined, epoch: "E1", mode: "once", totalTimeoutMs: 30_500 });
    expect(out).toEqual({ end: "done" });
    expect(h.calls.map((c) => c.timeoutMs)).toEqual([30_000]);
    expect(h.slept).toEqual([500]);
    expect(h.lines).toEqual([{ type: "display.timeout" }]);
    // 1 回の待ちは残りを超えない
    const h2 = io(async (_p, ms) => {
      h2.advance(ms);
      return res();
    });
    await runWaitLoop(h2.impl, { names: [], since: undefined, epoch: "E1", mode: "once", totalTimeoutMs: 1_500 });
    expect(h2.calls.map((c) => c.timeoutMs)).toEqual([1_500]);
  });

  it("まだ一度も聞いていないときは、残りが 1 秒未満（時計が進んで 0 以下でも）でも 1 回は聞く。2 回目以降の残りが短いときは聞かずに待って display.timeout", async () => {
    // 開始から 1ms 進んだ状態で呼ばれる（--timeout 1000 ぴったり）
    const h = io(async () => res({ next: 1, events: [ev(1) as never] }));
    let first = true;
    const realNow = h.impl.now;
    h.impl.now = () => {
      const t = realNow();
      if (first) return t;
      return t + 1;
    };
    const origCall = h.impl.call;
    h.impl.call = (p, ms) => {
      first = false;
      return origCall(p, ms);
    };
    const out = await runWaitLoop(h.impl, { names: [], since: undefined, epoch: "E1", mode: "once", totalTimeoutMs: 1_000 });
    expect(out).toEqual({ end: "done" });
    expect(h.calls.map((c) => c.timeoutMs)).toEqual([1_000]);
    expect(h.lines).toEqual([ev(1)]);
    // 開始の時点で期限を過ぎていても、1 回は聞く
    const h2 = io(async () => res());
    h2.advance(5_000);
    let t0 = true;
    const n0 = h2.impl.now;
    h2.impl.now = () => (t0 ? (t0 = false, n0() - 5_000) : n0());
    await runWaitLoop(h2.impl, { names: [], since: undefined, epoch: "E1", mode: "once", totalTimeoutMs: 1_000 });
    expect(h2.calls.length).toBe(1);
    expect(h2.lines).toEqual([{ type: "display.timeout" }]);
  });

  it("切れたら 150ms おきに 5 秒まで繋ぎ直し、戻ればそのまま続ける。戻らなければ connection_closed", async () => {
    let n = 0;
    const h = io(async () => {
      if (++n <= 3) throw new RpcFailure("connection_closed", "closed");
      return res({ next: 1, events: [ev(1) as never] });
    });
    expect(await runWaitLoop(h.impl, { names: [], since: undefined, epoch: "E1", mode: "once", totalTimeoutMs: undefined })).toEqual({ end: "done" });
    expect(h.slept).toEqual([150, 150, 150]);
    expect(h.lines).toEqual([ev(1)]);

    const dead = io(async () => {
      throw Object.assign(new Error("connect ECONNREFUSED"), { code: "ECONNREFUSED" });
    });
    const out = await runWaitLoop(dead.impl, { names: [], since: undefined, epoch: "E1", mode: "stream", totalTimeoutMs: undefined });
    expect(out.end).toBe("connection_closed");
    expect(dead.slept.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(DISPLAY_RECONNECT_MS);
    expect(dead.slept.reduce((a, b) => a + b, 0)).toBeGreaterThan(DISPLAY_RECONNECT_MS - 300);
  });

  it("繋ぎ直しの上限は最初の失敗から数える（成功したらまた 5 秒）", async () => {
    let n = 0;
    const h = io(async () => {
      n++;
      if (n === 2 || n === 4) return res({ next: n });
      if (n < 6) throw new RpcFailure("pane_socket_busy", "busy");
      return res({ next: 9, events: [ev(9) as never] });
    });
    expect(await runWaitLoop(h.impl, { names: [], since: undefined, epoch: "E1", mode: "once", totalTimeoutMs: undefined })).toEqual({ end: "done" });
  });

  it("古いサーバは unsupported、pane が無ければ pane_closed、想定外のエラーはそのまま投げる", async () => {
    expect((await runWaitLoop(io(async () => Promise.reject(new DisplayUnsupported())).impl, { names: [], since: undefined, epoch: "E", mode: "stream", totalTimeoutMs: undefined })).end).toBe("unsupported");
    expect((await runWaitLoop(io(async () => Promise.reject(new RpcFailure("not_found", "x"))).impl, { names: [], since: undefined, epoch: "E", mode: "stream", totalTimeoutMs: undefined })).end).toBe("pane_closed");
    await expect(runWaitLoop(io(async () => Promise.reject(new RpcFailure("display_busy", "x"))).impl, { names: [], since: undefined, epoch: "E", mode: "stream", totalTimeoutMs: undefined })).rejects.toMatchObject({ code: "display_busy" });
  });

  it("stdout が閉じたら emit が output_closed を投げ、ループは止まる", async () => {
    const h = io(async () => res({ next: 1, events: [ev(1) as never] }));
    h.impl.emit = () => {
      throw new RpcFailure("output_closed", "closed");
    };
    await expect(runWaitLoop(h.impl, { names: [], since: undefined, epoch: "E", mode: "stream", totalTimeoutMs: undefined })).rejects.toMatchObject({ code: "output_closed" });
    expect(h.calls).toHaveLength(1);
  });

  it("isReconnectable: 切れた系だけ", () => {
    expect(isReconnectable(new RpcFailure("connection_closed", ""))).toBe(true);
    expect(isReconnectable(new RpcFailure("pane_socket_busy", ""))).toBe(true);
    expect(isReconnectable(Object.assign(new Error("x"), { code: "ECONNREFUSED" }))).toBe(true);
    expect(isReconnectable(new RpcFailure("display_busy", ""))).toBe(false);
    expect(isReconnectable(new CliUsageError("x"))).toBe(false);
    expect(isReconnectable(new Error("boom"))).toBe(false);
  });
});

describe("runDisplay events / wait", () => {
  it("events は最初に display.ready を出し、features の epoch から待つ。stdout が閉じたら output_closed", async () => {
    const out = new Out();
    let n = 0;
    const tr = stub({
      "display.features": FEATURES,
      "display.list": LIST,
      "display.wait": () => {
        if (++n === 1) return { epoch: "E1", next: 1, events: [{ type: "display.closed", seq: 1, paneId: PANE, name: "main", reason: "dismissed", at: "t" }], dropped: 0, reset: false };
        throw new RpcFailure("not_found", "pane not found");
      },
    });
    const code = await runDisplay(parse(["events"]), store, out.deps({ transport: tr }));
    expect(code).toBe(0);
    expect(out.lines).toEqual([
      { type: "display.ready", v: 1, paneId: PANE, epoch: "E1", features: FEATURES.features, renderers: FEATURES.renderers },
      { type: "display.closed", seq: 1, paneId: PANE, name: "main", reason: "dismissed", at: "t" },
      { type: "display.end", reason: "pane_closed" },
    ]);
    expect(tr.calls.filter((c) => c.op === "display.wait").every((c) => c.params["epoch"] === "E1")).toBe(true);
  });

  it("events は繋ぎ直しが尽きたら display.end(connection_closed) を出して終了コード 1", async () => {
    const out = new Out();
    const tr = stub({ "display.features": FEATURES, "display.list": LIST, "display.wait": () => Promise.reject(new RpcFailure("connection_closed", "x")) });
    const code = await runDisplay(parse(["events"]), store, out.deps({ transport: tr, sleep: async () => undefined, now: (() => { let t = 0; return () => (t += 1000); })() }));
    expect(code).toBe(1);
    expect(out.lines.at(-1)).toEqual({ type: "display.end", reason: "connection_closed" });
  });

  it("events: ready の前に pane の今の seq を得て、最初の待ちから since を付ける（ready と登録の間の出来事を落とさない）", async () => {
    const out = new Out();
    const order: string[] = [];
    const tr = stub({
      "display.features": () => (order.push("features"), FEATURES),
      "display.list": () => (order.push("list"), { displays: [], seq: 7, epoch: "E9" }),
      "display.wait": () => Promise.reject(new RpcFailure("not_found", "pane not found")),
    });
    const deps = out.deps({ transport: tr, print: (v) => void (order.push((v as { type: string }).type), out.lines.push(v)) });
    await runDisplay(parse(["events"]), store, deps);
    expect(order.slice(0, 3)).toEqual(["features", "list", "display.ready"]);
    expect(out.lines[0]).toMatchObject({ type: "display.ready", epoch: "E9" });
    expect(tr.calls.find((c) => c.op === "display.wait")!.params).toMatchObject({ since: 7, epoch: "E9" });
    // --since / --epoch を渡せば、それを使う
    const tr2 = stub({ "display.features": FEATURES, "display.list": LIST, "display.wait": () => Promise.reject(new RpcFailure("not_found", "x")) });
    await runDisplay(parse(["events", "--since", "2", "--epoch", "EE"]), store, new Out().deps({ transport: tr2 }));
    expect(tr2.calls.find((c) => c.op === "display.wait")!.params).toMatchObject({ since: 2, epoch: "EE" });
  });

  it("events: 待ちの上限（display_busy）では、display.end(busy) の行を出し、エラーはそのまま投げる（黙って終わらない）", async () => {
    const out = new Out();
    const tr = stub({ "display.features": FEATURES, "display.list": LIST, "display.wait": () => Promise.reject(new RpcFailure("display_busy", "too many waits on display events")) });
    await expect(runDisplay(parse(["events"]), store, out.deps({ transport: tr }))).rejects.toMatchObject({ code: "display_busy" });
    expect(out.lines.at(-1)).toEqual({ type: "display.end", reason: "busy" });
  });

  it("wait は features の後、出来事を 1 行出して終わる。pane が無ければ not_found を投げる", async () => {
    const out = new Out();
    const tr = stub({ "display.features": FEATURES, "display.list": LIST, "display.wait": { epoch: "E1", next: 2, events: [{ type: "display.action", seq: 2, paneId: PANE, name: "main", rev: 1, action: "go", at: "t" }], dropped: 0, reset: false } });
    expect(await runDisplay(parse(["wait", "main"]), store, out.deps({ transport: tr }))).toBe(0);
    expect(out.lines).toEqual([{ type: "display.action", seq: 2, paneId: PANE, name: "main", rev: 1, action: "go", at: "t" }]);
    expect(tr.calls.find((c) => c.op === "display.wait")!.params).toMatchObject({ epoch: "E1", names: ["main"] });
    const gone = stub({ "display.features": FEATURES, "display.list": LIST, "display.wait": () => Promise.reject(new RpcFailure("not_found", "pane not found")) });
    await expect(runDisplay(parse(["wait"]), store, new Out().deps({ transport: gone }))).rejects.toMatchObject({ code: "not_found" });
  });

  it("set --wait は set の epoch・next から、その面の出来事を待つ。set の行は出さない", async () => {
    const out = new Out();
    const tr = stub({ "display.set": SET_RESULT, "display.wait": { epoch: "E1", next: 5, events: [{ type: "display.action", seq: 5, paneId: PANE, name: "main", rev: 1, action: "ok", at: "t" }], dropped: 0, reset: false } });
    expect(await runDisplay(parse(["set", "main", "--kind", "panel", "--text", "x", "--wait"]), store, out.deps({ transport: tr }))).toBe(0);
    expect(tr.calls.map((c) => c.op)).toEqual(["display.set", "display.wait"]);
    expect(tr.calls[1]!.params).toMatchObject({ since: 4, epoch: "E1", names: ["main"] });
    expect(out.lines).toHaveLength(1);
    expect(out.lines[0]).toMatchObject({ type: "display.action", action: "ok" });
  });
});
