import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PaneAskOpenParams, PaneSocketRequest, RpcError } from "@sodashitsu/protocol";
import { PaneOpRegistry, PaneSocket, type PaneOpContext } from "@sodashitsu/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { callPaneOp } from "./paneSocket.js";
import { RpcFailure } from "./wsClient.js";

/**
 * 実物の受け口（`PaneSocket`＋`PaneOpRegistry`。`@sodashitsu/server` のビルド済みの dist）× 実物のクライアント（`callPaneOp`）。
 * 20261003-sodactl-ask-socket の AC13・AC14・AC16: テスト用の操作を登録するだけで、受け口・クライアントのコードに手を入れずに通る。
 * 受け口は Unix ドメイン socket なので、Windows では走らせない（sodactl も Windows では受け口を使わない）。
 */

const WAIT = { timeoutMs: 10_000 };
const NO_LOG = { debug: () => undefined, info: () => undefined, warn: () => undefined, error: () => undefined };
/** どんな引数（オブジェクト）でも通す schema（cli は zod に依存しないので、protocol の要求の `params` の schema を借りる）。 */
const ANY_PARAMS = PaneSocketRequest.shape.params;

describe.skipIf(process.platform === "win32")("callPaneOp × 実物の PaneSocket", () => {
  let dir: string;
  let path: string;
  let socket: PaneSocket;
  let registry: PaneOpRegistry;
  /** 終わった接続の名前（`onConnectionGone` が呼ばれた順）。 */
  let gone: string[];
  /** `test.wait` の handler が受け取った文脈と、返事を出させる合図。 */
  let waiting: { ctx: PaneOpContext; release: (value: unknown) => void }[];

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), "sp-")); // socket のパスの長さの上限に近づけない（短い名前）
    path = join(dir, "pane.sock");
    gone = [];
    waiting = [];
    registry = new PaneOpRegistry(NO_LOG);
    registry.register({
      name: "test.echo",
      params: ANY_PARAMS,
      handler: (ctx, params) => ({ paneId: ctx.paneId, connId: ctx.connId, params }),
    });
    registry.register({
      name: "test.fail",
      params: ANY_PARAMS,
      handler: () => {
        throw new RpcError("ask_busy", "the pane already has a question");
      },
    });
    registry.register({ name: "test.strict", params: PaneAskOpenParams, handler: () => "unreachable" });
    // 結果が決まるまで返事をしない操作（`ask.open` と同じ形）。接続が切れたら `signal` で分かる。
    registry.register({
      name: "test.wait",
      params: ANY_PARAMS,
      handler: (ctx) => new Promise<unknown>((resolve) => waiting.push({ ctx, release: resolve })),
    });
    socket = new PaneSocket({
      registry,
      paneExists: (paneId) => paneId === "p1" || paneId === "p2",
      onConnectionGone: (connId) => void gone.push(connId),
      logger: NO_LOG,
    });
    await socket.listen(path);
  });

  afterEach(async () => {
    await socket.close();
    await rm(dir, { recursive: true, force: true });
  });

  it("登録した操作（test.echo）を呼ぶと、名乗った pane・引数が handler に届き、結果が返る", async () => {
    const out = await callPaneOp(path, { op: "test.echo", paneId: "p2", params: { text: "こんにちは", n: 1 } }, WAIT);
    expect(out).toEqual({ kind: "result", result: { paneId: "p2", connId: expect.stringMatching(/^pane-socket:\d+$/), params: { text: "こんにちは", n: 1 } } });
    // params を省いた要求は、受け口が {} として handler に渡す。
    const bare = await callPaneOp(path, { op: "test.echo", paneId: "p1" }, WAIT);
    expect(bare).toMatchObject({ kind: "result", result: { paneId: "p1", params: {} } });
  });

  it("handler が投げた RpcError は、その code と message の RpcFailure になる", async () => {
    const err = await callPaneOp(path, { op: "test.fail", paneId: "p1" }, WAIT).then(
      () => undefined,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(RpcFailure);
    expect(err).toMatchObject({ code: "ask_busy", message: "the pane already has a question" });
  });

  it("登録に無い操作は fallback（実在しない pane と組み合わせても fallback）", async () => {
    expect(await callPaneOp(path, { op: "pane.write", paneId: "p1", params: { data: "x" } }, WAIT)).toMatchObject({ kind: "fallback", reason: expect.stringContaining("unknown_op") });
    expect(await callPaneOp(path, { op: "pane.write", paneId: "p9" }, WAIT)).toMatchObject({ kind: "fallback", reason: expect.stringContaining("unknown_op") });
  });

  it("実在しない pane は not_found、引数が schema に合わなければ invalid_params（どちらも fallback にしない）", async () => {
    await expect(callPaneOp(path, { op: "test.echo", paneId: "p9" }, WAIT)).rejects.toMatchObject({ code: "not_found" });
    await expect(callPaneOp(path, { op: "test.strict", paneId: "p1", params: { timeoutMs: "soon" } }, WAIT)).rejects.toMatchObject({ code: "invalid_params" });
  });

  it("返事を待つ間、受け口から見て接続は開いたまま（取り消しにならない）。結果が決まれば届く", async () => {
    const pending = callPaneOp(path, { op: "test.wait", paneId: "p1" }, WAIT);
    await vi.waitFor(() => expect(waiting).toHaveLength(1));
    // 待っている間に別の要求を 1 往復させる（クライアントが半分だけ閉じていれば、その EOF を受け口が処理するだけの間が空く）。
    await callPaneOp(path, { op: "test.echo", paneId: "p1" }, WAIT);
    const { ctx, release } = waiting[0]!;
    expect(ctx.signal.aborted).toBe(false);
    expect(gone).not.toContain(ctx.connId);
    expect(socket.connectionCount).toBe(1);
    release({ status: "answered" });
    expect(await pending).toEqual({ kind: "result", result: { status: "answered" } });
    await vi.waitFor(() => expect(gone).toContain(ctx.connId)); // 返事の後に接続が終わる
  });

  it("クライアントが時間切れで接続を捨てると、受け口の側で取り消しになる（signal と onConnectionGone）", async () => {
    const pending = callPaneOp(path, { op: "test.wait", paneId: "p1" }, { timeoutMs: 100 });
    await vi.waitFor(() => expect(waiting).toHaveLength(1));
    await expect(pending).rejects.toMatchObject({ code: "timeout" });
    const { ctx } = waiting[0]!;
    await vi.waitFor(() => expect(ctx.signal.aborted).toBe(true));
    expect(gone).toContain(ctx.connId);
  });

  it("受け付けを止める（pause）と、待っていた呼び出しは connection_closed、新しい呼び出しは pane_socket_busy。resume で戻る", async () => {
    const pending = callPaneOp(path, { op: "test.wait", paneId: "p1" }, WAIT);
    const settled = pending.then(
      () => undefined,
      (e: unknown) => e,
    );
    await vi.waitFor(() => expect(waiting).toHaveLength(1));
    socket.pause();
    expect(await settled).toMatchObject({ code: "connection_closed" });
    await expect(callPaneOp(path, { op: "test.echo", paneId: "p1" }, WAIT)).rejects.toMatchObject({ code: "pane_socket_busy" });
    socket.resume();
    expect((await callPaneOp(path, { op: "test.echo", paneId: "p1" }, WAIT)).kind).toBe("result");
  });

  it("受け口を閉じると、待っていた呼び出しは connection_closed。閉じた後は socket のファイルが無く fallback", async () => {
    const pending = callPaneOp(path, { op: "test.wait", paneId: "p1" }, WAIT);
    const settled = pending.then(
      () => undefined,
      (e: unknown) => e,
    );
    await vi.waitFor(() => expect(waiting).toHaveLength(1));
    await socket.close();
    expect(await settled).toMatchObject({ code: "connection_closed" });
    await expect(stat(path)).rejects.toMatchObject({ code: "ENOENT" });
    expect(await callPaneOp(path, { op: "test.echo", paneId: "p1" }, WAIT)).toMatchObject({ kind: "fallback", reason: expect.stringContaining("ENOENT") });
  });
});
