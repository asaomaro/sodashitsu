import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, sep } from "node:path";
import {
  RpcError,
  type AgentSubagentTranscriptResult,
  type SubagentTranscriptEntry,
} from "@sodashitsu/protocol";
import type { Logger } from "../log/Logger.js";
import { isNotFound, lstatRegular, openVerified, readRange, realRootsOf } from "./safeFile.js";

/**
 * サブエージェントの記録を読む（20261008-graph-first の PR6c・AC-U4/U5。調査 `subagent-research.md` の 2.2・2.3）。
 *
 * **安全の作り**（利用者のファイル——ファイルの中身・コマンドの出力・指示文が入る——を、サーバが読んでブラウザへ配るので）:
 * - (a) 受け取るのは pane の id・サブエージェントの id・続きの位置だけ。ファイルの場所は受け取らない。
 * - (b) 場所はサーバが、フックの報告（親の記録の場所・セッションの id）と受けた id から、決まった形 `<親の記録のフォルダ>/<セッションの id>/subagents/agent-<id>.jsonl` に組み立てる。
 *   親の記録のファイル名は `<セッションの id>.jsonl` でなければならない。id は `^[A-Za-z0-9_-]{1,128}$` だけ。
 * - (c) 読んでよいのは、その pane のエージェントが報告しているサブエージェントだけ（窓を開いたときに報告していたものは、終わった後も、同じエージェントの間は読める）。
 * - (d) 組み立てた場所は、フォルダを実体のパスにして、Claude Code の記録の置き場所（`~/.claude/projects/`・`CLAUDE_CONFIG_DIR` の `projects/`）の下にあることを確かめる
 *   （リンクで外へ出ない）。ファイル自体がリンクなら開かない。報告は pane の中のプログラムも送れる（名乗りは検証されない）ので、報告された場所は信用しない。
 * - (e) 配るのは、整形して上限を掛けた抜粋（1 件 4,000 文字・1 回 200 件・1 回の読みは 1 MiB まで・待ちは 2 秒）。**ログに中身・場所を出さない**。
 * - (f) `pane.sock`（ログイン不要の受け口）には載せない（`/ws` の方式だけ）。
 */

export const TRANSCRIPT_TEXT_MAX = 4_000;
export const TRANSCRIPT_ENTRIES_MAX = 200;
export const TRANSCRIPT_READ_MAX_BYTES = 1024 * 1024;
export const TRANSCRIPT_TIMEOUT_MS = 2_000;
/** この大きさを超える 1 行（先頭の添付の行など）は、読まずに飛ばす。 */
const LINE_MAX_BYTES = 256 * 1024;
/** 先に大きいファイルの先頭から、指示の 1 行を探すときに読む量。 */
const HEAD_BYTES = 256 * 1024;
const TOOL_TEXT_MAX = 200;
const AT_MAX = 40;

export const SAFE_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** 読んでよい根（Claude Code の記録の置き場所）。 */
export function defaultTranscriptRoots(env: NodeJS.ProcessEnv = process.env, home: string = homedir()): string[] {
  const roots = [join(home, ".claude", "projects")];
  const cfg = env["CLAUDE_CONFIG_DIR"];
  if (typeof cfg === "string" && cfg !== "" && isAbsolute(cfg)) roots.push(join(cfg, "projects"));
  return roots;
}

export type ResolvedFile =
  | { ok: true; file: string }
  | { ok: false; reason: "invalid" | "outside" | "missing" | "unreadable" };

/**
 * 親の記録の場所・セッションの id・サブエージェントの id から、読むファイルの実体のパスを決める。組み立てて、実体のフォルダが根の下にあることを確かめる。
 * ファイルが無ければ `missing`（始まったばかりで、まだ書かれていない）。形が合わない・根の外は拒む。
 */
export async function resolveTranscriptFile(
  parentTranscriptPath: string,
  sessionId: string,
  agentId: string,
  roots: readonly string[],
): Promise<ResolvedFile> {
  if (!SAFE_ID.test(agentId) || !SAFE_ID.test(sessionId)) return { ok: false, reason: "invalid" };
  if (
    typeof parentTranscriptPath !== "string" ||
    !isAbsolute(parentTranscriptPath) ||
    parentTranscriptPath.includes("\0") ||
    basename(parentTranscriptPath) !== `${sessionId}.jsonl`
  )
    return { ok: false, reason: "invalid" };
  const dir = join(dirname(parentTranscriptPath), sessionId, "subagents");
  let realDir: string;
  try {
    realDir = await realpath(dir);
  } catch (err) {
    // 存在しない場所は、字面が根の下のときだけ「まだ無い」。根の外の場所は、有っても無くても同じ答え（outside）にする（存在の確認に使わせない）。
    const lexical = roots.some((r) => dir.startsWith(r + sep));
    return { ok: false, reason: isNotFound(err) && lexical ? "missing" : isNotFound(err) ? "outside" : "unreadable" };
  }
  const realRoots = await realRootsOf(roots);
  const inside = realRoots.some((root) => {
    if (!realDir.startsWith(root + sep)) return false;
    // 根の直下の `<プロジェクト>/<セッション>/subagents` の形（3 段以上）。実体になった後も `subagents` で終わる。
    return realDir.slice(root.length + 1).split(sep).length >= 3 && basename(realDir) === "subagents";
  });
  if (!inside) return { ok: false, reason: "outside" };
  const file = join(realDir, `agent-${agentId}.jsonl`);
  const kind = await lstatRegular(file);
  if (kind !== "ok") return { ok: false, reason: kind };
  return { ok: true, file };
}

