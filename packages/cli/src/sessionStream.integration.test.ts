import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ServerEvent } from "@sodashitsu/protocol";
import { composeServerOnFreePort, type ComposedServer } from "@sodashitsu/server";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { runPaneAttach, type AttachTerminal } from "./commands/attach.js";
import { runPaneControl, runPaneObserve, type StreamIo } from "./commands/sessionStream.js";
import { FsSessionStore } from "./session.js";
import { UnauthenticatedError, withSession } from "./withSession.js";
import { AuthError, connect, type SodaClient } from "./wsClient.js";

/**
 * `sodactl pane observe` / `pane control` を実サーバ・実 PTY の上で、メモリ上の stdin/stdout から確かめる（20260926-pane-observe-control）。
 * ビルド済みの sodactl を子プロセス（パイプ）で動かす確認は smoke（`smoke.ts`）が行う。
 */

interface Frame {
  type: string;
  seq?: number;
  width?: number;
  height?: number;
  full?: boolean;
  bytes?: string;
  reason?: string;
}

interface MemIo extends StreamIo {
  records(): Frame[];
  /** フレームの bytes を全部つないだ文字列。 */
  text(): string;
  warnings: string[];
  /** stdin の購読が始まった回数（始まる前に send した行は溜め、始まったときに渡す）。 */
  inRegistrations(): number;
  send(line: string): void;
  endInput(): void;
}

function memIo(): MemIo {
  const lines: string[] = [];
  let inCb: ((c: Uint8Array) => void) | null = null;
  let endCb: (() => void) | null = null;
  let registrations = 0;
  const queued: Uint8Array[] = [];
  const enc = new TextEncoder();
  const io: MemIo = {
    warnings: [],
    writeOut: (line) => lines.push(line),
    outPending: () => 0,
    onOutDrain: () => () => undefined,
    onOutError: () => () => undefined,
    warn: (line) => io.warnings.push(line),
    errPending: () => 0,
    onIn: (cb) => {
      inCb = cb;
      registrations += 1;
      for (const chunk of queued.splice(0)) cb(chunk);
      return () => (inCb = null);
    },
    onInEnd: (cb) => {
      endCb = cb;
      return () => (endCb = null);
    },
    stopIn: () => undefined,
    resumeIn: () => undefined,
    flushOut: () => Promise.resolve(),
    onSignal: () => () => undefined,
    records: () => lines.map((l) => JSON.parse(l) as Frame),
    text: () =>
      io
        .records()
        .filter((r) => r.type === "terminal.frame")
        .map((r) => Buffer.from(r.bytes ?? "", "base64").toString("utf8"))
        .join(""),
    inRegistrations: () => registrations,
    send: (line) => {
      const chunk = enc.encode(`${line}\n`);
      if (inCb) inCb(chunk);
      else queued.push(chunk);
    },
    endInput: () => endCb?.(),
  };
  return io;
}

/** 偽の手元の端末（`pane attach` との奪い合いを見るため。attach.integration.test.ts と同じ形）。 */
function testTerminal(
  cols: number,
  rows: number,
): AttachTerminal & { text(): string; type(t: string): void } {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let out = "";
  let inputCb: ((b: Uint8Array) => void) | null = null;
  return {
    isTTY: true,
    size: () => ({ cols, rows }),
    setRawMode: () => undefined,
    write: (data) => {
      out += typeof data === "string" ? data : dec.decode(data, { stream: true });
    },
    onInput: (cb) => {
      inputCb = cb;
      return () => (inputCb = null);
    },
    onResize: () => () => undefined,
    onSignal: () => () => undefined,
    text: () => out,
    type: (t) => inputCb?.(enc.encode(t)),
  };
}

