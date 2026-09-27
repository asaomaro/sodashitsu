import type { TuiIo, TuiSignal } from "../types.js";

const FALLBACK_SIZE = { cols: 80, rows: 24 };
const SIGNALS: readonly TuiSignal[] = ["SIGINT", "SIGTERM", "SIGHUP"];

export interface ProcessStreams {
  stdin: NodeJS.ReadStream;
  stdout: NodeJS.WriteStream;
  stderr: NodeJS.WriteStream;
}

/**
 * 本物の端末とプロセス（`packages/cli/src/commands/attach.ts` の `processTerminal()` を写した）。`streams` はテスト用の差し替え。
 */
export function processIo(
  streams: ProcessStreams = {
    stdin: process.stdin,
    stdout: process.stdout,
    stderr: process.stderr,
  },
): TuiIo {
  const { stdin, stdout, stderr } = streams;
  // 端末が先に閉じた（SIGHUP 等）後の書き込み・読み取りの失敗（EIO）で落ちないようにする。**raw を外した後も外さない**——
  // モードを戻す書き込みの失敗は、raw を外した後（非同期）に error として届く。受け手が無いと未処理の例外で落ちる（attach.ts と同じ穴）。
  const ignoreError = (): void => undefined;
  let guarded = false;
  return {
    isTTY: Boolean(stdin.isTTY && stdout.isTTY),
    size: () =>
      stdout.columns > 0 && stdout.rows > 0
        ? { cols: stdout.columns, rows: stdout.rows }
        : FALLBACK_SIZE,
    setRawMode: (on) => {
      if (on && !guarded) {
        guarded = true;
        stdout.on("error", ignoreError);
        stdin.on("error", ignoreError);
      }
      if (stdin.isTTY) stdin.setRawMode(on);
      if (on) stdin.resume();
      else stdin.pause();
    },
    write: (data) => {
      stdout.write(data);
    },
    onInput: (cb) => {
      const handler = (chunk: Buffer): void =>
        cb(new Uint8Array(chunk.buffer, chunk.byteOffset, chunk.byteLength));
      stdin.on("data", handler);
      return () => stdin.off("data", handler);
    },
    onResize: (cb) => {
      stdout.on("resize", cb);
      return () => stdout.off("resize", cb);
    },
    onSignal: (cb) => {
      const handlers = SIGNALS.map((sig) => {
        const h = (): void => cb(sig);
        process.on(sig, h);
        return [sig, h] as const;
      });
      return () => {
        for (const [sig, h] of handlers) process.off(sig, h);
      };
    },
    onFatal: (cb) => {
      const onException = (err: unknown): void => cb(err);
      process.on("uncaughtException", onException);
      process.on("unhandledRejection", onException);
      return () => {
        process.off("uncaughtException", onException);
        process.off("unhandledRejection", onException);
      };
    },
    onExit: (cb) => {
      process.on("exit", cb);
      return () => process.off("exit", cb);
    },
    writeError: (text) => {
      stderr.write(text);
    },
    env: process.env,
    platform: process.platform,
  };
}
