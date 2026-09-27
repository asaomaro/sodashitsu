import { createServer, type AddressInfo, type Server } from "node:net";
import { composeServer, type ComposedServer } from "./composeServer.js";
import type { RawServeArgs } from "./config.js";
import { unbracketHost } from "./util/net.js";

/**
 * テスト用：空いているポートの番号を 1 つ選ぶ（`listen(0)` で割り当てさせて閉じる）。閉じてから使うまでの間に別の誰かが
 * 同じ番号を取りうるので、待ち受けさせるなら `composeServerOnFreePort` を使う（20260926-load-flaky-tests の D3）。
 */
export function getFreePort(host = "127.0.0.1"): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    const probe = createServer();
    probe.on("error", rejectPromise);
    probe.listen(0, host, () => {
      const port = (probe.address() as AddressInfo).port;
      probe.close((err) => (err ? rejectPromise(err) : resolvePromise(port)));
    });
  });
}

/**
 * テスト用：`server`（`http.Server` 等）を `listen(0)` で待ち受けさせ、割り当てられたポートを返す。番号を先に取らないので取り合いが
 * 起きない。Origin の方針（`DefaultOriginPolicy`）は検査のたびに `opts.port` を読むので、組み立てに渡した `opts` の `port` を後から
 * この値に書き換えればよい。
 */
export function listenOnFreePort(server: Server, host = "127.0.0.1"): Promise<number> {
  return new Promise((resolvePromise, rejectPromise) => {
    server.once("error", rejectPromise);
    server.listen(0, host, () => {
      server.off("error", rejectPromise);
      resolvePromise((server.address() as AddressInfo).port);
    });
  });
}

export interface ComposeOnFreePortOptions {
  /** 待ち受けの手順（既定は `server.listen()`）。組み立てと待ち受けの間に何かを挟むテストが渡す。取り直すたびに最初から呼ばれる。 */
  start?: (server: ComposedServer, port: number) => Promise<void>;
  /** 組み立てて待ち受けるまでを試す回数の上限（既定 5）。 */
  attempts?: number;
  /** 空いているポートの選び方（既定は `getFreePort`）。 */
  pickPort?: (host: string) => Promise<number>;
  /** `composeServer` のテスト用の差し替え（2 つ目の引数）。 */
  internal?: Parameters<typeof composeServer>[1];
}

/**
 * テスト用：空いているポートで `composeServer` を組み立てて待ち受けさせる。選んだポートを待ち受けの前に別の誰かが使っていたら
 * （`EADDRINUSE`）、閉じて別のポートで組み立て直す。待ち受けに失敗した `listen()` は token・シェル・ロックを残さない（D101〜D103）
 * ので、やり直しても状態は汚れない。それ以外の失敗は閉じてから投げ直す。待ち受けたポートは `server.options.port`。
 */
export async function composeServerOnFreePort(
  args: Omit<RawServeArgs, "port">,
  opts: ComposeOnFreePortOptions = {},
): Promise<ComposedServer> {
  const host = unbracketHost(args.host ?? "127.0.0.1"); // `[::1]` の形でも listen(0) できるように（resolveServeOptions と同じ）
  const attempts = opts.attempts ?? 5;
  const pickPort = opts.pickPort ?? getFreePort;
  const start = opts.start ?? ((server: ComposedServer) => server.listen());
  for (let attempt = 1; ; attempt++) {
    const port = await pickPort(host);
    const server = await composeServer({ ...args, port: String(port) }, opts.internal);
    try {
      await start(server, port);
      return server;
    } catch (err) {
      await server.close().catch(() => undefined);
      if (!isAddrInUse(err) || attempt >= attempts) throw err;
    }
  }
}

function isAddrInUse(err: unknown): boolean {
  return (
    typeof err === "object" && err !== null && (err as { code?: unknown }).code === "EADDRINUSE"
  );
}