// --- 整形 --------------------------------------------------------------------------------------------------------

function cutText(s: string, max: number): { text: string; truncated: boolean } {
  if (s.length <= max) return { text: s, truncated: false };
  let t = s.slice(0, max);
  const last = t.charCodeAt(t.length - 1);
  if (last >= 0xd800 && last <= 0xdbff) t = t.slice(0, -1); // サロゲートペアの前半だけを残さない
  return { text: t, truncated: true };
}

function atOf(o: Record<string, unknown>): { at?: string } {
  const v = o["timestamp"];
  return typeof v === "string" && v.length <= AT_MAX ? { at: v } : {};
}

function textOfContent(c: unknown): string {
  if (typeof c === "string") return c;
  if (!Array.isArray(c)) return "";
  const out: string[] = [];
  for (const p of c) {
    if (typeof p === "object" && p !== null && (p as { type?: unknown }).type === "text") {
      const t = (p as { text?: unknown }).text;
      if (typeof t === "string") out.push(t);
    }
  }
  return out.join("\n");
}

/** 道具の呼び出しの 1 行。決まった項目の先頭だけを取り、入力の全体は出さない。 */
function toolSummary(input: unknown): string {
  if (typeof input !== "object" || input === null) return "";
  const o = input as Record<string, unknown>;
  for (const k of ["description", "command", "file_path", "path", "pattern", "query", "url"]) {
    const v = o[k];
    if (typeof v === "string" && v !== "") return cutText(v.replace(/\s+/g, " "), TOOL_TEXT_MAX).text;
  }
  return "";
}

/** 記録の 1 行（JSON を解いた値）から、人が読む 1 件以上を取り出す。知らない種類・形は飛ばす（版で変わりうる内部の形）。 */
export function entriesOfLine(o: unknown): SubagentTranscriptEntry[] {
  if (typeof o !== "object" || o === null) return [];
  const rec = o as Record<string, unknown>;
  const message = rec["message"];
  if (typeof message !== "object" || message === null) return [];
  const content = (message as { content?: unknown }).content;
  const at = atOf(rec);
  const out: SubagentTranscriptEntry[] = [];
  if (rec["type"] === "user") {
    if (typeof content === "string") {
      if (content !== "") out.push({ kind: "prompt", ...cutText(content, TRANSCRIPT_TEXT_MAX), ...at });
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part !== "object" || part === null) continue;
        const p = part as Record<string, unknown>;
        if (p["type"] === "tool_result") {
          const text = textOfContent(p["content"]);
          out.push({ kind: "result", ...cutText(text, TRANSCRIPT_TEXT_MAX), ...(p["is_error"] === true ? { error: true } : {}), ...at });
        } else if (p["type"] === "text" && typeof p["text"] === "string" && p["text"] !== "") {
          out.push({ kind: "prompt", ...cutText(p["text"], TRANSCRIPT_TEXT_MAX), ...at });
        }
      }
    }
  } else if (rec["type"] === "assistant") {
    if (typeof content === "string") {
      if (content !== "") out.push({ kind: "say", ...cutText(content, TRANSCRIPT_TEXT_MAX), ...at });
    } else if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part !== "object" || part === null) continue;
        const p = part as Record<string, unknown>;
        if (p["type"] === "text" && typeof p["text"] === "string" && p["text"] !== "") {
          out.push({ kind: "say", ...cutText(p["text"], TRANSCRIPT_TEXT_MAX), ...at });
        } else if (p["type"] === "tool_use" && typeof p["name"] === "string") {
          out.push({ kind: "tool", name: cutText(p["name"], 64).text, text: toolSummary(p["input"]), ...at });
        }
        // `thinking`（署名つきで長い）は出さない。
      }
    }
  }
  return out;
}

interface ParsedLines {
  /** 1 行だけで枠（`limit`）を超えたので、切った（続きの読みで、省いた分は戻らない）。 */
  clipped: boolean;
  entries: SubagentTranscriptEntry[];
  /** 最後に読み切った行の終わり（buffer の先頭からの位置）。 */
  consumed: number;
}

