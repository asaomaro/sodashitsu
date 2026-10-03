import { link, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import { connect, createServer, Socket, type Server } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseArgs, type GlobalOpts } from "./cliArgs.js";
import {
  callPaneOp,
  paneSocketFor,
  viaPaneSocketOrSession,
  type PaneOpOutcome,
} from "./paneSocket.js";
import { RpcFailure } from "./wsClient.js";

/** 20261003-sodactl-ask-socket（AC7・AC8・AC14）。受け口は偽物（テストが立てる `net.createServer`）。実物との組み合わせは `paneSocket.integration.test.ts`。 */

const IN_PANE = {
  SODA_PANE_ID: "p3",
  SODA_SERVER_URL: "http://127.0.0.1:7780",
} as NodeJS.ProcessEnv;

/** 環境と OS を明示して解析する（このテストを soda の pane の中で走らせても、その pane の環境を拾わない）。 */
function optsOf(
  argv: string[],
  env: NodeJS.ProcessEnv,
  platform: NodeJS.Platform = "linux",
): GlobalOpts {
  const cmd = parseArgs(argv, env, platform);
  if (!("opts" in cmd)) throw new Error(`no opts: ${cmd.kind}`);
  return cmd.opts;
}

describe("paneSocketFor", () => {
  const withSocket = { ...IN_PANE, SODA_PANE_SOCKET: "/s/pane.sock" } as NodeJS.ProcessEnv;

  it("pane の中で、受け口のパスがあり、接続先を明示していなければ、そのパス（SODA_AGENT_REPORT_SOCKET から導いたパスでも）", () => {
    expect(paneSocketFor(optsOf(["ask"], withSocket))).toBe("/s/pane.sock");
    expect(
      paneSocketFor(
        optsOf(["ask"], { ...IN_PANE, SODA_AGENT_REPORT_SOCKET: "/x/agent-report.sock" }),
      ),
    ).toBe("/x/pane.sock");
  });

  it("pane の外（SODA_PANE_ID・SODA_SERVER_URL のどちらかが無い）では使わない", () => {
    expect(
      paneSocketFor(optsOf(["ask"], { SODA_PANE_SOCKET: "/s/pane.sock" } as NodeJS.ProcessEnv)),
    ).toBeUndefined();
    expect(
      paneSocketFor(
        optsOf(["ask"], {
          SODA_PANE_ID: "p3",
          SODA_PANE_SOCKET: "/s/pane.sock",
        } as NodeJS.ProcessEnv),
      ),
    ).toBeUndefined();
    expect(
      paneSocketFor(
        optsOf(["ask"], {
          SODA_SERVER_URL: "http://127.0.0.1:7780",
          SODA_PANE_SOCKET: "/s/pane.sock",
        } as NodeJS.ProcessEnv),
      ),
    ).toBeUndefined();
  });

  it("受け口のパスが無ければ使わない（変数が無い・Windows）", () => {
    expect(paneSocketFor(optsOf(["ask"], IN_PANE))).toBeUndefined();
    expect(paneSocketFor(optsOf(["ask"], withSocket, "win32"))).toBeUndefined();
    expect(
      paneSocketFor({
        url: "http://127.0.0.1:7780",
        token: undefined,
        urlExplicit: false,
        caller: { paneId: "p3", serverUrl: "http://127.0.0.1:7780" },
        paneSocket: "",
      }),
    ).toBeUndefined();
  });

  it("接続先を明示した（--url・空でない SODACTL_URL）ら使わない——その pane のサーバと同じ URL でも", () => {
    expect(
      paneSocketFor(optsOf(["ask", "--url", "http://127.0.0.1:7780"], withSocket)),
    ).toBeUndefined();
    expect(
      paneSocketFor(optsOf(["ask", "--url", "http://other.example:1"], withSocket)),
    ).toBeUndefined();
    expect(
      paneSocketFor(optsOf(["ask"], { ...withSocket, SODACTL_URL: "http://127.0.0.1:7780" })),
    ).toBeUndefined();
  });

  it("--machine <別のマシン> では使わない。--machine local は使う", () => {
    expect(paneSocketFor(optsOf(["--machine", "box", "snapshot"], withSocket))).toBeUndefined();
    // `--machine <別のマシン>` は呼び出し元の pane（caller）も外すので、machine だけで断ることを直に見る。
    expect(paneSocketFor({ ...optsOf(["ask"], withSocket), machine: "box" })).toBeUndefined();
    expect(paneSocketFor(optsOf(["--machine", "local", "ask"], withSocket))).toBe("/s/pane.sock");
  });
});

