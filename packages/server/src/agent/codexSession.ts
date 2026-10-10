import { constants as fsConstants } from "node:fs";
import { open, readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * Codex の会話の id（スレッド id）を、手がかりから取り出す部品（20261010-codex-multi-pane）。
 * Codex 0.162 のフックは常駐の daemon の中で動くので、報告だけでは、どの pane の会話か分からない。pane ごとの手がかり:
 * - 前面の `codex` の引数（`codex resume <id>`。復元で打ち込んだもの・利用者が打ったもの）
 * - 終了のとき TUI が画面に出す `codex resume <id>`
 * - 記録（`$CODEX_HOME/sessions/YYYY/MM/DD/rollout-<日時>-<id>.jsonl`）の先頭。付ける前の検算に使う
 */

const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const UUID_RE = new RegExp(`^${UUID_SOURCE}$`, "i");

export function isCodexSessionId(s: string): boolean {
  return UUID_RE.test(s);
}

/**
 * `codex resume <id>`（`node …/codex resume <id> -m …` も、ネイティブの `codex resume <id> …` も）の引数から会話の id を取る。
 * `codex resume`（選ぶ画面）・`codex resume --last`・サブコマンド無しの `codex` は、無い。`resume` の後ろの先頭の数個の引数だけを見る。
 */
export function codexResumeIdFromArgv(argv: readonly string[]): string | undefined {
  const at = argv.findIndex((a, i) => i > 0 && a === "resume");
  if (at < 0) return undefined;
  // `resume` の前に、サブコマンドでない位置引数（別のコマンドの引数）が来る形は読まない: `codex -m x resume <id>` は読み、`codex foo resume <id>` は読まない。
  for (let i = 1; i < at; i++) {
    const a = argv[i]!;
    if (!a.startsWith("-") && !(argv[i - 1]?.startsWith("-") ?? false) && !/codex|\.js$|\.cjs$|\.mjs$/i.test(a)) return undefined;
  }
  for (let i = at + 1; i < argv.length && i <= at + 12; i++) {
    const a = argv[i]!;
    if (UUID_RE.test(a)) return a.toLowerCase();
    if (!a.startsWith("-") && !(argv[i - 1]?.startsWith("-") ?? false)) return undefined; // 位置引数（id でないもの）に当たった
  }
  return undefined;
}

/** 画面の終了の文言（`To reconnect, run:`／`To continue this session, run:` の次の行の `codex resume <id>`）の、最後のものの id。無ければ undefined。 */
export function codexExitSessionId(text: string): string | undefined {
  const re = new RegExp(`(?:To reconnect, run:|To continue this session, run:)[ \\t]*\\r?\\n[ \\t]*codex resume (${UUID_SOURCE})[ \\t]*$`, "gim");
  let last: string | undefined;
  for (const m of text.matchAll(re)) last = m[1]!.toLowerCase();
  return last;
}

/**
 * 記録の先頭から読む量。先頭の 1 行（`session_meta`）は約 23 KB（`base_instructions` が大きい）。**収まれば、その 1 行を JSON として読む**。
 * 収まらない・読めないときは、先頭の `HEAD_REGEX_BYTES` だけを正規表現で読む（id・cwd・originator は先頭の数百バイトにある。実測の最大は 480 バイト付近）。
 */
const HEAD_BYTES = 64 * 1024;
const HEAD_REGEX_BYTES = 8192;
/** 記録の探索の全体の時間の上限（フォルダの歩きを含む。止まった fs で、検算が終わらないままにならないため）。 */
const LOOKUP_TIMEOUT_MS = 2_000;
/** 記録を探すときに見る日付のフォルダの上限（新しい順に、見つかったら止める）。 */
export const MAX_DAY_DIRS = 400;
/** 記録を 1 件読む時間の上限（FIFO・止まった fs で、固まらないため）。 */
const READ_TIMEOUT_MS = 1_000;

export interface CodexRecord {
  /** 記録の `cwd`（読めなければ null）。 */
  cwd: string | null;
  /**
   * 記録の `originator`（会話を始めた道具。pane の TUI は `codex-tui`。`codex_exec`・`codex_cli_rs`・`codex_chatgpt_android_remote` などは別。
   * 読めなければ null）。`source` は、pane の TUI でも環境（`TERM_PROGRAM=vscode`）で `vscode` になるので使えない。
   */
  originator: string | null;
  /**
   * 先頭の行の `timestamp`（epoch ms）。記録は**最初のターンで作られる**ので、新しい会話では、最初の入力（Enter）の時刻に近い（実測: +21ms）。
   * 前からある会話（再開）では、古い。読めなければ null。
   */
  startedAt: number | null;
}

/**
 * 会話の id の記録を探して、先頭の `cwd`・`originator` を返す。無ければ null。`codexHome` の下の `sessions` だけを見る（読むだけ）。
 * `sessions` が無い（Codex を使っていない・場所が違う）ときは undefined（確かめられない）。id は UUID の形だけを受ける。
 * 日付のフォルダは新しい順に、見つかったら止める。`maxDayDirs` で、見るフォルダの数を縮められる（再試行は、最近の数日だけでよい）。
 * 読み方は、リンクを辿らず・通常のファイルだけ・時間切れつき（#126 の `SubagentTranscript` と同じ守り）。
 */
export async function lookupCodexRecord(codexHome: string, id: string, maxDayDirs = MAX_DAY_DIRS): Promise<CodexRecord | null | undefined> {
  // 全体を時間切れで包む（探索の途中で止まったら「見つからない」＝付けない。確かめられない〔undefined〕にはしない）。
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), LOOKUP_TIMEOUT_MS);
    timer.unref?.();
  });
  try {
    return await Promise.race([lookupUnbounded(codexHome, id, maxDayDirs), timeout]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

async function lookupUnbounded(codexHome: string, id: string, maxDayDirs: number): Promise<CodexRecord | null | undefined> {
  if (!isCodexSessionId(id)) return null;
  const root = join(codexHome, "sessions");
  const years = await subdirs(root);
  if (years === undefined) return undefined;
  const wanted = `-${id.toLowerCase()}.jsonl`;
  let visited = 0;
  for (const y of years.filter((n) => /^\d{4}$/.test(n)).sort().reverse()) {
    for (const m of ((await subdirs(join(root, y))) ?? []).filter((n) => /^\d{2}$/.test(n)).sort().reverse()) {
      for (const d of ((await subdirs(join(root, y, m))) ?? []).filter((n) => /^\d{2}$/.test(n)).sort().reverse()) {
        if (visited++ >= maxDayDirs) return null;
        const dir = join(root, y, m, d);
        const names = await readdir(dir).catch(() => [] as string[]);
        const hit = names.find((n) => n.startsWith("rollout-") && n.toLowerCase().endsWith(wanted));
        if (hit === undefined) continue;
        const head = await readHead(join(dir, hit), id);
        return head === undefined ? null : head;
      }
    }
  }
  return null;
}

/** 通常のディレクトリ（リンクでない）の名前。読めなければ undefined。 */
async function subdirs(path: string): Promise<string[] | undefined> {
  try {
    return (await readdir(path, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name);
  } catch {
    return undefined;
  }
}

/** 先頭の `cwd`・`originator`。`id` が合わない・通常のファイルでない・読めない記録は undefined（無いものとして扱う）。 */
async function readHead(path: string, id: string): Promise<CodexRecord | undefined> {
  let fh: Awaited<ReturnType<typeof open>> | undefined;
  const work = (async (): Promise<CodexRecord | undefined> => {
    try {
      fh = await open(path, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK);
      const st = await fh.stat();
      if (!st.isFile() || st.nlink !== 1) return undefined;
      const buf = Buffer.alloc(HEAD_BYTES);
      const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
      const head = buf.subarray(0, bytesRead).toString("utf8");
      // 先頭の 1 行が収まっていて JSON として読めるなら、それで読む（`payload.id`・`payload.cwd`・`payload.originator`・行の `timestamp`）。
      const eol = head.indexOf("\n");
      if (eol > 0) {
        try {
          const o: unknown = JSON.parse(head.slice(0, eol));
          if (typeof o === "object" && o !== null) {
            const rec = o as { timestamp?: unknown; payload?: unknown };
            const pl = typeof rec.payload === "object" && rec.payload !== null ? (rec.payload as Record<string, unknown>) : null;
            if (pl === null || typeof pl["id"] !== "string" || pl["id"].toLowerCase() !== id.toLowerCase()) return undefined;
            const str = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
            const t = typeof rec.timestamp === "string" ? Date.parse(rec.timestamp) : NaN;
            return { cwd: str(pl["cwd"]), originator: str(pl["originator"]), startedAt: Number.isFinite(t) ? t : null };
          }
        } catch {
          // 読めない（途中で切れた・壊れた）: 下の正規表現に落ちる。
        }
      }
      // 先頭の `session_meta` の `id` が、探している id であること。値は JSON の文字列として読む。
      const small = head.slice(0, HEAD_REGEX_BYTES);
      if (!new RegExp(`"id"\\s*:\\s*"${id}"`, "i").test(small)) return undefined;
      const ts = /^\s*\{\s*"timestamp"\s*:\s*"([^"]+)"/.exec(small);
      const t = ts ? Date.parse(ts[1]!) : NaN;
      return { cwd: stringField(small, "cwd"), originator: stringField(small, "originator"), startedAt: Number.isFinite(t) ? t : null };
    } catch {
      return undefined;
    }
  })();
  const timeout = new Promise<undefined>((resolve) => {
    const t = setTimeout(() => resolve(undefined), READ_TIMEOUT_MS);
    t.unref?.();
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    void work.finally(() => fh?.close().catch(() => undefined));
  }
}

function stringField(head: string, key: string): string | null {
  const m = new RegExp(`"${key}"\\s*:\\s*("(?:[^"\\\\]|\\\\.)*")`).exec(head);
  if (!m) return null;
  try {
    const v: unknown = JSON.parse(m[1]!);
    return typeof v === "string" && v !== "" ? v : null;
  } catch {
    return null;
  }
}