/**
 * buffer の中の、改行で終わった行を順に解く。途中まで書かれた最後の行（改行が無い）は読まない。大きすぎる行・壊れた行は飛ばす。
 * 枠（`limit` 件）に収まらない行は、**その行の頭で止める**（すでに 1 件以上あるとき。`consumed` はその行の前＝次の読みはその行から始まる。後ろの件が欠けない）。
 * その 1 行だけで枠を超えるときに限り、枠まで切って読んだことにし（`clipped`）、位置は行の次へ進める。
 */
function parseLines(buf: Buffer, limit: number): ParsedLines {
  const entries: SubagentTranscriptEntry[] = [];
  let pos = 0;
  let consumed = 0;
  let clipped = false;
  while (pos < buf.length && entries.length < limit) {
    const nl = buf.indexOf(0x0a, pos);
    if (nl === -1) break; // 途中まで書かれた行は、次に読む
    const len = nl - pos;
    if (len > 0 && len <= LINE_MAX_BYTES) {
      try {
        const es = entriesOfLine(JSON.parse(buf.toString("utf8", pos, nl)));
        const room = limit - entries.length;
        if (es.length > room) {
          if (entries.length > 0) break; // 枠の境目にかかった行は、その行の頭で止める（次の読みがその行から始まる）
          clipped = es.length > TRANSCRIPT_ENTRIES_MAX;
          es.length = Math.min(es.length, TRANSCRIPT_ENTRIES_MAX);
        } else if (es.length > TRANSCRIPT_ENTRIES_MAX) {
          es.length = TRANSCRIPT_ENTRIES_MAX; // 最初の読み（末尾から）。1 行の上限だけ掛ける
        }
        entries.push(...es);
      } catch {
        // 壊れた行は飛ばす
      }
    }
    pos = nl + 1;
    consumed = pos;
  }
  return { entries, consumed, clipped };
}

/** 読んだ結果（ファイルを開いて、位置から抜粋を返す）。 */
export async function readTranscriptWindow(file: string, offset: number | undefined): Promise<Omit<AgentSubagentTranscriptResult, "running">> {
  // 安全な開き方は `safeFile.ts`（O_NOFOLLOW・O_NONBLOCK・開いた fd で通常のファイル・リンク 1 つを確かめ直す）。
  const opened = await openVerified(file);
  if (opened === null) return { status: "unreadable", reason: "記録のファイルを読めません", entries: [], offset: 0, reset: false, omittedBefore: false };
  const { fd, st } = opened;
  try {
    const size = st.size;
    const reset = offset !== undefined && offset > size;
    if (offset !== undefined && !reset) {
      // 続き: `offset` から先を、最大 1 MiB。
      if (offset === size) return { status: "ok", entries: [], offset, reset: false, omittedBefore: false };
      const length = Math.min(size - offset, TRANSCRIPT_READ_MAX_BYTES);
      const buf = await readRange(fd, offset, length);
      const { entries, consumed, clipped } = parseLines(buf, TRANSCRIPT_ENTRIES_MAX);
      // 改行が 1 つも無いまま 1 MiB に達した（途方もなく長い 1 行）ときは、読み飛ばして先へ進む（止まり続けない）。
      const advance = consumed === 0 && buf.length >= TRANSCRIPT_READ_MAX_BYTES ? buf.length : consumed;
      return { status: "ok", entries, offset: offset + advance, reset: false, omittedBefore: false, ...(clipped ? { clipped: true } : {}) };
    }
    // 最初（か、位置が合わなくなったとき）: 末尾から最大 1 MiB。
    const start = Math.max(0, size - TRANSCRIPT_READ_MAX_BYTES);
    let buf = await readRange(fd, start, size - start);
    if (start > 0) {
      const nl = buf.indexOf(0x0a);
      buf = nl === -1 ? Buffer.alloc(0) : buf.subarray(nl + 1); // 途中から始まる最初の行は捨てる
    }
    const base = size - buf.length;
    const parsed = parseLines(buf, Number.MAX_SAFE_INTEGER);
    let entries = parsed.entries;
    let omittedBefore = start > 0;
    if (start > 0) {
      // 大きいファイルでも、指示（最初の user の行）は先頭から拾って添える。
      const head = await readRange(fd, 0, Math.min(HEAD_BYTES, size));
      const first = parseLines(head, 1).entries[0];
      if (first && first.kind === "prompt") entries = [first, ...entries];
    }
    if (entries.length > TRANSCRIPT_ENTRIES_MAX) {
      const keepFirst = start > 0 && entries[0]?.kind === "prompt";
      const tail = entries.slice(-(TRANSCRIPT_ENTRIES_MAX - (keepFirst ? 1 : 0)));
      entries = keepFirst ? [entries[0] as SubagentTranscriptEntry, ...tail] : tail;
      omittedBefore = true;
    }
    return { status: "ok", entries, offset: base + parsed.consumed, reset, omittedBefore };
  } finally {
    await fd.close().catch(() => undefined);
  }
}