/** 偽の受け口。接続ごとに `onConn` を呼ぶ。受け取った要求の行（改行まで）は `lines` に溜まる。 */
interface FakeSocket {
  path: string;
  lines: string[];
  /** これまでに受けた接続（閉じたものを含む）。 */
  conns: Socket[];
  close(): Promise<void>;
}

let dir: string;
const fakes: FakeSocket[] = [];

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "sp-")); // socket のパスの長さの上限に近づけない（短い名前）
});
afterEach(async () => {
  await Promise.all(fakes.splice(0).map((f) => f.close()));
  await rm(dir, { recursive: true, force: true });
});

/**
 * 偽の受け口を立てる。`onLine` は要求の 1 行が揃ったときに呼ぶ（返事を書くのはテスト）。`onConn` は繋がった直後に呼ぶ。
 * `allowHalfOpen` にして、クライアントが半分だけ閉じたか（`end` したか）を偽の受け口が自分で見られるようにする。
 */
async function fake(handlers: {
  onConn?: (sock: Socket) => void;
  onLine?: (sock: Socket, line: string) => void;
}): Promise<FakeSocket> {
  const lines: string[] = [];
  const conns: Socket[] = [];
  const server: Server = createServer({ allowHalfOpen: true }, (sock) => {
    conns.push(sock);
    sock.on("error", () => undefined);
    handlers.onConn?.(sock);
    if (!handlers.onLine) return;
    let buf = "";
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => {
      buf += chunk;
      const nl = buf.indexOf("\n");
      if (nl < 0) return;
      const line = buf.slice(0, nl);
      buf = "";
      lines.push(line);
      handlers.onLine?.(sock, line);
    });
  });
  const path = join(dir, "pane.sock");
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(path, () => resolve());
  });
  const f: FakeSocket = {
    path,
    lines,
    conns,
    close: () =>
      new Promise<void>((resolve) => {
        for (const c of conns) c.destroy();
        server.close(() => resolve());
      }),
  };
  fakes.push(f);
  return f;
}

/** 返事を 1 行書いて閉じる（実物の受け口と同じ: 書き切ってから閉じる）。 */
const replyWith = (res: unknown) => (sock: Socket) =>
  void sock.end(`${JSON.stringify(res)}\n`, () => sock.destroy());

const REQ = { op: "ask.open", paneId: "p3", params: { spec: { title: "質問" }, timeoutMs: 5000 } };
const WAIT = { timeoutMs: 10_000 };

