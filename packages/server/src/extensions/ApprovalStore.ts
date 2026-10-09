import { randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { open as fsOpen, readFile, stat as fsStat, unlink, type FileHandle } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import {
  EXTENSION_APPROVALS_MAX,
  EXTENSION_FILE_TIMEOUT_MS,
  EXTENSION_ALLOW_VALUES,
  EXTENSION_ID_RE,
  EXTENSION_LOCK,
  EXTENSION_PATH_MAX,
  EXTENSION_UNRESPONSIVE_VALUES,
  RpcError,
  hasForbiddenChars,
  type ExtensionApprovalRecordView,
} from "@sodashitsu/protocol";
import { z } from "zod";
import { writeFileAtomic } from "../persist/atomicFile.js";
import type { ExtensionEntry } from "./extensionConfig.js";

/**
 * 承認の記録（20261007-ext-host PR3。design「鍵と、承認の記録」）。ファイルは `<sessionRoot>/extension-approvals.json`（session で共有。K3）。
 * (根, id) ごとに 1 件で、**最後に承認した中身**（`approved`。鍵と、そのときの 1 件）と、**最後に「承認しない」とした鍵**（`denied`）を別々に持つ。
 *
 * **読めない・壊れている・規則の外 → 記録なし**（全部が承認待ちに戻る。動く側には倒れない）。読むのは `load()`（メモリに長く持たない）。
 * **書く手順**は、ほかの session のサーバと同時に書きうるので、鍵のファイル（`….lock`）を取り、読み直して、その 1 件だけを変えて書く。
 * 全体を `timeoutMs`（2 秒）で打ち切り、打ち切った後の続きは何も書かない（各段の前に、打ち切り済みでないことと、鍵が自分の印のままであることを確かめる）。
 * **同じ OS の利用者のプロセスは、このファイルを直接書ける。これは境界ではない**（そのプロセスは、既に利用者の権限で何でも実行できる）。
 */

export const APPROVALS_FILE_NAME = "extension-approvals.json";
const MAX_BYTES = 512 * 1024;
const HEX64 = /^[0-9a-f]{64}$/;

export interface ApprovalEntry {
  id: string;
  command: string;
  description: string | null;
  enabled: boolean;
  allow: string[];
  onUnresponsive: "pass" | "block";
  cwd: null;
}

export interface ApprovalRecord {
  root: string;
  id: string;
  approved?: { digest: string; at: string; entry: ApprovalEntry };
  denied?: { digest: string; at: string };
}

export type ApprovalLookup =
  | { status: "approved" }
  | { status: "denied" }
  | { status: "none"; previous?: ApprovalEntry; deniedBefore: boolean };

const At = z.string().min(1).max(40);
const Digest = z.string().regex(HEX64);
const EntrySchema = z.strictObject({
  id: z.string().regex(EXTENSION_ID_RE),
  command: z.string().min(1).max(1024),
  description: z.string().max(200).nullable(),
  enabled: z.boolean(),
  allow: z.array(z.enum(EXTENSION_ALLOW_VALUES)).max(EXTENSION_ALLOW_VALUES.length),
  onUnresponsive: z.enum(EXTENSION_UNRESPONSIVE_VALUES),
  cwd: z.null(),
});
const RecordSchema = z
  .strictObject({
    root: z
      .string()
      .min(1)
      .max(EXTENSION_PATH_MAX)
      .refine((v) => isAbsolute(v) && !hasForbiddenChars(v)),
    id: z.string().regex(EXTENSION_ID_RE),
    approved: z.strictObject({ digest: Digest, at: At, entry: EntrySchema }).optional(),
    denied: z.strictObject({ digest: Digest, at: At }).optional(),
  })
  .refine((r) => r.approved !== undefined || r.denied !== undefined);
const FileSchema = z.strictObject({ version: z.literal(1), records: z.array(RecordSchema).max(EXTENSION_APPROVALS_MAX) });

/** 読んだ記録（読み込み 1 回ぶん）。 */
export class ApprovalSet {
  constructor(
    readonly records: readonly ApprovalRecord[],
    /** 読めない・壊れている・規則の外・新しい版、のとき、その理由（一覧の `problems` に 1 行出す）。記録は空として扱う。 */
    readonly problem: string | null,
  ) {}

  find(root: string, id: string): ApprovalRecord | undefined {
    return this.records.find((r) => r.root === root && r.id === id);
  }

  /** `approved` の鍵と同じ → approved。`denied` の鍵と同じ → denied。どちらでもない → none（前に承認した中身と、前に「承認しない」とした有無つき）。 */
  lookup(root: string, id: string, digest: string): ApprovalLookup {
    const r = this.find(root, id);
    if (r?.approved?.digest === digest) return { status: "approved" };
    if (r?.denied?.digest === digest) return { status: "denied" };
    return { status: "none", ...(r?.approved ? { previous: r.approved.entry } : {}), deniedBefore: r?.denied !== undefined };
  }

  /** 記録の全部の見出し（コマンドは含めない）。`active` は呼び手が付ける。 */
  list(): Omit<ExtensionApprovalRecordView, "active">[] {
    return this.records.map((r) => ({
      root: r.root,
      id: r.id,
      ...(r.approved ? { approvedAt: r.approved.at } : {}),
      ...(r.denied ? { deniedAt: r.denied.at } : {}),
    }));
  }
}

export interface ApprovalFileDeps {
  open: (path: string, flags: number) => Promise<FileHandle>;
  getuid: (() => number) | undefined;
  platform: NodeJS.Platform;
  now: () => Date;
  /** 書く手順の全体の上限（鍵を取る待ちを含む）。 */
  timeoutMs: number;
  lockRetryMs: number;
  lockStaleMs: number;
}

const defaultDeps: ApprovalFileDeps = {
  open: (path, flags) => fsOpen(path, flags),
  getuid: typeof process.getuid === "function" ? () => process.getuid!() : undefined,
  platform: process.platform,
  now: () => new Date(),
  timeoutMs: EXTENSION_FILE_TIMEOUT_MS,
  lockRetryMs: EXTENSION_LOCK.retryMs,
  lockStaleMs: EXTENSION_LOCK.staleMs,
};

type Read =
  | { kind: "ok"; records: ApprovalRecord[] }
  | { kind: "missing" }
  | { kind: "corrupt"; problem: string }
  | { kind: "future"; problem: string }
  | { kind: "unreadable"; problem: string };

interface WriteCtx {
  aborted: boolean;
  mark: string;
  locked: boolean;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export class ApprovalStore {
  private readonly path: string;
  private readonly lockPath: string;
  private readonly deps: ApprovalFileDeps;
  /** 前の書く手順が、裏でまだ返っていない。 */
  private writing: Promise<void> | null = null;

  constructor(sessionRoot: string, deps: Partial<ApprovalFileDeps> = {}) {
    this.path = join(sessionRoot, APPROVALS_FILE_NAME);
    this.lockPath = `${this.path}.lock`;
    this.deps = { ...defaultDeps, ...deps };
  }

  get filePath(): string {
    return this.path;
  }

  // --- 読む ---------------------------------------------------------------------------------------------------------

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
      // 新しい版が書いたもの: 読まず（記録なし）、書くことも断る（新しい版の記録を壊さない）。
      if (typeof raw === "object" && raw !== null && typeof (raw as { version?: unknown }).version === "number" && (raw as { version: number }).version > 1) {
        return { kind: "future", problem: "新しい版が書いた記録なので読みません" };
      }
      const r = FileSchema.safeParse(raw);
      if (!r.success) return { kind: "corrupt", problem: "形が正しくありません" };
      const seen = new Set<string>();
      for (const rec of r.data.records) {
        const k = `${rec.root}\0${rec.id}`;
        if (seen.has(k)) return { kind: "corrupt", problem: "同じ登録の記録が重複しています" };
        seen.add(k);
      }
      return { kind: "ok", records: r.data.records as ApprovalRecord[] };
    } catch (err) {
      return { kind: "unreadable", problem: `読めません（${(err as NodeJS.ErrnoException).code ?? "不明なエラー"}）` };
    } finally {
      await handle.close().catch(() => undefined);
    }
  }

  /** 読めない・壊れている・規則の外 → 記録なし（全部が承認待ちに戻る）。理由は `problem`。 */
  async load(): Promise<ApprovalSet> {
    const r = await this.read();
    if (r.kind === "ok") return new ApprovalSet(r.records, null);
    if (r.kind === "missing") return new ApprovalSet([], null);
    return new ApprovalSet([], `${APPROVALS_FILE_NAME}: ${r.problem}。承認の記録がないものとして扱います（すべて承認待ちです）`);
  }

  /** 見張り用の署名（`mtimeMs:size:ino:ctimeMs:mode:uid`）。無ければ `"missing"`、読めなければ `"error"`。 */
  async signature(): Promise<string> {
    try {
      const st = await fsStat(this.path);
      // 中身（mtime・size）と置き換え（ino）に加えて、権限・持ち主だけの変更（`chmod`・`chown`。ctime・mode・uid）も拾う（読み込みは、他人が書ける・持ち主が違うを記録なしとして扱う）。
      return `${st.mtimeMs}:${st.size}:${st.ino}:${st.ctimeMs}:${st.mode}:${st.uid}`;
    } catch (err) {
      return (err as NodeJS.ErrnoException).code === "ENOENT" ? "missing" : "error";
    }
  }

  // --- 書く ---------------------------------------------------------------------------------------------------------

  /** `approved` を置き換え、`denied` を消す（承認）。 */
  decideApproved(root: string, id: string, digest: string, entry: ExtensionEntry): Promise<void> {
    const at = this.deps.now().toISOString();
    const approvedEntry: ApprovalEntry = {
      id: entry.id,
      command: entry.command,
      description: entry.description,
      enabled: entry.enabled,
      allow: [...entry.allow],
      onUnresponsive: entry.onUnresponsive,
      cwd: null,
    };
    return this.mutate((records) => {
      const rest = records.filter((r) => !(r.root === root && r.id === id));
      return [...rest, { root, id, approved: { digest, at, entry: approvedEntry } }];
    });
  }

  /** `denied` を置き換える。`approved` は残す。 */
  decideDenied(root: string, id: string, digest: string): Promise<void> {
    const at = this.deps.now().toISOString();
    return this.mutate((records) => {
      const cur = records.find((r) => r.root === root && r.id === id);
      const rest = records.filter((r) => r !== cur);
      return [...rest, { root, id, ...(cur?.approved ? { approved: cur.approved } : {}), denied: { digest, at } }];
    });
  }

  /** その (根, id) の 1 件を全部消す。記録が無ければ、何も書かずに成功。 */
  revoke(root: string, id: string): Promise<void> {
    return this.mutate((records) => records.filter((r) => !(r.root === root && r.id === id)), true);
  }

  /** 承認（`approved`）だけを消す。「承認しない」（`denied`）は残す（`denied` も無ければ、その 1 件ごと消える）。記録が無い・`approved` が無ければ、何も書かずに成功。 */
  revokeApprovedOnly(root: string, id: string): Promise<void> {
    return this.mutate(
      (records) =>
        records.flatMap((r) => {
          if (!(r.root === root && r.id === id) || r.approved === undefined) return [r];
          return r.denied === undefined ? [] : [{ root: r.root, id: r.id, denied: r.denied }];
        }),
      true,
    );
  }

  private async mutate(fn: (records: ApprovalRecord[]) => ApprovalRecord[], skipIfUnchanged = false): Promise<void> {
    if (this.writing !== null) throw new RpcError("internal", "承認の記録を書いている途中です。しばらくしてからもう一度試してください");
    const ctx: WriteCtx = { aborted: false, mark: `${process.pid}:${randomBytes(8).toString("hex")}`, locked: false };
    const work = this.write(ctx, fn, skipIfUnchanged);
    // 裏の続きが返るまで、次の書く手順は始めない（打ち切っても、鍵は裏の続きが返るまで消さない）。
    const mine: Promise<void> = work.then(
      () => undefined,
      () => undefined,
    );
    this.writing = mine;
    void mine.then(() => {
      if (this.writing === mine) this.writing = null;
    });
    let timer: NodeJS.Timeout | undefined;
    const timeout = new Promise<"timeout">((r) => {
      timer = setTimeout(() => r("timeout"), this.deps.timeoutMs);
    });
    try {
      const r = await Promise.race([work, timeout]);
      if (r === "timeout") {
        ctx.aborted = true;
        void work.catch(() => undefined);
        throw new RpcError("internal", "承認の記録を書けませんでした（時間内に終わりませんでした）");
      }
      // 終わった。続けて次の書く手順を始められるよう、すぐ空ける（上の `then` を待たない）。
      if (this.writing === mine) this.writing = null;
    } catch (err) {
      // 手順そのものが誤りで終わったとき（打ち切りではない）も、すぐ空ける。
      if (!ctx.aborted && this.writing === mine) this.writing = null;
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  private checkLive(ctx: WriteCtx): void {
    if (ctx.aborted) throw new RpcError("internal", "承認の記録を書けませんでした（打ち切りました）");
  }

  /** 鍵のファイルの中身が、自分の印のままか。 */
  private async lockIsMine(ctx: WriteCtx): Promise<boolean> {
    try {
      return (await readFile(this.lockPath, "utf8")) === ctx.mark;
    } catch {
      return false;
    }
  }

  private async write(ctx: WriteCtx, fn: (r: ApprovalRecord[]) => ApprovalRecord[], skipIfUnchanged: boolean): Promise<void> {
    try {
      await this.acquire(ctx);
      this.checkLive(ctx);
      if (!(await this.lockIsMine(ctx))) throw new RpcError("internal", "承認の記録の鍵を失いました");
      const cur = await this.read();
      this.checkLive(ctx);
      if (cur.kind === "unreadable") throw new RpcError("internal", "承認の記録を読めないので、書き換えませんでした");
      if (cur.kind === "future") throw new RpcError("internal", "新しい版が書いた承認の記録なので、書き換えませんでした");
      const before = cur.kind === "ok" ? cur.records : [];
      const after = fn([...before]);
      if (skipIfUnchanged && cur.kind !== "corrupt" && JSON.stringify(after) === JSON.stringify(before)) return;
      const trimmed = trim(after);
      if (!(await this.lockIsMine(ctx))) throw new RpcError("internal", "承認の記録の鍵を失いました");
      this.checkLive(ctx);
      await writeFileAtomic(this.path, `${JSON.stringify({ version: 1, records: trimmed }, null, 2)}\n`);
    } finally {
      // 自分の印のときだけ消す。打ち切った後でも、裏の続きがここへ戻ってから消す。
      if (ctx.locked && (await this.lockIsMine(ctx))) await unlink(this.lockPath).catch(() => undefined);
    }
  }

  /** 鍵のファイルを `wx` で作り、自分の印を書く。あれば `lockRetryMs` おきに待つ。置き去りの鍵は、中身と時刻を確かめ直してから消す。 */
  private async acquire(ctx: WriteCtx): Promise<void> {
    for (;;) {
      this.checkLive(ctx);
      try {
        const h = await fsOpen(this.lockPath, "wx", 0o600);
        try {
          await h.writeFile(ctx.mark, "utf8");
        } finally {
          await h.close().catch(() => undefined);
        }
        ctx.locked = true;
        return;
      } catch (err) {
        if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw new RpcError("internal", `承認の記録の鍵を作れません（${(err as NodeJS.ErrnoException).code ?? "不明なエラー"}）`);
      }
      await this.maybeClearStale(ctx);
      this.checkLive(ctx);
      await sleep(this.deps.lockRetryMs);
    }
  }

  private async maybeClearStale(ctx: WriteCtx): Promise<void> {
    try {
      const st1 = await fsStat(this.lockPath);
      if (this.deps.now().getTime() - st1.mtimeMs < this.deps.lockStaleMs) return;
      const text1 = await readFile(this.lockPath, "utf8");
      this.checkLive(ctx);
      // もう一度、中身と更新の時刻を読み、最初に見たものと同じときだけ消す（別のサーバが作り直した新しい鍵を消さない）。
      const st2 = await fsStat(this.lockPath);
      const text2 = await readFile(this.lockPath, "utf8");
      if (st2.mtimeMs === st1.mtimeMs && st2.ino === st1.ino && text1 === text2) await unlink(this.lockPath);
    } catch (err) {
      if (err instanceof RpcError) throw err;
      // 読めない・もう無い: 次の周で作り直す
    }
  }
}

/** 256 件を超えたら、`at` の新しいほう（`approved.at`・`denied.at` の大きいほう）が古いものから捨てる。 */
function trim(records: ApprovalRecord[]): ApprovalRecord[] {
  if (records.length <= EXTENSION_APPROVALS_MAX) return records;
  const stamp = (r: ApprovalRecord): string => [r.approved?.at ?? "", r.denied?.at ?? ""].sort().at(-1) ?? "";
  return [...records].sort((a, b) => stamp(b).localeCompare(stamp(a))).slice(0, EXTENSION_APPROVALS_MAX);
}

