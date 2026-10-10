import { constants } from "node:fs";
import type { Stats } from "node:fs";
import { lstat, open, realpath } from "node:fs/promises";
import type { FileHandle } from "node:fs/promises";
import { sep } from "node:path";

/**
 * 利用者のファイル（会話の記録）を、サーバが読むときの、共通の安全な I/O（20261010-agent-usage の AC2。サブエージェントの記録の窓
 * `SubagentTranscript.ts` と、利用状況 `usage/` の両方が使う。もとは `SubagentTranscript.ts` の中にあった作りを、動きを変えずに切り出した）。
 *
 * 守りの作り: (1) 場所はサーバが決めて、**実体のパスが根の下**にあることを確かめる（リンクで外へ出ない）。(2) ファイル自体がリンクなら開かない。
 * (3) `O_NOFOLLOW`・`O_NONBLOCK` で開き（開く間にすり替えられた FIFO で、書き手を待って固まらない）、**開いた fd で**通常のファイル・リンクが 1 つ
 * （ハードリンクで根の外のファイルを根の中へ繋いで読ませない）を確かめ直す。(4) 読む量は呼び手が上限を掛ける。(5) ログには場所・中身を出さない（呼び手の決まり）。
 */

/** 実体のパスにした根（無い根は飛ばす）。 */
export async function realRootsOf(roots: readonly string[]): Promise<string[]> {
  const out: string[] = [];
  for (const r of roots) {
    try {
      out.push(await realpath(r));
    } catch {
      // 根が無い（そのエージェントを使っていない）ものは飛ばす。
    }
  }
  return out;
}

/** 実体のパスが、根のどれかの下か（根そのものは含まない）。呼び手は、さらに深さ・名前の形を確かめる。 */
export function underRoot(realPath: string, realRoots: readonly string[]): string | null {
  for (const root of realRoots) if (realPath.startsWith(root + sep)) return root;
  return null;
}

export function isNotFound(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: string }).code === "ENOENT";
}

/** ファイルが、リンクでない・通常のファイル・リンクが 1 つ、か（`lstat`。開く前の確かめ）。 */
export async function lstatRegular(file: string): Promise<"ok" | "missing" | "unreadable"> {
  try {
    const st = await lstat(file);
    if (st.isSymbolicLink() || !st.isFile() || st.nlink !== 1) return "unreadable";
    return "ok";
  } catch (err) {
    return isNotFound(err) ? "missing" : "unreadable";
  }
}

export interface OpenedFile {
  fd: FileHandle;
  st: Stats;
}

/**
 * 安全に開く。開いた fd で通常のファイル・リンク 1 つを確かめ直し、違えば閉じて `null`。開けなければ投げる（呼び手が理由を固定の文にする）。
 * 呼び手は、使い終わったら `fd.close()` する。
 */
export async function openVerified(file: string): Promise<OpenedFile | null> {
  const fd = await open(file, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0) | (constants.O_NONBLOCK ?? 0));
  try {
    const st = await fd.stat();
    if (!st.isFile() || st.nlink !== 1) {
      await fd.close().catch(() => undefined);
      return null;
    }
    return { fd, st };
  } catch (err) {
    await fd.close().catch(() => undefined);
    throw err;
  }
}

/** `start` から `length` バイトを読む（短くても、そこで終わりまで）。 */
export async function readRange(fd: FileHandle, start: number, length: number): Promise<Buffer> {
  const buf = Buffer.alloc(length);
  let got = 0;
  while (got < length) {
    const { bytesRead } = await fd.read(buf, got, length - got, start + got);
    if (bytesRead === 0) break;
    got += bytesRead;
  }
  return got === length ? buf : buf.subarray(0, got);
}
