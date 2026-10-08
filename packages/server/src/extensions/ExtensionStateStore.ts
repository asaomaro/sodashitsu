import { constants as fsConstants } from "node:fs";
import { open as fsOpen, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { RpcError } from "@sodashitsu/protocol";
import { z } from "zod";
import { writeFileAtomic } from "../persist/atomicFile.js";

/**
 * 拡張の「画面で切った」記録（20261007-ext-host）。`<stateDir>/extension-state.json`（session ごと）: `{ "version": 1, "disabled": ["user:hello", …] }`。
 * session のロックの中なので、書くのはこのサーバだけ。
 * **読めない・壊れている → 動く側に倒さない**: `load()` が `ok: false` を返し、呼び手は全部の拡張を無効として扱う（利用者が切った拡張が、
 * ファイルの破損で勝手に動き出さない）。
 */

export const EXTENSION_STATE_FILE_NAME = "extension-state.json";
export const EXTENSION_STATE_MAX = 256;
const MAX_BYTES = 128 * 1024;

const StateFile = z.strictObject({ version: z.literal(1), disabled: z.array(z.string().min(1).max(160)).max(EXTENSION_STATE_MAX) });

export type ExtensionStateLoad = { ok: true; disabled: Set<string> } | { ok: false; problem: string };

export interface StateFileDeps {
  open: (path: string, flags: number) => Promise<FileHandle>;
  getuid: (() => number) | undefined;
  platform: NodeJS.Platform;
}
const defaultDeps: StateFileDeps = {
  open: (path, flags) => fsOpen(path, flags),
  getuid: typeof process.getuid === "function" ? () => process.getuid!() : undefined,
  platform: process.platform,
};

type Read = { kind: "ok"; disabled: Set<string> } | { kind: "missing" } | { kind: "corrupt"; problem: string } | { kind: "unreadable"; problem: string };

export class ExtensionStateStore {
  private readonly path: string;
  private readonly deps: StateFileDeps;
  constructor(stateDir: string, deps: Partial<StateFileDeps> = {}) {
    this.path = join(stateDir, EXTENSION_STATE_FILE_NAME);
    this.deps = { ...defaultDeps, ...deps };
  }

  private async read(): Promise<Read> {
    const d = this.deps;
    const unix = d.platform !== "win32";
    let handle: FileHandle;
    try {
      handle = await d.open(this.path, fsConstants.O_RDONLY | (unix ? fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK : 0));
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { kind: "missing" };
      if (code === "ELOOP") return { kind: "corrupt", problem: "リンクです" };
      return { kind: "unreadable", problem: `開けません（${code ?? "不明なエラー"}）` };
    }
    try {
      const st = await handle.stat();
      if (!st.isFile()) return { kind: "corrupt", problem: "通常のファイルではありません" };
      if (unix) {
        const uid = d.getuid?.();
        if (uid !== undefined && st.uid !== uid) return { kind: "corrupt", problem: "持ち主が違います" };
        if ((st.mode & 0o022) !== 0) return { kind: "corrupt", problem: "ほかの利用者が書き込めます" };
      }
      if (st.size > MAX_BYTES) return { kind: "corrupt", problem: "大きすぎます" };
      const buf = Buffer.alloc(MAX_BYTES + 1);
      let total = 0;
      for (;;) {
        const { bytesRead } = await handle.read(buf, total, buf.length - total, total);
        if (bytesRead === 0) break;
        total += bytesRead;
        if (total >= buf.length) break;
      }
      if (total > MAX_BYTES) return { kind: "corrupt", problem: "大きすぎます" };
      let raw: unknown;
      try {
        raw = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(0, total)));
      } catch {
        return { kind: "corrupt", problem: "JSON として読めません" };
      }
      const r = StateFile.safeParse(raw);
      if (!r.success) return { kind: "corrupt", problem: "形が正しくありません" };
      return { kind: "ok", disabled: new Set(r.data.disabled) };
    } catch (err) {
      return { kind: "unreadable", problem: `読めません（${(err as NodeJS.ErrnoException).code ?? "不明なエラー"}）` };
    } finally {
      await handle.close().catch(() => undefined);
    }
  }

  /** 無いファイルは空。読めない・壊れているときは `ok: false`（呼び手は、全部を無効にする）。 */
  async load(): Promise<ExtensionStateLoad> {
    const r = await this.read();
    if (r.kind === "ok") return { ok: true, disabled: r.disabled };
    if (r.kind === "missing") return { ok: true, disabled: new Set() };
    return { ok: false, problem: `${EXTENSION_STATE_FILE_NAME}: ${r.problem}` };
  }

  /**
   * `key` の入切を書く。`known`（いまの「あるべき拡張」の key の集合）に無い key は捨てる。**形の検査で落ちた（壊れている）ファイルと、無いファイルだけ**を、
   * 空から作り直す。時間切れ・権限などで読めなかったときは、書かずに `internal`（読めないまま書くと、切っていたほかの拡張が動き出す）。
   * 256 件を超えるなら `invalid_params`（古い無効を、黙って捨てない）。
   */
  async setDisabled(key: string, disabled: boolean, known: Set<string>): Promise<void> {
    const r = await this.read();
    if (r.kind === "unreadable") throw new RpcError("internal", "拡張の無効の記録を読めないので、書き換えませんでした");
    const set = r.kind === "ok" ? new Set(r.disabled) : new Set<string>();
    if (disabled) set.add(key);
    else set.delete(key);
    for (const k of [...set]) if (!known.has(k)) set.delete(k);
    if (set.size > EXTENSION_STATE_MAX) throw new RpcError("invalid_params", `画面で無効にできる拡張は ${EXTENSION_STATE_MAX} 件までです`);
    await writeFileAtomic(this.path, JSON.stringify({ version: 1, disabled: [...set].sort() }) + "\n");
  }
}
