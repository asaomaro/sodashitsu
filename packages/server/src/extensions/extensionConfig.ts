import { constants as fsConstants } from "node:fs";
import { open as fsOpen, type FileHandle } from "node:fs/promises";
import { isAbsolute } from "node:path";
import {
  EXTENSIONS_FILE_MAX_BYTES,
  EXTENSIONS_FILE_NAME,
  EXTENSIONS_PER_FILE_MAX,
  EXTENSION_ALLOW_VALUES,
  EXTENSION_COMMAND_MAX,
  EXTENSION_DESCRIPTION_MAX,
  EXTENSION_ID_RE,
  EXTENSION_PATH_MAX,
  EXTENSION_UNRESPONSIVE_VALUES,
  hasForbiddenChars,
  type ExtensionScope,
} from "@sodashitsu/protocol";
import { z } from "zod";

/**
 * 拡張の設定ファイル（20261007-ext-host）。利用者: 状態ディレクトリの `extensions.json`。
 * **1 つでも規則外ならファイル全体を採らない**。採らなかった理由（`problem`）は場所と種類だけから作り、**設定に書いた値（コマンドなど）を入れない**。
 * 読み方は `commands/commandConfig.ts` の `loadCommandsFile` と同じ手順を**写した**もの（`commands.json` の検査をこの作業で動かさないため、括り出さない）。
 */

/** 解釈した 1 件（既定を埋めたもの）。 */
export interface ExtensionEntry {
  id: string;
  command: string;
  description: string | null;
  enabled: boolean;
  /** 並べ替え済み（辞書順）。 */
  allow: string[];
  onUnresponsive: "pass" | "block";
  /** プロジェクトでは常に null。 */
  cwd: string | null;
}

export interface ExtensionFileLoad {
  entries: ExtensionEntry[];
  /** 採らなかった理由（採ったなら null）。 */
  problem: string | null;
  warning?: string;
}

const Entry = z.strictObject({
  id: z.string().regex(EXTENSION_ID_RE, { message: "id は小文字・数字・-・_ の 1〜64 文字（先頭は小文字か数字）にしてください" }),
  command: z
    .string()
    .min(1, { message: "空のコマンドは使えません" })
    .max(EXTENSION_COMMAND_MAX, { message: `コマンドは ${EXTENSION_COMMAND_MAX} 文字までです` })
    .refine((v) => v === v.trim(), { message: "コマンドの前後に空白は使えません" })
    .refine((v) => !hasForbiddenChars(v), { message: "コマンドに使えない文字（制御文字・見えない文字・U+0020 以外の空白など）が含まれます" }),
  description: z
    .string()
    .max(EXTENSION_DESCRIPTION_MAX, { message: `説明は ${EXTENSION_DESCRIPTION_MAX} 文字までです` })
    .refine((v) => !hasForbiddenChars(v), { message: "説明に使えない文字（制御文字・見えない文字・U+0020 以外の空白など）が含まれます" })
    .optional(),
  enabled: z.boolean({ message: "enabled は真偽にしてください" }).optional(),
  allow: z.array(z.enum(EXTENSION_ALLOW_VALUES, { message: "知らない許可の値です" })).optional(),
  onUnresponsive: z.enum(EXTENSION_UNRESPONSIVE_VALUES, { message: "onUnresponsive は pass か block にしてください" }).optional(),
  cwd: z
    .string()
    .min(1, { message: "cwd が空です" })
    .max(EXTENSION_PATH_MAX, { message: `cwd は ${EXTENSION_PATH_MAX} 文字までです` })
    .refine((v) => isAbsolute(v), { message: "cwd は絶対パスにしてください" })
    .refine((v) => !hasForbiddenChars(v), { message: "cwd に使えない文字が含まれます" })
    .optional(),
});

const File = z.strictObject({
  extensions: z.array(Entry).max(EXTENSIONS_PER_FILE_MAX, { message: `拡張は ${EXTENSIONS_PER_FILE_MAX} 件までです` }),
});

function pathText(path: readonly PropertyKey[]): string {
  let out = "";
  for (const p of path) out += typeof p === "number" ? `[${p}]` : `${out === "" ? "" : "."}${String(p)}`;
  return out === "" ? "(全体)" : out;
}

/** 知らない項目の名前を理由の文に出す形にする（項目名らしい形だけ出し、それ以外は伏せる）。 */
function safeKeyName(key: string): string {
  return /^[A-Za-z0-9_-]{1,32}$/.test(key) ? key : "（名前は省略）";
}

/** zod の issue を、値を含まない 1 行にする。 */
function issueText(issue: z.core.$ZodIssue): string {
  const where = pathText(issue.path);
  if (issue.code === "unrecognized_keys") return `${where}: 知らない項目です（${issue.keys.map(safeKeyName).join(", ")}）`;
  if (issue.code === "invalid_type") return `${where}: 型が違います（${issue.expected} にしてください）`;
  if (issue.code === "custom" || issue.code === "invalid_format" || issue.code === "too_big" || issue.code === "too_small" || issue.code === "invalid_value") {
    return `${where}: ${issue.message}`;
  }
  return `${where}: 規則に合いません（${issue.code}）`;
}

