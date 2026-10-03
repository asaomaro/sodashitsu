import { connect, type Socket } from "node:net";
import { readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { RpcError, type PaneSocketResponse } from "@sodashitsu/protocol";
import { makeTempDir } from "../persist/atomicFile.js";
import { MemoryLogger } from "../log/Logger.js";
import { PaneOpRegistry, type PaneOpContext } from "./PaneOpRegistry.js";
import { PaneSocket, type PaneSocketLimits } from "./PaneSocket.js";

/** 1 本の接続（テストのクライアント役）。受け口が書いたものを全部溜め、接続が閉じたら `closed` が解決する。 */
interface Client {
  sock: Socket;
  /** 接続が閉じるまでに受け取った生のテキスト。 */
  closed: Promise<string>;
}

function open(path: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    let buf = "";
    const sock = connect(path);
    sock.setEncoding("utf8");
    sock.on("data", (chunk: string) => (buf += chunk));
    const closed = new Promise<string>((res) => sock.on("close", () => res(buf)));
    sock.once("error", reject);
    sock.once("connect", () => {
      sock.off("error", reject);
      sock.on("error", () => undefined); // 受け口が先に切ったときの EPIPE・ECONNRESET は `close` で見る
      resolve({ sock, closed });
    });
  });
}

/** 生のデータを送って、受け口が接続を閉じるまでに書いたものを返す（sodactl と同じく `write` で送り、半分だけ閉じない）。 */
async function sendRaw(path: string, payload: string | Buffer): Promise<string> {
  const c = await open(path);
  c.sock.write(payload);
  return c.closed;
}

function parseReply(raw: string): PaneSocketResponse {
  expect(raw.endsWith("\n")).toBe(true);
  expect(raw.indexOf("\n")).toBe(raw.length - 1); // 返事は 1 行だけ
  return JSON.parse(raw) as PaneSocketResponse;
}

/** sodactl の `callPaneOp` と同じ形の 1 行を送り、返事の 1 行を返す。 */
async function call(path: string, op: string, paneId: string, params?: Record<string, unknown>): Promise<PaneSocketResponse> {
  return parseReply(await sendRaw(path, `${JSON.stringify({ v: 1, op, paneId, ...(params ? { params } : {}) })}\n`));
}

function deferred<T>(): { promise: Promise<T>; resolve(v: T): void } {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
}

