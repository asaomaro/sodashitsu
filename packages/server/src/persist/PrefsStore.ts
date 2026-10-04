import { join } from "node:path";
import { DEVICE_LOCAL_PREF_KEYS, PREFS_MAX_BYTES, type SharedPrefs } from "@sodashitsu/protocol";
import { readFileWithBackup, writeFileAtomic } from "./atomicFile.js";

/**
 * 共有の設定（20260927-cli-mode の design「server」・decisions D3）。ブラウザと端末版が同じ設定を使うよう、状態ディレクトリの `prefs.json`（0600・原子的な書き込み）に置く。
 * 中身の形は問わない（クライアントが読むときに正規化する）——版の違うクライアントが混ざっても知らない項目を捨てない。
 * `rev` は保存のたびに +1（0 = 一度も保存していない。web はそれを見て localStorage の値を初回だけ移す）。
 */
export const PREFS_FILE_NAME = "prefs.json";

export interface PrefsState {
  prefs: SharedPrefs;
  rev: number;
}

interface PrefsFileData {
  schema: 1;
  rev: number;
  prefs: SharedPrefs;
  savedAt: string;
}

/** 保存した後の全体が上限（`PREFS_MAX_BYTES`）を超える。方式の側で `invalid_params` にする。 */
export class PrefsTooLargeError extends Error {
  constructor(readonly bytes: number) {
    super(`prefs too large: ${bytes} bytes (max ${PREFS_MAX_BYTES})`);
    this.name = "PrefsTooLargeError";
  }
}

function parsePrefsFile(raw: string): PrefsState {
  const v: unknown = JSON.parse(raw);
  if (typeof v !== "object" || v === null || Array.isArray(v)) throw new Error("not an object");
  const r = v as Record<string, unknown>;
  if (r["schema"] !== 1) throw new Error("unknown schema");
  const rev = r["rev"];
  if (typeof rev !== "number" || !Number.isSafeInteger(rev) || rev < 0) throw new Error("bad rev");
  const prefs = r["prefs"];
  if (typeof prefs !== "object" || prefs === null || Array.isArray(prefs))
    throw new Error("bad prefs");
  return { rev, prefs: withoutProto(prefs as Record<string, unknown>) };
}

const DEVICE_LOCAL = new Set<string>(DEVICE_LOCAL_PREF_KEYS);

/**
 * 保存してよい項目だけにする。`JSON.parse` は `__proto__` を自前の項目として作るので、コピーするときにプロトタイプを差し替えないよう落とす。
 * 端末ごとの項目（`sidebarWidth`・`sidebarCollapsed`・`sidebarSectionRatio`・`sidebarSectionsCollapsed`）もここで落とす——`passthrough` の schema は通してしまうので、共有しない約束をサーバの境界で守る
 * （読み込みの時も通す。古い版・手で書いたファイルに残っていても配らない）。
 */
function withoutProto(src: Record<string, unknown>): SharedPrefs {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src))
    if (k !== "__proto__" && !DEVICE_LOCAL.has(k)) out[k] = v;
  return out;
}

function byteLength(v: unknown): number {
  return Buffer.byteLength(JSON.stringify(v), "utf8");
}

export class PrefsStore {
  private readonly filePath: string;
  private readonly backupsDir: string;
  private state: PrefsState = { prefs: {}, rev: 0 };
  /** 書き込みを 1 本に並べる（同時の `set` で古い全体が新しい全体を上書きしない）。 */
  private queue: Promise<unknown> = Promise.resolve();
  private readonly listeners = new Set<(state: PrefsState, byClientId: string) => void>();

  constructor(
    stateDir: string,
    /** 変更の知らせ（`onChange`）が投げたとき（ログに残す。既定は何もしない）。 */
    private readonly onListenerError?: (err: unknown) => void,
  ) {
    this.filePath = join(stateDir, PREFS_FILE_NAME);
    this.backupsDir = join(stateDir, "prefs-backups");
  }

  /**
   * 読み込む（状態ディレクトリのロックを取った後に 1 回）。無ければ空（rev 0）。壊れていれば退避して空から始める（web の初回の移行がもう一度走り、
   * その端末の localStorage の値が戻る）。読めない（権限等）は投げる。
   */
  async load(): Promise<"ok" | "missing" | { corrupt: string }> {
    const result = await readFileWithBackup(this.filePath, this.backupsDir, parsePrefsFile);
    if (result.kind === "ok") {
      this.state = result.data;
      return "ok";
    }
    this.state = { prefs: {}, rev: 0 };
    return result.kind === "missing" ? "missing" : { corrupt: result.backupPath };
  }

  get(): PrefsState {
    return { prefs: { ...this.state.prefs }, rev: this.state.rev };
  }

  /**
   * 項目ごとに上書きして保存する（浅いマージ。design「`prefs.set`」）。`baseRev` は今は拒む理由にしない（最後の書き込みが勝つ。衝突は同じ項目だけ）。
   * 全体が上限を超えるなら `PrefsTooLargeError`（保存しない）。保存できてから `onChange` を呼ぶ。
   */
  set(patch: SharedPrefs, byClientId: string): Promise<PrefsState> {
    const run = async (): Promise<PrefsState> => {
      const merged: SharedPrefs = { ...this.state.prefs, ...withoutProto(patch) };
      const bytes = byteLength(merged);
      if (bytes > PREFS_MAX_BYTES) throw new PrefsTooLargeError(bytes);
      const next: PrefsState = { prefs: merged, rev: this.state.rev + 1 };
      const data: PrefsFileData = {
        schema: 1,
        rev: next.rev,
        prefs: next.prefs,
        savedAt: new Date().toISOString(),
      };
      await writeFileAtomic(this.filePath, `${JSON.stringify(data, null, 2)}\n`);
      this.state = next;
      // 保存は済んでいる。知らせる先が投げても set を失敗にしない（保存したのに失敗と答え、同じ変更を送り直させない）。
      for (const fn of [...this.listeners]) {
        try {
          fn(this.get(), byClientId);
        } catch (err) {
          this.onListenerError?.(err);
        }
      }
      return this.get();
    };
    const result = this.queue.then(run, run);
    this.queue = result.catch(() => undefined);
    return result;
  }

  /** 保存できた変更を知らせる（`composeServer` が `prefs.changed` として全クライアントへ配る）。 */
  onChange(fn: (state: PrefsState, byClientId: string) => void): { dispose(): void } {
    this.listeners.add(fn);
    return { dispose: () => this.listeners.delete(fn) };
  }
}
