import { connect, type Socket } from "node:net";
import { resolveSessionStateDir } from "../persist/namedSession.js";
import { bridgeSocketPathFor } from "./BridgeEndpoint.js";

/**
 * `wtm bridge [--session NAME] [--state-dir DIR]`（20260927-multi-host-machines の design「wtm bridge」）。手元の `wtm serve` が
 * `ssh <宛先> wtm bridge …` として起動し、SSH の標準入出力と、このマシンの `wtm serve` の中継の受け口（`bridge.sock`・0600）を**素通しで**繋ぐ。
 * 枠は解釈しない（多重化を解くのは受け口）。`WTM_SESSION` は読まない（ssh の先の環境で思わぬ session を選ばない。decisions D5）。
 * 終了コード: 0 どちらかが閉じた／1 繋げない（その他）／2 引数の誤り・Windows（`ConfigError`）／3 動いていない（受け口が無い・拒否）。
 */
export const BRIDGE_EXIT_NOT_RUNNING = 3;

export interface BridgeIo {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  err(line: string): void;
}

export interface BridgeDeps {
  platform: NodeJS.Platform;
  connect(path: string): Socket;
}

export const defaultBridgeDeps = (): BridgeDeps => ({
  platform: process.platform,
  connect: (path) => connect(path),
});

export async function runBridge(
  opts: { stateDir: string; session: string | undefined },
  io: BridgeIo,
  deps: BridgeDeps = defaultBridgeDeps(),
): Promise<number> {
  if (deps.platform === "win32") {
    io.err("wtm: bridge is not supported on Windows");
    return 2;
  }
  // 名前の規則はここで見る（規則外は ConfigError＝終了コード 2。何も作らない）。
  const dir = resolveSessionStateDir(opts.stateDir, opts.session);
  const name = opts.session ?? "default";
  const sock = deps.connect(bridgeSocketPathFor(dir));
  const connected = await new Promise<NodeJS.ErrnoException | undefined>((resolve) => {
    sock.once("connect", () => resolve(undefined));
    sock.once("error", (err: NodeJS.ErrnoException) => resolve(err));
  });
  if (connected !== undefined) {
    sock.destroy();
    if (connected.code === "ENOENT" || connected.code === "ECONNREFUSED") {
      const hint = opts.session !== undefined ? `wtm serve --session ${opts.session}` : "wtm serve";
      io.err(`wtm: no running wtm serve for session ${name} (start it on this machine: ${hint})`);
      return BRIDGE_EXIT_NOT_RUNNING;
    }
    io.err(`wtm: cannot connect to the bridge socket of session ${name}: ${connected.message}`);
    return 1;
  }
  return new Promise<number>((resolve) => {
    let done = false;
    const finish = (code: number): void => {
      if (done) return;
      done = true;
      io.stdin.unpipe(sock);
      sock.unpipe(io.stdout as NodeJS.WritableStream & { write: never });
      sock.destroy();
      resolve(code);
    };
    sock.on("error", () => finish(0));
    sock.on("close", () => finish(0));
    // ssh の側が先に閉じた（標準出力への書き込みが EPIPE 等）も「どちらかが閉じた」＝ 0。リスナが無いと未処理の 'error' で落ちる。
    io.stdout.on("error", () => finish(0));
    io.stdout.on("close", () => finish(0));
    io.stdin.on("error", () => finish(0));
    io.stdin.on("end", () => sock.end());
    io.stdin.on("close", () => sock.end());
    io.stdin.pipe(sock);
    sock.pipe(io.stdout);
  });
}
