import { lstat, readdir, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import { PANE_HISTORY_MAX_PANE_BYTES, sanitizeHistoryAnsi } from "../terminal/historyAnsi.js";
import { writeFileAtomic } from "./atomicFile.js";

/**
 * 画面履歴の保存先（20260926-screen-history-replay）。herdr と同じく `session.json` の隣の別ファイル（research F1）。
 * パスは状態ディレクトリと固定の名前だけから作る（外からの入力を使わない）。
 */
export const PANE_HISTORY_FILE_NAME = "session-history.json";
/** ファイル全体の上限（decisions D5）。書くときはこれを超える pane から積まず、読むときは超えるファイルを読まない。 */
export const PANE_HISTORY_MAX_FILE_BYTES = 64 * 1024 * 1024;

export interface PaneHistoryFileData {
  schema: 1;
  /** 書いた時刻（ISO 8601）。 */
  savedAt: string;
  /** 鍵つきの object にしない（`__proto__` のような id を鍵にしない。research「実装時の注意」）。 */
  panes: { paneId: string; savedAt: string; ansi: string }[];
}

export interface PaneHistoryEntry {
  /** 安全化済み（`sanitizeHistoryAnsi`）。 */
  ansi: string;
  /** その pane を取り出した時刻（ISO 8601）。 */
  savedAt: string;
}

export type PaneHistoryLoadResult =
  | { kind: "ok"; panes: Map<string, PaneHistoryEntry> }
  | { kind: "missing" }
  | { kind: "too_large"; bytes: number }
  | { kind: "corrupt"; reason: string };

export interface PaneHistoryFile {
  readonly path: string;
  load(): Promise<PaneHistoryLoadResult>;
  save(data: PaneHistoryFileData): Promise<void>;
  /** 消したら true、無ければ false。 */
  clear(): Promise<boolean>;
}

const PaneHistoryFileDataSchema = z.object({
  schema: z.literal(1),
  savedAt: z.string(),
  panes: z.array(
    z.object({
      paneId: z.string().min(1),
      savedAt: z.string(),
      ansi: z
        .string()
        .refine(
          (s) => Buffer.byteLength(s, "utf8") <= PANE_HISTORY_MAX_PANE_BYTES,
          "ansi is too large",
        ),
    }),
  ),
});

export class FsPaneHistoryFile implements PaneHistoryFile {
  readonly path: string;
  private readonly maxFileBytes: number;

  constructor(stateDir: string, opts: { maxFileBytes?: number } = {}) {
    this.path = join(stateDir, PANE_HISTORY_FILE_NAME);
    this.maxFileBytes = opts.maxFileBytes ?? PANE_HISTORY_MAX_FILE_BYTES;
  }

  /**
   * 読む。大きすぎれば読まずに `too_large`、形が合わなければ `corrupt`（**退避コピーは作らない**——画面の内容を別の場所に残さない。
   * herdr と同じ。research F1）。返す `ansi` は安全化済み（AC8）。`ENOENT` 以外の読み取りの失敗は投げる。
   */
  async load(): Promise<PaneHistoryLoadResult> {
    let size: number;
    try {
      size = (await stat(this.path)).size;
    } catch (err) {
      if (isEnoent(err)) return { kind: "missing" };
      throw err;
    }
    if (size > this.maxFileBytes) return { kind: "too_large", bytes: size };
    let raw: string;
    try {
      raw = await readFile(this.path, "utf8");
    } catch (err) {
      if (isEnoent(err)) return { kind: "missing" };
      throw err;
    }
    // 理由（呼ぶ側がログに残す）に画面の内容を入れない：JSON の構文エラーの文言には中身の一部が入る（V8）ので固定の文言にし、
    // 形の誤りは項目の位置と種類だけにする（T3 の独立点検）。
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return { kind: "corrupt", reason: "invalid JSON" };
    }
    const parsed = PaneHistoryFileDataSchema.safeParse(json);
    if (!parsed.success) {
      return {
        kind: "corrupt",
        reason: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.code}`)
          .join("; ")
          .slice(0, 200),
      };
    }
    const panes = new Map<string, PaneHistoryEntry>();
    for (const p of parsed.data.panes)
      panes.set(p.paneId, { ansi: sanitizeHistoryAnsi(p.ansi), savedAt: p.savedAt });
    return { kind: "ok", panes };
  }

  async save(data: PaneHistoryFileData): Promise<void> {
    await writeFileAtomic(this.path, JSON.stringify(data)); // 0600（POSIX）
  }

  /**
   * 消す。本体を先に消し（失敗は投げる）、その後で、書いている途中で落ちて残った一時ディレクトリ（`writeFileAtomic` の `.tmp-*`。画面の
   * 内容を持ちうる）を片付ける（cross の独立点検。片付けの失敗は握りつぶす——本体を消せたかどうかを左右させない。review ラウンド 1）。
   * 片付けるのは `writeFileAtomic` が作る形（`.tmp-`＋6 文字の名前で、中身が `write` だけか空のディレクトリ）だけ——`--state-dir` は
   * 任意の場所を指せるので、soda と関係のないものを消さない（review ラウンド 1）。状態ディレクトリの `.tmp-*` は `session.json`・`auth.json` 等の
   * 書き込みも使うので、作られてから 10 分より新しいもの（書いている最中でありうる）は残す。呼ぶのは起動時だけ。
   */
  async clear(): Promise<boolean> {
    let removed = true;
    try {
      await stat(this.path);
    } catch (err) {
      if (!isEnoent(err)) throw err;
      removed = false;
    }
    if (removed) await rm(this.path, { force: true });
    await this.removeStaleTempDirs().catch(() => undefined);
    return removed;
  }

  private async removeStaleTempDirs(): Promise<void> {
    const dir = dirname(this.path);
    for (const name of await readdir(dir)) {
      if (!STALE_TEMP_DIR.test(name)) continue;
      const tmp = join(dir, name);
      try {
        const st = await lstat(tmp);
        if (!st.isDirectory()) continue;
        // 書いている最中のもの（起動の途中でも `/api/login` が auth.json を書きうる）を消さない：十分古いものだけ（T3 の独立点検 ラウンド 2）。
        if (Date.now() - st.mtimeMs < STALE_TEMP_MIN_AGE_MS) continue;
        const inside = await readdir(tmp);
        if (inside.some((n) => n !== "write")) continue;
        await rm(tmp, { recursive: true, force: true });
      } catch {
        // 1 つ片付けられなくても他は続ける。
      }
    }
  }
}

/** `writeFileAtomic` の `mkdtemp(join(dir, ".tmp-"))` が作る名前（接頭辞＋6 文字）。 */
const STALE_TEMP_DIR = /^\.tmp-[A-Za-z0-9]{6}$/;
/** 片付ける一時ディレクトリの古さの下限（書き込みの最中のものを消さない）。 */
const STALE_TEMP_MIN_AGE_MS = 10 * 60 * 1000;

function isEnoent(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: unknown }).code === "ENOENT"
  );
}