// --- 読む口 -----------------------------------------------------------------------------------------------------

export interface SubagentTranscriptReaderDeps {
  tracker: {
    transcriptSource(paneId: string, agentId: string): { sessionId: string; parentTranscriptPath: string } | undefined;
  };
  /** その pane に今検出されているエージェントの `instanceId`（無ければ null）。 */
  agentInstanceOf(paneId: string): string | null;
  /** 読んでよい根（既定: `~/.claude/projects`・`CLAUDE_CONFIG_DIR` の `projects`）。 */
  roots?: () => string[];
  now?: () => number;
  logger: Pick<Logger, "debug" | "warn">;
}

interface Grant {
  instanceId: string | null;
  sessionId: string;
  parentTranscriptPath: string;
  at: number;
}
const GRANT_TTL_MS = 30 * 60_000;
const GRANT_MAX = 64;

const REASONS = {
  invalid: "記録の場所を確かめられませんでした",
  outside: "記録が、Claude Code の記録の置き場所の外にあります",
  unreadable: "記録を読めません",
} as const;

export class SubagentTranscriptReader {
  private readonly grants = new Map<string, Grant>();

  constructor(private readonly deps: SubagentTranscriptReaderDeps) {}

  /**
   * `agent.subagent_transcript` の本体。居ないサブエージェント・別の pane の id・形の合わない id は `not_found`（居るかどうかも、ファイルの有無も、区別して教えない）。
   * ファイルがまだ無いときは `pending`、読めないときは固定の理由つきの `unreadable`。投げるのは `RpcError` だけ。
   */
  async read(paneId: string, agentId: string, offset: number | undefined): Promise<AgentSubagentTranscriptResult> {
    const now = (this.deps.now ?? Date.now)();
    const key = `${paneId}\n${agentId}`;
    const live = SAFE_ID.test(agentId) ? this.deps.tracker.transcriptSource(paneId, agentId) : undefined;
    const instanceId = this.deps.agentInstanceOf(paneId);
    let source = live;
    if (live) {
      this.grant(key, { instanceId, sessionId: live.sessionId, parentTranscriptPath: live.parentTranscriptPath, at: now });
    } else {
      const g = this.grants.get(key);
      // 窓を開いたときに報告していたサブエージェントは、同じエージェントの間だけ、終わった後も読める。
      if (!g || g.instanceId !== instanceId || instanceId === null || now - g.at > GRANT_TTL_MS) {
        this.grants.delete(key);
        throw new RpcError("not_found", "subagent not found");
      }
      g.at = now;
      source = g;
    }
    const s = source as { sessionId: string; parentTranscriptPath: string };
    const roots = (this.deps.roots ?? (() => defaultTranscriptRoots()))();
    const run = async (): Promise<AgentSubagentTranscriptResult> => {
      const resolved = await resolveTranscriptFile(s.parentTranscriptPath, s.sessionId, agentId, roots);
      if (!resolved.ok) {
        if (resolved.reason === "missing")
          return { status: "pending", entries: [], offset: offset ?? 0, reset: false, omittedBefore: false, running: live !== undefined };
        // 理由の種類だけをログに残す（場所・中身は書かない）。
        this.deps.logger.debug("subagent transcript: refused", { reason: resolved.reason });
        return { status: "unreadable", reason: REASONS[resolved.reason], entries: [], offset: offset ?? 0, reset: false, omittedBefore: false, running: live !== undefined };
      }
      const r = await readTranscriptWindow(resolved.file, offset);
      return { ...r, running: live !== undefined };
    };
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<AgentSubagentTranscriptResult>((resolve) => {
      timer = setTimeout(
        () => resolve({ status: "unreadable", reason: "記録の読み出しに時間がかかっています", entries: [], offset: offset ?? 0, reset: false, omittedBefore: false, running: live !== undefined }),
        TRANSCRIPT_TIMEOUT_MS,
      );
    });
    try {
      return await Promise.race([
        run().catch((err: unknown): AgentSubagentTranscriptResult => {
          // 例外の中身（場所を含みうる）は書かない。
          this.deps.logger.debug("subagent transcript: read failed", { code: (err as { code?: string })?.code ?? "unknown" });
          return { status: "unreadable", reason: REASONS.unreadable, entries: [], offset: offset ?? 0, reset: false, omittedBefore: false, running: live !== undefined };
        }),
        timeout,
      ]);
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }

  private grant(key: string, g: Grant): void {
    this.grants.delete(key);
    this.grants.set(key, g);
    while (this.grants.size > GRANT_MAX) this.grants.delete(this.grants.keys().next().value as string);
  }
}
