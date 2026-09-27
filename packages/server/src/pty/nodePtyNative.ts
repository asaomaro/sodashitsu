import { createRequire } from "node:module";

/**
 * node-pty のネイティブのモジュール（`pty.node`）の、fd を受け取る関数（20260926-live-handoff）。execve で引き継いだ PTY の master は
 * node-pty の `IPty` を持たないので、大きさの変更（`TIOCSWINSZ`）はネイティブの `resize(fd, …)` を直接呼ぶ（research F3.3）。
 * 読み込みは node-pty 自身と同じ `lib/utils.js` の `loadNativeModule`（ビルド・prebuild の場所を探す）に任せる。Unix だけ。
 */
export interface NodePtyNative {
  resize(fd: number, cols: number, rows: number, pixelWidth: number, pixelHeight: number): void;
  /** `openpty(3)`（テストで同じプロセスの中に PTY の組を作る）。 */
  open(cols: number, rows: number): { master: number; slave: number; pty: string };
}

let cached: NodePtyNative | undefined;

export function nodePtyNative(): NodePtyNative {
  if (cached === undefined) {
    const require = createRequire(import.meta.url);
    const utils = require("node-pty/lib/utils.js") as {
      loadNativeModule(name: string): { module: unknown };
    };
    cached = utils.loadNativeModule("pty").module as NodePtyNative;
  }
  return cached;
}