/** 出力の中に、印だけの行（コマンドを打った行ではなく実行された結果の行）があるか。 */
function hasOutputLine(text: string, marker: string): boolean {
  return text
    .split(/\r?\n/)
    .some((l) => l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").trim() === marker);
}

describe("sodactl pane observe / pane control integration（実サーバ・実 PTY）", () => {
  let server: ComposedServer;
  let dir: string;
  let store: FsSessionStore;
  let url: string;
  let token: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "sodactl-stream-it-"));
    server = await composeServerOnFreePort({
      host: "127.0.0.1",
      stateDir: join(dir, "state"),
      origin: [],
    });
    if (!server.freshToken) throw new Error("expected a freshly generated token");
    token = server.freshToken;
    url = `http://${server.options.host}:${server.options.port}`;
    store = new FsSessionStore(join(dir, "session.json"));
    await withSession({ url, token, urlExplicit: false }, store, (c) => c.hello()); // セッションをキャッシュする
  }, 30_000);

  afterAll(async () => {
    await server.close();
    await rm(dir, { recursive: true, force: true });
  });

  const opts = () => ({ url, token: undefined, urlExplicit: false });
  const observeCmd = (paneId: string) => ({ kind: "pane-observe" as const, opts: opts(), paneId });
  const controlCmd = (
    paneId: string,
    over: { takeover?: boolean; cols?: number; rows?: number } = {},
  ) => ({
    kind: "pane-control" as const,
    opts: opts(),
    paneId,
    takeover: over.takeover ?? false,
    cols: over.cols ?? 120,
    rows: over.rows ?? 40,
  });

  async function newPane(): Promise<string> {
    const first = server.session.snapshot().panes[0]!.id;
    const res = await withSession(opts(), store, async (c) => {
      await c.hello();
      return c.request("pane.split", { paneId: first, direction: "down" });
    });
    return res.pane.id;
  }

  const sizeOf = (paneId: string) => {
    const p = server.session.getPane(paneId);
    return p ? { cols: p.cols, rows: p.rows } : null;
  };

  /** 所有者の変化（`pane.attach_changed`）を記録する別の接続。 */
  async function watcher(): Promise<{ client: SodaClient; events: ServerEvent[] }> {
    const cookie = (await store.get(url))!;
    const client = await connect(url, cookie);
    const events: ServerEvent[] = [];
    await client.hello((e) => events.push(e));
    return { client, events };
  }

  const attachChanges = (events: ServerEvent[], paneId: string) =>
    events.filter((e) => e.event === "pane.attach_changed" && e.data.paneId === paneId);

  it("observe 2 本と control 1 本: 最初は full の画面、control の入力の出力が両方の observe に届き、observe は所有者・大きさを変えない。大きさの変化はフレームに乗り、release で所有者が外れる（AC1・AC2・AC3・AC5・AC6・AC7・AC8・AC9）", async () => {
    const paneId = await newPane();
    const watch = await watcher();
    const before = sizeOf(paneId)!;
    const obsA = memIo();
    const obsB = memIo();
    const runA = runPaneObserve(observeCmd(paneId), store, obsA);
    const runB = runPaneObserve(observeCmd(paneId), store, obsB);
    let runCtl: Promise<void> | undefined;
    let runAgain: Promise<void> | undefined;
    try {
      await vi.waitFor(() => expect(obsA.records().length).toBeGreaterThan(0), { timeout: 10_000 });
      await vi.waitFor(() => expect(obsB.records().length).toBeGreaterThan(0), { timeout: 10_000 });
      for (const obs of [obsA, obsB]) {
        expect(obs.records()[0]).toMatchObject({
          type: "terminal.frame",
          seq: 1,
          full: true,
          width: before.cols,
          height: before.rows,
        });
      }
      // observe を始めても pane の大きさも所有者も変わらない。watcher の接続で 1 往復してから見る（サーバの処理の順序を確定させる）。
      await watch.client.request("pane.unsubscribe", { paneId });
      expect(sizeOf(paneId)).toEqual(before);
      expect(attachChanges(watch.events, paneId)).toEqual([]);

      const ctl = memIo();
      runCtl = runPaneControl(controlCmd(paneId, { cols: 100, rows: 30 }), store, ctl);
      await vi.waitFor(() => expect(sizeOf(paneId)).toEqual({ cols: 100, rows: 30 }), {
        timeout: 10_000,
      });
      await vi.waitFor(() => expect(ctl.records().length).toBeGreaterThan(0), { timeout: 10_000 });
      expect(ctl.records()[0]).toMatchObject({
        type: "terminal.frame",
        seq: 1,
        full: true,
        width: 100,
        height: 30,
      });
      await vi.waitFor(() => expect(attachChanges(watch.events, paneId)).toHaveLength(1), {
        timeout: 10_000,
      });

      const marker = `CTL_${Date.now()}`;
      ctl.send(JSON.stringify({ type: "terminal.input", text: `echo ${marker}\r` }));
      for (const io of [obsA, obsB, ctl]) {
        await vi.waitFor(() => expect(hasOutputLine(io.text(), marker)).toBe(true), {
          timeout: 10_000,
        });
      }
      // bytes でも送れる（Ctrl-U で行を消してから echo）。
      const marker2 = `BYTES_${Date.now()}`;
      ctl.send(
        JSON.stringify({
          type: "terminal.input",
          bytes: Buffer.from(`\x15echo ${marker2}\r`).toString("base64"),
        }),
      );
      await vi.waitFor(() => expect(hasOutputLine(obsA.text(), marker2)).toBe(true), {
        timeout: 10_000,
      });
      // 以後のフレームは full:false で seq が 1 ずつ増える。
      const seqs = obsA.records().map((r) => r.seq);
      expect(seqs).toEqual(seqs.map((_s, i) => i + 1));
      expect(obsA.records().some((r) => r.full === false)).toBe(true);

      ctl.send(JSON.stringify({ type: "terminal.resize", cols: 90, rows: 25 }));
      await vi.waitFor(() => expect(sizeOf(paneId)).toEqual({ cols: 90, rows: 25 }), {
        timeout: 10_000,
      });
      const marker3 = `SIZE_${Date.now()}`;
      ctl.send(JSON.stringify({ type: "terminal.input", text: `echo ${marker3}\r` }));
      await vi.waitFor(() => expect(hasOutputLine(obsB.text(), marker3)).toBe(true), {
        timeout: 10_000,
      });
      for (const obs of [obsA, obsB]) {
        await vi.waitFor(() => expect(hasOutputLine(obs.text(), marker3)).toBe(true), {
          timeout: 10_000,
        });
        expect(obs.records().at(-1)).toMatchObject({ width: 90, height: 25 });
      }

      // 不正な行は何も送らない（知らないキーのある行の印は出ず、後の正しい行の印は出る）。
      const invalid = `INVALID_${Date.now()}`;
      ctl.send(
        JSON.stringify({ type: "terminal.input", text: `echo ${invalid}\r`, paneId: "other" }),
      );
      expect(ctl.warnings).toHaveLength(1);
      const marker4 = `AFTER_${Date.now()}`;
      ctl.send(JSON.stringify({ type: "terminal.input", text: `echo ${marker4}\r` }));
      await vi.waitFor(() => expect(hasOutputLine(obsA.text(), marker4)).toBe(true), {
        timeout: 10_000,
      });
      expect(obsA.text()).not.toContain(invalid);

      ctl.send(JSON.stringify({ type: "terminal.release" }));
      await expect(runCtl).resolves.toBeUndefined();
      expect(ctl.records().at(-1)).toEqual({ type: "terminal.closed", reason: "released" });
      expect(server.session.getPane(paneId)).toBeDefined();
      await vi.waitFor(
        () =>
          expect(attachChanges(watch.events, paneId).at(-1)).toEqual({
            event: "pane.attach_changed",
            data: { paneId, clientId: null },
          }),
        { timeout: 10_000 },
      );
      // observe が所有者の変化を起こしていない（control の 2 回だけ）。
      expect(attachChanges(watch.events, paneId)).toHaveLength(2);

      // 所有者が外れたので、takeover 無しの control が所有者になれる（stdin の終わりで返す）。
      const again = memIo();
      runAgain = runPaneControl(controlCmd(paneId), store, again);
      await vi.waitFor(() => expect(again.records().length).toBeGreaterThan(0), {
        timeout: 10_000,
      });
      again.endInput();
      await expect(runAgain).resolves.toBeUndefined();
      expect(again.records().at(-1)).toEqual({ type: "terminal.closed", reason: "released" });

      // observe はまだ続いている。
      expect(obsA.records().some((r) => r.type === "terminal.closed")).toBe(false);
    } finally {
      watch.client.close();
      await withSession(opts(), store, async (c) => {
        await c.hello();
        await c.request("pane.close", { paneId });
      });
      await Promise.allSettled([runA, runB, runCtl, runAgain]);
    }
    expect(obsA.records().at(-1)).toEqual({ type: "terminal.closed", reason: "pane_closed" });
    expect(obsB.records().at(-1)).toEqual({ type: "terminal.closed", reason: "pane_closed" });
  }, 60_000);

  it("所有者は pane attach と共通: 所有者がいれば pane_attached、--takeover で奪い、奪われた側は taken_over / attach_taken_over で終わる（AC10）", async () => {
    const paneId = await newPane();
    const pendingRuns: Promise<void>[] = [];
    const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    try {
      const first = memIo();
      const runFirst = runPaneControl(controlCmd(paneId, { cols: 100, rows: 30 }), store, first);
      pendingRuns.push(runFirst);
      runFirst.catch(() => undefined);
      await vi.waitFor(() => expect(first.records().length).toBeGreaterThan(0), {
        timeout: 10_000,
      });

      const refused = memIo();
      await expect(runPaneControl(controlCmd(paneId), store, refused)).rejects.toMatchObject({
        code: "pane_attached",
      });
      expect(refused.records()).toEqual([]);
      expect(sizeOf(paneId)).toEqual({ cols: 100, rows: 30 });

      // pane attach も control の所有を見て拒む。
      const refusedTerm = testTerminal(80, 24);
      await expect(
        runPaneAttach(
          { kind: "pane-attach", opts: opts(), paneId, takeover: false },
          store,
          refusedTerm,
        ),
      ).rejects.toMatchObject({ code: "pane_attached" });

      const second = memIo();
      const runSecond = runPaneControl(
        controlCmd(paneId, { takeover: true, cols: 81, rows: 23 }),
        store,
        second,
      );
      pendingRuns.push(runSecond);
      runSecond.catch(() => undefined);
      await expect(runFirst).rejects.toMatchObject({ code: "attach_taken_over" });
      expect(first.records().at(-1)).toEqual({ type: "terminal.closed", reason: "taken_over" });
      await vi.waitFor(() => expect(sizeOf(paneId)).toEqual({ cols: 81, rows: 23 }), {
        timeout: 10_000,
      });

      // pane attach --takeover が control から奪う。
      const term = testTerminal(82, 22);
      const runTerm = runPaneAttach(
        { kind: "pane-attach", opts: opts(), paneId, takeover: true },
        store,
        term,
      );
      pendingRuns.push(runTerm);
      runTerm.catch(() => undefined);
      await expect(runSecond).rejects.toMatchObject({ code: "attach_taken_over" });
      expect(second.records().at(-1)).toEqual({ type: "terminal.closed", reason: "taken_over" });
      await vi.waitFor(() => expect(sizeOf(paneId)).toEqual({ cols: 82, rows: 22 }), {
        timeout: 10_000,
      });
      await vi.waitFor(() => expect(term.text()).toContain("\x1b[?1049h"), { timeout: 10_000 });

      // pane attach が所有している間、takeover 無しの control は pane_attached で拒まれる。
      const refused2 = memIo();
      await expect(runPaneControl(controlCmd(paneId), store, refused2)).rejects.toMatchObject({
        code: "pane_attached",
      });
      expect(refused2.records()).toEqual([]);
      expect(sizeOf(paneId)).toEqual({ cols: 82, rows: 22 });

      // control --takeover が pane attach から奪い、奪われた pane attach は attach_taken_over で終わる。
      const third = memIo();
      const runThird = runPaneControl(
        controlCmd(paneId, { takeover: true, cols: 83, rows: 21 }),
        store,
        third,
      );
      pendingRuns.push(runThird);
      runThird.catch(() => undefined);
      await expect(runTerm).rejects.toMatchObject({ code: "attach_taken_over" });
      await vi.waitFor(() => expect(sizeOf(paneId)).toEqual({ cols: 83, rows: 21 }), {
        timeout: 10_000,
      });
      await vi.waitFor(() => expect(third.records().length).toBeGreaterThan(0), {
        timeout: 10_000,
      });
      third.send(JSON.stringify({ type: "terminal.release" }));
      await expect(runThird).resolves.toBeUndefined();
      expect(third.records().at(-1)).toEqual({ type: "terminal.closed", reason: "released" });
    } finally {
      stderr.mockRestore();
      await withSession(opts(), store, async (c) => {
        await c.hello();
        await c.request("pane.close", { paneId });
      }).catch(() => undefined);
      await Promise.allSettled(pendingRuns);
    }
  }, 60_000);

  it("pane のプロセスが終わると observe も control も terminal.closed(pane_closed) で正常に終わる（AC4・AC9）", async () => {
    const paneId = await newPane();
    const obs = memIo();
    const ctl = memIo();
    const runObs = runPaneObserve(observeCmd(paneId), store, obs);
    const runCtl = runPaneControl(controlCmd(paneId), store, ctl);
    try {
      await vi.waitFor(() => expect(obs.records().length).toBeGreaterThan(0), { timeout: 10_000 });
      await vi.waitFor(() => expect(ctl.records().length).toBeGreaterThan(0), { timeout: 10_000 });
      ctl.send(JSON.stringify({ type: "terminal.input", text: "exit\r" }));
      await expect(runObs).resolves.toBeUndefined();
      await expect(runCtl).resolves.toBeUndefined();
    } finally {
      if (server.session.getPane(paneId)) {
        await withSession(opts(), store, async (c) => {
          await c.hello();
          await c.request("pane.close", { paneId });
        }).catch(() => undefined);
      }
      await Promise.allSettled([runObs, runCtl]);
    }
    expect(obs.records().at(-1)).toEqual({ type: "terminal.closed", reason: "pane_closed" });
    expect(ctl.records().at(-1)).toEqual({ type: "terminal.closed", reason: "pane_closed" });
  }, 60_000);

  it("存在しない pane は stdout に何も書かず not_found（AC4）", async () => {
    const obs = memIo();
    await expect(runPaneObserve(observeCmd("p999999"), store, obs)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(obs.records()).toEqual([]);
    const ctl = memIo();
    await expect(runPaneControl(controlCmd("p999999"), store, ctl)).rejects.toMatchObject({
      code: "not_found",
    });
    expect(ctl.records()).toEqual([]);
  }, 30_000);

  it("ログインしていなければ（セッション無し・token 無し／誤った token）stdout に何も書かず失敗し、pane に何も届かない（AC13）", async () => {
    const paneId = await newPane();
    let runCheck: Promise<void> | undefined;
    try {
      const empty = new FsSessionStore(join(dir, "empty-session.json"));
      const obs = memIo();
      await expect(
        runPaneObserve(
          { kind: "pane-observe", opts: { url, token: undefined, urlExplicit: false }, paneId },
          empty,
          obs,
        ),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
      expect(obs.records()).toEqual([]);

      const wrong = new FsSessionStore(join(dir, "wrong-session.json"));
      const ctl = memIo();
      const marker = `UNAUTH_${Date.now()}`;
      const run = runPaneControl(
        { ...controlCmd(paneId), opts: { url, token: "not-the-token", urlExplicit: false } },
        wrong,
        ctl,
      );
      // 始まる前に送った行は溜めておき、stdin の購読が始まれば渡る（始まらないことを下で確かめる）。
      ctl.send(JSON.stringify({ type: "terminal.input", text: `echo ${marker}\r` }));
      await expect(run).rejects.toBeInstanceOf(AuthError);
      await expect(run).rejects.toThrow("login failed: HTTP 401");
      expect(ctl.records()).toEqual([]);
      expect(ctl.inRegistrations()).toBe(0);
      expect(await wrong.get(url)).toBeUndefined();
      // pane の画面に印が出ていない（届いていない）。
      const check = memIo();
      runCheck = runPaneObserve(observeCmd(paneId), store, check);
      await vi.waitFor(() => expect(check.records().length).toBeGreaterThan(0), {
        timeout: 10_000,
      });
      expect(check.text()).not.toContain(marker);
    } finally {
      await withSession(opts(), store, async (c) => {
        await c.hello();
        await c.request("pane.close", { paneId });
      }).catch(() => undefined);
      await Promise.allSettled([runCheck]);
    }
  }, 30_000);
});