function rejected(problem: string): ExtensionFileLoad {
  return { entries: [], problem: `${EXTENSIONS_FILE_NAME}: ${problem}` };
}

/** JSON の文字列を検証する（純粋）。規則外は 0 件と理由。 */
export function parseExtensionsJson(text: string, scope: ExtensionScope): ExtensionFileLoad {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return rejected("JSON として読めません");
  }
  const r = File.safeParse(raw);
  if (!r.success) {
    const first = r.error.issues[0];
    return rejected(first ? issueText(first) : "規則に合いません");
  }
  const seen = new Set<string>();
  for (let i = 0; i < r.data.extensions.length; i++) {
    const e = r.data.extensions[i]!;
    if (seen.has(e.id)) return rejected(`extensions[${i}].id: id が重複しています`);
    seen.add(e.id);
    if (e.allow !== undefined && new Set(e.allow).size !== e.allow.length) return rejected(`extensions[${i}].allow: 同じ値が重複しています`);
    if (scope === "project" && e.cwd !== undefined) return rejected(`extensions[${i}].cwd: プロジェクトの設定には cwd を書けません`);
  }
  const entries: ExtensionEntry[] = r.data.extensions.map((e) => ({
    id: e.id,
    command: e.command,
    description: e.description === undefined || e.description === "" ? null : e.description,
    enabled: e.enabled ?? true,
    allow: [...(e.allow ?? [])].sort(),
    onUnresponsive: e.onUnresponsive ?? "pass",
    cwd: scope === "project" ? null : (e.cwd ?? null),
  }));
  return { entries, problem: null };
}

export interface ExtensionFileDeps {
  open: (path: string, flags: number) => Promise<FileHandle>;
  /** Unix の uid（Windows では undefined）。 */
  getuid: (() => number) | undefined;
  platform: NodeJS.Platform;
}

const defaultDeps: ExtensionFileDeps = {
  open: (path, flags) => fsOpen(path, flags),
  getuid: typeof process.getuid === "function" ? () => process.getuid!() : undefined,
  platform: process.platform,
};

/**
 * 利用者の設定ファイルを読む。無ければ 0 件（問題なし）。**開いた fd の `stat` で検査し、同じ fd から読む**。
 * Unix：`O_NOFOLLOW`・`O_NONBLOCK` で開き、通常のファイルでない・持ち主がサーバの uid でない・グループかその他が書ける（`mode & 0o022`）・64 KiB 超を拒否する。
 * グループかその他が読めるだけなら採って `warning`。Windows：持ち主・権限は見ない（種類と大きさは見る）。
 */
export async function loadUserExtensionsFile(path: string, deps: Partial<ExtensionFileDeps> = {}): Promise<ExtensionFileLoad> {
  const d = { ...defaultDeps, ...deps };
  const unix = d.platform !== "win32";
  const flags = fsConstants.O_RDONLY | (unix ? fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK : 0);
  let handle: FileHandle;
  try {
    handle = await d.open(path, flags);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return { entries: [], problem: null };
    if (code === "ELOOP") return rejected("シンボリックリンクは使えません（ファイルそのものを置いてください）");
    return rejected(`開けません（${code ?? "不明なエラー"}）`);
  }
  try {
    const st = await handle.stat();
    if (!st.isFile()) return rejected("通常のファイルではありません");
    if (unix) {
      const uid = d.getuid?.();
      if (uid !== undefined && st.uid !== uid) return rejected("サーバを動かしているユーザーの持ち物ではありません");
      if ((st.mode & 0o022) !== 0) return rejected("グループかその他のユーザーが書き込めます（chmod 600 にしてください）");
    }
    if (st.size > EXTENSIONS_FILE_MAX_BYTES) return rejected(`大きすぎます（${EXTENSIONS_FILE_MAX_BYTES} バイトまで）`);
    // 読む量も上限で切る（stat の後に伸びても上限を超えて読まない）。短い読みに備えて終わりまで繰り返す。
    const buf = Buffer.alloc(EXTENSIONS_FILE_MAX_BYTES + 1);
    let total = 0;
    for (;;) {
      const { bytesRead } = await handle.read(buf, total, buf.length - total, total);
      if (bytesRead === 0) break;
      total += bytesRead;
      if (total >= buf.length) break;
    }
    if (total > EXTENSIONS_FILE_MAX_BYTES) return rejected(`大きすぎます（${EXTENSIONS_FILE_MAX_BYTES} バイトまで）`);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(buf.subarray(0, total));
    } catch {
      return rejected("UTF-8 として読めません");
    }
    const result = parseExtensionsJson(text, "user");
    if (result.problem === null && unix && (st.mode & 0o044) !== 0) {
      return { ...result, warning: `${EXTENSIONS_FILE_NAME} はグループかその他のユーザーが読めます（chmod 600 を勧めます）` };
    }
    return result;
  } catch (err) {
    return rejected(`読めません（${(err as NodeJS.ErrnoException).code ?? "不明なエラー"}）`);
  } finally {
    await handle.close().catch(() => undefined);
  }
}
