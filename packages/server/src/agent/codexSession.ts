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

/** 記録の先頭から読む量（先頭の 1 行は 20 KiB を超えるが、id・cwd は先頭の数百バイトにある）。 */
const HEAD_BYTES = 8192;
/** 記録を探すときに見る日付のフォルダの上限（新しい順）。 */
const MAX_DAY_DIRS = 400;

export interface CodexRecord {
  /** 記録の `cwd`（読めなければ null）。 */
  cwd: string | null;
}

/**
 * 会話の id の記録を探して、先頭の `cwd` を返す。無ければ null。`codexHome` の下の `sessions` だけを見る（読むだけ）。
 * `sessions` が無い（Codex を使っていない・場所が違う）ときは undefined（確かめられない）。id は UUID の形だけを受ける。
 */
export async function lookupCodexRecord(codexHome: string, id: string): Promise<CodexRecord | null | undefined> {
  if (!isCodexSessionId(id)) return null;
  const root = join(codexHome, "sessions");
  const years = await readdir(root).catch(() => undefined);
  if (years === undefined) return undefined;
  const wanted = `-${id.toLowerCase()}.jsonl`;
  const days: string[] = [];
  for (const y of years.filter((n) => /^\d{4}$/.test(n)).sort().reverse()) {
    for (const m of (await readdir(join(root, y)).catch(() => [])).filter((n) => /^\d{2}$/.test(n)).sort().reverse()) {
      for (const d of (await readdir(join(root, y, m)).catch(() => [])).filter((n) => /^\d{2}$/.test(n)).sort().reverse()) {
        days.push(join(root, y, m, d));
        if (days.length >= MAX_DAY_DIRS) break;
      }
      if (days.length >= MAX_DAY_DIRS) break;
    }
    if (days.length >= MAX_DAY_DIRS) break;
  }
  for (const dir of days) {
    const names = await readdir(dir).catch(() => [] as string[]);
    const hit = names.find((n) => n.startsWith("rollout-") && n.toLowerCase().endsWith(wanted));
    if (hit === undefined) continue;
    return { cwd: await readHeadCwd(join(dir, hit), id) };
  }
  return null;
}

async function readHeadCwd(path: string, id: string): Promise<string | null> {
  try {
    const fh = await open(path, "r");
    try {
      const buf = Buffer.alloc(HEAD_BYTES);
      const { bytesRead } = await fh.read(buf, 0, HEAD_BYTES, 0);
      const head = buf.subarray(0, bytesRead).toString("utf8");
      // 先頭の 1 行（session_meta）の `id` が、探している id であること。`cwd` は JSON の文字列として読む。
      if (!new RegExp(`"id"\\s*:\\s*"${id}"`, "i").test(head)) return null;
      const m = /"cwd"\s*:\s*("(?:[^"\\]|\\.)*")/.exec(head);
      if (!m) return null;
      const v: unknown = JSON.parse(m[1]!);
      return typeof v === "string" && v !== "" ? v : null;
    } finally {
      await fh.close();
    }
  } catch {
    return null;
  }
}
