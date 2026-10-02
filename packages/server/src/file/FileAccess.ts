import { open, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { FILE_CHUNK_BYTES, FILE_MAX_BYTES, isPastablePath, RpcError, type ResolvedFile } from "@sodashitsu/protocol";

export interface FileAccessOptions {
  /** その pane の今の場所（無い pane は undefined）。相対パスを解く起点。 */
  cwdOf(paneId: string): string | undefined;
  /** `~` を解く先。既定はサーバの利用者のホーム。 */
  home?: string;
}

/**
 * 端末のファイルのリンクのための読み取り（`@sodashitsu/protocol` の `file.ts`）。ブラウザが出力の中から拾ったパスらしい文字列を確かめ（`resolve`）、
 * 別のマシンのブラウザへは中身を分けて渡す（`read`）。認証を通った接続は pane のシェルで同じファイルを読めるので、読める範囲はサーバの利用者の権限のまま。
 */
export class FileAccess {
  private readonly home: string;

  constructor(private readonly opts: FileAccessOptions) {
    this.home = opts.home ?? homedir();
  }

  /** `paths` と同じ並びで、実在する通常のファイル・ディレクトリの情報を返す（無い・それ以外・貼れない文字を含むパスは null）。 */
  async resolve(paneId: string, paths: readonly string[]): Promise<(ResolvedFile | null)[]> {
    const cwd = this.opts.cwdOf(paneId);
    if (cwd === undefined) throw new RpcError("not_found", `pane not found: ${paneId}`);
    return Promise.all(paths.map((p) => this.resolveOne(cwd, p)));
  }

  private async resolveOne(cwd: string, raw: string): Promise<ResolvedFile | null> {
    // 区切りが 2 つ続く始まり（Windows の UNC `\\\\host\\share`・`//host/share`）は解かない——確かめるだけで、出力に書かれた相手のホストへ繋ぎに行ってしまう。
    if (/^[\\/]{2}/.test(raw)) return null;
    const expanded = raw === "~" || /^~[\\/]/.test(raw) ? join(this.home, raw.slice(1)) : raw;
    const path = resolve(cwd, expanded);
    // ブラウザはこのパスを pane へ貼ることがある（ドロップ）。制御文字等を含むパスは無いものとして扱う。
    if (!isPastablePath(path)) return null;
    try {
      const st = await stat(path);
      if (st.isFile()) return { path, kind: "file", size: st.size };
      if (st.isDirectory()) return { path, kind: "dir", size: 0 };
    } catch {
      // 無い・辿れない
    }
    return null;
  }

  /** `offset` から 1 片を読む。通常のファイルだけ（FIFO・デバイスは開かない——開くと止まるものがある）。 */
  async read(path: string, offset: number): Promise<{ data: string; size: number; mtimeMs: number }> {
    if (!isAbsolute(path)) throw new RpcError("invalid_params", "path must be absolute");
    let st;
    try {
      st = await stat(path);
    } catch (err) {
      throw readError(err);
    }
    if (!st.isFile()) throw new RpcError("file_unreadable", "not a regular file");
    let handle;
    try {
      handle = await open(path, "r");
    } catch (err) {
      throw readError(err);
    }
    try {
      st = await handle.stat();
      if (!st.isFile()) throw new RpcError("file_unreadable", "not a regular file");
      if (st.size > FILE_MAX_BYTES) throw new RpcError("file_too_large", `file is larger than ${FILE_MAX_BYTES} bytes`);
      if (offset > st.size) throw new RpcError("invalid_params", "offset is past the end of the file");
      const length = Math.min(FILE_CHUNK_BYTES, st.size - offset);
      const buf = Buffer.alloc(length);
      let got = 0;
      while (got < length) {
        const { bytesRead } = await handle.read(buf, got, length - got, offset + got);
        if (bytesRead === 0) break; // 読んでいる間に縮んだ（ブラウザが size の食い違いで気づく）
        got += bytesRead;
      }
      return { data: buf.subarray(0, got).toString("base64"), size: st.size, mtimeMs: st.mtimeMs };
    } catch (err) {
      if (err instanceof RpcError) throw err;
      throw readError(err);
    } finally {
      await handle.close().catch(() => undefined);
    }
  }
}

/** 詳細（errno・パス）はブラウザへ返さない（code だけ）。 */
function readError(err: unknown): RpcError {
  const code = (err as NodeJS.ErrnoException).code;
  if (code === "ENOENT" || code === "ENOTDIR") return new RpcError("file_not_found", "no such file");
  return new RpcError("file_unreadable", "cannot read the file");
}