// Unix ドメイン socket のファイルを使う（Windows では受け口を置かない）。
describe.skipIf(process.platform === "win32")("PaneSocket", () => {
  let dir: string;
  let path: string;
  let logger: MemoryLogger;
  let registry: PaneOpRegistry;
  let socket: PaneSocket;
  let panes: Set<string>;
  let gone: string[];
  /** `test.echo` が呼ばれた回数。 */
  let echoCalls: number;
  /** `test.wait` が呼ばれるたびに積む（待っている操作の文脈と、結果を返す口）。 */
  let waits: { ctx: PaneOpContext; finish(value: unknown): void }[];

  function start(limits?: Partial<PaneSocketLimits>): Promise<void> {
    socket = new PaneSocket({
      registry,
      paneExists: (id) => panes.has(id),
      onConnectionGone: (id) => gone.push(id),
      logger,
      ...(limits ? { limits } : {}),
    });
    return socket.listen(path);
  }

  /** `test.wait` を送り、handler が呼ばれるまで待つ（返事はまだ来ない）。 */
  async function openWaiting(paneId = "p1"): Promise<{ client: Client; wait: (typeof waits)[number] }> {
    const before = waits.length;
    const client = await open(path);
    client.sock.write(`${JSON.stringify({ v: 1, op: "test.wait", paneId })}\n`);
    await vi.waitFor(() => expect(waits.length).toBe(before + 1));
    return { client, wait: waits[before]! };
  }

  beforeEach(async () => {
    dir = await makeTempDir("soda-pane-sock-");
    path = join(dir, "pane.sock");
    logger = new MemoryLogger();
    panes = new Set(["p1", "p2"]);
    gone = [];
    echoCalls = 0;
    waits = [];
    registry = new PaneOpRegistry(logger);
    registry.register({
      name: "test.echo",
      params: z.object({ text: z.string(), fail: z.boolean().optional() }),
      handler: (ctx, p) => {
        echoCalls++;
        if (p.fail) throw new RpcError("ask_busy", "echo is busy");
        return { text: p.text, paneId: ctx.paneId, connId: ctx.connId };
      },
    });
    registry.register({
      name: "test.wait",
      params: z.object({}),
      handler: (ctx) => {
        const d = deferred<unknown>();
        waits.push({ ctx, finish: d.resolve });
        return d.promise;
      },
    });
  });

  afterEach(async () => {
    await socket?.close();
    await rm(dir, { recursive: true, force: true });
  });

  describe("正常系", () => {
    it("登録した操作を 1 行で呼ぶと、結果が 1 行で返って接続が閉じる。handler は名乗った paneId を受け取る（AC13・AC16）", async () => {
      await start();

      const res = await call(path, "test.echo", "p2", { text: "hi" });

      expect(res).toEqual({ ok: true, result: { text: "hi", paneId: "p2", connId: expect.stringMatching(/^pane-socket:\d+$/) } });
    });

    it("接続ごとに別の connId になる", async () => {
      await start();

      const a = await call(path, "test.echo", "p1", { text: "a" });
      const b = await call(path, "test.echo", "p1", { text: "b" });

      const idOf = (r: PaneSocketResponse): unknown => (r.ok ? (r.result as { connId: string }).connId : undefined);
      expect(idOf(a)).not.toBe(idOf(b));
    });

    it("handler が投げた RpcError は、その code の返事になる", async () => {
      await start();

      const res = await call(path, "test.echo", "p1", { text: "x", fail: true });

      expect(res).toEqual({ ok: false, error: { code: "ask_busy", message: "echo is busy" } });
    });

    it("params の省略は {} として扱う", async () => {
      await start();
      const { client, wait } = await openWaiting();

      wait.finish("done");

      expect(parseReply(await client.closed)).toEqual({ ok: true, result: "done" });
    });

    it("要求がいくつかのかたまりに分かれて届いても（多バイト文字の途中で割れても）1 行として読む", async () => {
      await start();
      const line = Buffer.from(`${JSON.stringify({ v: 1, op: "test.echo", paneId: "p1", params: { text: "操舵室" } })}\n`);
      const cut = line.indexOf(Buffer.from("舵")) + 1; // 「舵」の 3 バイトの途中
      const c = await open(path);

      c.sock.write(line.subarray(0, cut));
      await new Promise((r) => setTimeout(r, 20)); // 別のかたまりとして届かせる
      c.sock.write(line.subarray(cut));

      expect(parseReply(await c.closed)).toMatchObject({ ok: true, result: { text: "操舵室" } });
    });

    it("1 接続 1 要求: 2 行目以降は読まない", async () => {
      await start();
      const one = JSON.stringify({ v: 1, op: "test.echo", paneId: "p1", params: { text: "first" } });
      const two = JSON.stringify({ v: 1, op: "test.echo", paneId: "p1", params: { text: "second" } });

      const res = parseReply(await sendRaw(path, `${one}\n${two}\n`));

      expect(res).toMatchObject({ ok: true, result: { text: "first" } });
      expect(echoCalls).toBe(1);
    });

    it("知らない項目は無視する", async () => {
      await start();

      const raw = await sendRaw(path, `${JSON.stringify({ v: 1, op: "test.echo", paneId: "p1", params: { text: "x" }, token: "t" })}\n`);

      expect(parseReply(raw)).toMatchObject({ ok: true });
    });
  });

  describe("検査の順（形 → 操作 → pane → 引数）", () => {
    it("登録に無い操作は unknown_op（AC3・AC14）", async () => {
      await start();

      expect(await call(path, "pane.write", "p1", { data: "rm -rf /\n" })).toMatchObject({ ok: false, error: { code: "unknown_op" } });
      expect(await call(path, "workspace.create", "p1")).toMatchObject({ ok: false, error: { code: "unknown_op" } });
    });

    it("実在しない pane と知らない操作の組み合わせでも unknown_op（操作を pane より先に見る）", async () => {
      await start();

      expect(await call(path, "pane.write", "nope")).toMatchObject({ ok: false, error: { code: "unknown_op" } });
    });

    it("実在しない pane は not_found（handler は呼ばない）", async () => {
      await start();

      const res = await call(path, "test.echo", "nope", { text: "x" });

      expect(res).toEqual({ ok: false, error: { code: "not_found", message: "pane not found: nope" } });
      expect(echoCalls).toBe(0);
    });

    it("実在しない pane と schema に合わない引数の組み合わせは not_found（pane を引数より先に見る）", async () => {
      await start();

      expect(await call(path, "test.echo", "nope", { text: 1 })).toMatchObject({ ok: false, error: { code: "not_found" } });
    });

    it("引数が schema に合わなければ invalid_params（handler は呼ばない）", async () => {
      await start();

      expect(await call(path, "test.echo", "p1", { text: 1 })).toMatchObject({ ok: false, error: { code: "invalid_params" } });
      expect(await call(path, "test.echo", "p1")).toMatchObject({ ok: false, error: { code: "invalid_params" } });
      expect(echoCalls).toBe(0);
    });

    it("形が違う要求は、知らない操作・実在しない pane を名乗っていても bad_request", async () => {
      await start();

      const raw = await sendRaw(path, `${JSON.stringify({ v: 2, op: "pane.write", paneId: "nope" })}\n`);

      expect(parseReply(raw)).toMatchObject({ ok: false, error: { code: "bad_request" } });
    });
  });

  describe("壊れた入力（AC9）: 断った後も次の要求が通る", () => {
    async function expectStillServing(): Promise<void> {
      expect(await call(path, "test.echo", "p1", { text: "after" })).toMatchObject({ ok: true, result: { text: "after" } });
      expect(socket.connectionCount).toBe(0);
    }

    it.each([
      ["JSON でない", "not json\n"],
      ["空の行", "\n"],
      ["JSON だがオブジェクトでない", '"ask.open"\n'],
      ["v が違う", `${JSON.stringify({ v: 2, op: "test.echo", paneId: "p1", params: { text: "x" } })}\n`],
      ["v が無い", `${JSON.stringify({ op: "test.echo", paneId: "p1", params: { text: "x" } })}\n`],
      ["paneId が無い", `${JSON.stringify({ v: 1, op: "test.echo", params: { text: "x" } })}\n`],
      ["op が文字列でない", `${JSON.stringify({ v: 1, op: 7, paneId: "p1" })}\n`],
      ["params がオブジェクトでない", `${JSON.stringify({ v: 1, op: "test.echo", paneId: "p1", params: "x" })}\n`],
    ])("%s → bad_request", async (_name, payload) => {
      await start();

      const res = parseReply(await sendRaw(path, payload));

      expect(res).toMatchObject({ ok: false, error: { code: "bad_request" } });
      expect(echoCalls).toBe(0);
      await expectStillServing();
    });

    it("上限を超える行（改行つき）→ bad_request を書いて切る", async () => {
      await start({ maxLineBytes: 256 });
      const big = JSON.stringify({ v: 1, op: "test.echo", paneId: "p1", params: { text: "x".repeat(300) } });

      const res = parseReply(await sendRaw(path, `${big}\n`));

      expect(res).toMatchObject({ ok: false, error: { code: "bad_request" } });
      expect(echoCalls).toBe(0);
      await expectStillServing();
    });

    it("改行の無いまま上限を超える流れ → 改行を待たずに bad_request を書いて切る", async () => {
      await start({ maxLineBytes: 256 });

      const res = parseReply(await sendRaw(path, "x".repeat(257)));

      expect(res).toMatchObject({ ok: false, error: { code: "bad_request" } });
      await expectStillServing();
    });

    it("上限ちょうどの行は通る（上限は改行を除くバイト数）", async () => {
      const base = JSON.stringify({ v: 1, op: "test.echo", paneId: "p1", params: { text: "" } });
      const line = JSON.stringify({ v: 1, op: "test.echo", paneId: "p1", params: { text: "あ".repeat(10) } });
      expect(Buffer.byteLength(line)).toBe(base.length + 30); // バイト数で数えている（文字数なら +10）
      await start({ maxLineBytes: Buffer.byteLength(line) });

      expect(parseReply(await sendRaw(path, `${line}\n`))).toMatchObject({ ok: true });
      expect(parseReply(await sendRaw(path, `${line} \n`))).toMatchObject({ ok: false, error: { code: "bad_request" } });
    });

    it("行の途中で切れる → 何も返さず後始末する（handler は呼ばない）", async () => {
      await start();
      const c = await open(path);
      c.sock.write('{"v":1,"op":"test.echo","paneId":"p1","par');
      await vi.waitFor(() => expect(socket.connectionCount).toBe(1));

      c.sock.destroy();
      await c.closed;

      await vi.waitFor(() => expect(gone).toHaveLength(1));
      expect(echoCalls).toBe(0);
      await expectStillServing();
    });

    it("行が揃わないと、待ちの上限で何も書かずに切る", async () => {
      await start({ requestWaitMs: 50 });
      const c = await open(path);
      c.sock.write('{"v":1,"op":"test.echo"'); // 改行を送らない

      // 上限が効かなければ接続は閉じず、このテストは時間切れで落ちる。
      expect(await c.closed).toBe("");

      await vi.waitFor(() => expect(gone).toHaveLength(1));
      expect(socket.connectionCount).toBe(0);
      await expectStillServing();
    });

    it("何も送らない接続も、待ちの上限で切る", async () => {
      await start({ requestWaitMs: 50 });
      const c = await open(path);

      expect(await c.closed).toBe("");
      await vi.waitFor(() => expect(socket.connectionCount).toBe(0));
    });

    it("待ちの上限は行が揃うまでのもの: 行が揃った後は、操作が上限より長く掛かっても切らない", async () => {
      await start({ requestWaitMs: 50 });
      const { client, wait } = await openWaiting();

      await new Promise((r) => setTimeout(r, 150)); // 上限の 3 倍
      expect(wait.ctx.signal.aborted).toBe(false);
      wait.finish("late");

      expect(parseReply(await client.closed)).toEqual({ ok: true, result: "late" });
    });
  });

  describe("接続の終わり", () => {
    it("返事を待つ間に相手が接続を閉じると、signal が abort し、onConnectionGone がその connId で 1 回呼ばれる（AC6）", async () => {
      await start();
      const { client, wait } = await openWaiting();
      expect(wait.ctx.signal.aborted).toBe(false);
      expect(gone).toEqual([]);

      client.sock.destroy();

      await vi.waitFor(() => expect(gone).toEqual([wait.ctx.connId]));
      expect(wait.ctx.signal.aborted).toBe(true);
      expect(socket.connectionCount).toBe(0);
      // 切れた後に操作が終わっても、何も起きない（書く相手がいない）。
      wait.finish("too late");
      await new Promise((r) => setImmediate(r));
      expect(gone).toEqual([wait.ctx.connId]);
      expect(await call(path, "test.echo", "p1", { text: "x" })).toMatchObject({ ok: true });
    });

    it("返事を書いて閉じたときも、onConnectionGone は 1 回だけ呼ばれる", async () => {
      await start();

      const res = await call(path, "test.echo", "p1", { text: "x" });

      const connId = res.ok ? (res.result as { connId: string }).connId : "";
      await vi.waitFor(() => expect(gone).toEqual([connId]));
      await new Promise((r) => setTimeout(r, 20));
      expect(gone).toEqual([connId]);
    });

    it("断った要求（bad_request・unknown_op）でも、接続ごとに 1 回呼ばれる", async () => {
      await start();

      await sendRaw(path, "not json\n");
      await call(path, "pane.write", "p1");

      await vi.waitFor(() => expect(gone).toHaveLength(2));
      expect(new Set(gone).size).toBe(2);
    });

    it("onConnectionGone が投げても受け口は止まらない", async () => {
      socket = new PaneSocket({
        registry,
        paneExists: () => true,
        onConnectionGone: () => {
          throw new Error("boom");
        },
        logger,
      });
      await socket.listen(path);

      expect(await call(path, "test.echo", "p1", { text: "a" })).toMatchObject({ ok: true });
      expect(await call(path, "test.echo", "p1", { text: "b" })).toMatchObject({ ok: true });
    });
  });

  describe("同時接続の上限", () => {
    it("上限まで開いていると、新しい接続は要求を読まずに pane_socket_busy。空けば通る", async () => {
      await start({ maxConnections: 2 });
      const a = await openWaiting();
      const b = await openWaiting();
      expect(socket.connectionCount).toBe(2);

      const res = await call(path, "test.echo", "p1", { text: "x" });

      expect(res).toMatchObject({ ok: false, error: { code: "pane_socket_busy" } });
      expect(echoCalls).toBe(0);
      expect(socket.connectionCount).toBe(2); // 断った接続は数えない
      // 待っている 2 本は影響を受けない。
      expect(a.wait.ctx.signal.aborted).toBe(false);
      a.wait.finish("a");
      expect(parseReply(await a.client.closed)).toEqual({ ok: true, result: "a" });
      await vi.waitFor(() => expect(socket.connectionCount).toBe(1));
      expect(await call(path, "test.echo", "p1", { text: "y" })).toMatchObject({ ok: true, result: { text: "y" } });
      b.wait.finish("b");
      await b.client.closed;
    });

    it("断った接続では onConnectionGone を呼ばない（操作は始まっていない）", async () => {
      await start({ maxConnections: 1 });
      const a = await openWaiting();

      await call(path, "test.echo", "p1", { text: "x" });
      await new Promise((r) => setTimeout(r, 20));

      expect(gone).toEqual([]);
      a.wait.finish(null);
      await a.client.closed;
    });
  });

  describe("pause / resume（引き継ぎ）", () => {
    it("pause は開いている接続を何も書かずに捨て、signal を abort し、onConnectionGone を呼ぶ", async () => {
      await start();
      const a = await openWaiting("p1");
      const b = await openWaiting("p2");

      socket.pause();

      // pause から戻った時点で、待っていた操作は取り消されている。
      expect(a.wait.ctx.signal.aborted).toBe(true);
      expect(b.wait.ctx.signal.aborted).toBe(true);
      expect([...gone].sort()).toEqual([a.wait.ctx.connId, b.wait.ctx.connId].sort());
      expect(socket.connectionCount).toBe(0);
      expect(await a.client.closed).toBe("");
      expect(await b.client.closed).toBe("");
      expect(gone).toHaveLength(2); // socket の close が後から来ても 2 回目は呼ばない
    });

    it("pause 中の新しい接続は要求を読まずに pane_socket_busy、resume で受け付けが戻る", async () => {
      await start();

      socket.pause();
      const refused = await call(path, "test.echo", "p1", { text: "x" });

      expect(refused).toMatchObject({ ok: false, error: { code: "pane_socket_busy" } });
      expect(echoCalls).toBe(0);
      expect((await stat(path)).isSocket()).toBe(true); // 待ち受けは続けている

      socket.resume();

      expect(await call(path, "test.echo", "p1", { text: "back" })).toMatchObject({ ok: true, result: { text: "back" } });
      expect(echoCalls).toBe(1);
    });
  });

  describe("起動と停止", () => {
    it("pane.sock は 0600 の socket で、一時ディレクトリを残さない（AC5）", async () => {
      await start();

      const st = await stat(path);
      expect(st.isSocket()).toBe(true);
      expect(st.mode & 0o777).toBe(0o600);
      expect(await readdir(dir)).toEqual(["pane.sock"]);
    });

    it("前回の残骸（普通のファイル）があっても起動できる（AC11）", async () => {
      await writeFile(path, "stale");

      await start();

      expect((await stat(path)).isSocket()).toBe(true);
      expect(await call(path, "test.echo", "p1", { text: "x" })).toMatchObject({ ok: true });
    });

    it("前の版の受け口の socket が残っていても置き換える（execve で入れ替わった後の起動）", async () => {
      await start();
      const old = socket;
      const oldEcho = echoCalls;
      const fresh = new PaneOpRegistry(logger);
      fresh.register({ name: "test.echo", params: z.object({}), handler: () => "new" });
      socket = new PaneSocket({ registry: fresh, paneExists: () => true, onConnectionGone: () => undefined, logger });
      try {
        await socket.listen(path);

        expect(await call(path, "test.echo", "p1")).toEqual({ ok: true, result: "new" });
        expect(echoCalls).toBe(oldEcho);
      } finally {
        // 古い受け口の close は同じパスのファイルを消すので、新しい受け口を先に閉じてから片付ける。
        await socket.close();
        await old.close();
      }
    });

    it("置けなければ listen が投げる（呼び出し側が warn で続ける）", async () => {
      socket = new PaneSocket({ registry, paneExists: () => true, onConnectionGone: () => undefined, logger });

      await expect(socket.listen(join(dir, "missing", "pane.sock"))).rejects.toThrow();

      await socket.close(); // 起動に失敗した後の close は何もしない
      expect(await readdir(dir)).toEqual([]);
    });

    it("close の後は socket のファイルが無く、繋げない（AC11）", async () => {
      await start();
      expect(await call(path, "test.echo", "p1", { text: "x" })).toMatchObject({ ok: true });

      await socket.close();

      await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
      await expect(open(path)).rejects.toMatchObject({ code: "ENOENT" });
      expect(await readdir(dir)).toEqual([]);
    });

    it("close は待っている接続を何も書かずに捨てて終わる（接続が残っていても止まれる）", async () => {
      await start();
      const { client, wait } = await openWaiting();

      await socket.close();

      expect(wait.ctx.signal.aborted).toBe(true);
      expect(gone).toEqual([wait.ctx.connId]);
      expect(await client.closed).toBe("");
      expect(socket.connectionCount).toBe(0);
    });

    it("close は何度呼んでもよい", async () => {
      await start();

      await socket.close();
      await socket.close();
    });
  });

  describe("ログ", () => {
    it("操作の名前・paneId・connId・code だけを書き、引数・結果の中身は書かない", async () => {
      await start();

      const ok = await call(path, "test.echo", "p1", { text: "SECRET-PARAM-TEXT" });
      await call(path, "test.echo", "nope", { text: "SECRET-PARAM-TEXT" });
      await call(path, "pane.write", "p1", { data: "SECRET-PARAM-TEXT" });
      await sendRaw(path, "SECRET-PARAM-TEXT not json\n");

      const connId = ok.ok ? (ok.result as { connId: string }).connId : "";
      const requests = logger.lines.filter((l) => l.msg === "pane socket: request").map((l) => l.fields);
      expect(requests[0]).toEqual({ op: "test.echo", paneId: "p1", connId, code: "ok" });
      expect(requests.map((f) => f?.code)).toEqual(["ok", "not_found", "unknown_op", "bad_request"]);
      expect(JSON.stringify(logger.lines)).not.toContain("SECRET-PARAM-TEXT");
    });
  });
});
