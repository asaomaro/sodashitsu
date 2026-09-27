import type { TuiIo, TuiSignal } from "../types.js";

/** テスト用の外側の端末（出力を溜め、入力・大きさの変化・シグナル・例外を注入する）。 */
export interface FakeIo extends TuiIo {
  output(): string;
  errors(): string;
  rawMode: boolean;
  rawModeHistory: boolean[];
  cols: number;
  rows: number;
  type(bytes: string | Uint8Array): void;
  resizeTo(cols: number, rows: number): void;
  signal(sig: TuiSignal): void;
  fatal(err: unknown): void;
  exit(): void;
  /** 登録中の listener の数（後始末の確認）。 */
  listenerCount(): number;
}

export function fakeIo(
  opts: {
    cols?: number;
    rows?: number;
    env?: Record<string, string | undefined>;
    isTTY?: boolean;
  } = {},
): FakeIo {
  let out = "";
  let err = "";
  const input = new Set<(b: Uint8Array) => void>();
  const resize = new Set<() => void>();
  const signals = new Set<(s: TuiSignal) => void>();
  const fatals = new Set<(e: unknown) => void>();
  const exits = new Set<() => void>();
  const enc = new TextEncoder();
  const add = <T>(set: Set<T>, cb: T): (() => void) => {
    set.add(cb);
    return () => set.delete(cb);
  };
  const io: FakeIo = {
    isTTY: opts.isTTY ?? true,
    cols: opts.cols ?? 100,
    rows: opts.rows ?? 30,
    rawMode: false,
    rawModeHistory: [],
    size: () => ({ cols: io.cols, rows: io.rows }),
    setRawMode: (on) => {
      io.rawMode = on;
      io.rawModeHistory.push(on);
    },
    write: (data) => {
      out += data;
    },
    onInput: (cb) => add(input, cb),
    onResize: (cb) => add(resize, cb),
    onSignal: (cb) => add(signals, cb),
    onFatal: (cb) => add(fatals, cb),
    onExit: (cb) => add(exits, cb),
    writeError: (text) => {
      err += text;
    },
    env: opts.env ?? { COLORTERM: "truecolor" },
    platform: "linux",
    output: () => out,
    errors: () => err,
    type: (bytes) => {
      const b = typeof bytes === "string" ? enc.encode(bytes) : bytes;
      for (const cb of [...input]) cb(b);
    },
    resizeTo: (cols, rows) => {
      io.cols = cols;
      io.rows = rows;
      for (const cb of [...resize]) cb();
    },
    signal: (sig) => {
      for (const cb of [...signals]) cb(sig);
    },
    fatal: (e) => {
      for (const cb of [...fatals]) cb(e);
    },
    exit: () => {
      for (const cb of [...exits]) cb();
    },
    listenerCount: () => input.size + resize.size + signals.size + fatals.size + exits.size,
  };
  return io;
}