describe("callPaneOp（偽の受け口）", () => {
  it("要求を 1 行の JSON（v・op・paneId・params・末尾は改行）で送り、{ok:true} の result を返す", async () => {
    const f = await fake({
      onLine: replyWith({ ok: true, result: { status: "answered", answers: { a: "y" } } }),
    });
    const out = await callPaneOp(f.path, REQ, WAIT);
    expect(out).toEqual({ kind: "result", result: { status: "answered", answers: { a: "y" } } });
    expect(f.lines).toHaveLength(1);
    expect(JSON.parse(f.lines[0]!)).toEqual({
      v: 1,
      op: "ask.open",
      paneId: "p3",
      params: REQ.params,
    });
  });

  it("params を省くと、要求の行に params を入れない", async () => {
    const f = await fake({ onLine: replyWith({ ok: true, result: null }) });
    expect(await callPaneOp(f.path, { op: "test.echo", paneId: "p1" }, WAIT)).toEqual({
      kind: "result",
      result: null,
    });
    expect(JSON.parse(f.lines[0]!)).toEqual({ v: 1, op: "test.echo", paneId: "p1" });
  });

  it("返事の行を読むまで接続を半分だけ閉じない（受け口は EOF を取り消しとして扱う）", async () => {
    // 偽の受け口は、要求の行を受けたら「クライアントの EOF」か「テストの合図」を待つ。EOF が先に来たら、それを返事に書く。
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let gotLine!: () => void;
    const lineSeen = new Promise<void>((r) => (gotLine = r));
    let ended = false;
    const f = await fake({
      onConn: (sock) => sock.on("end", () => ((ended = true), release())),
      onLine: (sock) => {
        gotLine();
        void released.then(() => replyWith({ ok: true, result: { ended } })(sock));
      },
    });
    const pending = callPaneOp(f.path, REQ, WAIT);
    await lineSeen;
    // 別の接続で 1 往復する（同じ受け口の入出力を何巡かさせ、EOF が来ていれば先に届くだけの間を置く。固定の待ちにしない）。
    const probe = join(dir, "probe.sock");
    await new Promise<void>((resolve, reject) => {
      const s = createServer((c) => c.end("x")).listen(probe, () => {
        const c = connect(probe);
        c.on("error", reject);
        c.on("data", () => undefined);
        c.on("close", () => s.close(() => resolve()));
      });
    });
    release();
    expect(await pending).toEqual({ kind: "result", result: { ended: false } });
  });

  it("返事がかたまりに割れて届いても（多バイト文字の途中で割れても）1 行として読む", async () => {
    const bytes = Buffer.from(
      `${JSON.stringify({ ok: true, result: { text: "回答はこれ" } })}\n`,
      "utf8",
    );
    const cut = bytes.indexOf(Buffer.from("答", "utf8")) + 1; // 「答」の 1 バイト目の後で割る
    // クライアントの socket（`callPaneOp` が作る接続＝`connect` を発火した socket。偽の受け口の側の接続は発火しない）が受け取ったかたまり。
    const emit = vi.spyOn(Socket.prototype, "emit");
    const clientChunks = (): number[] => {
      const calls = emit.mock.calls as unknown as [event: string, arg?: unknown][];
      const client = emit.mock.contexts[calls.findIndex(([event]) => event === "connect")];
      if (client === undefined) return [];
      return calls
        .filter(([event], i) => emit.mock.contexts[i] === client && event === "data")
        .map(([, chunk]) => (chunk as Buffer).length);
    };
    try {
      const f = await fake({
        onLine: (sock) => {
          // 前半を書き、クライアントがそれだけを 1 つのかたまりとして受け取ったのを確かめてから、後半を書く。
          sock.write(bytes.subarray(0, cut));
          void vi
            .waitFor(() => expect(clientChunks()).toEqual([cut]))
            .then(() => sock.end(bytes.subarray(cut), () => sock.destroy()));
        },
      });
      expect(await callPaneOp(f.path, REQ, WAIT)).toEqual({
        kind: "result",
        result: { text: "回答はこれ" },
      });
      expect(clientChunks()).toEqual([cut, bytes.length - cut]); // 実際に 2 つに割れて届いた
    } finally {
      emit.mockRestore();
    }
  });

  it("返事の行が上限を超えたら、改行を待たずに connection_closed（溜め続けない）", async () => {
    let closedByClient!: () => void;
    const serverSawClose = new Promise<void>((r) => (closedByClient = r));
    // 改行の無い返事を書き、接続は開けたままにする（クライアントが自分で切ることを EOF で見る）。
    const f = await fake({
      onConn: (sock) => sock.on("end", () => closedByClient()),
      onLine: (sock) => void sock.write("x".repeat(300)),
    });
    const err = await callPaneOp(f.path, REQ, { ...WAIT, maxReplyBytes: 256 }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RpcFailure);
    expect(err).toMatchObject({
      code: "connection_closed",
      message: expect.stringContaining("256 bytes"),
    });
    await serverSawClose;
  });

  it("返事の行が上限ちょうどなら読む（上限は改行を除くバイト数）", async () => {
    const line = JSON.stringify({ ok: true, result: "y".repeat(100) });
    const f = await fake({ onLine: (sock) => void sock.end(`${line}\n`, () => sock.destroy()) });
    expect(await callPaneOp(f.path, REQ, { ...WAIT, maxReplyBytes: line.length })).toEqual({
      kind: "result",
      result: "y".repeat(100),
    });
    await expect(
      callPaneOp(f.path, REQ, { ...WAIT, maxReplyBytes: line.length - 1 }),
    ).rejects.toMatchObject({ code: "connection_closed" });
  });

  it("socket のファイルが無い（ENOENT）→ fallback", async () => {
    const out = await callPaneOp(join(dir, "none.sock"), REQ, WAIT);
    expect(out).toMatchObject({ kind: "fallback", reason: expect.stringContaining("ENOENT") });
  });

  it("socket でないファイル・誰も待ち受けていない socket（繋がる前のエラー）→ fallback", async () => {
    const file = join(dir, "plain.sock");
    await writeFile(file, "not a socket");
    // 普通のファイルへの connect も ECONNREFUSED になる。ここでは繋ぎ直しを見ない（`refusedRetryMs: 0`。繋ぎ直しは下の件）。
    expect((await callPaneOp(file, REQ, { ...WAIT, refusedRetryMs: 0 })).kind).toBe("fallback");
    // 待ち受けを止めた後に残った socket のファイル（不正終了の残骸と同じ形）。`server.close()` は自分のパスを消すので、
    // 先に別の名前（ハードリンク）を作っておき、そちらを残す。
    const live = join(dir, "live.sock");
    const stale = join(dir, "stale.sock");
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(live, () => resolve()));
    await link(live, stale);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    expect((await stat(stale)).isSocket()).toBe(true);
    // 繋ぎ直しを待たない設定（`refusedRetryMs: 0`）なら、すぐ fallback。
    const out = await callPaneOp(stale, REQ, { ...WAIT, refusedRetryMs: 0 });
    expect(out).toMatchObject({
      kind: "fallback",
      reason: expect.stringContaining("ECONNREFUSED"),
      errno: "ECONNREFUSED",
    });
  });

  /** 誰も待ち受けていない socket のファイル（`soda handoff` で古い版が execve した後に残る受け口と同じ形）を作る。 */
  async function staleSocket(name: string): Promise<string> {
    const live = join(dir, `${name}-live.sock`);
    const stale = join(dir, `${name}.sock`);
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(live, () => resolve()));
    await link(live, stale);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    return stale;
  }

  it("誰も待ち受けていない受け口（ECONNREFUSED）は、上限まで繋ぎ直してから fallback（すぐには落ちない）", async () => {
    const stale = await staleSocket("gone");
    const started = Date.now();
    const out = await callPaneOp(stale, REQ, { ...WAIT, refusedRetryMs: 400 });
    expect(out).toMatchObject({ kind: "fallback", errno: "ECONNREFUSED" });
    // 1 回で諦めていない（間隔 150ms で少なくとも 1 回は繋ぎ直している）。
    expect(Date.now() - started).toBeGreaterThanOrEqual(150);
  });

  it("繋ぎ直している間に受け口が置き直されたら（handoff の後の新しい版）、その受け口の結果を返す", async () => {
    const stale = await staleSocket("swap");
    const pending = callPaneOp(stale, REQ, { ...WAIT, refusedRetryMs: 5_000 });
    // 新しい受け口を別の名前で立ててから、同じパスへ rename で置き直す（サーバの置き方と同じ）。
    const f = await fake({ onLine: replyWith({ ok: true, result: { from: "new" } }) });
    await rename(f.path, stale);
    expect(await pending).toEqual({ kind: "result", result: { from: "new" } });
  });

  it("ファイルが無い（ENOENT）ときは繋ぎ直さず、すぐ fallback", async () => {
    const started = Date.now();
    const out = await callPaneOp(join(dir, "none2.sock"), REQ, { ...WAIT, refusedRetryMs: 5_000 });
    expect(out).toMatchObject({ kind: "fallback", errno: "ENOENT" });
    expect(Date.now() - started).toBeLessThan(1_000);
  });

  it.each(["unknown_op", "bad_request"])(
    "返事の code が %s（受け口がその操作・要求を知らない）→ fallback",
    async (code) => {
      const f = await fake({
        onLine: replyWith({ ok: false, error: { code, message: `m-${code}` } }),
      });
      expect(await callPaneOp(f.path, REQ, WAIT)).toEqual({
        kind: "fallback",
        reason: `${code}: m-${code}`,
      });
    },
  );

  it.each([
    "not_found",
    "ask_busy",
    "invalid_ask_spec",
    "invalid_params",
    "internal",
    "pane_socket_busy",
  ])("返事の code が %s → その code の RpcFailure（/ws へ落ちない）", async (code) => {
    const f = await fake({
      onLine: replyWith({ ok: false, error: { code, message: `m-${code}` } }),
    });
    const err = await callPaneOp(f.path, REQ, WAIT).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RpcFailure);
    expect(err).toMatchObject({ code, message: `m-${code}` });
  });

  it("要求を読まずに返事を書いて閉じる受け口（pane_socket_busy の断り方）の返事を読む——要求の書き込みが受け口の close に間に合う場合", async () => {
    // 書き込みが間に合わない（EPIPE）と、届いていても読んでいない返事は失われる。それを防ぐのは受け口の側（相手が閉じるまで読み捨てて待つ）で、
    // 実物の受け口との組み合わせは `paneSocket.integration.test.ts`（別のスレッドの受け口）で確かめる。
    const f = await fake({
      onConn: replyWith({ ok: false, error: { code: "pane_socket_busy", message: "busy" } }),
    });
    await expect(callPaneOp(f.path, REQ, WAIT)).rejects.toMatchObject({
      code: "pane_socket_busy",
      message: "busy",
    });
  });

  it("繋がった後、何も書かずに閉じた（0 バイト）→ connection_closed（fallback にしない）", async () => {
    const f = await fake({ onConn: (sock) => sock.destroy() });
    await expect(callPaneOp(f.path, REQ, WAIT)).rejects.toMatchObject({
      code: "connection_closed",
    });
  });

  it("要求を受け取った後、返事なしで閉じた → connection_closed（操作が始まっているかもしれないので /ws へ落ちない）", async () => {
    const f = await fake({ onLine: (sock) => sock.destroy() });
    const err = await callPaneOp(f.path, REQ, WAIT).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RpcFailure);
    expect(err).toMatchObject({ code: "connection_closed" });
    expect(f.lines).toHaveLength(1);
  });

  it("返事の行が揃う前（改行の前）に閉じた → connection_closed", async () => {
    const f = await fake({
      onLine: (sock) => void sock.end('{"ok":true,"result":{"status":"answ', () => sock.destroy()),
    });
    await expect(callPaneOp(f.path, REQ, WAIT)).rejects.toMatchObject({
      code: "connection_closed",
    });
  });

  it.each([
    ["JSON でない", "hello\n"],
    ["オブジェクトでない", "[1]\n"],
    ["ok が無い", '{"result":1}\n'],
    ["ok:false なのに error が無い", '{"ok":false}\n'],
    ["error の code が文字列でない", '{"ok":false,"error":{"code":7,"message":"x"}}\n'],
    ["空の行", "\n"],
  ])("返事が読めない（%s）→ connection_closed", async (_label, raw) => {
    const f = await fake({ onLine: (sock) => void sock.end(raw, () => sock.destroy()) });
    await expect(callPaneOp(f.path, REQ, WAIT)).rejects.toMatchObject({
      code: "connection_closed",
    });
  });

  it("timeoutMs を過ぎても返事が無ければ timeout。接続は捨てる", async () => {
    let closedByClient!: () => void;
    const serverSawClose = new Promise<void>((r) => (closedByClient = r));
    // 偽の受け口は半分閉じを許している（自分からは閉じない）ので、クライアントが捨てたことは EOF（`end`）で見る。
    const f = await fake({
      onConn: (sock) => sock.on("end", () => closedByClient()),
      onLine: () => undefined,
    }); // 返事を書かない
    const err = await callPaneOp(f.path, REQ, { timeoutMs: 50 }).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RpcFailure);
    expect(err).toMatchObject({ code: "timeout" });
    expect(f.lines).toHaveLength(1); // 要求は届いていた（繋がらなかったのではない）
    await serverSawClose; // クライアントの側から接続を捨てた（偽の受け口は自分からは閉じない）
  });

  it("返事を受け取った後は時間切れのタイマーを残さない", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    try {
      const f = await fake({ onLine: replyWith({ ok: true, result: 1 }) });
      await callPaneOp(f.path, REQ, { timeoutMs: 60_000 });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("viaPaneSocketOrSession", () => {
  const usable = optsOf(["ask"], {
    ...IN_PANE,
    SODA_PANE_SOCKET: "/s/pane.sock",
  } as NodeJS.ProcessEnv);
  const OP = {
    name: "ask.open",
    params: { spec: { title: "T" }, timeoutMs: 5000 },
    timeoutMs: 20_000,
  };
  const call = (outcome: PaneOpOutcome | Error) =>
    vi.fn<typeof callPaneOp>(async () => {
      if (outcome instanceof Error) throw outcome;
      return outcome;
    });

  it("受け口が使えれば、op・paneId・params・timeoutMs を渡して結果を返す。viaSession は呼ばない", async () => {
    const c = call({ kind: "result", result: { status: "answered" } });
    const viaSession = vi.fn(async () => ({ status: "from-session" }));
    expect(await viaPaneSocketOrSession(usable, "p3", OP, viaSession, c)).toEqual({
      status: "answered",
    });
    expect(c).toHaveBeenCalledExactlyOnceWith(
      "/s/pane.sock",
      { op: "ask.open", paneId: "p3", params: OP.params },
      { timeoutMs: 20_000 },
    );
    expect(viaSession).not.toHaveBeenCalled();
  });

  it("fallback なら viaSession の結果を返す", async () => {
    const c = call({ kind: "fallback", reason: "unknown_op: x" });
    const viaSession = vi.fn(async () => ({ status: "from-session" }));
    expect(await viaPaneSocketOrSession(usable, "p3", OP, viaSession, c)).toEqual({
      status: "from-session",
    });
    expect(c).toHaveBeenCalledOnce();
    expect(viaSession).toHaveBeenCalledOnce();
  });

  it("操作のエラー（RpcFailure）はそのまま投げ、viaSession へ落ちない", async () => {
    for (const code of ["ask_busy", "pane_socket_busy", "connection_closed", "timeout"]) {
      const viaSession = vi.fn(async () => "from-session");
      await expect(
        viaPaneSocketOrSession(usable, "p3", OP, viaSession, call(new RpcFailure(code, "m"))),
      ).rejects.toMatchObject({ code });
      expect(viaSession).not.toHaveBeenCalled();
    }
  });

  it("受け口を使わない条件（接続先を明示・pane の外・パスなし）では、繋ぎに行かずに viaSession", async () => {
    const env = { ...IN_PANE, SODA_PANE_SOCKET: "/s/pane.sock" } as NodeJS.ProcessEnv;
    for (const opts of [
      optsOf(["ask", "--url", "http://127.0.0.1:7780"], env),
      optsOf(["ask"], { SODA_PANE_SOCKET: "/s/pane.sock" } as NodeJS.ProcessEnv),
      optsOf(["ask"], IN_PANE),
    ]) {
      const c = call({ kind: "result", result: "from-socket" });
      expect(await viaPaneSocketOrSession(opts, "p3", OP, async () => "from-session", c)).toBe(
        "from-session",
      );
      expect(c).not.toHaveBeenCalled();
    }
  });

  it("差し替えなし（実物の callPaneOp）: 偽の受け口の結果を返す／繋げなければ viaSession", async () => {
    const f = await fake({ onLine: replyWith({ ok: true, result: { status: "cancelled" } }) });
    const viaSession = vi.fn(async () => ({ status: "from-session" }));
    expect(
      await viaPaneSocketOrSession({ ...usable, paneSocket: f.path }, "p3", OP, viaSession),
    ).toEqual({ status: "cancelled" });
    expect(viaSession).not.toHaveBeenCalled();
    expect(
      await viaPaneSocketOrSession(
        { ...usable, paneSocket: join(dir, "none.sock") },
        "p3",
        OP,
        viaSession,
      ),
    ).toEqual({ status: "from-session" });
    expect(viaSession).toHaveBeenCalledOnce();
  });
});
